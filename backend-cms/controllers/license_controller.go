package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"
	"itspress/backend-cms/services"

	"github.com/gin-gonic/gin"
)

func lcpServerURL() string {
	if url := os.Getenv("LCP_SERVER_URL"); url != "" {
		return url
	}
	log.Println("WARNING: LCP_SERVER_URL tidak di-set, menggunakan fallback localhost:8989")
	return "http://localhost:8989"
}

func backendPublicURL() string {
	if url := os.Getenv("BACKEND_PUBLIC_URL"); url != "" {
		return url
	}
	log.Println("WARNING: BACKEND_PUBLIC_URL tidak di-set, menggunakan fallback localhost:8081")
	return "http://localhost:8081"
}

// GetMyLicenses mengambil daftar lisensi yang dimiliki pelanggan.
// Jika ada transaksi sukses yang belum punya lisensi (karena LCP server sempat mati),
// retry generate license di background agar user cukup refresh dashboard.
func GetMyLicenses(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var licenses []models.License
	config.DB.Preload("Book").Where("user_id = ?", userID).Find(&licenses)

	var orphaned []models.Transaction
	config.DB.
		Where("user_id = ? AND status = ?", userID, models.StatusSuccess).
		Where("id NOT IN (SELECT transaction_id FROM licenses WHERE deleted_at IS NULL)").
		Find(&orphaned)
	for _, tx := range orphaned {
		go autoGenerateLicense(tx.ID, tx.UserID)
	}

	c.JSON(http.StatusOK, gin.H{"data": licenses})
}

// DownloadLicense mengirimkan file .lcpl ke pelanggan
func DownloadLicense(c *gin.Context) {
	userID, _ := c.Get("user_id")
	licenseID := c.Param("id")

	var license models.License
	if err := config.DB.Where("id = ? AND user_id = ?", licenseID, userID).First(&license).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "License not found or access denied"})
		return
	}

	if license.RevokedAt != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Lisensi ini telah dicabut oleh administrator"})
		return
	}

	if license.LicenseFilePath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "License file has not been generated yet"})
		return
	}

	filename := filepath.Base(license.LicenseFilePath)
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", "application/vnd.readium.lcp.license.v1.0+json")
	c.File(license.LicenseFilePath)
}

