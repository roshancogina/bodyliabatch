package main

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCOAPublicDownloadAndAdminLifecycle(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)
	batch := "PE-2610-WL01"

	// 1. Public download of COA before any admin upload:
	// "downloadable by anyone for any and every batch" -> returns generated PDF
	w := doReq(t, r, "GET", "/bff/v1/batches/"+batch+"/coa", nil, "")
	if w.Code != 200 {
		t.Fatalf("public coa before upload = %d, want 200: %s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/pdf" {
		t.Fatalf("content-type = %s, want application/pdf", ct)
	}
	body := w.Body.Bytes()
	if !bytes.HasPrefix(body, []byte("%PDF-1.4")) {
		t.Fatalf("generated pdf does not start with %%PDF-1.4: %q", string(body[:min(len(body), 20)]))
	}
	if !bytes.Contains(body, []byte("%%EOF")) {
		t.Fatalf("generated pdf does not contain %%%%EOF")
	}

	// 2. Public download of non-existent batch -> 404
	w = doReq(t, r, "GET", "/bff/v1/batches/ZZ-9999-9Z99/coa", nil, "")
	if w.Code != 404 {
		t.Fatalf("nonexistent batch coa = %d, want 404", w.Code)
	}

	// 3. Admin upload validation:
	// 3a. Unauthenticated -> 401
	w = doMultipart(t, r, "POST", "/api/admin/batches/"+batch+"/coa", "file", "test.pdf", []byte("%PDF-1.4 fake"), "")
	if w.Code != 401 {
		t.Fatalf("unauth upload = %d, want 401", w.Code)
	}

	// 3b. Non-existent batch -> 404
	w = doMultipart(t, r, "POST", "/api/admin/batches/ZZ-9999-9Z99/coa", "file", "test.pdf", []byte("%PDF-1.4 fake"), tok)
	if w.Code != 404 {
		t.Fatalf("nonexistent batch upload = %d, want 404", w.Code)
	}

	// 3c. Non-pdf file -> 400
	w = doMultipart(t, r, "POST", "/api/admin/batches/"+batch+"/coa", "file", "report.txt", []byte("plain text"), tok)
	if w.Code != 400 {
		t.Fatalf("non-pdf upload = %d, want 400: %s", w.Code, w.Body.String())
	}

	// 3d. Missing file field -> 400
	req := httptest.NewRequest("POST", "/api/admin/batches/"+batch+"/coa", bytes.NewReader([]byte("{}")))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "multipart/form-data; boundary=invalid")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 400 {
		t.Fatalf("missing file = %d, want 400", w.Code)
	}

	// 3e. Oversized file (> 10 MB) -> 400
	largeBytes := make([]byte, 10*1024*1024+50)
	copy(largeBytes, "%PDF-1.4 ")
	w = doMultipart(t, r, "POST", "/api/admin/batches/"+batch+"/coa", "file", "big.pdf", largeBytes, tok)
	if w.Code != 400 {
		t.Fatalf("oversized upload = %d, want 400: %s", w.Code, w.Body.String())
	}

	// 4. Successful Admin Upload
	samplePdf := []byte("%PDF-1.4\n%Eurofins signed test certificate sample data\n%%EOF")
	w = doMultipart(t, r, "POST", "/api/admin/batches/"+batch+"/coa", "file", "Eurofins-PE-2610-WL01.pdf", samplePdf, tok)
	if w.Code != 200 {
		t.Fatalf("upload coa = %d, want 200: %s", w.Code, w.Body.String())
	}

	// 5. Batch record and audit log updated
	w = doReq(t, r, "GET", "/api/admin/batches/"+batch, nil, tok)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Eurofins-PE-2610-WL01.pdf") {
		t.Fatalf("admin get batch coaFileName missing: %s", w.Body.String())
	}

	w = doReq(t, r, "GET", "/api/admin/audit?target="+batch, nil, tok)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Attached COA") {
		t.Fatalf("audit log missing Attached COA: %s", w.Body.String())
	}

	// 6. Public download now serves the attached file
	w = doReq(t, r, "GET", "/bff/v1/batches/"+batch+"/coa", nil, "")
	if w.Code != 200 {
		t.Fatalf("download attached coa = %d, want 200", w.Code)
	}
	if cd := w.Header().Get("Content-Disposition"); !strings.Contains(cd, "Eurofins-PE-2610-WL01.pdf") {
		t.Fatalf("Content-Disposition = %s, want filename with Eurofins-PE-2610-WL01.pdf", cd)
	}
	if !bytes.Equal(w.Body.Bytes(), samplePdf) {
		t.Fatalf("downloaded body did not match uploaded bytes")
	}

	// 7. Admin Delete COA
	// 7a. Nonexistent -> 404
	w = doReq(t, r, "DELETE", "/api/admin/batches/ZZ-9999-9Z99/coa", nil, tok)
	if w.Code != 404 {
		t.Fatalf("delete nonexistent = %d, want 404", w.Code)
	}

	// 7b. Successful delete
	w = doReq(t, r, "DELETE", "/api/admin/batches/"+batch+"/coa", nil, tok)
	if w.Code != 200 {
		t.Fatalf("delete coa = %d, want 200: %s", w.Code, w.Body.String())
	}

	// 8. Audit log records removal
	w = doReq(t, r, "GET", "/api/admin/audit?target="+batch, nil, tok)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Removed COA") {
		t.Fatalf("audit log missing Removed COA: %s", w.Body.String())
	}

	// 9. Public download falls back to generated PDF again
	w = doReq(t, r, "GET", "/bff/v1/batches/"+batch+"/coa", nil, "")
	if w.Code != 200 {
		t.Fatalf("fallback download = %d, want 200", w.Code)
	}
	if cd := w.Header().Get("Content-Disposition"); !strings.Contains(cd, "PE-2610-WL01-certificate.pdf") {
		t.Fatalf("Content-Disposition after delete = %s, want PE-2610-WL01-certificate.pdf", cd)
	}
	if !bytes.HasPrefix(w.Body.Bytes(), []byte("%PDF-1.4")) {
		t.Fatalf("fallback body did not start with %%PDF-1.4")
	}
}

func doMultipart(t *testing.T, r http.Handler, method, path, fieldName, filename string, content []byte, token string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := io.Copy(part, bytes.NewReader(content)); err != nil {
		t.Fatalf("copy content: %v", err)
	}
	_ = writer.Close()

	req := httptest.NewRequest(method, path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}
