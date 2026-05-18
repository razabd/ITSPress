package controllers

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"

	"itspress/backend-cms/config"
	"itspress/backend-cms/middlewares"
	"itspress/backend-cms/models"
	"itspress/backend-cms/utils"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"golang.org/x/crypto/bcrypt"
)

type RegisterInput struct {
	FullName string `json:"full_name" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// friendlyValidationError menerjemahkan error validasi Gin ke pesan bahasa Indonesia
func friendlyValidationError(err error) string {
	var ve validator.ValidationErrors
	if errors.As(err, &ve) {
		for _, fe := range ve {
			switch fe.Tag() {
			case "required":
				return fmt.Sprintf("Kolom '%s' wajib diisi.", fieldLabel(fe.Field()))
			case "email":
				return "Format email tidak valid."
			case "min":
				return fmt.Sprintf("'%s' minimal %s karakter.", fieldLabel(fe.Field()), fe.Param())
			case "max":
				return fmt.Sprintf("'%s' maksimal %s karakter.", fieldLabel(fe.Field()), fe.Param())
			}
		}
	}
	return "Data yang dikirim tidak valid. Periksa kembali isian Anda."
}

func fieldLabel(field string) string {
	labels := map[string]string{
		"FullName":   "Nama Lengkap",
		"Email":      "Email",
		"Password":   "Password",
		"Passphrase": "LCP Passphrase",
	}
	if l, ok := labels[field]; ok {
		return l
	}
	return field
}

type UpdatePasswordInput struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

type UpdatePassphraseInput struct {
	NewPassphrase string `json:"new_passphrase" binding:"required"`
}

// Register mendaftarkan pelanggan baru
func Register(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": friendlyValidationError(err)})
		return
	}

	hashedPw, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memproses password"})
		return
	}

	user := models.User{
		FullName:        input.FullName,
		Email:           input.Email,
		PasswordHash:    string(hashedPw),
		Role:            models.RolePelanggan,
		IsEmailVerified: false,
	}

	if err := config.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email sudah terdaftar. Gunakan email lain."})
		return
	}

	token, err := generateSecureToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat token verifikasi"})
		return
	}
	vToken := models.EmailVerificationToken{
		UserID:    user.ID,
		Token:     token,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	config.DB.Create(&vToken)

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	verifyLink := fmt.Sprintf("%s/verify-email?token=%s", frontendURL, token)
	go func() {
		if err := sendVerificationEmail(input.Email, input.FullName, verifyLink); err != nil {
			log.Printf("Gagal mengirim email verifikasi ke %s: %v", input.Email, err)
		}
	}()

	c.JSON(http.StatusCreated, gin.H{
		"message":      "Registrasi berhasil! Cek email Anda dan klik link verifikasi.",
		"needs_verify": true,
	})
}

// Login memverifikasi kredensial dan mengembalikan JWT token
func Login(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": friendlyValidationError(err)})
		return
	}

	// Cek apakah akun dikunci sementara karena terlalu banyak percobaan login gagal
	if !middlewares.CheckLoginAllowed(input.Email) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Akun dikunci sementara karena terlalu banyak percobaan login. Coba lagi nanti."})
		return
	}

	var user models.User
	// Gunakan Unscoped agar akun nonaktif (soft-deleted) bisa terdeteksi
	if err := config.DB.Unscoped().Where("email = ?", input.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Email atau password salah"})
		return
	}

	if user.DeletedAt.Valid {
		c.JSON(http.StatusForbidden, gin.H{
			"error":    "Akun Anda telah dinonaktifkan. Hubungi itspress@gmail.com untuk informasi lebih lanjut.",
			"disabled": true,
		})
		return
	}

	// Admin tidak butuh verifikasi email (dibuat manual, bukan via register publik)
	if user.Role != models.RoleAdmin && !user.IsEmailVerified {
		c.JSON(http.StatusForbidden, gin.H{
			"error":      "Email belum diverifikasi. Cek inbox Anda dan klik link verifikasi.",
			"unverified": true,
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		middlewares.RecordFailedLogin(input.Email)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Email atau password salah"})
		return
	}

	// Reset login attempts setelah berhasil
	middlewares.ResetLoginAttempts(input.Email)

	token, err := utils.GenerateToken(user.ID, string(user.Role))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat token"})
		return
	}

	needsPassphrase := user.Role == models.RolePelanggan && user.LCPPassphraseHash == ""

	c.JSON(http.StatusOK, gin.H{
		"token":            token,
		"user_id":          user.ID,
		"role":             user.Role,
		"name":             user.FullName,
		"needs_passphrase": needsPassphrase,
	})
}

// GetProfile mengembalikan profil user yang sedang login
func GetProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var user models.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":             user.ID,
		"name":           user.FullName,
		"email":          user.Email,
		"role":           user.Role,
		"has_passphrase": user.LCPPassphraseHash != "",
	})
}

// UpdatePassword mengubah password akun (perlu verifikasi password lama)
func UpdatePassword(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var input UpdatePasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": friendlyValidationError(err)})
		return
	}

	var user models.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Password saat ini tidak benar"})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memproses password baru"})
		return
	}

	config.DB.Model(&user).Update("password_hash", string(newHash))
	c.JSON(http.StatusOK, gin.H{"message": "Password berhasil diubah"})
}

type ForgotPasswordInput struct {
	Email string `json:"email" binding:"required,email"`
}

type ResetPasswordInput struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// generateSecureToken membuat token acak 32-byte sebagai hex string (64 karakter)
func generateSecureToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", b), nil
}

// sendEmail mengirim HTML email via SMTP dengan timeout 15 detik.
// Jika SMTP belum dikonfigurasi, link di-log ke console (mode development).
func sendEmail(toEmail, subject, htmlBody string) error {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")

	if host == "" || user == "" || pass == "" {
		log.Printf("[DEV] Email ke %s — subjek: %s", toEmail, subject)
		return nil
	}
	if port == "" {
		port = "587"
	}

	conn, err := net.DialTimeout("tcp", host+":"+port, 15*time.Second)
	if err != nil {
		return fmt.Errorf("SMTP timeout: %v", err)
	}

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		conn.Close()
		return err
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err = client.StartTLS(&tls.Config{ServerName: host}); err != nil {
			return err
		}
	}
	if err = client.Auth(smtp.PlainAuth("", user, pass, host)); err != nil {
		return err
	}
	if err = client.Mail(user); err != nil {
		return err
	}
	if err = client.Rcpt(toEmail); err != nil {
		return err
	}
	wc, err := client.Data()
	if err != nil {
		return err
	}

	msg := "From: ITSPress <" + user + ">\r\n" +
		"To: " + toEmail + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/html; charset=utf-8\r\n" +
		"\r\n" + htmlBody

	if _, err = fmt.Fprint(wc, msg); err != nil {
		return err
	}
	return wc.Close()
}

func sendResetEmail(toEmail, resetLink string) error {
	body := fmt.Sprintf(`<html><body>
<p>Halo,</p>
<p>Anda menerima email ini karena ada permintaan reset password untuk akun ITSPress Anda.</p>
<p><a href="%s" style="background:#003f7f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Reset Password</a></p>
<p>Atau salin link berikut ke browser Anda:<br><a href="%s">%s</a></p>
<p>Link ini berlaku selama <strong>1 jam</strong>. Abaikan email ini jika Anda tidak merasa meminta reset password.</p>
<p>— Tim ITSPress</p>
</body></html>`, resetLink, resetLink, resetLink)
	return sendEmail(toEmail, "Reset Password ITSPress", body)
}

func sendVerificationEmail(toEmail, name, verifyLink string) error {
	body := fmt.Sprintf(`<html><body>
<p>Halo <strong>%s</strong>,</p>
<p>Terima kasih telah mendaftar di ITSPress. Klik tombol di bawah untuk memverifikasi email Anda:</p>
<p><a href="%s" style="background:#014A8F;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Verifikasi Email</a></p>
<p>Atau salin link berikut ke browser Anda:<br><a href="%s">%s</a></p>
<p>Link ini berlaku selama <strong>24 jam</strong>.</p>
<p>— Tim ITSPress</p>
</body></html>`, name, verifyLink, verifyLink, verifyLink)
	return sendEmail(toEmail, "Verifikasi Email ITSPress", body)
}

type VerifyEmailInput struct {
	Token string `json:"token" binding:"required"`
}

// VerifyEmail memvalidasi token dan mengaktifkan akun pelanggan
func VerifyEmail(c *gin.Context) {
	var input VerifyEmailInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token tidak valid"})
		return
	}

	var vToken models.EmailVerificationToken
	if err := config.DB.Where("token = ?", input.Token).First(&vToken).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Link verifikasi tidak valid atau sudah digunakan."})
		return
	}

	if vToken.Used {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Link ini sudah pernah digunakan."})
		return
	}

	if time.Now().After(vToken.ExpiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Link verifikasi sudah kadaluarsa. Daftar ulang untuk mendapatkan link baru."})
		return
	}

	config.DB.Model(&models.User{}).Where("id = ?", vToken.UserID).Update("is_email_verified", true)
	config.DB.Model(&vToken).Update("used", true)

	c.JSON(http.StatusOK, gin.H{
		"message": "Email berhasil diverifikasi! Silakan login dan setup LCP Passphrase Anda.",
	})
}

// ForgotPassword menerima email dan mengirim link reset password
func ForgotPassword(c *gin.Context) {
	var input ForgotPasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": friendlyValidationError(err)})
		return
	}

	var user models.User
	if err := config.DB.Where("email = ?", input.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Email tidak ditemukan. Pastikan email yang Anda masukkan sudah terdaftar."})
		return
	}

	token, err := generateSecureToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat token reset"})
		return
	}

	// Hapus token lama yang belum dipakai untuk user ini
	config.DB.Where("user_id = ? AND used = false", user.ID).Delete(&models.PasswordResetToken{})

	resetToken := models.PasswordResetToken{
		UserID:    user.ID,
		Token:     token,
		ExpiresAt: time.Now().Add(1 * time.Hour),
		Used:      false,
	}
	if err := config.DB.Create(&resetToken).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal menyimpan token reset"})
		return
	}

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	resetLink := fmt.Sprintf("%s/reset-password?token=%s", frontendURL, token)

	go func() {
		if err := sendResetEmail(input.Email, resetLink); err != nil {
			log.Printf("Gagal mengirim email reset ke %s: %v", input.Email, err)
		}
	}()

	c.JSON(http.StatusOK, gin.H{"message": "Link reset password telah dikirim ke email Anda."})
}

// ResetPassword memverifikasi token dan mengupdate password user
func ResetPassword(c *gin.Context) {
	var input ResetPasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": friendlyValidationError(err)})
		return
	}

	var resetToken models.PasswordResetToken
	if err := config.DB.Where("token = ?", input.Token).First(&resetToken).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token tidak valid atau sudah kadaluarsa."})
		return
	}

	if resetToken.Used {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token ini sudah pernah digunakan."})
		return
	}

	if time.Now().After(resetToken.ExpiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token sudah kadaluarsa. Minta link reset baru."})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memproses password baru"})
		return
	}

	if err := config.DB.Model(&models.User{}).Where("id = ?", resetToken.UserID).
		Update("password_hash", string(newHash)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengupdate password"})
		return
	}

	config.DB.Model(&resetToken).Update("used", true)

	c.JSON(http.StatusOK, gin.H{"message": "Password berhasil direset. Silakan masuk dengan password baru Anda."})
}

// Logout membatalkan token JWT dengan memasukkannya ke blacklist
func Logout(c *gin.Context) {
	tokenStr := c.GetHeader("Authorization")
	tokenStr = strings.TrimPrefix(tokenStr, "Bearer ")
	claims, err := utils.ValidateToken(tokenStr)
	if err == nil {
		middlewares.BlacklistToken(tokenStr, claims.ExpiresAt.Time)
	}
	c.JSON(http.StatusOK, gin.H{"message": "Berhasil logout"})
}

// UpdatePassphrase mengubah LCP Passphrase (hash SHA-256 disimpan ulang)
func UpdatePassphrase(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var input UpdatePassphraseInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": friendlyValidationError(err)})
		return
	}

	var user models.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User tidak ditemukan"})
		return
	}

	hash := sha256.Sum256([]byte(input.NewPassphrase))
	newHash := fmt.Sprintf("%x", hash)

	config.DB.Model(&user).Update("lcp_passphrase_hash", newHash)

	// Perbarui semua file .lcpl milik user dengan passphrase baru
	user.LCPPassphraseHash = newHash
	RefreshUserLicenses(user.ID)

	c.JSON(http.StatusOK, gin.H{"message": "LCP Passphrase berhasil diubah. Harap download ulang semua file .lcpl Anda."})
}
