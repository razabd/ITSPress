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
	"regexp"
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

	coverPath := filepath.Join(coverDir, coverID+".png")

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		// toWSLPath hanya mengkonversi path absolut (dengan drive letter).
		// Path relatif harus dijadikan absolut terlebih dahulu.
		absPDF, err := filepath.Abs(pdfPath)
		if err != nil {
			return "", err
		}
		absCover, err := filepath.Abs(coverPath)
		if err != nil {
			return "", err
		}
		cmd = exec.Command("wsl", "mutool", "draw",
			"-o", toWSLPath(absCover),
			"-r", "150",
			toWSLPath(absPDF), "1",
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
	c.String(http.StatusOK, `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Petunjuk Passphrase — ITSPress</title>
  <style>
    body { font-family: sans-serif; max-width: 480px; margin: 48px auto; padding: 0 20px; color: #1a1a2e; }
    h2  { color: #1a1a2e; margin-bottom: 8px; }
    p   { line-height: 1.7; color: #444; }
    .box { background: #f4f6fb; border-left: 4px solid #1a1a2e; padding: 14px 18px; border-radius: 6px; margin: 20px 0; }
    a   { color: #e07b00; }
  </style>
</head>
<body>
  <h2>Petunjuk Passphrase LCP — ITSPress</h2>
  <p>Thorium Reader membutuhkan <strong>LCP Passphrase</strong> untuk membuka e-book yang Anda beli di ITSPress.</p>
  <div class="box">
    <strong>Passphrase ini adalah passphrase yang Anda buat saat mendaftar akun ITSPress,
    atau yang terakhir Anda ubah di menu <em>Pengaturan &rsaquo; LCP Passphrase</em>.</strong>
  </div>
  <p>Jika Anda lupa passphrase, login ke akun ITSPress Anda dan ubah passphrase melalui menu
  <strong>Pengaturan</strong>. Setelah diubah, download ulang file <em>.lcpl</em> dari dashboard.</p>
  <p style="font-size:0.85rem; color:#888;">Passphrase bersifat rahasia dan tidak dapat ditampilkan ulang oleh sistem.</p>
</body>
</html>`)
}

// GetBooks mengambil seluruh katalog buku (publik)
func GetBooks(c *gin.Context) {
	var books []models.Book
	config.DB.Preload("Publisher").
		Where("approval_status = ? AND lcp_content_id != ? AND (is_withdrawn = ? OR is_withdrawn IS NULL)", "approved", "", false).
		Find(&books)
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
	if book.IsWithdrawn {
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
		if !allowed[coverExt] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Ekstensi file cover tidak valid. Gunakan jpg, jpeg, png, atau webp"})
			return
		}
		allowedMIME := map[string]bool{
			"image/jpeg": true,
			"image/png":  true,
			"image/webp": true,
		}
		mimeType := coverHeader.Header.Get("Content-Type")
		if !allowedMIME[mimeType] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Tipe file cover tidak valid"})
			return
		}
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

	book := models.Book{
		PublisherID:    publisherID.(uint),
		Title:          title,
		Description:    description,
		ClearFilePath:  destPath,
		CoverURL:       coverURL,
		Format:         format,
		Price:          price,
		ApprovalStatus: "approved",
	}

	if err := config.DB.Create(&book).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save book record"})
		return
	}

	go autoEncryptBook(book.ID)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Book uploaded successfully. Encryption started automatically.",
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

// GetMyStats mengembalikan ringkasan statistik penjualan untuk publisher yang sedang login.
func GetMyStats(c *gin.Context) {
	publisherID, _ := c.Get("user_id")

	type bookStat struct {
		ID             uint    `json:"id"`
		Title          string  `json:"title"`
		Format         string  `json:"format"`
		Price          float64 `json:"price"`
		ApprovalStatus string  `json:"approval_status"`
		IsWithdrawn    bool    `json:"is_withdrawn"`
		LCPContentID   string  `json:"lcp_content_id"`
		PurchaseCount  int64   `json:"purchase_count"`
		Revenue        float64 `json:"revenue"`
	}

	var stats []bookStat
	config.DB.Raw(`
		SELECT
			b.id, b.title, b.format, b.price,
			b.approval_status, b.is_withdrawn, b.lcp_content_id,
			COUNT(CASE WHEN t.status = 'success' THEN 1 END)          AS purchase_count,
			COUNT(CASE WHEN t.status = 'success' THEN 1 END) * b.price AS revenue
		FROM books b
		LEFT JOIN transactions t ON t.book_id = b.id AND t.deleted_at IS NULL
		WHERE b.publisher_id = ? AND b.deleted_at IS NULL
		GROUP BY b.id
		ORDER BY purchase_count DESC, b.created_at DESC
	`, publisherID).Scan(&stats)

	var totalBooks, publishedBooks, totalPurchases int64
	var totalRevenue float64
	for _, s := range stats {
		totalBooks++
		if s.ApprovalStatus == "approved" && s.LCPContentID != "" && !s.IsWithdrawn {
			publishedBooks++
		}
		totalPurchases += s.PurchaseCount
		totalRevenue += s.Revenue
	}

	c.JSON(http.StatusOK, gin.H{
		"summary": gin.H{
			"total_books":     totalBooks,
			"published_books": publishedBooks,
			"total_purchases": totalPurchases,
			"total_revenue":   totalRevenue,
		},
		"books": stats,
	})
}

