package controllers

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"
	"itspress/backend-cms/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// --- Response DTOs ---

type AdminUserResponse struct {
	ID        uint   `json:"id"`
	FullName  string `json:"full_name"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	IsActive  bool   `json:"is_active"`
	CreatedAt string `json:"created_at"`
}

// AdminGetUsers mengembalikan semua user (aktif & nonaktif) dengan filter role opsional
func AdminGetUsers(c *gin.Context) {
	roleFilter := c.Query("role")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var users []struct {
		models.User
		DeletedAt gorm.DeletedAt
	}

	query := config.DB.Unscoped().Model(&models.User{})
	if roleFilter != "" && roleFilter != "all" {
		query = query.Where("role = ?", roleFilter)
	}

	var total int64
	query.Count(&total)
	query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&users)

	result := make([]AdminUserResponse, 0, len(users))
	for _, u := range users {
		result = append(result, AdminUserResponse{
			ID:        u.ID,
			FullName:  u.FullName,
			Email:     u.Email,
			Role:      string(u.Role),
			IsActive:  !u.DeletedAt.Valid,
			CreatedAt: u.Model.CreatedAt.Format(time.RFC3339),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  result,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// AdminDeactivateUser menonaktifkan akun user (soft delete)
func AdminDeactivateUser(c *gin.Context) {
	id := c.Param("id")

	// Cegah admin menghapus dirinya sendiri
	selfID, _ := c.Get("user_id")
	if id == fmt.Sprintf("%v", selfID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tidak bisa menonaktifkan akun sendiri."})
		return
	}

	var user models.User
	if err := config.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}

	config.DB.Delete(&user)
	log.Printf("[AUDIT] Admin %v menonaktifkan user %s", selfID, id)
	c.JSON(http.StatusOK, gin.H{"message": "Akun berhasil dinonaktifkan"})
}

// AdminReactivateUser mengaktifkan kembali akun yang dinonaktifkan
func AdminReactivateUser(c *gin.Context) {
	id := c.Param("id")

	result := config.DB.Unscoped().Model(&models.User{}).Where("id = ?", id).
		Update("deleted_at", nil)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Akun berhasil diaktifkan kembali"})
}

// AdminGetBooks mengembalikan semua buku dari semua publisher
func AdminGetBooks(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var books []models.Book
	var total int64
	config.DB.Model(&models.Book{}).Count(&total)
	config.DB.Preload("Publisher").Order("created_at DESC").Limit(limit).Offset(offset).Find(&books)
	c.JSON(http.StatusOK, gin.H{
		"data":  books,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// AdminDeleteBook menghapus buku (hard delete dari DB)
func AdminDeleteBook(c *gin.Context) {
	id := c.Param("id")
	adminID, _ := c.Get("user_id")

	var book models.Book
	if err := config.DB.First(&book, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Buku tidak ditemukan"})
		return
	}

	// Soft delete via GORM default
	config.DB.Delete(&book)
	log.Printf("[AUDIT] Admin %v menghapus buku %s", adminID, id)
	c.JSON(http.StatusOK, gin.H{"message": "Buku berhasil dihapus"})
}

// AdminGenerateBookPreview memicu generate ulang preview pages untuk buku yang sudah ada.
func AdminGenerateBookPreview(c *gin.Context) {
	bookIDStr := c.Param("id")
	var book models.Book
	if err := config.DB.First(&book, bookIDStr).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Buku tidak ditemukan"})
		return
	}
	if book.ClearFilePath == "" {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "File mentah buku tidak tersedia"})
		return
	}
	go func() {
		if err := services.GeneratePreviewPages(&book, 10); err != nil {
			log.Printf("AdminGenerateBookPreview: buku %d gagal: %v", book.ID, err)
		} else {
			log.Printf("AdminGenerateBookPreview: buku %d selesai (%d halaman)", book.ID, book.PreviewPageCount)
		}
	}()
	c.JSON(http.StatusOK, gin.H{"message": "Preview sedang di-generate di background"})
}

// AdminGetTransactions mengembalikan semua transaksi dengan filter status opsional
func AdminGetTransactions(c *gin.Context) {
	statusFilter := c.Query("status")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var txs []models.Transaction
	var total int64
	countQuery := config.DB.Model(&models.Transaction{})
	if statusFilter != "" && statusFilter != "all" {
		countQuery = countQuery.Where("status = ?", statusFilter)
	}
	countQuery.Count(&total)

	dataQuery := config.DB.Preload("User").Preload("Book")
	if statusFilter != "" && statusFilter != "all" {
		dataQuery = dataQuery.Where("status = ?", statusFilter)
	}
	dataQuery.Order("created_at DESC").Limit(limit).Offset(offset).Find(&txs)

	c.JSON(http.StatusOK, gin.H{
		"data":  txs,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}
