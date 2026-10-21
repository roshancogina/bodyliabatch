package main

import (
	"testing"
)

func TestReportPurchaseVerificationAuditAndEmails(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)
	resetTestSentEmails()

	// 1. Submit report with verified batch, orderNumber, purchaseDate
	ch := fetchChallenge(t, r)
	captchaTok := solveTestCaptcha(t, ch)
	w := doReq(t, r, "POST", "/bff/v1/reports", withCaptcha(map[string]any{
		"fullName":     "Priya Sharma",
		"email":        "priya.sharma@example.com",
		"phone":        "9876543210",
		"batch":        "PE-2610-WL01",
		"channel":      "Amazon",
		"orderNumber":  "402-1234567-8901234",
		"purchaseDate": "2026-10-18",
		"message":      "The safety seal under the bottle cap was partially torn upon arrival.",
		"consent":      true,
	}, captchaTok), "")
	if w.Code != 201 {
		t.Fatalf("submit report = %d: %s", w.Code, w.Body.String())
	}
	var out map[string]any
	decodeBody(t, w, &out)
	ref, _ := out["reference"].(string)
	if ref == "" {
		t.Fatalf("expected reference, got %v", out)
	}

	// Verify emails sent on report submission (customer confirmation + internal alert)
	emails := getTestSentEmails()
	if len(emails) < 2 {
		t.Fatalf("expected at least 2 emails sent on report submission, got %d", len(emails))
	}
	foundCustomerEmail := false
	foundInternalAlert := false
	for _, em := range emails {
		if em.To == "priya.sharma@example.com" {
			foundCustomerEmail = true
		}
		if em.To == "care@bodylia.in" {
			foundInternalAlert = true
		}
	}
	if !foundCustomerEmail {
		t.Errorf("customer confirmation email was not sent")
	}
	if !foundInternalAlert {
		t.Errorf("internal alert email was not sent")
	}

	// 2. Verify report detail in admin API
	w = doReq(t, r, "GET", "/api/admin/reports/"+ref, nil, tok)
	if w.Code != 200 {
		t.Fatalf("get report detail = %d: %s", w.Code, w.Body.String())
	}
	var rep map[string]any
	decodeBody(t, w, &rep)
	if rep["batchVerified"] != true {
		t.Errorf("expected batchVerified=true for PE-2610-WL01, got %v", rep["batchVerified"])
	}
	if rep["orderNumber"] != "402-1234567-8901234" {
		t.Errorf("expected orderNumber='402-1234567-8901234', got %v", rep["orderNumber"])
	}
	if rep["purchaseDate"] != "2026-10-18" {
		t.Errorf("expected purchaseDate='2026-10-18', got %v", rep["purchaseDate"])
	}

	// 3. Update report status to investigating with note (verifies email + audit log)
	resetTestSentEmails()
	w = doReq(t, r, "PATCH", "/api/admin/reports/"+ref, map[string]any{
		"status": "investigating",
		"note":   "Contacting warehouse to inspect retention samples.",
	}, tok)
	if w.Code != 200 {
		t.Fatalf("patch report = %d: %s", w.Code, w.Body.String())
	}
	emails = getTestSentEmails()
	if len(emails) != 1 || emails[0].To != "priya.sharma@example.com" {
		t.Fatalf("expected 1 update email sent to customer, got %v", emails)
	}

	// 4. Escalate report (verifies escalation email + audit log)
	resetTestSentEmails()
	w = doReq(t, r, "POST", "/api/admin/reports/"+ref+"/escalate", map[string]any{
		"urgency": "urgent",
		"reason":  "Potential packaging seal failure in warehouse shipment.",
	}, tok)
	if w.Code != 201 {
		t.Fatalf("escalate report = %d: %s", w.Code, w.Body.String())
	}
	emails = getTestSentEmails()
	if len(emails) != 1 || emails[0].To != "care@bodylia.in" {
		t.Fatalf("expected 1 escalation email sent to quality, got %v", emails)
	}

	// 5. Verify audit log trail has all events
	w = doReq(t, r, "GET", "/api/admin/audit?q="+ref, nil, tok)
	if w.Code != 200 {
		t.Fatalf("audit search = %d: %s", w.Code, w.Body.String())
	}
	var auditRows []map[string]any
	decodeBody(t, w, &auditRows)
	if len(auditRows) < 3 {
		t.Fatalf("expected at least 3 audit entries for report %s, got %d", ref, len(auditRows))
	}
}
