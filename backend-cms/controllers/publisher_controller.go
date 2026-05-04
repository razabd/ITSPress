package controllers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"

	"github.com/gin-gonic/gin"
)

// UploadDeclaration menerima file PDF surat pernyataan dari publisher,
// menyimpannya ke storage/declarations/, dan mengubah ApprovalStatus dari draft ke pending.
func UploadDeclaration(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var user models.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}

	if user.Role != models.RolePublisher {
		c.JSON(http.StatusForbidden, gin.H{"error": "Hanya publisher yang dapat mengupload surat pernyataan"})
		return
	}

	if user.ApprovalStatus == models.ApprovalApproved {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Akun Anda sudah disetujui"})
		return
	}
	if user.ApprovalStatus == models.ApprovalPending {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Surat pernyataan Anda sudah dikirim dan sedang ditinjau oleh admin. Harap menunggu."})
		return
	}

	file, header, err := c.Request.FormFile("declaration")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File surat pernyataan wajib diupload"})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".pdf" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Format file harus PDF"})
		return
	}

	const maxSize = 5 << 20 // 5 MB
	if header.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ukuran file maksimal 5 MB"})
		return
	}

	declDir := "storage/declarations"
	if err := os.MkdirAll(declDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat direktori penyimpanan"})
		return
	}

	fileID, err := generateRandomID()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat ID file"})
		return
	}
	savePath := filepath.Join(declDir, fmt.Sprintf("%s.pdf", fileID))

	out, err := os.Create(savePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan file"})
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan file"})
		return
	}

	// Hapus file lama jika ada
	if user.DeclarationFilePath != "" {
		os.Remove(user.DeclarationFilePath)
	}

	config.DB.Model(&user).Updates(map[string]interface{}{
		"declaration_file_path": savePath,
		"approval_status":       models.ApprovalPending,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Surat pernyataan berhasil diupload. Akun Anda sedang dalam peninjauan oleh Admin ITS Press."})
}