// UpdateBook memungkinkan publisher memperbarui metadata dan/atau file buku.
// Setiap pembaruan akan mereset approval_status ke "pending" sehingga perlu persetujuan admin ulang.
func UpdateBook(c *gin.Context) {
	publisherID, _ := c.Get("user_id")
	bookIDStr := c.Param("id")

	var book models.Book
	if err := config.DB.Where("id = ? AND publisher_id = ?", bookIDStr, publisherID).First(&book).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Buku tidak ditemukan"})
		return
	}

	title := c.PostForm("title")
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Judul tidak boleh kosong"})
		return
	}
	description := c.PostForm("description")
	priceStr := c.PostForm("price")
	price, _ := strconv.ParseFloat(priceStr, 64)

	updates := map[string]interface{}{
		"title":           title,
		"description":     description,
		"price":           price,
		"approval_status": "approved",
		"approval_note":   "",
	}

	// Optional: ganti cover
	if coverHeader, err := c.FormFile("cover"); err == nil {
		coverExt := strings.ToLower(filepath.Ext(filepath.Base(coverHeader.Filename)))
		allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}
		if allowed[coverExt] {
			allowedMIME := map[string]bool{
				"image/jpeg": true,
				"image/png":  true,
				"image/webp": true,
			}
			mimeType := coverHeader.Header.Get("Content-Type")
			if !allowedMIME[mimeType] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Tipe file cover tidak valid"})
				return
			}
			coverDir := "storage/covers"
			os.MkdirAll(coverDir, os.ModePerm)
			coverFileID, genErr := generateRandomID()
			if genErr == nil {
				coverDstPath := filepath.Join(coverDir, coverFileID+coverExt)
				if saveErr := c.SaveUploadedFile(coverHeader, coverDstPath); saveErr == nil {
					updates["cover_url"] = "/api/v1/covers/" + filepath.Base(coverDstPath)
				}
			}
		}
	}

	// Optional: ganti file buku (reset enkripsi)
	fileReplaced := false
	if fileHeader, err := c.FormFile("file"); err == nil {
		rawDir := "storage/raw"
		os.MkdirAll(rawDir, os.ModePerm)
		fileID, genErr := generateRandomID()
		if genErr == nil {
			ext := filepath.Ext(filepath.Base(fileHeader.Filename))
			destPath := filepath.Join(rawDir, fileID+ext)
			if saveErr := c.SaveUploadedFile(fileHeader, destPath); saveErr == nil {
				updates["clear_file_path"] = destPath
				updates["lcp_content_id"] = ""
				updates["encrypted_file_path"] = ""
				fileReplaced = true
			}
		}
	}

	if err := config.DB.Model(&book).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memperbarui buku"})
		return
	}
	config.DB.First(&book, book.ID)

	if fileReplaced {
		go autoEncryptBook(book.ID)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Buku berhasil diperbarui", "data": book})
}

// WithdrawBook memungkinkan publisher menarik buku dari katalog secara langsung.
func WithdrawBook(c *gin.Context) {
	publisherID, _ := c.Get("user_id")
	bookIDStr := c.Param("id")

	var book models.Book
	if err := config.DB.Where("id = ? AND publisher_id = ?", bookIDStr, publisherID).First(&book).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Buku tidak ditemukan"})
		return
	}
	if err := config.DB.Model(&book).Update("is_withdrawn", true).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menarik buku"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Buku berhasil ditarik dari katalog"})
}

