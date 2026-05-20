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
	"runtime"
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
	os.MkdirAll(encryptedDir, os.ModePerm)

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
		log.Println("WARNING: LCP_SERVER_URL tidak di-set, menggunakan fallback localhost:8989")
		lcpSvHost = "http://localhost:8989"
	}
	lcpSvWithAuth := strings.Replace(lcpSvHost, "://", fmt.Sprintf("://%s:%s@", lcpLogin, lcpPassword), 1)
	wslTmpDir := "/tmp/lcp_encrypted"

	extractCover := (ext == ".epub" || ext == ".pdf") && book.CoverURL == ""

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		absClearPath, _ := filepath.Abs(book.ClearFilePath)
		wslInput := utils.ToWSLPath(absClearPath)
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
		wslDst := utils.ToWSLPath(absEncryptedPath)
		absEncryptedDir, _ := filepath.Abs(encryptedDir)
		wslEncryptedDir := utils.ToWSLPath(absEncryptedDir)
		cpCmd := exec.Command("wsl", "/bin/bash", "-c",
			fmt.Sprintf("mkdir -p %q && cp %q %q", wslEncryptedDir, wslSrc, wslDst),
		)
		cpOut, cpErr := cpCmd.CombinedOutput()
		if cpErr != nil {
			log.Printf("copy error: %v\nOutput: %s", cpErr, string(cpOut))
			return fmt.Errorf("gagal menyalin file hasil enkripsi: %s", string(cpOut))
		}
	} else {
		tmpSrc := fmt.Sprintf("%s/%s%s", wslTmpDir, contentID, outExt)
		srcFile, err := os.Open(tmpSrc)
		if err != nil {
			return fmt.Errorf("gagal membuka file hasil enkripsi: %v", err)
		}
		defer srcFile.Close()
		dstFile, err := os.Create(encryptedPath)
		if err != nil {
			return fmt.Errorf("gagal membuat file enkripsi tujuan: %v", err)
		}
		defer dstFile.Close()
		if _, err = io.Copy(dstFile, srcFile); err != nil {
			return fmt.Errorf("gagal menyalin file enkripsi: %v", err)
		}
		os.Remove(tmpSrc)
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
			coverFileID, _ := utils.GenerateRandomID()
			absCoverDir, _ := filepath.Abs(coverDir)
			wslCoverDst := utils.ToWSLPath(filepath.Join(absCoverDir, coverFileID+coverExt))
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

// RecoverUnencryptedBooks dijalankan saat startup: retry enkripsi untuk semua buku
// yang punya file sumber tapi belum memiliki lcp_content_id.
// Menangani kasus LCP server mati pada saat buku diupload.
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

// patchLCPDFTitle membuka file .lcpdf (ZIP), memperbarui field metadata.title
// di dalam manifest.json dengan title dari record buku, lalu menulis ulang file.
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
