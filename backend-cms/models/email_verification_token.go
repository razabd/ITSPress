package models

import (
	"time"

	"gorm.io/gorm"
)

type EmailVerificationToken struct {
	gorm.Model
	UserID    uint      `gorm:"not null"`
	Token     string    `gorm:"uniqueIndex;not null"`
	ExpiresAt time.Time `gorm:"not null"`
	Used      bool      `gorm:"default:false"`
}
