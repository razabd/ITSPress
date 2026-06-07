//go:build !nofitz

package pack

import (
	"image"
	"image/jpeg"
	"log"
	"os"
	"time"

	"github.com/gen2brain/go-fitz"
)

// extractRWPInfo extracts metadata from the PDF using go-fitz (MuPDF).
// Also extracts the first page as a JPG cover image if coverPath is not empty.
func extractRWPInfo(inputPath, coverPath string) (RWPInfo, error) {

	var rwpInfo RWPInfo

	start := time.Now()
	defer func() {
		if coverPath != "" {
			log.Printf("Extracting the PDF cover and metadata took %s", time.Since(start).Truncate(10*time.Millisecond))
		}
	}()

	doc, err := fitz.New(inputPath)
	if err != nil {
		return rwpInfo, err
	}
	defer doc.Close()

	metadata := doc.Metadata()
	rwpInfo.Title = cleanNulls(metadata["title"])
	author := cleanNulls(metadata["author"])
	if author != "" {
		rwpInfo.Author = []string{author}
	}
	subject := cleanNulls(metadata["subject"])
	if subject != "" {
		rwpInfo.Subject = []string{subject}
	}
	rwpInfo.NumPages = doc.NumPage()

	if coverPath == "" {
		return rwpInfo, nil
	}

	img, err := renderPreview(doc, 0, 1200.0)
	if err != nil {
		return rwpInfo, err
	}

	cover, err := os.Create(coverPath)
	if err != nil {
		return rwpInfo, err
	}
	defer cover.Close()

	if err = jpeg.Encode(cover, img, &jpeg.Options{Quality: jpeg.DefaultQuality}); err != nil {
		return rwpInfo, nil
	}

	return rwpInfo, nil
}

func renderPreview(doc *fitz.Document, pageNum int, maxSide float64) (*image.RGBA, error) {
	rect, err := doc.Bound(pageNum)
	if err != nil {
		return nil, err
	}

	widthPoints := float64(rect.Dx())
	heightPoints := float64(rect.Dy())

	largerSide := widthPoints
	if heightPoints > widthPoints {
		largerSide = heightPoints
	}

	targetDPI := (maxSide / largerSide) * 72.0
	if targetDPI > 300.0 {
		targetDPI = 300.0
	}

	return doc.ImageDPI(pageNum, targetDPI)
}
