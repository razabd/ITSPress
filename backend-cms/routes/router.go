package routes

import (
	"itspress/backend-cms/controllers"
	"itspress/backend-cms/middlewares"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetupRouter() *gin.Engine {
	r := gin.Default()

	// CORS: izinkan semua origin (termasuk Thorium Reader yg pakai file:// atau app://)
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return true // izinkan semua origin untuk local dev
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	api := r.Group("/api/v1")
	{
		// --- Auth Routes (Publik) ---
		auth := api.Group("/auth")
		{
			auth.POST("/register", controllers.Register)
			auth.POST("/login", controllers.Login)
			auth.POST("/verify-email", controllers.VerifyEmail)
			auth.POST("/forgot-password", controllers.ForgotPassword)
			auth.POST("/reset-password", controllers.ResetPassword)
		}

		// --- Content Delivery (Encrypted File untuk Thorium Reader) ---
		// Publik: file sudah terenkripsi AES-256, aman diakses tanpa auth
		api.GET("/content/*content_id", controllers.ServeContent)

		// --- Cover Image (Publik) ---
		api.GET("/covers/:filename", controllers.ServeCover)

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

			// Publisher: upload surat pernyataan
			protected.POST("/publisher/declaration", middlewares.RoleRequired("publisher"), controllers.UploadDeclaration)

			// Admin Panel
			admin := protected.Group("/admin", middlewares.RoleRequired("admin"))
			{
				admin.GET("/users", controllers.AdminGetUsers)
				admin.DELETE("/users/:id", controllers.AdminDeactivateUser)
				admin.POST("/users/:id/reactivate", controllers.AdminReactivateUser)
				admin.GET("/books", controllers.AdminGetBooks)
				admin.DELETE("/books/:id", controllers.AdminDeleteBook)
				admin.GET("/transactions", controllers.AdminGetTransactions)
				// Publisher approval
				admin.GET("/publishers/pending", controllers.AdminGetPendingPublishers)
				admin.POST("/publishers/:id/approve", controllers.AdminApprovePublisher)
				admin.POST("/publishers/:id/reject", controllers.AdminRejectPublisher)
				admin.GET("/publishers/:id/declaration", controllers.AdminDownloadDeclaration)
			}
		}
	}

	return r
}
