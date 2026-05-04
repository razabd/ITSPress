package controllers

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"

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

	var users []struct {
		models.User
		DeletedAt gorm.DeletedAt
	}

	query := config.DB.Unscoped().Model(&models.User{})
	if roleFilter != "" && roleFilter != "all" {
		query = query.Where("role = ?", roleFilter)
	}
	query.Order("created_at DESC").Find(&users)

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

	c.JSON(http.StatusOK, gin.H{"data": result})
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
	var books []models.Book
	config.DB.Preload("Publisher").Order("created_at DESC").Find(&books)
	c.JSON(http.StatusOK, gin.H{"data": books})
}

// AdminDeleteBook menghapus buku (hard delete dari DB)
func AdminDeleteBook(c *gin.Context) {
	id := c.Param("id")

	var book models.Book
	if err := config.DB.First(&book, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Buku tidak ditemukan"})
		return
	}

	// Soft delete via GORM default
	config.DB.Delete(&book)
	c.JSON(http.StatusOK, gin.H{"message": "Buku berhasil dihapus"})
}

// --- Publisher Approval ---

type PendingPublisherResponse struct {
	ID                  uint   `json:"id"`
	FullName            string `json:"full_name"`
	Email               string `json:"email"`
	ApprovalStatus      string `json:"approval_status"`
	HasDeclaration      bool   `json:"has_declaration"`
	CreatedAt           string `json:"created_at"`
}

// AdminGetPendingPublishers mengembalikan semua publisher dengan status pending
func AdminGetPendingPublishers(c *gin.Context) {
	var users []models.User
	config.DB.Where("role = ? AND approval_status = ?", models.RolePublisher, models.ApprovalPending).
		Order("created_at DESC").Find(&users)

	result := make([]PendingPublisherResponse, 0, len(users))
	for _, u := range users {
		result = append(result, PendingPublisherResponse{
			ID:             u.ID,
			FullName:       u.FullName,
			Email:          u.Email,
			ApprovalStatus: string(u.ApprovalStatus),
			HasDeclaration: u.DeclarationFilePath != "",
			CreatedAt:      u.CreatedAt.Format(time.RFC3339),
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": result})
}

// AdminApprovePublisher menyetujui pendaftaran publisher
func AdminApprovePublisher(c *gin.Context) {
	id := c.Param("id")

	var user models.User
	if err := config.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}
	if user.Role != models.RolePublisher {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User bukan publisher"})
		return
	}

	config.DB.Model(&user).Updates(map[string]interface{}{
		"approval_status": models.ApprovalApproved,
		"approval_note":   "",
	})

	c.JSON(http.StatusOK, gin.H{"message": "Publisher berhasil disetujui"})
}

type RejectPublisherInput struct {
	Note string `json:"note"`
}

// AdminRejectPublisher menolak pendaftaran publisher dengan catatan alasan
func AdminRejectPublisher(c *gin.Context) {
	id := c.Param("id")

	var input RejectPublisherInput
	c.ShouldBindJSON(&input)

	var user models.User
	if err := config.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}
	if user.Role != models.RolePublisher {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User bukan publisher"})
		return
	}

	config.DB.Model(&user).Updates(map[string]interface{}{
		"approval_status": models.ApprovalRejected,
		"approval_note":   input.Note,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Publisher ditolak"})
}

// AdminDownloadDeclaration mengirimkan file PDF surat pernyataan publisher ke admin
func AdminDownloadDeclaration(c *gin.Context) {
	id := c.Param("id")

	var user models.User
	if err := config.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}
	if user.DeclarationFilePath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Surat pernyataan belum diupload"})
		return
	}
	if _, err := os.Stat(user.DeclarationFilePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "File tidak ditemukan di server"})
		return
	}

	filename := fmt.Sprintf("surat_pernyataan_%d.pdf", user.ID)
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.File(user.DeclarationFilePath)
}

// AdminGetTransactions mengembalikan semua transaksi dengan filter status opsional
func AdminGetTransactions(c *gin.Context) {
	statusFilter := c.Query("status")

	var txs []models.Transaction
	query := config.DB.Preload("User").Preload("Book")
	if statusFilter != "" && statusFilter != "all" {
		query = query.Where("status = ?", statusFilter)
	}
	query.Order("created_at DESC").Find(&txs)

	c.JSON(http.StatusOK, gin.H{"data": txs})
}
