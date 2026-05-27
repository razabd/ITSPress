package models

import (
	"time"

	"gorm.io/gorm"
)

type License struct {
	gorm.Model
	UserID          uint       `gorm:"not null" json:"user_id"`
	User            User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	BookID          uint       `gorm:"not null" json:"book_id"`
	Book            Book       `gorm:"foreignKey:BookID" json:"book,omitempty"`
	TransactionID   uint       `gorm:"not null;uniqueIndex" json:"transaction_id"`
	LCPLicenseID    string     `json:"lcp_license_id"`
	LicenseFilePath string     `json:"license_file_path"`
	ExpiresAt       *time.Time `json:"expires_at,omitempty"`
	RevokedAt       *time.Time `json:"revoked_at,omitempty"` // non-nil = dicabut oleh admin
}