// RelistBook memungkinkan publisher mendaftarkan ulang buku yang ditarik.
// Buku akan masuk ke status pending dan memerlukan persetujuan admin.
func RelistBook(c *gin.Context) {
	publisherID, _ := c.Get("user_id")
	bookIDStr := c.Param("id")

	var book models.Book
	if err := config.DB.Where("id = ? AND publisher_id = ?", bookIDStr, publisherID).First(&book).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Buku tidak ditemukan"})
		return
	}
	updates := map[string]interface{}{
		"is_withdrawn":    false,
		"approval_status": "approved",
		"approval_note":   "",
	}
	if err := config.DB.Model(&book).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mendaftarkan ulang buku"})
		return
	}
	if book.LCPContentID == "" {
		go autoEncryptBook(book.ID)
	}
	c.JSON(http.StatusOK, gin.H{"message": "Buku berhasil didaftarkan ulang ke katalog"})
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

// encryptBookCore melakukan enkripsi LCP pada sebuah buku dan memperbarui record DB.
// Dapat dipanggil dari HTTP handler maupun goroutine background.
func encryptBookCore(book *models.Book) error {
	if book.LCPContentID != "" {
		return nil
	}
	if book.ClearFilePath == "" {
		return fmt.Errorf("file buku tidak ditemukan di server")
	}

	contentID, err := generateRandomID()
	if err != nil {
		return fmt.Errorf("gagal generate content ID: %v", err)
	}

	encryptedDir := "storage/encrypted"
	os.MkdirAll(encryptedDir, os.ModePerm)

	backendURL := os.Getenv("BACKEND_PUBLIC_URL")
	if backendURL == "" {
		backendURL = "http://localhost:8081"
	}
	contentURL := backendURL + "/api/v1/content/"
	ext := strings.ToLower(filepath.Ext(book.ClearFilePath))

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
		outExt = ext
	}
	encryptedPath := filepath.Join(encryptedDir, contentID+outExt)

	lcpEncryptBin := os.Getenv("LCP_ENCRYPT_BIN")
	if lcpEncryptBin == "" {
		lcpEncryptBin = "lcpencrypt"
	}
	lcpLogin := os.Getenv("LCP_SERVER_LOGIN")
	lcpPassword := os.Getenv("LCP_SERVER_PASSWORD")
	if lcpLogin == "" || lcpPassword == "" {
		return fmt.Errorf("LCP_SERVER_LOGIN dan LCP_SERVER_PASSWORD harus di-set")
	}
	lcpSvHost := os.Getenv("LCP_SERVER_URL")
	if lcpSvHost == "" {
		lcpSvHost = "http://localhost:8989"
	}
	lcpSvWithAuth := strings.Replace(lcpSvHost, "://", fmt.Sprintf("://%s:%s@", lcpLogin, lcpPassword), 1)
	wslTmpDir := "/tmp/lcp_encrypted"

	extractCover := (ext == ".epub" || ext == ".rpf" || ext == ".pdf") && book.CoverURL == ""

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		absClearPath, _ := filepath.Abs(book.ClearFilePath)
		wslInput := toWSLPath(absClearPath)
		wslTmpInput := fmt.Sprintf("/tmp/lcp_input_%s%s", contentID, ext)
		lcpProvider := os.Getenv("LCP_PROVIDER")
		if lcpProvider == "" {
			lcpProvider = "https://itspress.its.ac.id"
		}
		lcpCmd := fmt.Sprintf("%s -input %s -storage %s -contentid %s -url %s -lcpsv %s -provider %s",
			lcpEncryptBin, wslTmpInput, wslTmpDir, contentID, contentURL, lcpSvWithAuth, lcpProvider)
		if extractCover {
			lcpCmd += " -cover"
		}
		cmd = exec.Command("wsl", "/bin/bash", "-c",
			fmt.Sprintf("mkdir -p %s && cp %q %s && %s; _exit=$?; rm -f %s; exit $_exit",
				wslTmpDir, wslInput, wslTmpInput, lcpCmd, wslTmpInput),
		)
	} else {
		lcpProvider := os.Getenv("LCP_PROVIDER")
		if lcpProvider == "" {
			lcpProvider = "https://itspress.its.ac.id"
		}
		args := []string{
			"-input", book.ClearFilePath,
			"-storage", wslTmpDir,
			"-contentid", contentID,
			"-url", contentURL,
			"-lcpsv", lcpSvWithAuth,
			"-provider", lcpProvider,
		}
		if extractCover {
			args = append(args, "-cover")
		}
		cmd = exec.Command(lcpEncryptBin, args...)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("lcpencrypt error: %v\nOutput: %s", err, string(out))
		return fmt.Errorf("enkripsi gagal: %s", string(out))
	}

	if runtime.GOOS == "windows" {
		wslSrc := fmt.Sprintf("%s/%s%s", wslTmpDir, contentID, outExt)
		absEncryptedPath, _ := filepath.Abs(encryptedPath)
		wslDst := toWSLPath(absEncryptedPath)
		absEncryptedDir, _ := filepath.Abs(encryptedDir)
		wslEncryptedDir := toWSLPath(absEncryptedDir)
		cpCmd := exec.Command("wsl", "/bin/bash", "-c",
			fmt.Sprintf("mkdir -p %q && cp %q %q", wslEncryptedDir, wslSrc, wslDst),
		)
		cpOut, cpErr := cpCmd.CombinedOutput()
		if cpErr != nil {
			log.Printf("copy error: %v\nOutput: %s", cpErr, string(cpOut))
			return fmt.Errorf("gagal menyalin file hasil enkripsi: %s", string(cpOut))
		}
	}

	if strings.EqualFold(ext, ".pdf") && book.Title != "" {
		if patchErr := patchLCPDFTitle(encryptedPath, book.Title); patchErr != nil {
			log.Printf("Warning: gagal patch title di manifest.json: %v", patchErr)
		}
	}

	var newCoverURL string
	if extractCover && runtime.GOOS == "windows" {
		coverDir := "storage/covers"
		os.MkdirAll(coverDir, os.ModePerm)
		findCmd := exec.Command("wsl", "/bin/bash", "-c",
			fmt.Sprintf(`find %s -maxdepth 1 -type f \( -iname "%s*.jpg" -o -iname "%s*.jpeg" -o -iname "%s*.png" \) 2>/dev/null | head -1`,
				wslTmpDir, contentID, contentID, contentID))
		foundOut, _ := findCmd.Output()
		if wslCoverSrc := strings.TrimSpace(string(foundOut)); wslCoverSrc != "" {
			coverExt := strings.ToLower(filepath.Ext(wslCoverSrc))
			coverFileID, _ := generateRandomID()
			absCoverDir, _ := filepath.Abs(coverDir)
			wslCoverDst := toWSLPath(filepath.Join(absCoverDir, coverFileID+coverExt))
			cpCover := exec.Command("wsl", "/bin/bash", "-c",
				fmt.Sprintf("cp %q %q", wslCoverSrc, wslCoverDst))
			if cpCover.Run() == nil {
				newCoverURL = "/api/v1/covers/" + coverFileID + coverExt
				log.Printf("Cover berhasil diekstrak: %s", newCoverURL)
			} else {
				log.Printf("Warning: gagal menyalin cover dari WSL: %s", wslCoverSrc)
			}
		} else {
			log.Printf("Info: lcpencrypt tidak menghasilkan cover untuk contentID %s", contentID)
		}
	}

	updates := map[string]interface{}{
		"lcp_content_id":      contentID,
		"encrypted_file_path": encryptedPath,
	}
	if newCoverURL != "" {
		updates["cover_url"] = newCoverURL
	}
	if err := config.DB.Model(book).Updates(updates).Error; err != nil {
		return fmt.Errorf("gagal update database: %v", err)
	}
	book.LCPContentID = contentID
	book.EncryptedFilePath = encryptedPath
	if newCoverURL != "" {
		book.CoverURL = newCoverURL
	}
	return nil
}

