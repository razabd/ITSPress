package controllers

import (
	"net/http"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"
	"itspress/backend-cms/services"

	"github.com/gin-gonic/gin"
)

// EncryptBook adalah HTTP handler untuk enkripsi manual (fallback jika enkripsi otomatis gagal).
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
	if err := services.EncryptBookCore(&book); err != nil {
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
