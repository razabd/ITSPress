package models

import "gorm.io/gorm"

type Book struct {
	gorm.Model
	PublisherID        uint    `gorm:"not null" json:"publisher_id"`
	Publisher          User    `gorm:"foreignKey:PublisherID" json:"publisher,omitempty"`
	Title              string  `gorm:"not null" json:"title"`
	Description        string  `json:"description"`
	CoverURL           string  `json:"cover_url"`
	ClearFilePath      string  `json:"-"` // Path lokal ke file EPUB/PDF mentah (rahasia)
	EncryptedFilePath  string  `json:"-"` // Path lokal ke file terenkripsi (rahasia, jangan ekspos)
	LCPContentID       string  `json:"lcp_content_id"` // ID yang didapat dari LCP Server setelah enkripsi
	Format             string  `gorm:"type:text;default:'epub'" json:"format"` // epub, pdf, lpf, audiobook, divina, webpub, rpf
	Price              float64 `gorm:"default:0" json:"price"`
}
