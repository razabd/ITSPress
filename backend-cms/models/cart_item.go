package models

import "time"

// CartItem tidak menggunakan gorm.Model (soft delete) agar unique index tidak bermasalah
// saat user menambah ulang buku yang sudah pernah dihapus dari cart.
type CartItem struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"ID"`
	CreatedAt time.Time `json:"CreatedAt"`
	UserID    uint      `gorm:"not null;uniqueIndex:idx_cart_user_book" json:"user_id"`
	BookID    uint      `gorm:"not null;uniqueIndex:idx_cart_user_book" json:"book_id"`
	Book      Book      `gorm:"foreignKey:BookID" json:"book,omitempty"`
}
