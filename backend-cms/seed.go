//go:build ignore

package main

import (
	"fmt"
	"log"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

// ── Ubah credential di sini sesuai kebutuhan ──────────────────────────────────

var seeds = []struct {
	FullName string
	Email    string
	Password string
	Role     models.UserRole
}{
	{
		FullName: "Administrator",
		Email:    "admin@itspress.com",
		Password: "admin@12345",
		Role:     models.RoleAdmin,
	},
	{
		FullName: "ITS Press",
		Email:    "itspress@test.com",
		Password: "itspress@123",
		Role:     models.RolePublisher,
	},
}

// ─────────────────────────────────────────────────────────────────────────────

func main() {
	for _, path := range []string{".env", "../.env"} {
		if err := godotenv.Load(path); err == nil {
			break
		}
	}

	config.ConnectDatabase()

	for _, s := range seeds {
		upsert(s.FullName, s.Email, s.Password, s.Role)
	}
}

func upsert(fullName, email, password string, role models.UserRole) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Gagal hash password untuk %s: %v", email, err)
	}

	var user models.User
	result := config.DB.Where("email = ?", email).First(&user)

	if result.Error == nil {
		// Sudah ada — update password dan pastikan field lain benar
		if err := config.DB.Model(&user).Updates(map[string]interface{}{
			"full_name":         fullName,
			"password_hash":     string(hash),
			"role":              role,
			"is_email_verified": true,
		}).Error; err != nil {
			log.Fatalf("Gagal update %s: %v", email, err)
		}
		fmt.Printf("[UPDATE] %-12s  %s  (ID: %d)\n", role, email, user.ID)
	} else {
		// Belum ada — buat baru
		user = models.User{
			FullName:        fullName,
			Email:           email,
			PasswordHash:    string(hash),
			Role:            role,
			IsEmailVerified: true,
		}
		if err := config.DB.Create(&user).Error; err != nil {
			log.Fatalf("Gagal membuat %s: %v", email, err)
		}
		fmt.Printf("[CREATE] %-12s  %s  (ID: %d)\n", role, email, user.ID)
	}
}
