package controllers

import (
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"

	"github.com/gin-gonic/gin"
	"github.com/midtrans/midtrans-go"
	"github.com/midtrans/midtrans-go/coreapi"
	"github.com/midtrans/midtrans-go/snap"
)

type PurchaseInput struct {
	BookID uint `json:"book_id" binding:"required"`
}

func midtransEnv() midtrans.EnvironmentType {
	if os.Getenv("MIDTRANS_ENV") == "production" {
		return midtrans.Production
	}
	return midtrans.Sandbox
}

func midtransServerKey() string {
	return os.Getenv("SERVER_KEY")
}

func frontendURL() string {
	if url := os.Getenv("FRONTEND_URL"); url != "" {
		return url
	}
	return "http://localhost:3000"
}

// splitName memisahkan nama lengkap menjadi first name dan last name
func splitName(fullName string) (string, string) {
	parts := strings.SplitN(strings.TrimSpace(fullName), " ", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return fullName, ""
}

// midtransItemName memotong judul buku agar tidak melebihi batas 50 karakter Midtrans
func midtransItemName(title string) string {
	runes := []rune(title)
	if len(runes) > 50 {
		return string(runes[:47]) + "..."
	}
	return title
}

// createSnapToken memanggil Midtrans Snap API dan mengembalikan token + redirect URL
func createSnapToken(orderID string, book models.Book, user models.User) (string, string, error) {
	snapClient := snap.Client{}
	snapClient.New(midtransServerKey(), midtransEnv())

	grossAmount := int64(book.Price)
	firstName, lastName := splitName(user.FullName)

	req := &snap.Request{
		TransactionDetails: midtrans.TransactionDetails{
			OrderID:  orderID,
			GrossAmt: grossAmount,
		},
		CustomerDetail: &midtrans.CustomerDetails{
			FName: firstName,
			LName: lastName,
			Email: user.Email,
		},
		Items: &[]midtrans.ItemDetails{
			{
				ID:    fmt.Sprintf("book-%d", book.ID),
				Price: grossAmount,
				Qty:   1,
				Name:  midtransItemName(book.Title),
			},
		},
		Callbacks: &snap.Callbacks{
			Finish: frontendURL() + "/dashboard?tab=transaksi",
		},
	}

	resp, err := snapClient.CreateTransaction(req)
	if err != nil {
		return "", "", fmt.Errorf("midtrans: %v", err)
	}
	return resp.Token, resp.RedirectURL, nil
}

// createCartSnapToken membuat Snap token untuk checkout cart (multiple books, satu payment).
func createCartSnapToken(orderID string, books []models.Book, user models.User, totalAmount int64) (string, string, error) {
	snapClient := snap.Client{}
	snapClient.New(midtransServerKey(), midtransEnv())

	firstName, lastName := splitName(user.FullName)

	items := make([]midtrans.ItemDetails, len(books))
	for i, book := range books {
		items[i] = midtrans.ItemDetails{
			ID:    fmt.Sprintf("book-%d", book.ID),
			Price: int64(book.Price),
			Qty:   1,
			Name:  midtransItemName(book.Title),
		}
	}

	req := &snap.Request{
		TransactionDetails: midtrans.TransactionDetails{
			OrderID:  orderID,
			GrossAmt: totalAmount,
		},
		CustomerDetail: &midtrans.CustomerDetails{
			FName: firstName,
			LName: lastName,
			Email: user.Email,
		},
		Items: &items,
		Callbacks: &snap.Callbacks{
			Finish: frontendURL() + "/dashboard?tab=transaksi",
		},
	}

	resp, err := snapClient.CreateTransaction(req)
	if err != nil {
		return "", "", fmt.Errorf("midtrans: %v", err)
	}
	return resp.Token, resp.RedirectURL, nil
}

// syncStatusFromMidtrans mengambil status terkini dari Midtrans API dan update DB.
// Jika order ID digunakan oleh beberapa transaksi (cart checkout), semua diupdate sekaligus.
func syncStatusFromMidtrans(tx *models.Transaction) {
	coreClient := coreapi.Client{}
	coreClient.New(midtransServerKey(), midtransEnv())

	res, err := coreClient.CheckTransaction(tx.MidtransOrderID)
	if err != nil {
		return
	}

	var newStatus models.TransactionStatus
	switch res.TransactionStatus {
	case "settlement":
		newStatus = models.StatusSuccess
	case "capture":
		if res.FraudStatus == "accept" {
			newStatus = models.StatusSuccess
		} else {
			newStatus = models.StatusFailed
		}
	case "deny", "cancel", "expire":
		newStatus = models.StatusFailed
	default:
		return
	}

	if newStatus != tx.Status {
		// Update semua transaksi dengan order ID yang sama (bisa lebih dari satu untuk cart checkout)
		config.DB.Model(&models.Transaction{}).Where("midtrans_order_id = ?", tx.MidtransOrderID).Update("status", newStatus)
		tx.Status = newStatus

		// Bersihkan cart dan generate lisensi otomatis jika pembayaran berhasil
		if newStatus == models.StatusSuccess {
			var siblings []models.Transaction
			config.DB.Where("midtrans_order_id = ?", tx.MidtransOrderID).Find(&siblings)
			for _, s := range siblings {
				config.DB.Where("user_id = ? AND book_id = ?", s.UserID, s.BookID).Delete(&models.CartItem{})
				autoGenerateLicense(s.ID, s.UserID)
			}
		}
	}
}

// Purchase membuat transaksi pending dan meminta Snap token ke Midtrans.
// Untuk buku gratis (harga 0), langsung set success tanpa melalui Midtrans.
func Purchase(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var input PurchaseInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var book models.Book
	if err := config.DB.Preload("Publisher").First(&book, input.BookID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Book not found"})
		return
	}
	if book.LCPContentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Buku belum dienkripsi. Hubungi publisher."})
		return
	}

	// Cek apakah sudah pernah beli
	var existingTx models.Transaction
	if err := config.DB.Where("user_id = ? AND book_id = ? AND status = ?", userID, input.BookID, models.StatusSuccess).First(&existingTx).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Anda sudah memiliki buku ini", "transaction_id": existingTx.ID})
		return
	}

	var user models.User
	config.DB.First(&user, userID)

	// Buku gratis: langsung success tanpa Midtrans
	if book.Price == 0 {
		tx := models.Transaction{
			UserID:          userID.(uint),
			BookID:          input.BookID,
			Status:          models.StatusSuccess,
			MidtransOrderID: fmt.Sprintf("FREE-%d-%d", userID.(uint), time.Now().UnixMilli()),
		}
		if err := config.DB.Create(&tx).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat transaksi"})
			return
		}
		go autoGenerateLicense(tx.ID, userID.(uint))
		c.JSON(http.StatusOK, gin.H{
			"message":        "Buku berhasil didapatkan. Lisensi sedang disiapkan.",
			"transaction_id": tx.ID,
			"status":         "success",
		})
		return
	}

	// Buku berbayar: buat transaksi pending lalu minta Snap token
	orderID := fmt.Sprintf("ITSPRESS-%d-%d", userID.(uint), time.Now().UnixMilli())

	tx := models.Transaction{
		UserID:          userID.(uint),
		BookID:          input.BookID,
		Status:          models.StatusPending,
		MidtransOrderID: orderID,
	}
	if err := config.DB.Create(&tx).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat transaksi"})
		return
	}

	snapToken, redirectURL, err := createSnapToken(orderID, book, user)
	if err != nil {
		config.DB.Unscoped().Delete(&tx)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat sesi pembayaran. Coba lagi.", "detail": err.Error()})
		return
	}

	config.DB.Model(&tx).Updates(map[string]interface{}{
		"snap_token":  snapToken,
		"payment_url": redirectURL,
	})

	c.JSON(http.StatusCreated, gin.H{
		"message":        "Transaksi dibuat. Lanjutkan ke pembayaran.",
		"transaction_id": tx.ID,
		"snap_token":     snapToken,
		"payment_url":    redirectURL,
	})
}

