package models

import "gorm.io/gorm"

type UserRole string

const (
	RolePelanggan UserRole = "pelanggan"
	RolePublisher UserRole = "publisher"
	RoleAdmin     UserRole = "admin"
)

type User struct {
	gorm.Model
	FullName          string   `gorm:"not null" json:"full_name"`
	Email             string   `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash      string   `gorm:"not null" json:"-"`
	Role              UserRole `gorm:"type:text;default:'pelanggan'" json:"role"`
	LCPPassphraseHash string   `json:"-"`
	IsEmailVerified   bool     `gorm:"default:false" json:"is_email_verified"`
	Books             []Book   `gorm:"foreignKey:PublisherID" json:"-"`
}
