//go:build nofitz

package pack

// extractRWPInfo stub: skips PDF metadata extraction and cover generation.
// Built with -tags nofitz (Windows native build, no libmupdf.dll required).
func extractRWPInfo(inputPath, coverPath string) (RWPInfo, error) {
	return RWPInfo{}, nil
}
