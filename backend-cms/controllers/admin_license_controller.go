package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"

	"github.com/gin-gonic/gin"
)

func lsdServerURL() string {
	if url := os.Getenv("LSD_SERVER_URL"); url != "" {
		return url
	}
	log.Println("WARNING: LSD_SERVER_URL tidak di-set, menggunakan fallback localhost:8990")
	return "http://localhost:8990"
}

func lsdAuth() (string, string) {
	return os.Getenv("LSD_SERVER_LOGIN"), os.Getenv("LSD_SERVER_PASSWORD")
}

// fetchLSDStatus mengambil status lisensi dari LSD server secara real-time.
// Mengembalikan "unknown" (tanpa error) jika LSD server tidak bisa dijangkau.
func fetchLSDStatus(lcpLicenseID string) string {
	if lcpLicenseID == "" {
		return "unknown"
	}

	login, password := lsdAuth()
	url := fmt.Sprintf("%s/licenses/%s/status", lsdServerURL(), lcpLicenseID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "unknown"
	}
	if login != "" {
		req.SetBasicAuth(login, password)
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("fetchLSDStatus: LSD server tidak bisa dijangkau untuk license %s: %v", lcpLicenseID, err)
		return "unknown"
	}
	defer func() {
		if cerr := resp.Body.Close(); cerr != nil {
			log.Printf("fetchLSDStatus: gagal menutup response body: %v", cerr)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		return "unknown"
	}

	var statusDoc map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&statusDoc); err != nil {
		return "unknown"
	}

	if s, ok := statusDoc["status"].(string); ok {
		return s
	}
	return "unknown"
}

// ensureLSDStatusRecord memastikan LSD server punya status record untuk lisensi ini.
// Diperlukan untuk lisensi lama yang dibuat sebelum lsd_notify_auth dikonfigurasi.
// Jika record sudah ada, LSD mengembalikan error (diabaikan). Jika belum ada, dibuat.
func ensureLSDStatusRecord(lcpLicenseID string) {
	login, password := lsdAuth()
	if login == "" {
		return
	}

	body, err := json.Marshal(map[string]interface{}{"id": lcpLicenseID})
	if err != nil {
		return
	}

	req, err := http.NewRequest("PUT", lsdServerURL()+"/licenses", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/vnd.readium.lcp.license.v1.0+json")
	req.SetBasicAuth(login, password)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("ensureLSDStatusRecord: LSD tidak bisa dijangkau untuk %s: %v", lcpLicenseID, err)
		return
	}
	defer func() {
		if cerr := resp.Body.Close(); cerr != nil {
			log.Printf("ensureLSDStatusRecord: gagal menutup response body: %v", cerr)
		}
	}()
	log.Printf("ensureLSDStatusRecord: PUT /licenses → %d untuk license %s", resp.StatusCode, lcpLicenseID)
}

