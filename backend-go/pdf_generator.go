package main

import (
	"bytes"
	"fmt"
	"strings"
	"time"
)

// escapePDF escapes parentheses and backslashes for PDF string literals.
func escapePDF(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "(", "\\(")
	s = strings.ReplaceAll(s, ")", "\\)")
	// Replace non-ASCII typographic characters with ASCII equivalents
	s = strings.ReplaceAll(s, "≤", "<=")
	s = strings.ReplaceAll(s, "≥", ">=")
	s = strings.ReplaceAll(s, "—", "-")
	s = strings.ReplaceAll(s, "–", "-")
	s = strings.ReplaceAll(s, "’", "'")
	s = strings.ReplaceAll(s, "‘", "'")
	s = strings.ReplaceAll(s, "“", "\"")
	s = strings.ReplaceAll(s, "”", "\"")
	s = strings.ReplaceAll(s, "±", "+/-")
	s = strings.ReplaceAll(s, "°", " deg ")
	s = strings.ReplaceAll(s, "µ", "u")
	return s
}

// generateCertificatePDF builds a valid, branded Certificate of Analysis PDF
// for any batch record using standard PDF-1.4 primitives and universal Helvetica fonts.
func generateCertificatePDF(rec *BatchRecord) []byte {
	var stream bytes.Buffer

	// Top burgundy header banner: RGB(74, 31, 51) -> (0.29, 0.12, 0.20)
	stream.WriteString("q\n")
	stream.WriteString("0.29 0.12 0.20 rg\n")
	stream.WriteString("0 772 595 70 re f\n")
	stream.WriteString("Q\n")

	// White header text
	stream.WriteString("BT\n")
	stream.WriteString("/F2 22 Tf\n")
	stream.WriteString("1 1 1 rg\n")
	stream.WriteString("40 802 Td\n")
	stream.WriteString("(bodylia) Tj\n")
	stream.WriteString("ET\n")

	stream.WriteString("BT\n")
	stream.WriteString("/F1 10 Tf\n")
	stream.WriteString("1 1 1 rg\n")
	stream.WriteString("380 802 Td\n")
	stream.WriteString("(CERTIFICATE OF ANALYSIS) Tj\n")
	stream.WriteString("ET\n")

	// Product Title & Claim
	stream.WriteString("BT\n")
	stream.WriteString("/F2 20 Tf\n")
	stream.WriteString("0.29 0.12 0.20 rg\n")
	stream.WriteString(fmt.Sprintf("40 730 Td\n(%s) Tj\n", escapePDF(rec.ProductName)))
	stream.WriteString("ET\n")

	stream.WriteString("BT\n")
	stream.WriteString("/F1 10 Tf\n")
	stream.WriteString("0.43 0.35 0.30 rg\n")
	stream.WriteString(fmt.Sprintf("40 714 Td\n(Product Code: %s) Tj\n", escapePDF(rec.Product)))
	stream.WriteString("ET\n")

	// Separator line: Gold/Taupe
	stream.WriteString("q\n0.71 0.61 0.53 RG\n1 w\n40 700 m 555 700 l S\nQ\n")

	// Key facts
	statusLabel := "Released"
	if rec.Status == "recalled" {
		statusLabel = "RECALLED - Do not consume"
	} else if rec.Expires < time.Now().Format("2006-01-02") {
		statusLabel = "Expired"
	}

	facts := [][2]string{
		{"Batch number", rec.Batch},
		{"Manufactured", rec.Manufactured},
		{"Expires", rec.Expires},
		{"Status", statusLabel},
		{"Manufactured at", rec.Facility},
		{"Tested by", rec.Lab},
	}
	if rec.Qty != nil {
		facts = append(facts, [2]string{"Pack quantity", fmt.Sprintf("%d", *rec.Qty)})
	}
	if rec.Mrp != nil {
		facts = append(facts, [2]string{"MRP", fmt.Sprintf("Rs. %.0f", *rec.Mrp)})
	}

	y := 682
	for _, f := range facts {
		stream.WriteString("BT\n/F1 10 Tf\n0.43 0.35 0.30 rg\n")
		stream.WriteString(fmt.Sprintf("40 %d Td\n(%s:) Tj\nET\n", y, escapePDF(f[0])))
		stream.WriteString("BT\n/F2 10 Tf\n0.20 0.21 0.20 rg\n")
		stream.WriteString(fmt.Sprintf("160 %d Td\n(%s) Tj\nET\n", y, escapePDF(f[1])))
		y -= 16
	}

	// Test results section
	y -= 10
	stream.WriteString("BT\n/F2 12 Tf\n0.29 0.12 0.20 rg\n")
	stream.WriteString(fmt.Sprintf("40 %d Td\n(Laboratory Test Results) Tj\nET\n", y))

	y -= 8
	stream.WriteString("q\n0.71 0.61 0.53 RG\n1 w\n")
	stream.WriteString(fmt.Sprintf("40 %d m 555 %d l S\nQ\n", y, y))

	y -= 14
	// Table Headers
	stream.WriteString("BT\n/F2 9 Tf\n0.43 0.35 0.30 rg\n")
	stream.WriteString(fmt.Sprintf("40 %d Td\n(Test) Tj\nET\n", y))
	stream.WriteString("BT\n/F2 9 Tf\n0.43 0.35 0.30 rg\n")
	stream.WriteString(fmt.Sprintf("200 %d Td\n(Specification) Tj\nET\n", y))
	stream.WriteString("BT\n/F2 9 Tf\n0.43 0.35 0.30 rg\n")
	stream.WriteString(fmt.Sprintf("370 %d Td\n(Result) Tj\nET\n", y))
	stream.WriteString("BT\n/F2 9 Tf\n0.43 0.35 0.30 rg\n")
	stream.WriteString(fmt.Sprintf("490 %d Td\n(Outcome) Tj\nET\n", y))

	y -= 6
	stream.WriteString("q\n0.89 0.85 0.82 RG\n0.5 w\n")
	stream.WriteString(fmt.Sprintf("40 %d m 555 %d l S\nQ\n", y, y))

	for _, cr := range rec.Coa {
		y -= 16
		if y < 80 {
			break
		}
		stream.WriteString("BT\n/F1 9 Tf\n0.20 0.21 0.20 rg\n")
		stream.WriteString(fmt.Sprintf("40 %d Td\n(%s) Tj\nET\n", y, escapePDF(cr.Test)))

		stream.WriteString("BT\n/F1 9 Tf\n0.43 0.35 0.30 rg\n")
		stream.WriteString(fmt.Sprintf("200 %d Td\n(%s) Tj\nET\n", y, escapePDF(cr.Specification)))

		stream.WriteString("BT\n/F1 9 Tf\n0.20 0.21 0.20 rg\n")
		stream.WriteString(fmt.Sprintf("370 %d Td\n(%s) Tj\nET\n", y, escapePDF(cr.Result)))

		if cr.Pass {
			stream.WriteString("BT\n/F2 9 Tf\n0.18 0.49 0.20 rg\n")
			stream.WriteString(fmt.Sprintf("490 %d Td\n(PASS) Tj\nET\n", y))
		} else {
			stream.WriteString("BT\n/F2 9 Tf\n0.78 0.16 0.16 rg\n")
			stream.WriteString(fmt.Sprintf("490 %d Td\n(FAIL) Tj\nET\n", y))
		}

		stream.WriteString("q\n0.92 0.90 0.88 RG\n0.5 w\n")
		stream.WriteString(fmt.Sprintf("40 %d m 555 %d l S\nQ\n", y-3, y-3))
	}

	// Footer
	stream.WriteString("BT\n/F1 8 Tf\n0.43 0.35 0.30 rg\n")
	stream.WriteString(fmt.Sprintf("40 45 Td\n(Verified at batch.bodylia.in/?b=%s on %s. Results apply to this batch only.) Tj\nET\n",
		escapePDF(rec.Batch), time.Now().Format("2006-01-02")))
	stream.WriteString("BT\n/F1 8 Tf\n0.43 0.35 0.30 rg\n")
	stream.WriteString("40 33 Td\n(Dietary supplement. Not for medicinal use.) Tj\nET\n")

	contentBytes := stream.Bytes()

	// Assemble PDF document objects
	var doc bytes.Buffer
	doc.WriteString("%PDF-1.4\n")

	offsets := make([]int, 7)

	// Object 1: Catalog
	offsets[1] = doc.Len()
	doc.WriteString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")

	// Object 2: Pages
	offsets[2] = doc.Len()
	doc.WriteString("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")

	// Object 3: Page (A4 MediaBox: 595 x 842 points)
	offsets[3] = doc.Len()
	doc.WriteString("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n")

	// Object 4: Contents stream
	offsets[4] = doc.Len()
	doc.WriteString(fmt.Sprintf("4 0 obj\n<< /Length %d >>\nstream\n", len(contentBytes)))
	doc.Write(contentBytes)
	doc.WriteString("\nendstream\nendobj\n")

	// Object 5: Font F1 (Helvetica)
	offsets[5] = doc.Len()
	doc.WriteString("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")

	// Object 6: Font F2 (Helvetica-Bold)
	offsets[6] = doc.Len()
	doc.WriteString("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n")

	// Xref table
	xrefStart := doc.Len()
	doc.WriteString("xref\n0 7\n")
	doc.WriteString("0000000000 65535 f \n")
	for i := 1; i <= 6; i++ {
		doc.WriteString(fmt.Sprintf("%010d 00000 n \n", offsets[i]))
	}

	// Trailer
	doc.WriteString("trailer\n<< /Size 7 /Root 1 0 R >>\n")
	doc.WriteString(fmt.Sprintf("startxref\n%d\n%%%%EOF\n", xrefStart))

	return doc.Bytes()
}
