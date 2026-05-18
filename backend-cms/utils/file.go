package utils

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// GenerateRandomID membuat ID acak 16-byte sebagai string hex (32 karakter)
func GenerateRandomID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ToWSLPath mengkonversi path Windows (C:\...) ke path WSL (/mnt/c/...)
func ToWSLPath(winPath string) string {
	p := strings.ReplaceAll(winPath, "\\", "/")
	if len(p) >= 2 && p[1] == ':' {
		drive := strings.ToLower(string(p[0]))
		p = "/mnt/" + drive + p[2:]
	}
	return p
}

// WSLDistroName mengembalikan nama distro WSL dari env WSL_DISTRO atau default "Ubuntu"
func WSLDistroName() string {
	if name := os.Getenv("WSL_DISTRO"); name != "" {
		return name
	}
	return "Ubuntu"
}

// GeneratePDFCover mengekstrak halaman pertama PDF sebagai gambar PNG cover
// menggunakan mutool (MuPDF). Mengembalikan path file cover yang dibuat.
func GeneratePDFCover(pdfPath string, coverDir string) (string, error) {
	coverID, err := GenerateRandomID()
	if err != nil {
		return "", err
	}

	coverPath := filepath.Join(coverDir, coverID+".png")

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		absPDF, err := filepath.Abs(pdfPath)
		if err != nil {
			return "", err
		}
		absCover, err := filepath.Abs(coverPath)
		if err != nil {
			return "", err
		}
		cmd = exec.Command("wsl", "mutool", "draw",
			"-o", ToWSLPath(absCover),
			"-r", "150",
			ToWSLPath(absPDF), "1",
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
		return "", fmt.Errorf("mutool gagal: %w", err)
	}

	return coverPath, nil
}