// patchLSDStatus mengirim PATCH ke LSD server untuk mencabut atau membatalkan lisensi.
// newStatus harus "revoked" (sudah pernah dipakai/aktif) atau "cancelled" (belum pernah dipakai).
// LSD server otomatis mengubah "revoked" menjadi "cancelled" jika status masih "ready".
func patchLSDStatus(lcpLicenseID string, newStatus string) error {
	login, password := lsdAuth()
	if login == "" {
		return fmt.Errorf("LSD_SERVER_LOGIN tidak di-set")
	}

	url := fmt.Sprintf("%s/licenses/%s/status", lsdServerURL(), lcpLicenseID)

	body, err := json.Marshal(map[string]interface{}{
		"status": newStatus,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PATCH", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/vnd.readium.lcp.license.status.document.v1.0+json")
	req.SetBasicAuth(login, password)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("LSD server tidak dapat dijangkau: %v", err)
	}
	defer func() {
		if cerr := resp.Body.Close(); cerr != nil {
			log.Printf("patchLSDStatus: gagal menutup response body: %v", cerr)
		}
	}()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("LSD server returned %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// AdminListLicenses mengembalikan semua lisensi dengan informasi user dan buku.
// Query params: page, per_page, email (filter by user email), revoked (true/false)
func AdminListLicenses(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 50
	}
	offset := (page - 1) * perPage

	query := config.DB.Preload("User").Preload("Book").
		Order("licenses.created_at DESC")
	countQuery := config.DB.Model(&models.License{})

	if email := c.Query("email"); email != "" {
		var userIDs []uint
		config.DB.Model(&models.User{}).Where("email ILIKE ?", "%"+email+"%").Pluck("id", &userIDs)
		if len(userIDs) == 0 {
			c.JSON(http.StatusOK, gin.H{"data": []models.License{}, "total": 0, "page": page, "per_page": perPage})
			return
		}
		query = query.Where("licenses.user_id IN ?", userIDs)
		countQuery = countQuery.Where("user_id IN ?", userIDs)
	}

	switch c.Query("revoked") {
	case "true":
		query = query.Where("licenses.revoked_at IS NOT NULL")
		countQuery = countQuery.Where("revoked_at IS NOT NULL")
	case "false":
		query = query.Where("licenses.revoked_at IS NULL")
		countQuery = countQuery.Where("revoked_at IS NULL")
	}

	var total int64
	countQuery.Count(&total)

	var licenses []models.License
	query.Limit(perPage).Offset(offset).Find(&licenses)

	c.JSON(http.StatusOK, gin.H{
		"data":     licenses,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

// AdminGetLicenseDetail mengembalikan satu lisensi beserta status real-time dari LSD server.
func AdminGetLicenseDetail(c *gin.Context) {
	id := c.Param("id")

	var license models.License
	if err := config.DB.Preload("User").Preload("Book").First(&license, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Lisensi tidak ditemukan"})
		return
	}

	lsdStatus := fetchLSDStatus(license.LCPLicenseID)

	c.JSON(http.StatusOK, gin.H{
		"data":       license,
		"lsd_status": lsdStatus,
	})
}

// AdminRevokeLicense mencabut lisensi melalui LSD server dan menandainya di DB.
func AdminRevokeLicense(c *gin.Context) {
	id := c.Param("id")

	var license models.License
	if err := config.DB.Preload("User").Preload("Book").First(&license, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Lisensi tidak ditemukan"})
		return
	}
	if license.RevokedAt != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Lisensi sudah dicabut sebelumnya"})
		return
	}

	if license.LCPLicenseID != "" {
		// Pastikan LSD punya record untuk lisensi ini (lisensi lama mungkin belum ter-register)
		ensureLSDStatusRecord(license.LCPLicenseID)
		// "revoked" = sudah pernah dipakai (status active); LSD otomatis ubah ke "cancelled" jika masih "ready"
		if err := patchLSDStatus(license.LCPLicenseID, "revoked"); err != nil {
			log.Printf("AdminRevokeLicense: LSD PATCH gagal untuk license %s: %v — tetap lanjut revoke di DB", license.LCPLicenseID, err)
		}
	}

	now := time.Now()
	if err := config.DB.Model(&license).Update("revoked_at", &now).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan status pencabutan"})
		return
	}

	log.Printf("AdminRevokeLicense: lisensi %d (LCP: %s, user: %d, buku: %d) dicabut oleh admin",
		license.ID, license.LCPLicenseID, license.UserID, license.BookID)

	c.JSON(http.StatusOK, gin.H{"message": "Lisensi berhasil dicabut"})
}

// AdminReissueLicense mencabut lisensi lama dan menerbitkan lisensi baru untuk transaksi yang sama.
func AdminReissueLicense(c *gin.Context) {
	id := c.Param("id")

	var license models.License
	if err := config.DB.Preload("User").Preload("Book").First(&license, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Lisensi tidak ditemukan"})
		return
	}

	txID := license.TransactionID
	userID := license.UserID

	// Cabut lisensi lama di LSD server (register dulu jika belum ada record-nya)
	if license.LCPLicenseID != "" {
		ensureLSDStatusRecord(license.LCPLicenseID)
		if err := patchLSDStatus(license.LCPLicenseID, "revoked"); err != nil {
			log.Printf("AdminReissueLicense: LSD PATCH gagal: %v — tetap lanjut hapus lisensi lama", err)
		}
	}

	// Hard-delete lisensi lama agar unique index pada transaction_id tidak menghalangi record baru
	if err := config.DB.Unscoped().Delete(&license).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menghapus lisensi lama"})
		return
	}

	// Terbitkan lisensi baru; generateLicenseCore juga akan notify LSD server via notifyLsdServer()
	if err := generateLicenseCore(txID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menerbitkan lisensi baru: " + err.Error()})
		return
	}

	var newLicense models.License
	config.DB.Preload("User").Preload("Book").Where("transaction_id = ?", txID).First(&newLicense)

	log.Printf("AdminReissueLicense: lisensi baru diterbitkan (tx=%d user=%d LCP: %s)",
		txID, userID, newLicense.LCPLicenseID)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Lisensi baru berhasil diterbitkan",
		"data":    newLicense,
	})
}
