package models

import "gorm.io/gorm"

type Book struct {
	gorm.Model
	PublisherID        uint    `gorm:"not null" json:"publisher_id"`
	Publisher          User    `gorm:"foreignKey:PublisherID" json:"publisher,omitempty"`
	Title              string  `gorm:"not null" json:"title"`
	Description        string  `json:"description"`
	CoverURL           string  `json:"cover_url"`
	ClearFilePath      string  `json:"-"`
	EncryptedFilePath  string  `json:"-"`
	LCPContentID       string  `json:"lcp_content_id"`
	Format             string  `gorm:"type:text;default:'epub'" json:"format"`
	Price              float64 `gorm:"default:0" json:"price"`
	ApprovalStatus     string  `gorm:"type:text;default:'pending'" json:"approval_status"` // pending, approved, rejected
	ApprovalNote       string  `json:"approval_note,omitempty"`
	IsWithdrawn        bool    `gorm:"default:false" json:"is_withdrawn"`
}
