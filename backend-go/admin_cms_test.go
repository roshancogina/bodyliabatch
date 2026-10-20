package main

// Contract tests for the production admin console CRUD endpoints added for
// Reports, Escalations, Batches (edit/recall/import), Audit, Settings and
// Catalogue. Run: DB_NAME=bodyliabatch_test go test -run TestAdminCMS -v

import (
	"fmt"
	"testing"
)

// submitTestReport files a public report so the admin endpoints have data.
func submitTestReport(t *testing.T, r *ginEngine, name string) string {
	t.Helper()
	ch := fetchChallenge(t, r)
	tok := solveTestCaptcha(t, ch)
	w := doReq(t, r, "POST", "/bff/v1/reports", withCaptcha(map[string]any{
		"fullName": name, "email": "qa.tester@example.com", "batch": "PE-2610-WL01",
		"channel": "bodylia.in", "message": "Contract test report for admin CMS flows.",
		"consent": true,
	}, tok), "")
	if w.Code != 201 {
		t.Fatalf("submit report = %d: %s", w.Code, w.Body.String())
	}
	var out map[string]any
	decodeBody(t, w, &out)
	ref, _ := out["reference"].(string)
	if ref == "" {
		t.Fatalf("no reference: %v", out)
	}
	return ref
}

func TestAdminReportsListGetUpdate(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)
	ref := submitTestReport(t, r, "QA Tester")

	// list
	w := doReq(t, r, "GET", "/api/admin/reports?status=open", nil, tok)
	if w.Code != 200 {
		t.Fatalf("list = %d: %s", w.Code, w.Body.String())
	}
	// unknown filter rejected
	w = doReq(t, r, "GET", "/api/admin/reports?status=bogus", nil, tok)
	if w.Code != 400 {
		t.Fatalf("bad filter = %d, want 400", w.Code)
	}
	// search by reference
	w = doReq(t, r, "GET", "/api/admin/reports?q="+ref, nil, tok)
	var list []map[string]any
	decodeBody(t, w, &list)
	if len(list) != 1 {
		t.Fatalf("search = %d rows: %s", len(list), w.Body.String())
	}
	// detail
	w = doReq(t, r, "GET", "/api/admin/reports/"+ref, nil, tok)
	if w.Code != 200 {
		t.Fatalf("detail = %d: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "GET", "/api/admin/reports/SR-2099-99999", nil, tok)
	if w.Code != 404 {
		t.Fatalf("missing detail = %d, want 404", w.Code)
	}
	// update status + note + assignee
	w = doReq(t, r, "PATCH", "/api/admin/reports/"+ref,
		map[string]any{"status": "investigating", "note": "Looking into it now.", "assignee": "QA Tester"}, tok)
	if w.Code != 200 {
		t.Fatalf("patch = %d: %s", w.Code, w.Body.String())
	}
	var rep map[string]any
	decodeBody(t, w, &rep)
	if rep["status"] != "investigating" {
		t.Fatalf("status = %v", rep["status"])
	}
	tl, _ := rep["timeline"].([]any)
	if len(tl) < 3 {
		t.Fatalf("timeline too short: %v", tl)
	}
	// invalid status
	w = doReq(t, r, "PATCH", "/api/admin/reports/"+ref, map[string]any{"status": "nope"}, tok)
	if w.Code != 400 {
		t.Fatalf("bad status = %d, want 400", w.Code)
	}
	// empty patch
	w = doReq(t, r, "PATCH", "/api/admin/reports/"+ref, map[string]any{}, tok)
	if w.Code != 400 {
		t.Fatalf("empty patch = %d, want 400", w.Code)
	}
	// unassign
	blank := ""
	w = doReq(t, r, "PATCH", "/api/admin/reports/"+ref, map[string]any{"assignee": blank}, tok)
	if w.Code != 200 {
		t.Fatalf("unassign = %d: %s", w.Code, w.Body.String())
	}
	// requires auth
	w = doReq(t, r, "GET", "/api/admin/reports", nil, "")
	if w.Code != 401 {
		t.Fatalf("unauth list = %d, want 401", w.Code)
	}
}

func TestAdminReportEscalationFlow(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)
	ref := submitTestReport(t, r, "QA Escalator")

	// escalate
	w := doReq(t, r, "POST", "/api/admin/reports/"+ref+"/escalate",
		map[string]any{"reason": "Customer reports health symptoms after use.", "urgency": "urgent"}, tok)
	if w.Code != 201 {
		t.Fatalf("escalate = %d: %s", w.Code, w.Body.String())
	}
	// duplicate → 409
	w = doReq(t, r, "POST", "/api/admin/reports/"+ref+"/escalate",
		map[string]any{"reason": "Second attempt that should collide hard.", "urgency": "standard"}, tok)
	if w.Code != 409 {
		t.Fatalf("dup escalate = %d, want 409: %s", w.Code, w.Body.String())
	}
	// short reason
	w = doReq(t, r, "POST", "/api/admin/reports/"+ref+"/escalate",
		map[string]any{"reason": "short", "urgency": "standard"}, tok)
	if w.Code != 400 {
		t.Fatalf("short reason = %d, want 400", w.Code)
	}
	// list open
	w = doReq(t, r, "GET", "/api/admin/escalations?state=open", nil, tok)
	var esc []map[string]any
	decodeBody(t, w, &esc)
	if len(esc) == 0 {
		t.Fatalf("open escalations empty: %s", w.Body.String())
	}
	// accept
	w = doReq(t, r, "PATCH", "/api/admin/escalations/"+ref, map[string]any{"state": "accepted"}, tok)
	if w.Code != 200 {
		t.Fatalf("accept = %d: %s", w.Code, w.Body.String())
	}
	// accept again → 409 (no longer open)
	w = doReq(t, r, "PATCH", "/api/admin/escalations/"+ref, map[string]any{"state": "accepted"}, tok)
	if w.Code != 409 {
		t.Fatalf("re-accept = %d, want 409", w.Code)
	}
	// bad state
	w = doReq(t, r, "PATCH", "/api/admin/escalations/"+ref, map[string]any{"state": "closed"}, tok)
	if w.Code != 400 {
		t.Fatalf("bad state = %d, want 400", w.Code)
	}
}

