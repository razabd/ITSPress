package controllers

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"

	"github.com/gin-gonic/gin"
)

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

// ServeCover menyajikan gambar cover buku
func ServeCover(c *gin.Context) {
	filename := filepath.Base(c.Param("filename"))
	coverPath := filepath.Join("storage/covers", filename)

	if _, err := os.Stat(coverPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Cover not found"})
		return
	}

	c.File(coverPath)
}

// ServeContent menyajikan file EPUB/PDF terenkripsi berdasarkan LCPContentID.
// Endpoint ini publik karena file sudah terenkripsi AES-256 — tidak bisa dibaca tanpa passphrase.
// URL endpoint ini yang akan disimpan di dalam file .lcpl untuk diakses Thorium Reader.
func ServeContent(c *gin.Context) {
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

	contentTypeMap := map[string]string{
		".epub":  "application/epub+zip",
		".lcpdf": "application/pdf+lcp",
	}
	if ct, ok := contentTypeMap[ext]; ok {
		c.Header("Content-Type", ct)
	}

	c.Header("Content-Disposition", `attachment; filename="`+contentID+ext+`"`)
	c.File(filePath)
}

// ServePreviewPage menyajikan gambar JPEG halaman preview buku (publik).
func ServePreviewPage(c *gin.Context) {
	bookID := c.Param("bookID")
	if !regexp.MustCompile(`^\d+$`).MatchString(bookID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID buku tidak valid"})
		return
	}
	page, err := strconv.Atoi(c.Param("page"))
	if err != nil || page < 1 || page > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nomor halaman tidak valid"})
		return
	}
	imgPath := filepath.Join("storage", "previews", bookID, strconv.Itoa(page)+".jpg")
	if _, err := os.Stat(imgPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Halaman preview tidak tersedia"})
		return
	}
	c.Header("Cache-Control", "public, max-age=86400")
	c.File(imgPath)
}
