//go:build windows

package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

// HandleSignals handles system signals and adds a log before quitting
func HandleSignals() {
	sigChan := make(chan os.Signal, 2)
	go func() {
		for sig := range sigChan {
			switch sig {
			case syscall.SIGINT:
				fallthrough
			case syscall.SIGTERM:
				fmt.Println("Shutting down...")
				os.Exit(0)
			}
		}
	}()
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
}
