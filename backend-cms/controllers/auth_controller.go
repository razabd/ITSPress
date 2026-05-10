package controllers

import (
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"strings"
	"time"

	"itspress/backend-cms/config"
	"itspress/backend-cms/middleware"
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
	Role     string `json:"role"`
	// Passphrase pelanggan diisi setelah verifikasi email, bukan saat daftar
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

// Register mendaftarkan user baru (Pelanggan atau Publisher)
func Register(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": friendlyValidationError(err)})
		return
	}

	role := models.UserRole(input.Role)
	if role == "" {
		role = models.RolePelanggan
	}

	hashedPw, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal memproses password"})
		return
	}

	// Semua role wajib verifikasi email; publisher juga butuh approval admin setelahnya
	user := models.User{
		FullName:        input.FullName,
		Email:           input.Email,
		PasswordHash:    string(hashedPw),
		Role:            role,
		IsEmailVerified: false,
	}
	if role == models.RolePublisher {
		user.ApprovalStatus = models.ApprovalDraft
	}

	if err := config.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email sudah terdaftar. Gunakan email lain."})
		return
	}

	// Kirim email verifikasi untuk semua role (pelanggan dan publisher)
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
	if err := sendVerificationEmail(input.Email, input.FullName, verifyLink); err != nil {
		log.Printf("Gagal mengirim email verifikasi ke %s: %v", input.Email, err)
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":          "Registrasi berhasil! Cek email Anda dan klik link verifikasi.",
		"needs_verify":     true,
		"is_publisher":     role == models.RolePublisher,
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
	if !middleware.CheckLoginAllowed(input.Email) {
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
		middleware.RecordFailedLogin(input.Email)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Email atau password salah"})
		return
	}

	// Reset login attempts setelah berhasil
	middleware.ResetLoginAttempts(input.Email)

	// Cek approval publisher — hanya pending yang diblokir login
	// draft dan rejected diizinkan login agar bisa upload/upload-ulang surat pernyataan
	if user.Role == models.RolePublisher && user.ApprovalStatus == models.ApprovalPending {
		c.JSON(http.StatusForbidden, gin.H{
			"error":           "Akun Anda sedang dalam peninjauan oleh Admin ITS Press.",
			"approval_status": string(models.ApprovalPending),
		})
		return
	}

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
		"approval_status":  string(user.ApprovalStatus),
		"approval_note":    user.ApprovalNote,
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
		"id":              user.ID,
		"name":            user.FullName,
		"email":           user.Email,
		"role":            user.Role,
		"has_passphrase":  user.LCPPassphraseHash != "",
		"approval_status": string(user.ApprovalStatus),
		"approval_note":   user.ApprovalNote,
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

// sendResetEmail mengirim email reset password via SMTP
func sendResetEmail(toEmail, resetLink string) error {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")

	if host == "" || user == "" || pass == "" {
		// Jika SMTP belum dikonfigurasi, log ke console saja (mode development)
		log.Printf("[DEV] Reset password link untuk %s: %s", toEmail, resetLink)
		return nil
	}

	subject := "Reset Password ITSPress"
	body := fmt.Sprintf(`<html><body>
<p>Halo,</p>
<p>Anda menerima email ini karena ada permintaan reset password untuk akun ITSPress Anda.</p>
<p><a href="%s" style="background:#003f7f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Reset Password</a></p>
<p>Atau salin link berikut ke browser Anda:<br><a href="%s">%s</a></p>
<p>Link ini berlaku selama <strong>1 jam</strong>. Abaikan email ini jika Anda tidak merasa meminta reset password.</p>
<p>— Tim ITSPress</p>
</body></html>`, resetLink, resetLink, resetLink)

	msg := strings.Join([]string{
		"From: ITSPress <" + user + ">",
		"To: " + toEmail,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=utf-8",
		"",
		body,
	}, "\r\n")

	auth := smtp.PlainAuth("", user, pass, host)
	if port == "" {
		port = "587"
	}
	return smtp.SendMail(host+":"+port, auth, user, []string{toEmail}, []byte(msg))
}

// sendVerificationEmail mengirim email verifikasi ke user baru
func sendVerificationEmail(toEmail, name, verifyLink string) error {
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")

	if host == "" || user == "" || pass == "" {
		log.Printf("[DEV] Link verifikasi email untuk %s: %s", toEmail, verifyLink)
		return nil
	}

	subject := "Verifikasi Email ITSPress"
	body := fmt.Sprintf(`<html><body>
<p>Halo <strong>%s</strong>,</p>
<p>Terima kasih telah mendaftar di ITSPress. Klik tombol di bawah untuk memverifikasi email Anda:</p>
<p><a href="%s" style="background:#014A8F;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Verifikasi Email</a></p>
<p>Atau salin link berikut ke browser Anda:<br><a href="%s">%s</a></p>
<p>Link ini berlaku selama <strong>24 jam</strong>.</p>
<p>— Tim ITSPress</p>
</body></html>`, name, verifyLink, verifyLink, verifyLink)

	msg := strings.Join([]string{
		"From: ITSPress <" + user + ">",
		"To: " + toEmail,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=utf-8",
		"",
		body,
	}, "\r\n")

	if port == "" {
		port = "587"
	}
	auth := smtp.PlainAuth("", user, pass, host)
	return smtp.SendMail(host+":"+port, auth, user, []string{toEmail}, []byte(msg))
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

	var user models.User
	config.DB.First(&user, vToken.UserID)

	msg := "Email berhasil diverifikasi! Silakan login dan setup LCP Passphrase Anda."
	isPublisher := user.Role == models.RolePublisher
	if isPublisher {
		msg = "Email berhasil diverifikasi! Silakan upload surat pernyataan untuk melanjutkan proses pendaftaran publisher."
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      msg,
		"is_publisher": isPublisher,
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

	if err := sendResetEmail(input.Email, resetLink); err != nil {
		log.Printf("Gagal mengirim email reset ke %s: %v", input.Email, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengirim email. Coba lagi nanti."})
		return
	}

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
		middleware.BlacklistToken(tokenStr, claims.ExpiresAt.Time)
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