// GetTransactionStatus mengambil status transaksi milik user.
// Jika masih pending dan punya order ID Midtrans, status di-sync dari Midtrans API.
func GetTransactionStatus(c *gin.Context) {
	userID, _ := c.Get("user_id")
	txID := c.Param("id")

	var tx models.Transaction
	if err := config.DB.Preload("Book").Where("id = ? AND user_id = ?", txID, userID).First(&tx).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Transaction not found"})
		return
	}

	if tx.Status == models.StatusPending && tx.MidtransOrderID != "" && !strings.HasPrefix(tx.MidtransOrderID, "FREE-") {
		syncStatusFromMidtrans(&tx)
	}

	c.JSON(http.StatusOK, gin.H{"data": tx})
}

// HandleMidtransNotification menerima webhook notifikasi pembayaran dari Midtrans.
// Endpoint ini publik (tidak perlu JWT) karena dipanggil langsung oleh server Midtrans.
func HandleMidtransNotification(c *gin.Context) {
	var notif map[string]interface{}
	if err := c.ShouldBindJSON(&notif); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	orderID, _ := notif["order_id"].(string)
	statusCode, _ := notif["status_code"].(string)
	grossAmount, _ := notif["gross_amount"].(string)
	signatureKey, _ := notif["signature_key"].(string)

	// Verifikasi signature: SHA512(order_id + status_code + gross_amount + server_key)
	raw := orderID + statusCode + grossAmount + midtransServerKey()
	hash := sha512.Sum512([]byte(raw))
	if hex.EncodeToString(hash[:]) != signatureKey {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
		return
	}

	transactionStatus, _ := notif["transaction_status"].(string)
	fraudStatus, _ := notif["fraud_status"].(string)

	var newStatus models.TransactionStatus
	switch transactionStatus {
	case "settlement":
		newStatus = models.StatusSuccess
	case "capture":
		if fraudStatus == "accept" {
			newStatus = models.StatusSuccess
		} else {
			newStatus = models.StatusFailed
		}
	case "deny", "cancel", "expire":
		newStatus = models.StatusFailed
	default:
		c.JSON(http.StatusOK, gin.H{"message": "notification received"})
		return
	}

	var txs []models.Transaction
	config.DB.Where("midtrans_order_id = ?", orderID).Find(&txs)
	if len(txs) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "notification received (no matching transaction)"})
		return
	}

	for i := range txs {
		config.DB.Model(&txs[i]).Update("status", newStatus)
	}

	// Bersihkan cart dan generate lisensi sinkron sebelum balas Midtrans
	if newStatus == models.StatusSuccess {
		for _, tx := range txs {
			config.DB.Where("user_id = ? AND book_id = ?", tx.UserID, tx.BookID).Delete(&models.CartItem{})
			autoGenerateLicense(tx.ID, tx.UserID)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "OK"})
}

