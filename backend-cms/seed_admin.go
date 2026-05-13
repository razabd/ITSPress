//go:build ignore

package main

import (
	"fmt"
	"log"
	"os"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	if err := godotenv.Load("../.env"); err != nil {
		log.Println("Warning: .env not found, using system env")
	}

	config.ConnectDatabase()

	email := "admin@itspress.com"
	password := "admin@12345"
	fullName := "Administrator"

	if len(os.Args) >= 3 {
		email = os.Args[1]
		password = os.Args[2]
	}
	if len(os.Args) >= 4 {
		fullName = os.Args[3]
	}

	var existing models.User
	if config.DB.Where("email = ?", email).First(&existing).Error == nil {
		log.Fatalf("User dengan email %s sudah ada (ID: %d, role: %s)", email, existing.ID, existing.Role)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal("Gagal hash password:", err)
	}

	admin := models.User{
		FullName:        fullName,
		Email:           email,
		PasswordHash:    string(hash),
		Role:            models.RoleAdmin,
		IsEmailVerified: true,
	}

	if err := config.DB.Create(&admin).Error; err != nil {
		log.Fatal("Gagal membuat admin:", err)
	}

	fmt.Printf("Admin berhasil dibuat!\n")
	fmt.Printf("  ID       : %d\n", admin.ID)
	fmt.Printf("  Nama     : %s\n", admin.FullName)
	fmt.Printf("  Email    : %s\n", admin.Email)
	fmt.Printf("  Password : %s\n", password)
	fmt.Printf("  Role     : %s\n", admin.Role)
}
