package config

import (
	"log"
	"os"
	"itspress/backend-cms/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func ConnectDatabase() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL environment variable is not set")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

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

	// Pastikan unique index pada transaction_id ada (idempoten, valid di PostgreSQL)
	db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_transaction_id ON licenses(transaction_id)")

	log.Println("Database connected and migrated successfully.")
	DB = db
}
