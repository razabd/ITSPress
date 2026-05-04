package models

import "gorm.io/gorm"

type TransactionStatus string

const (
	StatusPending TransactionStatus = "pending"
	StatusSuccess TransactionStatus = "success"
	StatusFailed  TransactionStatus = "failed"
)

type Transaction struct {
	gorm.Model
	UserID          uint              `gorm:"not null" json:"user_id"`
	User            User              `gorm:"foreignKey:UserID" json:"user,omitempty"`
	BookID          uint              `gorm:"not null" json:"book_id"`
	Book            Book              `gorm:"foreignKey:BookID" json:"book,omitempty"`
	Status          TransactionStatus `gorm:"type:text;default:'pending'" json:"status"`
	MidtransOrderID string            `json:"midtrans_order_id,omitempty"`
	SnapToken       string            `json:"snap_token,omitempty"`
	PaymentURL      string            `json:"payment_url,omitempty"`
	License         License           `gorm:"foreignKey:TransactionID" json:"license,omitempty"`
}