// generateLicenseCore adalah inti logic pembuatan lisensi LCP.
// Dipanggil oleh GenerateLicense (HTTP handler) dan autoGenerateLicense (goroutine).
func generateLicenseCore(txID uint, userID uint) error {
	// Idempoten: jangan buat ulang jika sudah ada
	var existing models.License
	if config.DB.Where("transaction_id = ?", txID).First(&existing).Error == nil {
		return nil
	}

	var tx models.Transaction
	if err := config.DB.Preload("Book").First(&tx, txID).Error; err != nil {
		return fmt.Errorf("transaction %d not found: %v", txID, err)
	}
	if tx.Book.LCPContentID == "" {
		return fmt.Errorf("book %d not encrypted", tx.BookID)
	}

	var user models.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		return fmt.Errorf("user %d not found: %v", userID, err)
	}
	if user.LCPPassphraseHash == "" {
		return fmt.Errorf("user %d has no LCP passphrase", userID)
	}

	now := time.Now().UTC()
	licenseEnd := time.Date(2099, 12, 31, 23, 59, 59, 0, time.UTC)

	reqBody := map[string]interface{}{
		"provider": backendPublicURL(),
		"user": map[string]interface{}{
			"id":        fmt.Sprintf("%d", user.ID),
			"email":     user.Email,
			"name":      user.FullName,
			"encrypted": []string{},
		},
		"encryption": map[string]interface{}{
			"user_key": map[string]interface{}{
				"text_hint": "Passphrase ITSPress Anda — dibuat saat registrasi atau diubah di menu Pengaturan akun",
				"hex_value": user.LCPPassphraseHash,
			},
		},
		"rights": map[string]interface{}{
			"print": 0,
			"copy":  0,
			"start": now.Format(time.RFC3339),
			"end":   licenseEnd.Format(time.RFC3339),
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("marshal error: %v", err)
	}

	lcpLogin := os.Getenv("LCP_SERVER_LOGIN")
	lcpPassword := os.Getenv("LCP_SERVER_PASSWORD")
	if lcpLogin == "" || lcpPassword == "" {
		return fmt.Errorf("LCP_SERVER_LOGIN dan LCP_SERVER_PASSWORD harus di-set")
	}

	lcpURL := fmt.Sprintf("%s/contents/%s/license", lcpServerURL(), tx.Book.LCPContentID)
	req, err := http.NewRequest("POST", lcpURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("build request error: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(lcpLogin, lcpPassword)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("LCP server unreachable: %v", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			log.Printf("Gagal menutup response body: %v", err)
		}
	}()

	lcplBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		// Konten tidak dikenal LCP server: lcpencrypt dulu exit 0 tapi push ke server gagal.
		// Reset state enkripsi buku dan trigger ulang agar lcpencrypt mendaftarkan ulang kontennya.
		if resp.StatusCode == http.StatusNotFound && strings.Contains(string(lcplBytes), "Content not found") {
			config.DB.Model(&models.Book{}).Where("id = ?", tx.BookID).Updates(map[string]interface{}{
				"lcp_content_id":      "",
				"encrypted_file_path": "",
			})
			go services.AutoEncryptBook(tx.BookID)
			return fmt.Errorf("konten buku %d tidak terdaftar di LCP server, enkripsi ulang dimulai", tx.BookID)
		}
		return fmt.Errorf("LCP server returned %d: %s", resp.StatusCode, string(lcplBytes))
	}

	licenseDir := "storage/licenses"
	if err := os.MkdirAll(licenseDir, os.ModePerm); err != nil {
		return fmt.Errorf("failed to create license directory: %v", err)
	}
	licenseFilePath := filepath.Join(licenseDir, fmt.Sprintf("license_tx_%d.lcpl", txID))
	if err := os.WriteFile(licenseFilePath, lcplBytes, 0644); err != nil {
		return fmt.Errorf("write file error: %v", err)
	}

	var lcplJSON map[string]interface{}
	if err := json.Unmarshal(lcplBytes, &lcplJSON); err != nil {
		return fmt.Errorf("invalid JSON from LCP server: %v", err)
	}
	lcpLicenseID, _ := lcplJSON["id"].(string)

	license := models.License{
		UserID:          userID,
		BookID:          tx.BookID,
		TransactionID:   txID,
		LCPLicenseID:    lcpLicenseID,
		LicenseFilePath: licenseFilePath,
		ExpiresAt:       nil, // berlaku selamanya (2099 di dalam file LCPL)
	}
	result := config.DB.Create(&license)
	if result.Error != nil {
		if strings.Contains(result.Error.Error(), "UNIQUE constraint failed") {
			return nil // sudah ada, tidak masalah (idempoten)
		}
		return fmt.Errorf("DB save error: %v", result.Error)
	}

	log.Printf("License generated: tx=%d user=%d book=%d", txID, userID, tx.BookID)
	return nil
}

// autoGenerateLicense dipanggil sebagai goroutine setelah transaksi sukses.
// Error dicatat di log tapi tidak menggagalkan proses utama.
func autoGenerateLicense(txID uint, userID uint) {
	if err := generateLicenseCore(txID, userID); err != nil {
		log.Printf("autoGenerateLicense failed (tx=%d user=%d): %v", txID, userID, err)
	}
}