func TestAdminBatchEditAndRecall(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)

	// edit a seeded released batch (005 first production batch).
	w := doReq(t, r, "PATCH", "/api/admin/batches/PE-2610-WL01",
		map[string]any{"manufactured": "2026-10-01", "expires": "2028-04-30",
			"facility": "Unit 2, Baddi, Himachal Pradesh", "lab": "Eurofins, Bengaluru"}, tok)
	if w.Code != 200 {
		t.Fatalf("edit = %d: %s", w.Code, w.Body.String())
	}
	// bad dates
	w = doReq(t, r, "PATCH", "/api/admin/batches/PE-2610-WL01",
		map[string]any{"manufactured": "2028-01-01", "expires": "2027-01-01",
			"facility": "X", "lab": "Y"}, tok)
	if w.Code != 400 {
		t.Fatalf("bad dates = %d, want 400", w.Code)
	}
	// missing batch
	w = doReq(t, r, "PATCH", "/api/admin/batches/ZZ-9999-9Z99",
		map[string]any{"manufactured": "2026-01-01", "expires": "2027-01-01",
			"facility": "X", "lab": "Y"}, tok)
	if w.Code != 404 {
		t.Fatalf("missing edit = %d, want 404", w.Code)
	}

	// recall: public lookup must flip to recalled.
	w = doReq(t, r, "POST", "/api/admin/batches/FE-2610-WL01/recall",
		map[string]any{"reason": "Customer complaints about loose seals in this lot."}, tok)
	if w.Code != 200 {
		t.Fatalf("recall = %d: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "GET", "/bff/v1/batches/FE-2610-WL01", nil, "")
	var lk map[string]any
	decodeBody(t, w, &lk)
	if lk["kind"] != "recalled" {
		t.Fatalf("public lookup after recall = %v", lk)
	}
	// recall again → 409
	w = doReq(t, r, "POST", "/api/admin/batches/FE-2610-WL01/recall",
		map[string]any{"reason": "Duplicate recall attempt against already recalled batch."}, tok)
	if w.Code != 409 {
		t.Fatalf("dup recall = %d, want 409: %s", w.Code, w.Body.String())
	}
	// short reason
	w = doReq(t, r, "POST", "/api/admin/batches/MB-2610-WL01/recall",
		map[string]any{"reason": "too short"}, tok)
	if w.Code != 400 {
		t.Fatalf("short reason = %d, want 400", w.Code)
	}
	// restore
	w = doReq(t, r, "DELETE", "/api/admin/batches/FE-2610-WL01/recall", nil, tok)
	if w.Code != 200 {
		t.Fatalf("unrecall = %d: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "GET", "/bff/v1/batches/FE-2610-WL01", nil, "")
	decodeBody(t, w, &lk)
	if lk["kind"] != "genuine" {
		t.Fatalf("public lookup after restore = %v", lk)
	}
	// unrecall a non-recalled batch → 409
	w = doReq(t, r, "DELETE", "/api/admin/batches/MB-2610-WL01/recall", nil, tok)
	if w.Code != 409 {
		t.Fatalf("unrecall released = %d, want 409", w.Code)
	}
}

func TestAdminBulkImportAllOrNothing(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)
	seed := fmt.Sprintf("CI-99%02d-IT01", 10)

	// happy path: two rows with one alias.
	rows := []map[string]any{
		{"batch": seed, "product": "CI", "manufactured": "2026-09-01",
			"expires": "2028-08-31", "facility": "Goa Unit 1", "lab": "Eurofins",
			"aliases": []string{"IMP-CODE-1"}},
		{"batch": "FN-9902-IT02", "product": "FN", "manufactured": "2026-09-01",
			"expires": "2028-08-31", "facility": "Goa Unit 1", "lab": "Eurofins"},
	}
	w := doReq(t, r, "POST", "/api/admin/import/batches", map[string]any{"rows": rows}, tok)
	if w.Code != 201 {
		t.Fatalf("import = %d: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "GET", "/bff/v1/batches/IMP-CODE-1", nil, "")
	var lk map[string]any
	decodeBody(t, w, &lk)
	if lk["kind"] != "genuine" {
		t.Fatalf("imported alias lookup = %v", lk)
	}
	// all-or-nothing: a row with an already-taken alias must reject the lot.
	badRows := []map[string]any{
		{"batch": "CI-9903-IT03", "product": "CI", "manufactured": "2026-09-01",
			"expires": "2028-08-31", "facility": "Goa Unit 1", "lab": "Eurofins"},
		{"batch": "FN-9904-IT04", "product": "FN", "manufactured": "2026-09-01",
			"expires": "2028-08-31", "facility": "Goa Unit 1", "lab": "Eurofins",
			"aliases": []string{"IMP-CODE-1"}},
	}
	w = doReq(t, r, "POST", "/api/admin/import/batches", map[string]any{"rows": badRows}, tok)
	if w.Code != 409 {
		t.Fatalf("clash import = %d, want 409: %s", w.Code, w.Body.String())
	}
	// neither row from the failed batch may exist.
	w = doReq(t, r, "GET", "/bff/v1/batches/CI-9903-IT03", nil, "")
	if w.Code != 404 {
		t.Fatalf("rollback failed: CI-9903-IT03 = %d, want 404", w.Code)
	}
	// empty import
	w = doReq(t, r, "POST", "/api/admin/import/batches", map[string]any{"rows": []any{}}, tok)
	if w.Code != 400 {
		t.Fatalf("empty import = %d, want 400", w.Code)
	}
	// product mismatch row
	w = doReq(t, r, "POST", "/api/admin/import/batches", map[string]any{"rows": []map[string]any{
		{"batch": "CI-9905-IT05", "product": "FN", "manufactured": "2026-09-01",
			"expires": "2028-08-31", "facility": "G", "lab": "L"},
	}}, tok)
	if w.Code != 400 {
		t.Fatalf("mismatch import = %d, want 400", w.Code)
	}
}

func TestAdminAuditSettingsCatalogue(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)

	// produce an audit event via a recall, then read the log.
	w := doReq(t, r, "POST", "/api/admin/batches/MB-2610-WL01/recall",
		map[string]any{"reason": "Audited recall for the CMS contract suite run."}, tok)
	if w.Code != 200 {
		t.Fatalf("recall for audit = %d: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "GET", "/api/admin/audit?target=MB-2610-WL01", nil, tok)
	var events []map[string]any
	decodeBody(t, w, &events)
	found := false
	for _, e := range events {
		if e["action"] == "Recalled batch" {
			found = true
		}
	}
	if !found {
		t.Fatalf("audit missing Recalled batch: %s", w.Body.String())
	}
	// plain audit list (no target) — was a 500: LIMIT $2 with no $1.
	w = doReq(t, r, "GET", "/api/admin/audit", nil, tok)
	if w.Code != 200 {
		t.Fatalf("audit all = %d: %s", w.Code, w.Body.String())
	}
	// bad limit ignored, target filter no-match returns empty.
	w = doReq(t, r, "GET", "/api/admin/audit?limit=abc&target=NO-SUCH-TARGET", nil, tok)
	if w.Code != 200 {
		t.Fatalf("audit bad limit = %d", w.Code)
	}
	decodeBody(t, w, &events)
	if len(events) != 0 {
		t.Fatalf("audit no-match not empty: %d", len(events))
	}
	// cleanup so later runs start clean.
	db := mustTestDB(t)
	_, _ = db.Exec(`DELETE FROM audit_log WHERE target='MB-2610-WL01'`)
	_, _ = db.Exec(`UPDATE batches SET status='released', recall_reason=NULL WHERE batch='MB-2610-WL01'`)

	// settings: read, edit, validate.
	w = doReq(t, r, "GET", "/api/admin/settings", nil, tok)
	if w.Code != 200 {
		t.Fatalf("settings get = %d: %s", w.Code, w.Body.String())
	}
	var s map[string]any
	decodeBody(t, w, &s)
	if s["supportEmail"] == "" {
		t.Fatalf("settings empty: %v", s)
	}
	w = doReq(t, r, "PATCH", "/api/admin/settings",
		map[string]any{"replyTargetHours": 24, "supportEmail": "care@bodylia.in"}, tok)
	if w.Code != 200 {
		t.Fatalf("settings patch = %d: %s", w.Code, w.Body.String())
	}
	decodeBody(t, w, &s)
	if s["replyTargetHours"] != float64(24) {
		t.Fatalf("replyTargetHours = %v", s["replyTargetHours"])
	}
	w = doReq(t, r, "PATCH", "/api/admin/settings", map[string]any{"replyTargetHours": 0}, tok)
	if w.Code != 400 {
		t.Fatalf("settings invalid = %d, want 400", w.Code)
	}
	w = doReq(t, r, "PATCH", "/api/admin/settings", map[string]any{}, tok)
	if w.Code != 400 {
		t.Fatalf("settings empty patch = %d, want 400", w.Code)
	}

	// catalogue: read products+sites, archive/unarchive a product and a site.
	w = doReq(t, r, "GET", "/api/admin/catalogue", nil, tok)
	if w.Code != 200 {
		t.Fatalf("catalogue = %d: %s", w.Code, w.Body.String())
	}
	var cat map[string]any
	decodeBody(t, w, &cat)
	products, _ := cat["products"].([]any)
	sites, _ := cat["sites"].([]any)
	if len(products) == 0 || len(sites) == 0 {
		t.Fatalf("catalogue empty: %v", cat)
	}
	w = doReq(t, r, "PATCH", "/api/admin/catalogue/products/PE",
		map[string]any{"archived": true}, tok)
	if w.Code != 200 {
		t.Fatalf("archive product = %d: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "PATCH", "/api/admin/catalogue/products/PE",
		map[string]any{"archived": false}, tok)
	if w.Code != 200 {
		t.Fatalf("unarchive product = %d: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "PATCH", "/api/admin/catalogue/products/ZZ",
		map[string]any{"archived": true}, tok)
	if w.Code != 404 {
		t.Fatalf("archive missing product = %d, want 404", w.Code)
	}
	w = doReq(t, r, "PATCH", "/api/admin/catalogue/products/PE", map[string]any{}, tok)
	if w.Code != 400 {
		t.Fatalf("archive no flag = %d, want 400", w.Code)
	}
	firstSite, _ := sites[0].(map[string]any)
	id, _ := firstSite["id"].(string)
	w = doReq(t, r, "PATCH", "/api/admin/catalogue/sites/"+id,
		map[string]any{"archived": true}, tok)
	if w.Code != 200 {
		t.Fatalf("archive site = %d: %s", w.Code, w.Body.String())
	}
	_, _ = db.Exec(`UPDATE sites SET archived=false WHERE id=$1`, id)
	w = doReq(t, r, "PATCH", "/api/admin/catalogue/sites/11111111-1111-1111-1111-111111111111",
		map[string]any{"archived": true}, tok)
	if w.Code != 404 {
		t.Fatalf("archive missing site = %d, want 404", w.Code)
	}

	// settings is a singleton NOT reset by resetTestDB — restore the default
	// LAST so later tests (TestAdminInsightsSeedState) still see 48.
	_, _ = db.Exec(`UPDATE settings SET reply_target_hours=48`)
}

// Regression (Oct 2026): PATCH/DELETE /api/admin/staff/:id called
// canManageUsers(c) with the gin context — the StaffUser type-assert always
// failed, so even admins got 403. The fix passes currentUser(c).
func TestAdminStaffUpdateAndDeactivate(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)

	w := doReq(t, r, "GET", "/api/admin/staff", nil, tok)
	var staff []map[string]any
	decodeBody(t, w, &staff)
	var target map[string]any
	for _, s := range staff {
		if email, _ := s["email"].(string); email != "admin@bodylia.in" {
			target = s
			break
		}
	}
	if target == nil {
		t.Fatalf("no non-self staff member in seed: %d rows", len(staff))
	}
	id, _ := target["id"].(string)

	// role change by admin must succeed (was 403 before the fix).
	w = doReq(t, r, "PATCH", "/api/admin/staff/"+id, map[string]any{"role": "quality"}, tok)
	if w.Code != 200 {
		t.Fatalf("patch role = %d: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "PATCH", "/api/admin/staff/"+id, map[string]any{"role": "nope"}, tok)
	if w.Code != 400 {
		t.Fatalf("bad role = %d, want 400", w.Code)
	}
	// self-deactivation blocked both ways.
	w = doReq(t, r, "GET", "/api/admin/staff", nil, tok)
	decodeBody(t, w, &staff)
	var meID string
	for _, s := range staff {
		if email, _ := s["email"].(string); email == "admin@bodylia.in" {
			meID, _ = s["id"].(string)
		}
	}
	w = doReq(t, r, "PATCH", "/api/admin/staff/"+meID, map[string]any{"status": "deactivated"}, tok)
	if w.Code != 400 {
		t.Fatalf("self-deactivate patch = %d, want 400", w.Code)
	}
	w = doReq(t, r, "DELETE", "/api/admin/staff/"+meID, nil, tok)
	if w.Code != 400 {
		t.Fatalf("self-deactivate delete = %d, want 400", w.Code)
	}
	// deactivating someone else succeeds and sticks.
	w = doReq(t, r, "DELETE", "/api/admin/staff/"+id, nil, tok)
	if w.Code != 200 {
		t.Fatalf("delete other = %d: %s", w.Code, w.Body.String())
	}
	w = doReq(t, r, "GET", "/api/admin/staff", nil, tok)
	decodeBody(t, w, &staff)
	found := false
	for _, s := range staff {
		if s["id"] == id {
			found = true
			if s["status"] != "deactivated" {
				t.Fatalf("status = %v, want deactivated", s["status"])
			}
		}
	}
	if !found {
		t.Fatalf("deactivated staff missing from list")
	}
	// unknown id → 404; empty body → 400.
	w = doReq(t, r, "DELETE", "/api/admin/staff/11111111-1111-1111-1111-111111111111", nil, tok)
	if w.Code != 404 {
		t.Fatalf("delete missing = %d, want 404", w.Code)
	}
	w = doReq(t, r, "PATCH", "/api/admin/staff/"+id, map[string]any{}, tok)
	if w.Code != 400 {
		t.Fatalf("empty patch = %d, want 400", w.Code)
	}
}
