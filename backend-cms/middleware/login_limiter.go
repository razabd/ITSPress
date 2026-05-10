package middleware

import (
	"sync"
	"time"
)

type loginAttempt struct {
	count     int
	lockedAt  *time.Time
	lastReset time.Time
}

var (
	loginMu       sync.Mutex
	loginAttempts = make(map[string]*loginAttempt)
)

const (
	maxLoginAttempts = 5
	lockDuration     = 15 * time.Minute
	resetAfter       = 1 * time.Hour
)

func CheckLoginAllowed(email string) bool {
	loginMu.Lock()
	defer loginMu.Unlock()
	attempt, ok := loginAttempts[email]
	if !ok {
		return true
	}
	if attempt.lockedAt != nil {
		if time.Since(*attempt.lockedAt) > lockDuration {
			delete(loginAttempts, email)
			return true
		}
		return false
	}
	if time.Since(attempt.lastReset) > resetAfter {
		delete(loginAttempts, email)
		return true
	}
	return true
}

func RecordFailedLogin(email string) bool {
	loginMu.Lock()
	defer loginMu.Unlock()
	attempt, ok := loginAttempts[email]
	if !ok {
		now := time.Now()
		loginAttempts[email] = &loginAttempt{count: 1, lastReset: now}
		return false
	}
	attempt.count++
	if attempt.count >= maxLoginAttempts {
		now := time.Now()
		attempt.lockedAt = &now
		return true // locked
	}
	return false
}

func ResetLoginAttempts(email string) {
	loginMu.Lock()
	defer loginMu.Unlock()
	delete(loginAttempts, email)
}
