package models

import "gorm.io/gorm"

type UserRole string

const (
	RolePelanggan UserRole = "pelanggan"
	RolePublisher UserRole = "publisher"
	RoleAdmin     UserRole = "admin"
)

type ApprovalStatus string

const (
	ApprovalDraft    ApprovalStatus = "draft"    // belum upload surat pernyataan
	ApprovalPending  ApprovalStatus = "pending"  // menunggu review admin
	ApprovalApproved ApprovalStatus = "approved" // disetujui admin
	ApprovalRejected ApprovalStatus = "rejected" // ditolak admin
)

type User struct {
	gorm.Model
	FullName            string         `gorm:"not null" json:"full_name"`
	Email               string         `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash        string         `gorm:"not null" json:"-"`
	Role                UserRole       `gorm:"type:text;default:'pelanggan'" json:"role"`
	LCPPassphraseHash   string         `json:"-"`
	IsEmailVerified     bool           `gorm:"default:false" json:"is_email_verified"`
	ApprovalStatus      ApprovalStatus `gorm:"type:text;default:''" json:"approval_status"`
	ApprovalNote        string         `gorm:"type:text;default:''" json:"approval_note"`
	DeclarationFilePath string         `gorm:"type:text;default:''" json:"-"`
	Books               []Book         `gorm:"foreignKey:PublisherID" json:"-"`
}
