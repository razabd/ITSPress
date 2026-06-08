package utils

import (
	"archive/zip"
	"crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
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

// ExtractEPUBCover membuka EPUB (ZIP), menemukan gambar cover via OPF (EPUB2/3),
// menyalinnya ke coverDir, dan mengembalikan path file yang disimpan.
// Mengembalikan ("", nil) jika EPUB tidak memiliki cover — bukan error.
func ExtractEPUBCover(epubPath, coverDir string) (string, error) {
	zr, err := zip.OpenReader(epubPath)
	if err != nil {
		return "", fmt.Errorf("gagal membuka EPUB: %w", err)
	}
	defer zr.Close()

	readZipFile := func(name string) ([]byte, error) {
		for _, f := range zr.File {
			if f.Name == name {
				rc, err := f.Open()
				if err != nil {
					return nil, err
				}
				defer rc.Close()
				return io.ReadAll(rc)
			}
		}
		return nil, fmt.Errorf("file %s tidak ditemukan di EPUB", name)
	}

	// Parse container.xml untuk menemukan path file OPF
	containerData, err := readZipFile("META-INF/container.xml")
	if err != nil {
		return "", err
	}
	var container struct {
		Rootfiles []struct {
			FullPath string `xml:"full-path,attr"`
		} `xml:"rootfiles>rootfile"`
	}
	if err := xml.Unmarshal(containerData, &container); err != nil || len(container.Rootfiles) == 0 {
		return "", fmt.Errorf("gagal parse container.xml")
	}
	opfPath := container.Rootfiles[0].FullPath
	opfDir := strings.TrimSuffix(filepath.ToSlash(filepath.Dir(opfPath)), "/")

	// Parse OPF untuk menemukan cover image
	opfData, err := readZipFile(opfPath)
	if err != nil {
		return "", err
	}
	var opf struct {
		Metadata struct {
			Metas []struct {
				Name    string `xml:"name,attr"`
				Content string `xml:"content,attr"`
			} `xml:"meta"`
		} `xml:"metadata"`
		Manifest struct {
			Items []struct {
				ID         string `xml:"id,attr"`
				Href       string `xml:"href,attr"`
				MediaType  string `xml:"media-type,attr"`
				Properties string `xml:"properties,attr"`
			} `xml:"item"`
		} `xml:"manifest"`
	}
	if err := xml.Unmarshal(opfData, &opf); err != nil {
		return "", fmt.Errorf("gagal parse OPF: %w", err)
	}

	coverHref := ""
	// EPUB3: properties="cover-image"
	for _, item := range opf.Manifest.Items {
		if strings.Contains(item.Properties, "cover-image") {
			coverHref = item.Href
			break
		}
	}
	// EPUB2: <meta name="cover" content="item-id">
	if coverHref == "" {
		coverItemID := ""
		for _, m := range opf.Metadata.Metas {
			if strings.EqualFold(m.Name, "cover") {
				coverItemID = m.Content
				break
			}
		}
		if coverItemID != "" {
			for _, item := range opf.Manifest.Items {
				if item.ID == coverItemID {
					coverHref = item.Href
					break
				}
			}
		}
	}
	if coverHref == "" {
		return "", nil // tidak ada cover — bukan error
	}

	// Bangun path lengkap di dalam ZIP
	zipCoverPath := coverHref
	if opfDir != "" && opfDir != "." {
		zipCoverPath = opfDir + "/" + coverHref
	}

	var coverEntry *zip.File
	for _, f := range zr.File {
		if filepath.ToSlash(f.Name) == zipCoverPath {
			coverEntry = f
			break
		}
	}
	if coverEntry == nil {
		return "", nil
	}

	// Simpan cover ke coverDir
	if err := os.MkdirAll(coverDir, os.ModePerm); err != nil {
		return "", err
	}
	coverID, err := GenerateRandomID()
	if err != nil {
		return "", err
	}
	ext := strings.ToLower(filepath.Ext(coverHref))
	if ext == "" {
		ext = ".jpg"
	}
	destPath := filepath.Join(coverDir, coverID+ext)

	rc, err := coverEntry.Open()
	if err != nil {
		return "", err
	}
	defer rc.Close()

	dst, err := os.Create(destPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err = io.Copy(dst, rc); err != nil {
		return "", err
	}
	return destPath, nil
}