// CancelTransaction membatalkan transaksi pending dan memberi tahu Midtrans
func CancelTransaction(c *gin.Context) {
	userID, _ := c.Get("user_id")
	txID := c.Param("id")

	var tx models.Transaction
	if err := config.DB.Where("id = ? AND user_id = ?", txID, userID).First(&tx).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Transaksi tidak ditemukan"})
		return
	}
	if tx.Status != models.StatusPending {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hanya transaksi yang belum dibayar yang dapat dibatalkan"})
		return
	}

	// Update DB dulu agar respons tidak tertahan menunggu Midtrans API.
	// Notifikasi ke Midtrans dijalankan di goroutine (fire-and-forget).
	config.DB.Model(&tx).Update("status", models.StatusFailed)

	if tx.MidtransOrderID != "" && !strings.HasPrefix(tx.MidtransOrderID, "FREE-") {
		orderID := tx.MidtransOrderID
		go func() {
			coreClient := coreapi.Client{}
			coreClient.New(midtransServerKey(), midtransEnv())
			if _, err := coreClient.CancelTransaction(orderID); err != nil {
				log.Printf("Midtrans cancel warning (%s): %v", orderID, err)
			}
		}()
	}

	c.JSON(http.StatusOK, gin.H{"message": "Transaksi berhasil dibatalkan"})
}

// GetMyTransactions mengambil riwayat transaksi pelanggan
func GetMyTransactions(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var transactions []models.Transaction
	config.DB.Preload("Book").Where("user_id = ?", userID).Find(&transactions)
	c.JSON(http.StatusOK, gin.H{"data": transactions})
}