// refreshLicenseFile memanggil LCP server untuk mendapatkan lisensi baru dengan
// passphrase hash terkini, menimpa file .lcpl lama, dan memperbarui record DB.
func refreshLicenseFile(license *models.License, user *models.User) error {
	var tx models.Transaction
	if err := config.DB.Preload("Book").First(&tx, license.TransactionID).Error; err != nil {
		return fmt.Errorf("transaction %d not found: %v", license.TransactionID, err)
	}
	if tx.Book.LCPContentID == "" {
		return fmt.Errorf("book %d belum dienkripsi", tx.BookID)
	}

	now := time.Now().UTC()
	licenseEnd := time.Date(2099, 12, 31, 23, 59, 59, 0, time.UTC)

	reqBody := map[string]interface{}{
		"provider": backendPublicURL(),
		"user": map[string]interface{}{
			"id":        fmt.Sprintf("%d", user.ID),
			"email":     user.Email,
			"name":      user.FullName,
			"encrypted": []string{},
		},
		"encryption": map[string]interface{}{
			"user_key": map[string]interface{}{
				"text_hint": "Passphrase ITSPress Anda — dibuat saat registrasi atau diubah di menu Pengaturan akun",
				"hex_value": user.LCPPassphraseHash,
			},
		},
		"rights": map[string]interface{}{
			"print": 0,
			"copy":  0,
			"start": now.Format(time.RFC3339),
			"end":   licenseEnd.Format(time.RFC3339),
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	lcpLogin := os.Getenv("LCP_SERVER_LOGIN")
	lcpPassword := os.Getenv("LCP_SERVER_PASSWORD")
	if lcpLogin == "" || lcpPassword == "" {
		return fmt.Errorf("LCP_SERVER_LOGIN dan LCP_SERVER_PASSWORD harus di-set")
	}

	lcpURL := fmt.Sprintf("%s/contents/%s/license", lcpServerURL(), tx.Book.LCPContentID)
	req, err := http.NewRequest("POST", lcpURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(lcpLogin, lcpPassword)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("LCP server tidak dapat dijangkau: %v", err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			log.Printf("Gagal menutup response body: %v", err)
		}
	}()

	lcplBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("LCP server returned %d: %s", resp.StatusCode, string(lcplBytes))
	}

	if err := os.WriteFile(license.LicenseFilePath, lcplBytes, 0644); err != nil {
		return err
	}

	var lcplJSON map[string]interface{}
	if err := json.Unmarshal(lcplBytes, &lcplJSON); err != nil {
		return fmt.Errorf("invalid JSON from LCP server: %v", err)
	}
	if newID, _ := lcplJSON["id"].(string); newID != "" {
		config.DB.Model(license).Update("lcp_license_id", newID)
	}

	return nil
}

// RefreshUserLicenses meregenerasi semua file .lcpl milik user dengan passphrase hash terkini.
// Dipanggil secara sinkron setelah passphrase diupdate agar file langsung siap didownload.
func RefreshUserLicenses(userID uint) {
	var user models.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		log.Printf("RefreshUserLicenses: user %d tidak ditemukan: %v", userID, err)
		return
	}

	var licenses []models.License
	config.DB.Where("user_id = ?", userID).Find(&licenses)

	for i := range licenses {
		if err := refreshLicenseFile(&licenses[i], &user); err != nil {
			log.Printf("RefreshUserLicenses: gagal refresh lisensi %d: %v", licenses[i].ID, err)
		} else {
			log.Printf("RefreshUserLicenses: lisensi %d berhasil diperbarui (user %d)", licenses[i].ID, userID)
		}
	}
}

// RecoverOrphanedLicenses dijalankan saat startup: mencari semua transaksi sukses
// yang belum punya lisensi, lalu retry generate license di background.
// Menangani kasus LCP server mati pada saat pembayaran dikonfirmasi.
func RecoverOrphanedLicenses() {
	var txs []models.Transaction
	config.DB.
		Where("status = ?", models.StatusSuccess).
		Where("id NOT IN (SELECT transaction_id FROM licenses WHERE deleted_at IS NULL)").
		Find(&txs)
	if len(txs) == 0 {
		return
	}
	log.Printf("RecoverOrphanedLicenses: %d transaksi tanpa lisensi, memulai retry...", len(txs))
	for _, tx := range txs {
		if err := generateLicenseCore(tx.ID, tx.UserID); err != nil {
			log.Printf("RecoverOrphanedLicenses: gagal generate license untuk tx %d user %d: %v", tx.ID, tx.UserID, err)
		}
	}
}

// GenerateLicense adalah HTTP handler untuk generate lisensi secara manual (fallback).
func GenerateLicense(c *gin.Context) {
	userID, _ := c.Get("user_id")
	transactionID := c.Param("transaction_id")

	var tx models.Transaction
	if err := config.DB.Where("id = ? AND user_id = ? AND status = ?", transactionID, userID, models.StatusSuccess).First(&tx).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Valid transaction not found"})
		return
	}

	// Cek apakah lisensi sudah ada
	var existing models.License
	if config.DB.Where("transaction_id = ?", tx.ID).First(&existing).Error == nil {
		c.JSON(http.StatusOK, gin.H{"message": "Lisensi sudah tersedia", "license_id": existing.ID})
		return
	}

	if err := generateLicenseCore(tx.ID, userID.(uint)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var newLicense models.License
	config.DB.Where("transaction_id = ?", tx.ID).First(&newLicense)
	c.JSON(http.StatusCreated, gin.H{"message": "Lisensi berhasil di-generate!", "license_id": newLicense.ID})
}
