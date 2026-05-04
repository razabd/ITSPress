package controllers

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"

	"github.com/gin-gonic/gin"
)

// generateRandomID membuat ID acak 16-byte sebagai string hex (32 karakter)
func generateRandomID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// generatePDFCover mengekstrak halaman pertama PDF sebagai gambar PNG cover
// menggunakan mutool (MuPDF). Mengembalikan path file cover yang dibuat.
func generatePDFCover(pdfPath string, coverDir string) (string, error) {
	coverID, err := generateRandomID()
	if err != nil {
		return "", err
	}

	// Path output cover (PNG)
	coverPath := filepath.Join(coverDir, coverID+".png")

	// Konversi path Windows ke path WSL jika berjalan di Windows
	wslPDFPath := toWSLPath(pdfPath)
	wslCoverPath := toWSLPath(coverPath)

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		// Jalankan mutool via WSL
		cmd = exec.Command("wsl", "mutool", "draw",
			"-o", wslCoverPath,
			"-r", "150",
			wslPDFPath, "1",
		)
	} else {
		cmd = exec.Command("mutool", "draw",
			"-o", coverPath,
			"-r", "150",
			pdfPath, "1",
		)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("mutool error: %v\nOutput: %s", err, string(out))
		return "", err
	}

	return coverPath, nil
}

// wslDistroName mengembalikan nama distro WSL dari env WSL_DISTRO atau default "Ubuntu"
func wslDistroName() string {
	if name := os.Getenv("WSL_DISTRO"); name != "" {
		return name
	}
	return "Ubuntu"
}

// toWSLPath mengkonversi path Windows (C:\...) ke path WSL (/mnt/c/...)
func toWSLPath(winPath string) string {
	// Normalisasi separator
	p := strings.ReplaceAll(winPath, "\\", "/")
	// Konversi "C:/..." → "/mnt/c/..."
	if len(p) >= 2 && p[1] == ':' {
		drive := strings.ToLower(string(p[0]))
		p = "/mnt/" + drive + p[2:]
	}
	return p
}

// ServeLCPHint menyajikan halaman petunjuk passphrase LCP untuk Thorium Reader
func ServeLCPHint(c *gin.Context) {
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, `<!DOCTYPE html><html><body>
<h2>LCP Passphrase Hint</h2>
<p>Masukkan passphrase yang Anda daftarkan saat registrasi akun ITSPRESS.</p>
</body></html>`)
}

// GetBooks mengambil seluruh katalog buku (publik)
func GetBooks(c *gin.Context) {
	var books []models.Book
	config.DB.Preload("Publisher").Find(&books)
	c.JSON(http.StatusOK, gin.H{"data": books})
}

