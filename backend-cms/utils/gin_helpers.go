package utils

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

var ErrUnauthorized = errors.New("unauthorized: user identity not found")

func GetAuthUserID(c *gin.Context) (uint, error) {
	val, ok := c.Get("user_id")
	if !ok {
		return 0, ErrUnauthorized
	}
	id, ok := val.(uint)
	if !ok {
		return 0, ErrUnauthorized
	}
	return id, nil
}

func MustGetAuthUserID(c *gin.Context) (uint, bool) {
	id, err := GetAuthUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return 0, false
	}
	return id, true
}
