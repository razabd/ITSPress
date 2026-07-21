package services

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"
	"itspress/backend-cms/utils"
)

// EncryptBookCore melakukan enkripsi LCP pada sebuah buku dan memperbarui record DB.
// Dapat dipanggil dari HTTP handler maupun goroutine background.
func EncryptBookCore(book *models.Book) error {
	if book.LCPContentID != "" {
		return nil
	}
	if book.ClearFilePath == "" {
		return fmt.Errorf("file buku tidak ditemukan di server")
	}

	contentID, err := utils.GenerateRandomID()
	if err != nil {
		return fmt.Errorf("gagal generate content ID: %v", err)
	}

	encryptedDir := "storage/encrypted"
	if err := os.MkdirAll(encryptedDir, os.ModePerm); err != nil {
		return fmt.Errorf("gagal membuat direktori: %v", err)
	}

	backendURL := os.Getenv("BACKEND_PUBLIC_URL")
	if backendURL == "" {
		log.Println("WARNING: BACKEND_PUBLIC_URL tidak di-set, menggunakan fallback localhost:8081")
		backendURL = "http://localhost:8081"
	}
	contentURL := backendURL + "/api/v1/content/"
	ext := strings.ToLower(filepath.Ext(book.ClearFilePath))

	outExtMap := map[string]string{
		".epub": ".epub",
		".pdf":  ".lcpdf",
	}
	outExt := outExtMap[ext]
	if outExt == "" {
		outExt = ext
	}
	encryptedPath := filepath.Join(encryptedDir, contentID+outExt)

	lcpEncryptRaw := os.Getenv("LCP_ENCRYPT_BIN")
	if lcpEncryptRaw == "" {
		lcpEncryptRaw = "lcpencrypt"
	}
	// Pisahkan command dari prefix args (misal: "wsl /path/to/lcpencrypt" → cmd="wsl", prefixArgs=["/path/to/lcpencrypt"])
	// CATATAN (legacy development): dukungan prefix "wsl" dipakai saat masa
	// pengembangan, karena Readium LCP hanya bekerja pada Linux sedangkan
	// backend/frontend ITSPress dikembangkan pada Windows. Di production
	// (VPS Linux/Docker), LCP_ENCRYPT_BIN cukup diisi path binary lcpencrypt.
	lcpEncryptParts := strings.Fields(lcpEncryptRaw)
	lcpEncryptBin := lcpEncryptParts[0]
	lcpEncryptPrefix := lcpEncryptParts[1:]
	// Jika command adalah "wsl", path Windows perlu dikonversi ke path WSL (/mnt/c/...)
	useWSL := lcpEncryptBin == "wsl"
	lcpLogin := os.Getenv("LCP_SERVER_LOGIN")
	lcpPassword := os.Getenv("LCP_SERVER_PASSWORD")
	if lcpLogin == "" || lcpPassword == "" {
		return fmt.Errorf("LCP_SERVER_LOGIN dan LCP_SERVER_PASSWORD harus di-set")
	}
	lcpSvHost := os.Getenv("LCP_SERVER_URL")
	if lcpSvHost == "" {
		log.Println("WARNING: LCP_SERVER_URL tidak di-set, menggunakan fallback localhost:8989")
		lcpSvHost = "http://localhost:8989"
	}
	lcpSvWithAuth := strings.Replace(lcpSvHost, "://", fmt.Sprintf("://%s:%s@", lcpLogin, lcpPassword), 1)

	lcpProvider := os.Getenv("LCP_PROVIDER")
	if lcpProvider == "" {
		log.Println("WARNING: LCP_PROVIDER tidak di-set, menggunakan fallback https://itspress.its.ac.id")
		lcpProvider = "https://itspress.its.ac.id"
	}

	// Jika via WSL, gunakan tmpDir di dalam storage backend agar path mudah dikonversi ke /mnt/...
	// Jika native, gunakan OS temp dir seperti biasa
	var tmpDir string
	if strings.Fields(os.Getenv("LCP_ENCRYPT_BIN"))[0] == "wsl" {
		tmpDir = filepath.Join("storage", "tmp_lcp")
	} else {
		tmpDir = filepath.Join(os.TempDir(), "lcp_encrypted")
	}
	if err := os.MkdirAll(tmpDir, os.ModePerm); err != nil {
		return fmt.Errorf("gagal membuat direktori sementara: %v", err)
	}

	extractCover := (ext == ".epub" || ext == ".pdf") && book.CoverURL == ""

	absClearPath, err := filepath.Abs(book.ClearFilePath)
	if err != nil {
		return fmt.Errorf("gagal resolve path file buku: %v", err)
	}

	// Konversi path Windows → WSL jika lcpencrypt dipanggil via "wsl"
	inputPath := absClearPath
	storagePath := tmpDir
	if useWSL {
		inputPath = windowsToWSLPath(absClearPath)
		storagePath = windowsToWSLPath(tmpDir)
	}

	args := []string{
		"-input", inputPath,
		"-storage", storagePath,
		"-contentid", contentID,
		"-url", contentURL,
		"-lcpsv", lcpSvWithAuth,
		"-provider", lcpProvider,
	}
	if extractCover {
		args = append(args, "-cover")
	}
	cmd := exec.Command(lcpEncryptBin, append(lcpEncryptPrefix, args...)...)

	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("lcpencrypt error: %v\nOutput: %s", err, string(out))
		return fmt.Errorf("enkripsi gagal: %s", string(out))
	}

	tmpSrc := filepath.Join(tmpDir, contentID+outExt)
	if err := copyFile(tmpSrc, encryptedPath); err != nil {
		return fmt.Errorf("gagal menyalin file hasil enkripsi: %v", err)
	}
	os.Remove(tmpSrc)

	if strings.EqualFold(ext, ".pdf") && book.Title != "" {
		if patchErr := patchLCPDFTitle(encryptedPath, book.Title); patchErr != nil {
			log.Printf("Warning: gagal patch title di manifest.json: %v", patchErr)
		}
	}

	var newCoverURL string
	if extractCover {
		coverDir := "storage/covers"
		if mkErr := os.MkdirAll(coverDir, os.ModePerm); mkErr != nil {
			log.Printf("Warning: gagal membuat direktori cover: %v", mkErr)
		}
		matches, _ := filepath.Glob(filepath.Join(tmpDir, contentID+".*"))
		imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true}
		for _, match := range matches {
			if !imageExts[strings.ToLower(filepath.Ext(match))] {
				continue
			}
			coverFileID, genErr := utils.GenerateRandomID()
			if genErr != nil {
				log.Printf("Warning: gagal generate cover file ID: %v", genErr)
				coverFileID = contentID + "-cover"
			}
			coverExt := strings.ToLower(filepath.Ext(match))
			coverDst := filepath.Join(coverDir, coverFileID+coverExt)
			if cpErr := copyFile(match, coverDst); cpErr != nil {
				log.Printf("Warning: gagal menyalin cover: %v", cpErr)
				continue
			}
			os.Remove(match)
			newCoverURL = "/api/v1/covers/" + coverFileID + coverExt
			log.Printf("Cover berhasil diekstrak: %s", newCoverURL)
			break
		}
		if newCoverURL == "" {
			log.Printf("Info: lcpencrypt tidak menghasilkan cover untuk contentID %s, mencoba ekstrak manual...", contentID)
		}

		// Fallback: jika lcpencrypt tidak menghasilkan cover, ekstrak langsung dari EPUB
		if newCoverURL == "" && ext == ".epub" {
			if coverPath, extractErr := utils.ExtractEPUBCover(book.ClearFilePath, coverDir); extractErr != nil {
				log.Printf("Warning: gagal ekstrak cover EPUB: %v", extractErr)
			} else if coverPath != "" {
				newCoverURL = "/api/v1/covers/" + filepath.Base(coverPath)
				log.Printf("Cover EPUB berhasil diekstrak: %s", newCoverURL)
			}
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

// RecoverUnencryptedBooks dijalankan saat startup: retry enkripsi untuk semua buku
// yang punya file sumber tapi belum memiliki lcp_content_id.
func RecoverUnencryptedBooks() {
	var books []models.Book
	config.DB.Where("clear_file_path != ? AND lcp_content_id = ?", "", "").Find(&books)
	if len(books) == 0 {
		return
	}
	log.Printf("RecoverUnencryptedBooks: %d buku belum terenkripsi, memulai retry...", len(books))
	for _, b := range books {
		go AutoEncryptBook(b.ID)
	}
}

// AutoEncryptBook dipanggil sebagai goroutine setelah buku diupload atau disetujui admin.
func AutoEncryptBook(bookID uint) {
	var book models.Book
	if err := config.DB.First(&book, bookID).Error; err != nil {
		log.Printf("AutoEncryptBook: buku %d tidak ditemukan: %v", bookID, err)
		return
	}
	if err := EncryptBookCore(&book); err != nil {
		log.Printf("AutoEncryptBook: enkripsi buku %d gagal: %v", bookID, err)
		return
	}
	log.Printf("AutoEncryptBook: buku %d berhasil dienkripsi (content_id=%s)", bookID, book.LCPContentID)
	if err := GeneratePreviewPages(&book, 10); err != nil {
		log.Printf("AutoEncryptBook: preview buku %d gagal: %v", bookID, err)
	} else {
		log.Printf("AutoEncryptBook: preview buku %d selesai (%d halaman)", bookID, book.PreviewPageCount)
	}
}

func copyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("gagal membuka %s: %v", src, err)
	}
	defer srcFile.Close()
	dstFile, err := os.Create(dst)
	if err != nil {
		return fmt.Errorf("gagal membuat %s: %v", dst, err)
	}
	defer dstFile.Close()
	_, err = io.Copy(dstFile, srcFile)
	return err
}

// patchLCPDFTitle membuka file .lcpdf (ZIP), memperbarui field metadata.title
// di dalam manifest.json, lalu menulis ulang file.
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
			var manifest map[string]interface{}
			if err := json.NewDecoder(rc).Decode(&manifest); err != nil {
				rc.Close()
				return err
			}
			rc.Close()

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

	return os.WriteFile(lcpdfPath, buf.Bytes(), 0644)
}

// windowsToWSLPath mengkonversi path Windows (C:\foo\bar) ke path WSL (/mnt/c/foo/bar).
// Digunakan saat lcpencrypt dipanggil via "wsl" dari backend yang berjalan di Windows native.
func windowsToWSLPath(winPath string) string {
	// Normalisasi backslash ke forward slash
	p := strings.ReplaceAll(winPath, `\`, "/")
	// Konversi drive letter: "C:/..." → "/mnt/c/..."
	if len(p) >= 2 && p[1] == ':' {
		drive := strings.ToLower(string(p[0]))
		rest := ""
		if len(p) > 2 {
			rest = p[2:] // sudah diawali "/"
		}
		return "/mnt/" + drive + rest
	}
	return p
}
