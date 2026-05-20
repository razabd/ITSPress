package main

import (
	"log"
	"os"

	"itspress/backend-cms/config"
	"itspress/backend-cms/controllers"
	"itspress/backend-cms/routes"
	"itspress/backend-cms/services"

	"github.com/joho/godotenv"
)

func main() {
	// Coba load .env dari beberapa lokasi; di production env var sudah di-set oleh sistem
	for _, path := range []string{".env", "../.env"} {
		if err := godotenv.Load(path); err == nil {
			break
		}
	}

	// 1. Inisiasi & Migrasi Database
	config.ConnectDatabase()

	// 2. Recovery startup: retry enkripsi buku yang gagal + generate lisensi yang hilang
	// (berjalan di goroutine agar tidak memblok startup server)
	go services.RecoverUnencryptedBooks()
	go controllers.RecoverOrphanedLicenses()

	// 3. Setup Router & semua routes
	r := routes.SetupRouter()

	// 3. Jalankan server — port dari env PORT, default :8081
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	log.Printf("ITSPress Backend CMS running on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
