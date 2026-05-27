package routes

import (
	"itspress/backend-cms/controllers"
	"itspress/backend-cms/middlewares"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetupRouter() *gin.Engine {
	r := gin.Default()

	// Security headers
	r.Use(func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	})

	// CORS: di production (GIN_MODE=release) hanya izinkan FRONTEND_URL;
	// di development tambahkan localhost sebagai fallback
	var allowedOrigins []string
	if frontendURL := os.Getenv("FRONTEND_URL"); frontendURL != "" {
		allowedOrigins = append(allowedOrigins, frontendURL)
	}
	if os.Getenv("GIN_MODE") != "release" {
		allowedOrigins = append(allowedOrigins, "http://localhost:3000", "http://localhost:3001")
	}
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			for _, a := range allowedOrigins {
				if origin == a {
					return true
				}
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	api := r.Group("/api/v1")
	{
		// --- Auth Routes (Publik) ---
		auth := api.Group("/auth")
		auth.Use(middlewares.NewRateLimiter(10, time.Minute)) // 10 req/menit per IP
		{
			auth.POST("/register", controllers.Register)
			auth.POST("/login", controllers.Login)
			auth.POST("/verify-email", controllers.VerifyEmail)
			auth.POST("/forgot-password", controllers.ForgotPassword)
			auth.POST("/reset-password", controllers.ResetPassword)
			auth.POST("/logout", controllers.Logout)
		}

		// --- Content Delivery (Encrypted File untuk Thorium Reader) ---
		// Publik: file sudah terenkripsi AES-256, aman diakses tanpa auth
		api.GET("/content/*content_id", controllers.ServeContent)

		// --- Cover Image (Publik) ---
		api.GET("/covers/:filename", controllers.ServeCover)

		// --- Preview Pages (Publik) ---
		api.GET("/previews/:bookID/:page", controllers.ServePreviewPage)

		// --- LCP Hint Page (untuk Thorium Reader passphrase dialog) ---
		api.GET("/lcp-hint", controllers.ServeLCPHint)

		// --- Book Routes ---
		books := api.Group("/books")
		{
			books.GET("", controllers.GetBooks)          // Publik: lihat katalog
			books.GET("/:id", controllers.GetBookByID)   // Publik: detail buku

			// Publisher only: upload dan enkripsi buku
			books.POST("", middlewares.AuthRequired(), middlewares.RoleRequired("publisher"), controllers.UploadBook)
			books.GET("/my", middlewares.AuthRequired(), middlewares.RoleRequired("publisher"), controllers.GetMyBooks)
			books.GET("/my/stats", middlewares.AuthRequired(), middlewares.RoleRequired("publisher"), controllers.GetMyStats)
			books.PUT("/:id", middlewares.AuthRequired(), middlewares.RoleRequired("publisher"), controllers.UpdateBook)
			books.POST("/:id/withdraw", middlewares.AuthRequired(), middlewares.RoleRequired("publisher"), controllers.WithdrawBook)
			books.POST("/:id/relist", middlewares.AuthRequired(), middlewares.RoleRequired("publisher"), controllers.RelistBook)
			books.POST("/:id/encrypt", middlewares.AuthRequired(), middlewares.RoleRequired("publisher"), controllers.EncryptBook)
		}

		// --- Midtrans Webhook (Publik, dipanggil server Midtrans) ---
		api.POST("/transactions/notification", controllers.HandleMidtransNotification)

		// --- Routes yang butuh login ---
		protected := api.Group("", middlewares.AuthRequired())
		{
			// Profile & Ubah Akun
			protected.GET("/profile", controllers.GetProfile)
			protected.PUT("/auth/password", controllers.UpdatePassword)
			protected.PUT("/auth/passphrase", middlewares.RoleRequired("pelanggan"), controllers.UpdatePassphrase)

			// Transaksi (Pelanggan)
			protected.POST("/transactions", middlewares.RoleRequired("pelanggan"), controllers.Purchase)
			protected.GET("/transactions", middlewares.RoleRequired("pelanggan"), controllers.GetMyTransactions)
			protected.GET("/transactions/:id/status", middlewares.RoleRequired("pelanggan"), controllers.GetTransactionStatus)
			protected.DELETE("/transactions/:id", middlewares.RoleRequired("pelanggan"), controllers.CancelTransaction)

			// Lisensi (Pelanggan)
			protected.POST("/licenses/generate/:transaction_id", middlewares.RoleRequired("pelanggan"), controllers.GenerateLicense)
			protected.GET("/licenses", middlewares.RoleRequired("pelanggan"), controllers.GetMyLicenses)
			protected.GET("/licenses/:id/download", middlewares.RoleRequired("pelanggan"), controllers.DownloadLicense)

			// Keranjang Belanja (Pelanggan)
			protected.POST("/cart", middlewares.RoleRequired("pelanggan"), controllers.AddToCart)
			protected.GET("/cart", middlewares.RoleRequired("pelanggan"), controllers.GetCart)
			protected.DELETE("/cart/:book_id", middlewares.RoleRequired("pelanggan"), controllers.RemoveFromCart)
			protected.POST("/cart/checkout", middlewares.RoleRequired("pelanggan"), controllers.CheckoutCart)

			// Admin Panel
			admin := protected.Group("/admin", middlewares.RoleRequired("admin"))
			{
				admin.GET("/users", controllers.AdminGetUsers)
				admin.DELETE("/users/:id", controllers.AdminDeactivateUser)
				admin.POST("/users/:id/reactivate", controllers.AdminReactivateUser)
				admin.GET("/books", controllers.AdminGetBooks)
				admin.DELETE("/books/:id", controllers.AdminDeleteBook)
				admin.GET("/transactions", controllers.AdminGetTransactions)
				admin.GET("/licenses", controllers.AdminListLicenses)
				admin.GET("/licenses/:id", controllers.AdminGetLicenseDetail)
				admin.POST("/licenses/:id/revoke", controllers.AdminRevokeLicense)
				admin.POST("/licenses/:id/reissue", controllers.AdminReissueLicense)
			}
		}
	}

	return r
}
