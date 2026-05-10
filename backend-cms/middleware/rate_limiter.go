package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	limit    int
	window   time.Duration
}

func NewRateLimiter(limit int, window time.Duration) gin.HandlerFunc {
	rl := &rateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
	return func(c *gin.Context) {
		ip := c.ClientIP()
		rl.mu.Lock()
		now := time.Now()
		windowStart := now.Add(-rl.window)
		// Hapus request yang sudah expired
		filtered := rl.requests[ip][:0]
		for _, t := range rl.requests[ip] {
			if t.After(windowStart) {
				filtered = append(filtered, t)
			}
		}
		rl.requests[ip] = append(filtered, now)
		count := len(rl.requests[ip])
		rl.mu.Unlock()
		if count > rl.limit {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Terlalu banyak permintaan, coba lagi nanti"})
			c.Abort()
			return
		}
		c.Next()
	}
}
