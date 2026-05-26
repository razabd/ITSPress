package controllers

import (
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"
	"itspress/backend-cms/services"
	"itspress/backend-cms/utils"

	"github.com/gin-gonic/gin"
)

// GetBooks mengambil seluruh katalog buku (publik)
func GetBooks(c *gin.Context) {
	var books []models.Book
	config.DB.Preload("Publisher").
		Where("lcp_content_id != ? AND (is_withdrawn = ? OR is_withdrawn IS NULL)", "", false).
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
		ID            uint    `json:"id"`
		Title         string  `json:"title"`
		Format        string  `json:"format"`
		Price         float64 `json:"price"`
		IsWithdrawn   bool    `json:"is_withdrawn"`
		LCPContentID  string  `json:"lcp_content_id"`
		PurchaseCount int64   `json:"purchase_count"`
		Revenue       float64 `json:"revenue"`
	}

	var stats []bookStat
	config.DB.Raw(`
		SELECT
			b.id, b.title, b.format, b.price,
			b.is_withdrawn, b.lcp_content_id,
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
		if s.LCPContentID != "" && !s.IsWithdrawn {
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

// UploadBook hanya bisa diakses oleh Publisher.
// Menerima file upload + metadata, lalu menyimpan file mentah ke storage/raw/
// dan memulai enkripsi LCP secara otomatis di background.
func UploadBook(c *gin.Context) {
	publisherID, _ := c.Get("user_id")

	title := c.PostForm("title")
	description := c.PostForm("description")
	priceStr := c.PostForm("price")
	format := c.PostForm("format")
	author := c.PostForm("author")
	isbn := c.PostForm("isbn")
	publishedYear, _ := strconv.Atoi(c.PostForm("published_year"))
	pageCount, _ := strconv.Atoi(c.PostForm("page_count"))

	allowedFormats := map[string]bool{
		"epub": true, "pdf": true,
	}
	if title == "" || format == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Judul dan format wajib diisi"})
		return
	}
	if !allowedFormats[strings.ToLower(format)] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format tidak didukung. Pilih: epub atau pdf"})
		return
	}

	price, _ := strconv.ParseFloat(priceStr, 64)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "E-book file is required"})
		return
	}

	rawDir := "storage/raw"
	if err := os.MkdirAll(rawDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create storage directory"})
		return
	}

	fileID, err := utils.GenerateRandomID()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate file ID"})
		return
	}
	ext := filepath.Ext(filepath.Base(fileHeader.Filename))
	destPath := filepath.Join(rawDir, fileID+ext)

	src, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open uploaded file"})
		return
	}
	defer func() {
		if err := src.Close(); err != nil {
			log.Printf("Gagal menutup file sumber: %v", err)
		}
	}()

	dst, err := os.Create(destPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	defer func() {
		if err := dst.Close(); err != nil {
			log.Printf("Gagal menutup file tujuan: %v", err)
		}
	}()
	if _, err := io.Copy(dst, src); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Generate cover otomatis hanya untuk PDF via MuPDF
	var coverURL string
	if strings.EqualFold(format, "pdf") {
		coverDir := "storage/covers"
		if err := os.MkdirAll(coverDir, os.ModePerm); err != nil {
			log.Printf("Warning: gagal membuat direktori cover: %v", err)
			coverDir = "storage"
		}
		coverPath, err := utils.GeneratePDFCover(destPath, coverDir)
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
		if !allowedMIME[coverHeader.Header.Get("Content-Type")] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Tipe file cover tidak valid"})
			return
		}
		coverDir := "storage/covers"
		if err := os.MkdirAll(coverDir, os.ModePerm); err != nil {
			log.Printf("Warning: gagal membuat direktori cover: %v", err)
			coverDir = "storage"
		}
		if coverFileID, genErr := utils.GenerateRandomID(); genErr == nil {
			coverDstPath := filepath.Join(coverDir, coverFileID+coverExt)
			if saveErr := c.SaveUploadedFile(coverHeader, coverDstPath); saveErr == nil {
				coverURL = "/api/v1/covers/" + filepath.Base(coverDstPath)
			} else {
				log.Printf("Warning: gagal menyimpan cover: %v", saveErr)
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
		Author:        author,
		PublishedYear: publishedYear,
		ISBN:          isbn,
		PageCount:     pageCount,
	}

	if err := config.DB.Create(&book).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save book record"})
		return
	}

	go services.AutoEncryptBook(book.ID)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Book uploaded successfully. Encryption started automatically.",
		"book_id": book.ID,
		"data":    book,
	})
}

// UpdateBook memungkinkan publisher memperbarui metadata dan/atau file buku.
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
	editPublishedYear, _ := strconv.Atoi(c.PostForm("published_year"))
	editPageCount, _ := strconv.Atoi(c.PostForm("page_count"))

	updates := map[string]interface{}{
		"title":          title,
		"description":    description,
		"price":          price,
		"author":         c.PostForm("author"),
		"published_year": editPublishedYear,
		"isbn":           c.PostForm("isbn"),
		"page_count":     editPageCount,
	}

	if coverHeader, err := c.FormFile("cover"); err == nil {
		coverExt := strings.ToLower(filepath.Ext(filepath.Base(coverHeader.Filename)))
		allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true}
		if allowed[coverExt] {
			allowedMIME := map[string]bool{
				"image/jpeg": true,
				"image/png":  true,
				"image/webp": true,
			}
			if !allowedMIME[coverHeader.Header.Get("Content-Type")] {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Tipe file cover tidak valid"})
				return
			}
			coverDir := "storage/covers"
			if err := os.MkdirAll(coverDir, os.ModePerm); err != nil {
				log.Printf("Warning: gagal membuat direktori cover: %v", err)
				coverDir = "storage"
			}
			if coverFileID, genErr := utils.GenerateRandomID(); genErr == nil {
				coverDstPath := filepath.Join(coverDir, coverFileID+coverExt)
				if saveErr := c.SaveUploadedFile(coverHeader, coverDstPath); saveErr == nil {
					updates["cover_url"] = "/api/v1/covers/" + filepath.Base(coverDstPath)
				}
			}
		}
	}

	fileReplaced := false
	if fileHeader, err := c.FormFile("file"); err == nil {
		rawDir := "storage/raw"
		if err := os.MkdirAll(rawDir, os.ModePerm); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create storage directory"})
			return
		}
		if fileID, genErr := utils.GenerateRandomID(); genErr == nil {
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
		go services.AutoEncryptBook(book.ID)
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
func RelistBook(c *gin.Context) {
	publisherID, _ := c.Get("user_id")
	bookIDStr := c.Param("id")

	var book models.Book
	if err := config.DB.Where("id = ? AND publisher_id = ?", bookIDStr, publisherID).First(&book).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Buku tidak ditemukan"})
		return
	}
	updates := map[string]interface{}{
		"is_withdrawn": false,
	}
	if err := config.DB.Model(&book).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mendaftarkan ulang buku"})
		return
	}
	if book.LCPContentID == "" {
		go services.AutoEncryptBook(book.ID)
	}
	c.JSON(http.StatusOK, gin.H{"message": "Buku berhasil didaftarkan ulang ke katalog"})
}