// GetBookByID mengambil detail 1 buku
func GetBookByID(c *gin.Context) {
	id := c.Param("id")
	var book models.Book
	if err := config.DB.Preload("Publisher").First(&book, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Book not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": book})
}

// UploadBook hanya bisa diakses oleh Publisher
// Menerima file upload + metadata, lalu menyimpan file mentah ke storage/raw/
func UploadBook(c *gin.Context) {
	publisherID, _ := c.Get("user_id")

	// Pastikan publisher sudah di-approve sebelum bisa upload buku
	var publisher models.User
	if err := config.DB.First(&publisher, publisherID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User tidak ditemukan"})
		return
	}
	if publisher.ApprovalStatus != models.ApprovalApproved && publisher.ApprovalStatus != "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Akun Anda belum disetujui oleh admin. Upload buku tidak diizinkan."})
		return
	}

	title := c.PostForm("title")
	description := c.PostForm("description")
	priceStr := c.PostForm("price")
	format := c.PostForm("format")

	// Format yang didukung lcpencrypt
	allowedFormats := map[string]bool{
		"epub": true, "pdf": true, "lpf": true,
		"audiobook": true, "divina": true, "webpub": true, "rpf": true,
	}
	if title == "" || format == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Judul dan format wajib diisi"})
		return
	}
	if !allowedFormats[strings.ToLower(format)] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format tidak didukung. Pilih: epub, pdf, lpf, audiobook, divina, webpub, atau rpf"})
		return
	}

	price, _ := strconv.ParseFloat(priceStr, 64)

	// Proses upload file
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "E-book file is required"})
		return
	}

	// Simpan file ke storage/raw/ dengan nama acak (mencegah path traversal)
	rawDir := "storage/raw"
	os.MkdirAll(rawDir, os.ModePerm)

	fileID, err := generateRandomID()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate file ID"})
		return
	}
	// Ambil hanya ekstensi dari nama asli, abaikan path/nama berbahaya
	ext := filepath.Ext(filepath.Base(fileHeader.Filename))
	destPath := filepath.Join(rawDir, fileID+ext)

	src, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open uploaded file"})
		return
	}
	defer src.Close()

	dst, err := os.Create(destPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	defer dst.Close()
	io.Copy(dst, src)

	// Generate cover otomatis hanya untuk PDF via MuPDF.
	// Format lain (epub, audiobook, dll.) harus upload cover manual atau dibiarkan kosong.
	var coverURL string
	if strings.EqualFold(format, "pdf") {
		coverDir := "storage/covers"
		os.MkdirAll(coverDir, os.ModePerm)
		coverPath, err := generatePDFCover(destPath, coverDir)
		if err != nil {
			log.Printf("Warning: gagal generate cover untuk %s: %v", destPath, err)
		} else {
			coverURL = "/api/v1/covers/" + filepath.Base(coverPath)
		}
	}

	// Optional cover image upload (untuk EPUB, atau override cover PDF)
	if coverHeader, err := c.FormFile("cover"); err == nil {
		coverExt := strings.ToLower(filepath.Ext(filepath.Base(coverHeader.Filename)))
		allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}
		if allowed[coverExt] {
			coverDir := "storage/covers"
			os.MkdirAll(coverDir, os.ModePerm)
			coverFileID, genErr := generateRandomID()
			if genErr == nil {
				coverDstPath := filepath.Join(coverDir, coverFileID+coverExt)
				if saveErr := c.SaveUploadedFile(coverHeader, coverDstPath); saveErr == nil {
					coverURL = "/api/v1/covers/" + filepath.Base(coverDstPath)
				} else {
					log.Printf("Warning: gagal menyimpan cover: %v", saveErr)
				}
			}
		}
	}

	book := models.Book{
		PublisherID:   publisherID.(uint),
		Title:         title,
		Description:   description,
		ClearFilePath: destPath,
		CoverURL:      coverURL,
		Format:        format,
		Price:         price,
	}

	if err := config.DB.Create(&book).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save book record"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Book uploaded successfully. Proceed to encrypt the file.",
		"book_id": book.ID,
		"data":    book,
	})
}

// GetMyBooks mengambil daftar buku milik publisher yang sedang login
func GetMyBooks(c *gin.Context) {
	publisherID, _ := c.Get("user_id")
	var books []models.Book
	config.DB.Where("publisher_id = ?", publisherID).Find(&books)
	c.JSON(http.StatusOK, gin.H{"data": books})
}

// ServeCover menyajikan gambar cover buku (PNG hasil ekstraksi MuPDF)
func ServeCover(c *gin.Context) {
	filename := filepath.Base(c.Param("filename")) // sanitasi path traversal
	coverPath := filepath.Join("storage/covers", filename)

	if _, err := os.Stat(coverPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cover not found"})
		return
	}

	c.File(coverPath)
}

