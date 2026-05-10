package config

import (
	"log"
	"itspress/backend-cms/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var DB *gorm.DB

func ConnectDatabase() {
	db, err := gorm.Open(sqlite.Open("itspress.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto Migrate semua tabel dari model
	err = db.AutoMigrate(
		&models.User{},
		&models.Book{},
		&models.Transaction{},
		&models.License{},
		&models.CartItem{},
		&models.PasswordResetToken{},
		&models.EmailVerificationToken{},
	)
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Pastikan unique index pada transaction_id ada (idempoten)
	db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_transaction_id ON licenses(transaction_id)")

	log.Println("Database connected and migrated successfully.")
	DB = db
}
