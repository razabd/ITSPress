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
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #F4F8FC;
      color: #0F172A;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 32px 20px 48px;
    }
    .card {
      background: #fff;
      border-radius: 14px;
      border: 1px solid #E2E8F0;
      box-shadow: 0 4px 24px rgba(1,74,143,0.08), 0 1px 4px rgba(0,0,0,0.04);
      max-width: 440px;
      width: 100%;
      overflow: hidden;
    }
    .card-header {
      background: linear-gradient(135deg, #011F42 0%, #013870 50%, #014A8F 100%);
      padding: 22px 28px;
    }
    .brand-label {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.13em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.45);
      margin-bottom: 7px;
    }
    .card-header h1 {
      font-size: 1.05rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.02em;
      line-height: 1.25;
    }
    .card-body {
      padding: 24px 28px 28px;
    }
    p {
      font-size: 0.875rem;
      line-height: 1.72;
      color: #334155;
      margin-bottom: 14px;
    }
    p:last-child { margin-bottom: 0; }
    .info-box {
      background: #EAF4FB;
      border: 1px solid rgba(1,74,143,0.14);
      border-radius: 10px;
      padding: 14px 18px;
      margin: 16px 0 18px;
    }
    .info-box p {
      font-size: 0.875rem;
      color: #013870;
      margin: 0;
      line-height: 1.68;
    }
    .info-box strong { color: #011F42; }
    .note {
      font-size: 0.78rem;
      color: #94A3B8;
      line-height: 1.6;
    }
    a { color: #014A8F; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
    strong { color: #0F172A; }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <div class="brand-label">ITSPress</div>
      <h1>Petunjuk Passphrase LCP</h1>
    </div>
    <div class="card-body">
      <p>Thorium Reader membutuhkan <strong>LCP Passphrase</strong> untuk membuka e-book yang Anda beli di ITSPress.</p>
      <div class="info-box">
        <p>Passphrase ini adalah passphrase yang Anda buat saat mendaftar akun ITSPress, atau yang terakhir Anda ubah di menu <strong>Pengaturan &rsaquo; LCP Passphrase</strong>.</p>
      </div>
      <p>Jika Anda lupa passphrase, login ke akun ITSPress dan ubah passphrase melalui menu <strong>Pengaturan</strong>. Setelah diubah, download ulang file <em>.lcpl</em> dari dashboard.</p>
      <p class="note">Passphrase bersifat rahasia dan tidak dapat ditampilkan ulang oleh sistem.</p>
    </div>
  </div>
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