// generatePreviewPages me-render pageCount halaman pertama dari file mentah buku
// sebagai JPEG menggunakan mutool (MuPDF), lalu menyimpannya di storage/previews/{bookID}/.
func generatePreviewPages(book *models.Book, pageCount int) error {
	if book.ClearFilePath == "" {
		return fmt.Errorf("ClearFilePath kosong")
	}
	previewDir := filepath.Join("storage", "previews", fmt.Sprintf("%d", book.ID))
	if err := os.MkdirAll(previewDir, os.ModePerm); err != nil {
		return err
	}

	absFile, err := filepath.Abs(book.ClearFilePath)
	if err != nil {
		return err
	}
	absOut, err := filepath.Abs(filepath.Join(previewDir, "%d.jpg"))
	if err != nil {
		return err
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		if _, lookErr := exec.LookPath("mutool.exe"); lookErr == nil {
			// MuPDF terinstall sebagai Windows native binary — pakai path Windows langsung
			cmd = exec.Command("mutool.exe", "draw",
				"-o", absOut, "-r", "150",
				absFile, fmt.Sprintf("1-%d", pageCount),
			)
		} else {
			// Fallback: jalankan lewat WSL bash -c agar PATH penuh (apt-installed tools) dimuat
			// Format JPEG disimpulkan otomatis dari ekstensi .jpg pada output path
			wslCmd := fmt.Sprintf("mutool draw -o '%s' -r 150 '%s' 1-%d",
				toWSLPath(absOut), toWSLPath(absFile), pageCount)
			cmd = exec.Command("wsl", "/bin/bash", "-c", wslCmd)
		}
	} else {
		cmd = exec.Command("mutool", "draw",
			"-o", absOut, "-r", "150",
			absFile, fmt.Sprintf("1-%d", pageCount),
		)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("generatePreviewPages: mutool error: %v\nOutput: %s", err, string(out))
		return err
	}

	// Hitung halaman yang benar-benar di-render (buku mungkin < pageCount halaman)
	actualCount := 0
	for i := 1; i <= pageCount; i++ {
		if _, e := os.Stat(filepath.Join(previewDir, fmt.Sprintf("%d.jpg", i))); e == nil {
			actualCount = i
		}
	}

	return config.DB.Model(book).Update("preview_page_count", actualCount).Error
}

