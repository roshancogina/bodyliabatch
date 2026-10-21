package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
)

type sentEmailRecord struct {
	To      string
	Subject string
	HTML    string
}

var (
	testEmailsMu   sync.Mutex
	testSentEmails []sentEmailRecord
)

func getTestSentEmails() []sentEmailRecord {
	testEmailsMu.Lock()
	defer testEmailsMu.Unlock()
	cp := make([]sentEmailRecord, len(testSentEmails))
	copy(cp, testSentEmails)
	return cp
}

func resetTestSentEmails() {
	testEmailsMu.Lock()
	defer testEmailsMu.Unlock()
	testSentEmails = nil
}

func sendEmail(to, subject, htmlBody string) error {
	to = strings.TrimSpace(to)
	if to == "" {
		return fmt.Errorf("recipient email is required")
	}

	if isTest() {
		testEmailsMu.Lock()
		testSentEmails = append(testSentEmails, sentEmailRecord{To: to, Subject: subject, HTML: htmlBody})
		testEmailsMu.Unlock()
		return nil
	}

	apiKey := strings.TrimSpace(os.Getenv("EMAILIT_API_KEY"))
	if apiKey == "" {
		log.Printf("[email:mock] To=%s Subject=%q (EMAILIT_API_KEY unset)", to, subject)
		return nil
	}

	payload := emailItPayload{
		From:    "Bodylia Care <care@bodylia.in>",
		To:      to,
		Subject: subject,
		HTML:    htmlBody,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.emailit.com/v2/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("emailit request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("emailit %s: %s", resp.Status, strings.TrimSpace(string(b)))
	}
	io.Copy(io.Discard, resp.Body)
	return nil
}

func deliverReportReceivedCustomerEmail(to, fullName, ref, batch, channel string) error {
	subject := fmt.Sprintf("Report received: [%s] — Bodylia Quality Assurance", ref)
	html := fmt.Sprintf(`<div style="font-family:sans-serif;color:#222;line-height:1.6;">
<h2 style="color:#6A1B29;">Bodylia Quality Assurance</h2>
<p>Dear %s,</p>
<p>Thank you for contacting us. We have received your report regarding batch <strong>%s</strong> (Purchased via %s).</p>
<p style="background:#F6F4F0;padding:12px 16px;border-left:4px solid #6A1B29;font-size:16px;">
Your tracking reference number: <strong>%s</strong>
</p>
<p>Our quality and safety team reviews every customer report within 2 business days. You can track live updates and notes at any time here:</p>
<p><a href="https://batch.bodylia.in/#/?p=track" style="color:#6A1B29;font-weight:bold;">Track your report on batch.bodylia.in</a></p>
<p>Warm regards,<br>Bodylia Quality Assurance Team<br><a href="mailto:care@bodylia.in">care@bodylia.in</a></p>
</div>`, fullName, batch, channel, ref)
	return sendEmail(to, subject, html)
}

func deliverReportNotificationInternalEmail(ref, fullName, customerEmail, phone, batch, channel, orderNumber, purchaseDate, message string) error {
	dest := strings.TrimSpace(os.Getenv("REPORT_ALERT_EMAIL"))
	if dest == "" {
		dest = "care@bodylia.in"
	}
	subject := fmt.Sprintf("[New Batch Report] %s — Batch %s (%s)", ref, batch, channel)
	html := fmt.Sprintf(`<div style="font-family:sans-serif;color:#222;line-height:1.6;">
<h3 style="color:#6A1B29;">New Issue Reported: %s</h3>
<p><strong>Customer:</strong> %s (%s, %s)</p>
<p><strong>Batch:</strong> %s</p>
<p><strong>Channel:</strong> %s</p>
<p><strong>Order Number:</strong> %s</p>
<p><strong>Purchase Date:</strong> %s</p>
<blockquote style="background:#F6F4F0;padding:12px;border-left:3px solid #6A1B29;">%s</blockquote>
<p><a href="https://batch.bodylia.in/#/console" style="color:#6A1B29;font-weight:bold;">Open staff console</a></p>
</div>`, ref, fullName, customerEmail, phone, batch, channel, orderNumber, purchaseDate, message)
	return sendEmail(dest, subject, html)
}

func deliverReportStatusCustomerEmail(to, fullName, ref, batch, status, note string) error {
	statusDesc := status
	switch status {
	case "investigating":
		statusDesc = "Under Active Investigation by Quality Team"
	case "resolved_genuine":
		statusDesc = "Resolved — Verified Genuine Pack"
	case "resolved_counterfeit":
		statusDesc = "Resolved — Confirmed Counterfeit / Non-Compliant"
	}
	subject := fmt.Sprintf("Update on your Bodylia report [%s]", ref)
	noteSection := ""
	if note != "" {
		noteSection = fmt.Sprintf(`<p><strong>Team Note:</strong></p><blockquote style="background:#F6F4F0;padding:10px 14px;border-left:3px solid #6A1B29;">%s</blockquote>`, note)
	}
	html := fmt.Sprintf(`<div style="font-family:sans-serif;color:#222;line-height:1.6;">
<h2 style="color:#6A1B29;">Bodylia Quality Assurance</h2>
<p>Dear %s,</p>
<p>An update has been made to your report <strong>%s</strong> (Batch %s):</p>
<p style="background:#F6F4F0;padding:12px 16px;border-left:4px solid #6A1B29;font-size:16px;">
Status: <strong>%s</strong>
</p>
%s
<p>You can check the timeline anytime at <a href="https://batch.bodylia.in/#/?p=track" style="color:#6A1B29;font-weight:bold;">Track your report</a>.</p>
<p>Thank you for helping us maintain product integrity.<br>Bodylia Quality Assurance</p>
</div>`, fullName, ref, batch, statusDesc, noteSection)
	return sendEmail(to, subject, html)
}

func deliverReportEscalatedEmail(ref, batch, urgency, reason, actor string) error {
	dest := strings.TrimSpace(os.Getenv("REPORT_ALERT_EMAIL"))
	if dest == "" {
		dest = "care@bodylia.in"
	}
	subject := fmt.Sprintf("[%s Escalation] Report %s (Batch %s)", strings.ToUpper(urgency), ref, batch)
	html := fmt.Sprintf(`<div style="font-family:sans-serif;color:#222;line-height:1.6;">
<h3 style="color:#B83232;">Escalation Alert (%s)</h3>
<p><strong>Report:</strong> %s (Batch %s)</p>
<p><strong>Escalated by:</strong> %s</p>
<p><strong>Reason:</strong> %s</p>
<p><a href="https://batch.bodylia.in/#/console" style="color:#6A1B29;font-weight:bold;">Review in staff console</a></p>
</div>`, urgency, ref, batch, actor, reason)
	return sendEmail(dest, subject, html)
}
