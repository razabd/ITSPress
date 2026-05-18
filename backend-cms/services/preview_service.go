package services

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"
	"itspress/backend-cms/utils"
)

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

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		if _, lookErr := exec.LookPath("mutool.exe"); lookErr == nil {
			cmd = exec.Command("mutool.exe", "draw",
				"-o", absOut, "-r", "150",
				absFile, fmt.Sprintf("1-%d", pageCount),
			)
		} else {
			// Fallback: jalankan lewat WSL bash -c agar PATH penuh (apt-installed tools) dimuat
			wslCmd := fmt.Sprintf("mutool draw -o '%s' -r 150 '%s' 1-%d",
				utils.ToWSLPath(absOut), utils.ToWSLPath(absFile), pageCount)
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
		log.Printf("GeneratePreviewPages: mutool error: %v\nOutput: %s", err, string(out))
		return err
	}

	actualCount := 0
	for i := 1; i <= pageCount; i++ {
		if _, e := os.Stat(filepath.Join(previewDir, fmt.Sprintf("%d.jpg", i))); e == nil {
			actualCount = i
		}
	}

	return config.DB.Model(book).Update("preview_page_count", actualCount).Error
}

// AutoGeneratePreview dipanggil sebagai goroutine setelah admin menyetujui buku.
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
