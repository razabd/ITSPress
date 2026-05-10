package middleware

import (
	"sync"
	"time"
)

type blacklistEntry struct {
	expiry time.Time
}

var (
	blacklistMu sync.RWMutex
	blacklist   = make(map[string]blacklistEntry)
)

func BlacklistToken(token string, expiry time.Time) {
	blacklistMu.Lock()
	defer blacklistMu.Unlock()
	blacklist[token] = blacklistEntry{expiry: expiry}
	// Cleanup expired tokens
	for t, e := range blacklist {
		if time.Now().After(e.expiry) {
			delete(blacklist, t)
		}
	}
}

func IsTokenBlacklisted(token string) bool {
	blacklistMu.RLock()
	defer blacklistMu.RUnlock()
	entry, ok := blacklist[token]
	if !ok {
		return false
	}
	if time.Now().After(entry.expiry) {
		return false
	}
	return true
}