// EncryptBook mengenkripsi file EPUB/PDF via lcpencrypt dan mendaftarkannya ke LCP Server.
// Hanya bisa dipanggil oleh publisher pemilik buku, setelah buku di-upload.
func EncryptBook(c *gin.Context) {
	publisherID, _ := c.Get("user_id")
	bookIDStr := c.Param("id")

	var book models.Book
	if err := config.DB.Where("id = ? AND publisher_id = ?", bookIDStr, publisherID).First(&book).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Book not found"})
		return
	}

	if book.LCPContentID != "" {
		c.JSON(http.StatusConflict, gin.H{"error": "Buku sudah dienkripsi", "lcp_content_id": book.LCPContentID})
		return
	}

	if book.ClearFilePath == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "File buku tidak ditemukan di server"})
		return
	}

	// Generate content ID unik
	contentID, err := generateRandomID()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate content ID"})
		return
	}

	encryptedDir := "storage/encrypted"
	os.MkdirAll(encryptedDir, os.ModePerm)

	// lcpencrypt menambahkan filename ke URL ini, jadi cukup base path
	contentURL := "http://127.0.0.1:8081/api/v1/content/"

	ext := strings.ToLower(filepath.Ext(book.ClearFilePath))

	// Mapping ekstensi input → ekstensi output terenkripsi (sesuai readium-lcp-server)
	outExtMap := map[string]string{
		".epub":      ".epub",
		".pdf":       ".lcpdf",
		".lpf":       ".webpub",
		".audiobook": ".lcpa",
		".divina":    ".lcpdi",
		".webpub":    ".webpub",
		".rpf":       ".webpub",
	}
	outExt := outExtMap[ext]
	if outExt == "" {
		outExt = ext // fallback untuk format tidak dikenal
	}
	// Path tujuan akhir di Windows
	encryptedPath := filepath.Join(encryptedDir, contentID+outExt)

	// Binary lcpencrypt (bisa di-override via env LCP_ENCRYPT_BIN)
	lcpEncryptBin := os.Getenv("LCP_ENCRYPT_BIN")
	if lcpEncryptBin == "" {
		lcpEncryptBin = "lcpencrypt"
	}

	// Credentials dalam URL (format yang didukung lcpencrypt: http://user:pass@host)
	lcpLogin := os.Getenv("LCP_SERVER_LOGIN")
	if lcpLogin == "" {
		lcpLogin = "admin"
	}
	lcpPassword := os.Getenv("LCP_SERVER_PASSWORD")
	if lcpPassword == "" {
		lcpPassword = "admin123"
	}
	lcpSvWithAuth := fmt.Sprintf("http://%s:%s@localhost:8989", lcpLogin, lcpPassword)

	// lcpencrypt menulis ke native WSL filesystem untuk menghindari korupsi ZIP
	// saat menulis melalui mount /mnt/c/ (central directory ZIP bisa rusak).
	// Setelah selesai, file di-copy ke storage/encrypted/ di Windows.
	wslTmpDir := "/tmp/lcp_encrypted"

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		absClearPath, _ := filepath.Abs(book.ClearFilePath)
		wslInput := toWSLPath(absClearPath)
		// lcpencrypt tidak bisa membaca file langsung dari /mnt/c/ (Windows mount),
		// jadi file di-copy dulu ke WSL native filesystem sebelum enkripsi.
		wslTmpInput := fmt.Sprintf("/tmp/lcp_input_%s%s", contentID, ext)
		cmd = exec.Command("wsl", "/bin/bash", "-c",
			fmt.Sprintf("mkdir -p %s && cp %q %s && %s -input %s -storage %s -contentid %s -url %s -lcpsv %s; rm -f %s",
				wslTmpDir, wslInput, wslTmpInput, lcpEncryptBin, wslTmpInput, wslTmpDir, contentID, contentURL, lcpSvWithAuth, wslTmpInput),
		)
	} else {
		cmd = exec.Command(lcpEncryptBin,
			"-input", book.ClearFilePath,
			"-storage", wslTmpDir,
			"-contentid", contentID,
			"-url", contentURL,
			"-lcpsv", lcpSvWithAuth,
		)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("lcpencrypt error: %v\nOutput: %s", err, string(out))
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":  "Enkripsi gagal. Pastikan lcpencrypt tersedia di WSL dan LCP Server berjalan.",
			"detail": string(out),
		})
		return
	}

	// Copy file hasil enkripsi dari WSL tmp ke Windows storage/encrypted/
	if runtime.GOOS == "windows" {
		wslSrc := fmt.Sprintf("%s/%s%s", wslTmpDir, contentID, outExt)
		wslDst := toWSLPath(encryptedPath)
		absEncryptedDir, _ := filepath.Abs(encryptedDir)
		wslEncryptedDir := toWSLPath(absEncryptedDir)
		cpCmd := exec.Command("wsl", "/bin/bash", "-c",
			fmt.Sprintf("mkdir -p %s && cp %s %s", wslEncryptedDir, wslSrc, wslDst),
		)
		cpOut, cpErr := cpCmd.CombinedOutput()
		if cpErr != nil {
			log.Printf("copy error: %v\nOutput: %s", cpErr, string(cpOut))
			c.JSON(http.StatusInternalServerError, gin.H{
				"error":  "Enkripsi berhasil tetapi gagal menyalin file ke storage.",
				"detail": string(cpOut),
			})
			return
		}
	}

	// Untuk PDF: patch manifest.json di dalam .lcpdf agar title muncul di Thorium.
	// lcpencrypt mengambil title dari metadata dokumen PDF; jika kosong, Thorium
	// menampilkan "No Title Available". Kita timpa dengan title dari record buku.
	if strings.EqualFold(ext, ".pdf") && book.Title != "" {
		if patchErr := patchLCPDFTitle(encryptedPath, book.Title); patchErr != nil {
			log.Printf("Warning: gagal patch title di manifest.json: %v", patchErr)
			// Tidak fatal — lanjutkan, buku tetap bisa dibuka meski tanpa title
		}
	}

	if err := config.DB.Model(&book).Updates(map[string]interface{}{
		"lcp_content_id":      contentID,
		"encrypted_file_path": encryptedPath,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update book record"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":        "Buku berhasil dienkripsi dan didaftarkan ke LCP Server",
		"lcp_content_id": contentID,
		"book_id":        book.ID,
	})
}