// autoGeneratePreview dipanggil sebagai goroutine setelah admin menyetujui buku.
func autoGeneratePreview(bookID uint) {
	var book models.Book
	if err := config.DB.First(&book, bookID).Error; err != nil {
		log.Printf("autoGeneratePreview: buku %d tidak ditemukan: %v", bookID, err)
		return
	}
	if err := generatePreviewPages(&book, 10); err != nil {
		log.Printf("autoGeneratePreview: buku %d gagal: %v", bookID, err)
	} else {
		log.Printf("autoGeneratePreview: buku %d selesai (%d halaman preview)", bookID, book.PreviewPageCount)
	}
}

// ServePreviewPage menyajikan gambar JPEG halaman preview buku (publik).
func ServePreviewPage(c *gin.Context) {
	bookID := c.Param("bookID")
	if !regexp.MustCompile(`^\d+$`).MatchString(bookID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID buku tidak valid"})
		return
	}
	pageStr := c.Param("page")
	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 || page > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nomor halaman tidak valid"})
		return
	}
	imgPath := filepath.Join("storage", "previews", bookID, fmt.Sprintf("%d.jpg", page))
	if _, err := os.Stat(imgPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Halaman preview tidak tersedia"})
		return
	}
	c.Header("Cache-Control", "public, max-age=86400")
	c.File(imgPath)
}

// autoEncryptBook dipanggil sebagai goroutine setelah admin menyetujui buku.
func autoEncryptBook(bookID uint) {
	var book models.Book
	if err := config.DB.First(&book, bookID).Error; err != nil {
		log.Printf("autoEncryptBook: buku %d tidak ditemukan: %v", bookID, err)
		return
	}
	if err := encryptBookCore(&book); err != nil {
		log.Printf("autoEncryptBook: enkripsi buku %d gagal: %v", bookID, err)
		return
	}
	log.Printf("autoEncryptBook: buku %d berhasil dienkripsi (content_id=%s)", bookID, book.LCPContentID)
	if err := generatePreviewPages(&book, 10); err != nil {
		log.Printf("autoEncryptBook: preview buku %d gagal: %v", bookID, err)
	} else {
		log.Printf("autoEncryptBook: preview buku %d selesai (%d halaman)", bookID, book.PreviewPageCount)
	}
}

// EncryptBook adalah HTTP handler untuk enkripsi manual (admin/fallback).
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
	if err := encryptBookCore(&book); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":  "Enkripsi gagal. Pastikan lcpencrypt tersedia di WSL dan LCP Server berjalan.",
			"detail": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message":        "Buku berhasil dienkripsi dan didaftarkan ke LCP Server",
		"lcp_content_id": book.LCPContentID,
		"book_id":        book.ID,
	})
}

// AdminGenerateBookPreview memicu generate ulang preview pages untuk buku yang sudah ada.
func AdminGenerateBookPreview(c *gin.Context) {
	bookIDStr := c.Param("id")
	var book models.Book
	if err := config.DB.First(&book, bookIDStr).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Buku tidak ditemukan"})
		return
	}
	if book.ClearFilePath == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "File mentah buku tidak tersedia"})
		return
	}
	go func() {
		if err := generatePreviewPages(&book, 10); err != nil {
			log.Printf("AdminGenerateBookPreview: buku %d gagal: %v", book.ID, err)
		} else {
			log.Printf("AdminGenerateBookPreview: buku %d selesai (%d halaman)", book.ID, book.PreviewPageCount)
		}
	}()
	c.JSON(http.StatusOK, gin.H{"message": "Preview sedang di-generate di background"})
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
