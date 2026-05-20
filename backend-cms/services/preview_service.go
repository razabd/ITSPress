package services

import (
	"fmt"
	"image/jpeg"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"
	"itspress/backend-cms/utils"
)

// getDocPageCount menjalankan mutool info untuk membaca jumlah halaman dokumen.
func getDocPageCount(absFilePath string) (int, error) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		if _, lookErr := exec.LookPath("mutool.exe"); lookErr == nil {
			cmd = exec.Command("mutool.exe", "info", absFilePath)
		} else {
			wslCmd := fmt.Sprintf("mutool info '%s' 2>/dev/null", utils.ToWSLPath(absFilePath))
			cmd = exec.Command("wsl", "/bin/bash", "-c", wslCmd)
		}
	} else {
		cmd = exec.Command("mutool", "info", absFilePath)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return 0, fmt.Errorf("mutool info gagal: %w", err)
	}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Pages:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				if n, convErr := strconv.Atoi(parts[1]); convErr == nil {
					return n, nil
				}
			}
		}
	}
	return 0, fmt.Errorf("jumlah halaman tidak ditemukan di output mutool info")
}

// compressJPEG membaca file JPEG dari disk dan menulis ulang dengan kualitas lebih rendah.
func compressJPEG(path string, quality int) {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("compressJPEG: gagal buka %s: %v", path, err)
		return
	}
	img, err := jpeg.Decode(f)
	f.Close()
	if err != nil {
		log.Printf("compressJPEG: gagal decode %s: %v", path, err)
		return
	}
	out, err := os.Create(path)
	if err != nil {
		log.Printf("compressJPEG: gagal buat file %s: %v", path, err)
		return
	}
	defer out.Close()
	if err := jpeg.Encode(out, img, &jpeg.Options{Quality: quality}); err != nil {
		log.Printf("compressJPEG: gagal encode %s: %v", path, err)
	}
}

// GeneratePreviewPages me-render pageCount halaman pertama dari file mentah buku
// sebagai JPEG menggunakan mutool (MuPDF), lalu menyimpannya di storage/previews/{bookID}/.
func GeneratePreviewPages(book *models.Book, pageCount int) error {
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

	// Query jumlah halaman aktual agar mutool draw tidak diminta halaman yang tidak ada
	if docPages, infoErr := getDocPageCount(absFile); infoErr != nil {
		log.Printf("GeneratePreviewPages: gagal baca page count buku %d: %v", book.ID, infoErr)
	} else if docPages < pageCount {
		pageCount = docPages
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		if _, lookErr := exec.LookPath("mutool.exe"); lookErr == nil {
			cmd = exec.Command("mutool.exe", "draw",
				"-o", absOut, "-r", "96",
				absFile, fmt.Sprintf("1-%d", pageCount),
			)
		} else {
			wslCmd := fmt.Sprintf("mutool draw -o '%s' -r 96 '%s' 1-%d",
				utils.ToWSLPath(absOut), utils.ToWSLPath(absFile), pageCount)
			cmd = exec.Command("wsl", "/bin/bash", "-c", wslCmd)
		}
	} else {
		cmd = exec.Command("mutool", "draw",
			"-o", absOut, "-r", "96",
			absFile, fmt.Sprintf("1-%d", pageCount),
		)
	}

	out, mutoolErr := cmd.CombinedOutput()

	actualCount := 0
	for i := 1; i <= pageCount; i++ {
		if _, e := os.Stat(filepath.Join(previewDir, fmt.Sprintf("%d.jpg", i))); e == nil {
			actualCount = i
		}
	}

	if actualCount == 0 {
		log.Printf("GeneratePreviewPages: mutool error (0 halaman): %v\nOutput: %s", mutoolErr, string(out))
		return fmt.Errorf("preview gagal: %w", mutoolErr)
	}
	if mutoolErr != nil {
		log.Printf("GeneratePreviewPages: %d halaman ter-generate (mutool partial: %v)", actualCount, mutoolErr)
	}

	for i := 1; i <= actualCount; i++ {
		compressJPEG(filepath.Join(previewDir, fmt.Sprintf("%d.jpg", i)), 80)
	}

	return config.DB.Model(book).Update("preview_page_count", actualCount).Error
}

// AutoGeneratePreview dipanggil sebagai goroutine setelah buku dienkripsi.
func AutoGeneratePreview(bookID uint) {
	var book models.Book
	if err := config.DB.First(&book, bookID).Error; err != nil {
		log.Printf("AutoGeneratePreview: buku %d tidak ditemukan: %v", bookID, err)
		return
	}
	if err := GeneratePreviewPages(&book, 10); err != nil {
		log.Printf("AutoGeneratePreview: buku %d gagal: %v", bookID, err)
	} else {
		log.Printf("AutoGeneratePreview: buku %d selesai (%d halaman preview)", bookID, book.PreviewPageCount)
	}
}
