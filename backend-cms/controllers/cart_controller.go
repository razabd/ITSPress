package controllers

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"itspress/backend-cms/config"
	"itspress/backend-cms/models"

	"github.com/gin-gonic/gin"
)

type AddToCartInput struct {
	BookID uint `json:"book_id" binding:"required"`
}

// AddToCart menambah satu buku ke keranjang user.
func AddToCart(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var input AddToCartInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var book models.Book
	if err := config.DB.First(&book, input.BookID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Buku tidak ditemukan"})
		return
	}

	// Cegah menambah buku yang sudah dimiliki
	var owned models.Transaction
	if err := config.DB.Where("user_id = ? AND book_id = ? AND status = ?", userID, input.BookID, models.StatusSuccess).First(&owned).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Anda sudah memiliki buku ini"})
		return
	}

	// Cegah duplikat di cart
	var existing models.CartItem
	if err := config.DB.Where("user_id = ? AND book_id = ?", userID, input.BookID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Buku sudah ada di keranjang"})
		return
	}

	item := models.CartItem{
		UserID: userID.(uint),
		BookID: input.BookID,
	}
	if err := config.DB.Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menambah ke keranjang"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Buku ditambahkan ke keranjang", "data": item})
}

// GetCart mengambil semua item keranjang milik user beserta detail buku.
func GetCart(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var items []models.CartItem
	config.DB.Preload("Book.Publisher").Where("user_id = ?", userID).Find(&items)

	c.JSON(http.StatusOK, gin.H{"data": items})
}

// RemoveFromCart menghapus satu item dari keranjang berdasarkan book_id.
func RemoveFromCart(c *gin.Context) {
	userID, _ := c.Get("user_id")
	bookID := c.Param("book_id")

	result := config.DB.Where("user_id = ? AND book_id = ?", userID, bookID).Delete(&models.CartItem{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item tidak ditemukan di keranjang"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Item dihapus dari keranjang"})
}

// CheckoutCart membuat transaksi untuk semua item di keranjang.
// Buku gratis langsung success. Buku berbayar mendapat satu Snap token bersama.
func CheckoutCart(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var user models.User
	config.DB.First(&user, userID)

	var cartItems []models.CartItem
	config.DB.Preload("Book").Where("user_id = ?", userID).Find(&cartItems)

	if len(cartItems) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Keranjang kosong"})
		return
	}

	// Pisahkan buku gratis dan berbayar; lewati buku yang sudah dimiliki
	var freeItems []models.CartItem
	var paidItems []models.CartItem
	for _, item := range cartItems {
		var owned models.Transaction
		alreadyOwned := config.DB.Where("user_id = ? AND book_id = ? AND status = ?", userID, item.BookID, models.StatusSuccess).First(&owned).Error == nil
		if alreadyOwned {
			config.DB.Where("user_id = ? AND book_id = ?", userID, item.BookID).Delete(&models.CartItem{})
			continue
		}
		if item.Book.LCPContentID == "" {
			continue // skip buku yang belum dienkripsi
		}
		if item.Book.Price == 0 {
			freeItems = append(freeItems, item)
		} else {
			paidItems = append(paidItems, item)
		}
	}

	if len(freeItems) == 0 && len(paidItems) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tidak ada buku yang dapat di-checkout"})
		return
	}

	var txIDs []uint

	// Proses buku gratis: langsung success, hapus dari cart, generate lisensi otomatis
	for _, item := range freeItems {
		tx := models.Transaction{
			UserID:          userID.(uint),
			BookID:          item.BookID,
			Status:          models.StatusSuccess,
			MidtransOrderID: fmt.Sprintf("FREE-%d-%d", userID.(uint), time.Now().UnixMilli()),
		}
		if err := config.DB.Create(&tx).Error; err == nil {
			txIDs = append(txIDs, tx.ID)
			config.DB.Where("user_id = ? AND book_id = ?", userID, item.BookID).Delete(&models.CartItem{})
			go autoGenerateLicense(tx.ID, userID.(uint))
		}
	}

	// Jika tidak ada buku berbayar, selesai
	if len(paidItems) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"message":         "Checkout berhasil. Semua buku telah ditambahkan.",
			"transaction_ids": txIDs,
			"status":          "success",
		})
		return
	}

	// Proses buku berbayar: satu order ID + satu Snap token untuk semua
	orderID := fmt.Sprintf("ITSPRESS-CART-%d-%d", userID.(uint), time.Now().UnixMilli())

	var totalAmount int64
	var paidBooks []models.Book
	var paidTxs []models.Transaction
	for _, item := range paidItems {
		totalAmount += int64(item.Book.Price)
		paidBooks = append(paidBooks, item.Book)

		tx := models.Transaction{
			UserID:          userID.(uint),
			BookID:          item.BookID,
			Status:          models.StatusPending,
			MidtransOrderID: orderID,
		}
		if err := config.DB.Create(&tx).Error; err == nil {
			paidTxs = append(paidTxs, tx)
			txIDs = append(txIDs, tx.ID)
		}
	}

	log.Printf("Cart checkout: orderID=%s totalAmount=%d books=%d", orderID, totalAmount, len(paidBooks))
	snapToken, redirectURL, err := createCartSnapToken(orderID, paidBooks, user, totalAmount)
	if err != nil {
		log.Printf("Cart checkout Midtrans error: %v", err)
		// Rollback transaksi berbayar yang baru dibuat
		for _, tx := range paidTxs {
			config.DB.Unscoped().Delete(&tx)
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat sesi pembayaran. Coba lagi.", "detail": err.Error()})
		return
	}

	config.DB.Model(&models.Transaction{}).Where("midtrans_order_id = ?", orderID).Updates(map[string]interface{}{
		"snap_token":  snapToken,
		"payment_url": redirectURL,
	})

	// Hapus cart items setelah transaksi dan snap token berhasil dibuat
	for _, item := range paidItems {
		config.DB.Where("user_id = ? AND book_id = ?", userID, item.BookID).Delete(&models.CartItem{})
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":         "Checkout berhasil. Lanjutkan ke pembayaran.",
		"transaction_ids": txIDs,
		"snap_token":      snapToken,
		"payment_url":     redirectURL,
	})
}