// ServeContent menyajikan file EPUB/PDF terenkripsi berdasarkan LCPContentID.
// Endpoint ini publik karena file sudah terenkripsi AES-256 — tidak bisa dibaca tanpa passphrase.
// URL endpoint ini yang akan disimpan di dalam file .lcpl untuk diakses Thorium Reader.
func ServeContent(c *gin.Context) {
	// Wildcard *content_id menghasilkan "/contentid.epub" (dengan leading slash)
	// Strip leading slash dan extension untuk mendapatkan content ID murni
	raw := strings.TrimPrefix(c.Param("content_id"), "/")
	contentID := strings.TrimSuffix(raw, filepath.Ext(raw))

	var book models.Book
	if err := config.DB.Where("lcp_content_id = ?", contentID).First(&book).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Content not found"})
		return
	}

	filePath := book.EncryptedFilePath
	if filePath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Encrypted file not available yet"})
		return
	}

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Encrypted file missing on server"})
		return
	}

	ext := strings.ToLower(filepath.Ext(filePath))

	// Content-Type sesuai spesifikasi Readium LCP per format terenkripsi
	contentTypeMap := map[string]string{
		".epub":   "application/epub+zip",
		".lcpdf":  "application/pdf+lcp",
		".lcpa":   "application/audiobook+lcp",
		".lcpdi":  "application/divina+lcp",
		".webpub": "application/webpub+lcp",
	}
	if ct, ok := contentTypeMap[ext]; ok {
		c.Header("Content-Type", ct)
	}

	c.Header("Content-Disposition", `attachment; filename="`+contentID+ext+`"`)
	c.File(filePath)
}

// patchLCPDFTitle membuka file .lcpdf (ZIP), memperbarui field metadata.title
// di dalam manifest.json dengan title dari record buku, lalu menulis ulang file.
// Ini mengatasi masalah "No Title Available" di Thorium ketika PDF tidak punya
// metadata title di document properties-nya.
func patchLCPDFTitle(lcpdfPath, title string) error {
	data, err := os.ReadFile(lcpdfPath)
	if err != nil {
		return err
	}

	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return err
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			return err
		}

		if f.Name == "manifest.json" {
			// Parse manifest sebagai map generik agar tidak kehilangan field apapun
			var manifest map[string]interface{}
			if err := json.NewDecoder(rc).Decode(&manifest); err != nil {
				rc.Close()
				return err
			}
			rc.Close()

			// Set metadata.title dengan title dari record buku
			if meta, ok := manifest["metadata"].(map[string]interface{}); ok {
				meta["title"] = title
			} else {
				manifest["metadata"] = map[string]interface{}{"title": title}
			}

			updated, err := json.Marshal(manifest)
			if err != nil {
				return err
			}
			w, err := zw.CreateHeader(&f.FileHeader)
			if err != nil {
				return err
			}
			if _, err = w.Write(updated); err != nil {
				return err
			}
		} else {
			w, err := zw.CreateHeader(&f.FileHeader)
			if err != nil {
				rc.Close()
				return err
			}
			if _, err = io.Copy(w, rc); err != nil {
				rc.Close()
				return err
			}
			rc.Close()
		}
	}

	if err = zw.Close(); err != nil {
		return err
	}

	// Tulis kembali file .lcpdf yang sudah di-patch
	return os.WriteFile(lcpdfPath, buf.Bytes(), 0644)
}
