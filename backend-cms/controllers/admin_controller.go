package controllers

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"
	"itspress/backend-cms/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// --- Response DTOs ---

type AdminUserResponse struct {
	ID              uint    `json:"id"`
	FullName        string  `json:"full_name"`
	Email           string  `json:"email"`
	Role            string  `json:"role"`
	IsActive        bool    `json:"is_active"`
	IsEmailVerified bool    `json:"is_email_verified"`
	CreatedAt       string  `json:"created_at"`
	DeactivatedAt   *string `json:"deactivated_at,omitempty"`
}

// AdminGetUsers mengembalikan semua user (aktif & nonaktif) dengan filter role opsional
func AdminGetUsers(c *gin.Context) {
	roleFilter := c.Query("role")

	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit < 1 || limit > 100 {
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
		var deactivatedAt *string
		if u.DeletedAt.Valid {
			t := u.DeletedAt.Time.Format(time.RFC3339)
			deactivatedAt = &t
		}

		result = append(result, AdminUserResponse{
			ID:              u.ID,
			FullName:        u.FullName,
			Email:           u.Email,
			Role:            string(u.Role),
			IsActive:        !u.DeletedAt.Valid,
			IsEmailVerified: u.IsEmailVerified,
			CreatedAt:       u.CreatedAt.Format(time.RFC3339),
			DeactivatedAt:   deactivatedAt,
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

	selfID, ok := utils.MustGetAuthUserID(c)
	if !ok {
		return
	}
	if id == fmt.Sprintf("%d", selfID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tidak bisa menonaktifkan akun sendiri."})
		return
	}

	var user models.User
	if err := config.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}

	if user.Role != models.RolePelanggan {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya akun pelanggan yang dapat dinonaktifkan."})
		return
	}

	if err := config.DB.Delete(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menonaktifkan akun"})
		return
	}
	log.Printf("[AUDIT] Admin %d menonaktifkan user %s", selfID, id)
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
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit < 1 || limit > 100 {
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
	adminID, ok := utils.MustGetAuthUserID(c)
	if !ok {
		return
	}

	var book models.Book
	if err := config.DB.First(&book, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Buku tidak ditemukan"})
		return
	}

	if err := config.DB.Delete(&book).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menghapus buku"})
		return
	}
	log.Printf("[AUDIT] Admin %d menghapus buku %s", adminID, id)
	c.JSON(http.StatusOK, gin.H{"message": "Buku berhasil dihapus"})
}

// AdminGetTransactions mengembalikan semua transaksi dengan filter status opsional
func AdminGetTransactions(c *gin.Context) {
	statusFilter := c.Query("status")

	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if err != nil || limit < 1 || limit > 100 {
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
