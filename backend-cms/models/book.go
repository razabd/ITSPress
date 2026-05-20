package models

import "gorm.io/gorm"

type Book struct {
	gorm.Model
	PublisherID       uint    `gorm:"not null" json:"publisher_id"`
	Publisher         User    `gorm:"foreignKey:PublisherID" json:"publisher,omitempty"`
	Title             string  `gorm:"not null" json:"title"`
	Description       string  `json:"description"`
	CoverURL          string  `json:"cover_url"`
	ClearFilePath     string  `json:"-"`
	EncryptedFilePath string  `json:"-"`
	LCPContentID      string  `json:"lcp_content_id"`
	Format            string  `gorm:"type:text;default:'epub'" json:"format"`
	Price             float64 `gorm:"default:0" json:"price"`
	IsWithdrawn       bool    `gorm:"default:false" json:"is_withdrawn"`
	PreviewPageCount  int     `gorm:"default:0" json:"preview_page_count"`
	Author            string  `json:"author"`
	PublishedYear     int     `json:"published_year"`
	ISBN              string  `json:"isbn"`
	PageCount         int     `json:"page_count"`
}
