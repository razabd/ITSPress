package main

import (
	"log"

	"itspress/backend-cms/config"
	"itspress/backend-cms/routes"

	"github.com/joho/godotenv"
)

func main() {
	// Load .env dari root project (satu level di atas backend-cms/)
	if err := godotenv.Load("../.env"); err != nil {
		log.Println("Warning: .env file not found, using system environment variables")
	}

	// 1. Inisiasi & Migrasi Database
	config.ConnectDatabase()

	// 2. Setup Router & semua routes
	r := routes.SetupRouter()

	// 3. Jalankan server di port 8080
	log.Println("ITSPress Backend CMS running on http://localhost:8081")
	if err := r.Run(":8081"); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
