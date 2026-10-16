package main

// TDD RED PHASE — GET /api/admin/insights contract (console Overview tab).
// Run: DB_NAME=bodyliabatch_test go test -run TestAdminInsights -v

import (
	"testing"
	"time"
)

func insightsGet(t *testing.T, r *ginEngine, tok string) AdminInsights {
	t.Helper()
	w := doReq(t, r, "GET", "/api/admin/insights", nil, tok)
	if w.Code != 200 {
		t.Fatalf("insights = %d: %s", w.Code, w.Body.String())
	}
	var out AdminInsights
	decodeBody(t, w, &out)
	return out
}

func channelBy(out AdminInsights, name string) (InsightsChannel, bool) {
	for _, ch := range out.Reports.ByChannel {
		if ch.Channel == name {
			return ch, true
		}
	}
	return InsightsChannel{}, false
}

func TestAdminInsightsRequiresAuth(t *testing.T) {
	r := testRouter(t)
	w := doReq(t, r, "GET", "/api/admin/insights", nil, "")
	if w.Code != 401 {
		t.Fatalf("unauthenticated insights = %d, want 401", w.Code)
	}
}

func TestAdminInsightsSeedState(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)
	out := insightsGet(t, r, tok)

	if out.ReplyTargetHours != 48 {
		t.Fatalf("replyTargetHours = %d, want 48 (settings default)", out.ReplyTargetHours)
	}
	// Seed reports: 2 new (unassigned) + 2 investigating (assigned).
	if out.Reports.Total != 4 || out.Reports.Open != 4 {
		t.Fatalf("reports total/open = %d/%d, want 4/4 (reset isolation)", out.Reports.Total, out.Reports.Open)
	}
	if out.Reports.Unassigned != 2 {
		t.Fatalf("unassigned = %d, want 2", out.Reports.Unassigned)
	}
	if out.Reports.AtRisk != 0 {
		// Seeds are inserted with created_at = NOW(), far inside the 48 h target.
		t.Fatalf("atRisk = %d, want 0 for freshly seeded reports", out.Reports.AtRisk)
	}
	// Suspected = confirmed counterfeit OR never-registered batch number.
	// All four seed reports carry legacy BDL-* inputs that migration 004
	// re-pointed to NULL canonicals, so every one traces to a batch number
	// that is not in the registry (the demo counterfeit story).
	if out.Reports.SuspectedCounterfeit != 4 {
		t.Fatalf("suspectedCounterfeit = %d, want 4", out.Reports.SuspectedCounterfeit)
	}
	if out.Reports.Resolved != 0 || out.Reports.ResolvedCounterfeit != 0 {
		t.Fatalf("resolved = %d/%d, want 0/0 for seed state", out.Reports.Resolved, out.Reports.ResolvedCounterfeit)
	}
	if ch, ok := channelBy(out, "Flipkart"); !ok || ch.Total != 2 || ch.Suspected != 2 {
		t.Fatalf("Flipkart channel = %+v ok=%v, want total 2 suspected 2", ch, ok)
	}

	// Workload: active non-admin staff only, admins never appear.
	wantLoad := map[string]int{"Ananya Sen": 1, "Vikram Rao": 1, "Rohan Desai": 0}
	if len(out.Reports.Workload) != len(wantLoad) {
		t.Fatalf("workload = %+v, want %d entries", out.Reports.Workload, len(wantLoad))
	}
	for _, w := range out.Reports.Workload {
		if w.Name == "Meera Iyer" {
			t.Fatalf("admin must not appear in workload: %+v", out.Reports.Workload)
		}
		if wantLoad[w.Name] != w.Open {
			t.Fatalf("workload %s = %d, want %d", w.Name, w.Open, wantLoad[w.Name])
		}
	}

	// One open escalation seeded (SR-2026-04817, urgent, by Ananya Sen).
	if out.Escalations.Open != 1 || out.Escalations.Oldest == nil {
		t.Fatalf("escalations = %d oldest %+v, want 1 with oldest", out.Escalations.Open, out.Escalations.Oldest)
	}
	if out.Escalations.Oldest.By != "Ananya Sen" || out.Escalations.Oldest.Reference != "SR-2026-04817" {
		t.Fatalf("oldest escalation = %+v", out.Escalations.Oldest)
	}

	// Batch health: 8 seeded batches, exactly one recall (PH-2504-PH77).
	if out.Batches.Total != 8 || out.Batches.Recalled != 1 {
		t.Fatalf("batches total/recalled = %d/%d, want 8/1", out.Batches.Total, out.Batches.Recalled)
	}
	for _, e := range out.Batches.ExpiringSoon {
		if e.Batch == "MB-2203-MB45" {
			t.Fatalf("already-expired batch must not be 'expiring soon': %+v", e)
		}
		if e.ProductName == "" {
			t.Fatalf("expiring entry missing product name: %+v", e)
		}
	}

	// 14-day trend: always 14 buckets, oldest first.
	if len(out.Lookups14d.Days) != 14 {
		t.Fatalf("lookups days = %d, want 14", len(out.Lookups14d.Days))
	}
	if out.Lookups14d.Total != 0 || len(out.Hotspots) != 0 {
		t.Fatalf("fresh state lookups/hotspots = %d/%d, want 0/0 (reset wipes lookups)", out.Lookups14d.Total, len(out.Hotspots))
	}

	// Staff: 4 active (incl. admin), one invited (Kabir Malhotra).
	if out.Staff.Active != 4 {
		t.Fatalf("staff active = %d, want 4", out.Staff.Active)
	}
	if len(out.Staff.Invited) != 1 || out.Staff.Invited[0].Name != "Kabir Malhotra" {
		t.Fatalf("invited = %+v, want Kabir Malhotra", out.Staff.Invited)
	}

	// No resolved reports yet → honest null, not a fabricated 100%.
	if out.Service.RepliesOnTargetPct != nil {
		t.Fatalf("repliesOnTargetPct = %v, want null with zero resolved reports", *out.Service.RepliesOnTargetPct)
	}
}

// TestAdminInsightsAggregation injects a week of lookup traffic and reports,
// then re-reads the payload: hotspot ranking, week-on-week deltas, trend
// totals, at-risk window, workload and channel attribution must all move.
func TestAdminInsightsAggregation(t *testing.T) {
	r := testRouter(t)
	tok := adminToken(t, r)
	db := mustTestDB(t)

	// 5 not-found checks on an unproduced number this week, 2 last week,
	// plus 3 genuine checks on a real batch (trend noise).
	if _, err := db.Exec(`INSERT INTO lookups (input, verdict, at) VALUES
		('ZZ-9999-9Z99','not_found', NOW() - interval '2 days'),
		('ZZ-9999-9Z99','not_found', NOW() - interval '3 days'),
		('ZZ-9999-9Z99','not_found', NOW() - interval '4 days'),
		('ZZ-9999-9Z99','not_found', NOW() - interval '5 days'),
		('ZZ-9999-9Z99','not_found', NOW() - interval '6 days'),
		('ZZ-9999-9Z99','not_found', NOW() - interval '8 days'),
		('ZZ-9999-9Z99','not_found', NOW() - interval '9 days'),
		('PE-2610-WL01','genuine',   NOW() - interval '1 hour'),
		('PE-2610-WL01','genuine',   NOW() - interval '2 hours'),
		('PE-2610-WL01','genuine',   NOW() - interval '3 hours')`); err != nil {
		t.Fatalf("insert lookups: %v", err)
	}
	// A customer report naming the same unproduced number (linked to hotspot),
	// and an aged unassigned report that has just entered the at-risk window.
	if _, err := db.Exec(`INSERT INTO reports
		(reference, full_name, email, batch_input, channel, message, status, assignee) VALUES
		('SR-2026-09999','Tomas Test','tomas@example.com','ZZ-9999-9Z99','Flipkart',
		 'Customer reports the unproduced number arrived on a Flipkart order.','investigating','Rohan Desai')`); err != nil {
		t.Fatalf("insert linked report: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO reports
		(reference, full_name, email, batch_input, batch_canonical, channel, message, status, created_at) VALUES
		('SR-2026-09998','Aged Test','aged@example.com','PE-2610-WL01','PE-2610-WL01','Pharmacy or store',
		 'Report that is 40 hours old so it counts against the reply target.','new', NOW() - interval '40 hours')`); err != nil {
		t.Fatalf("insert aged report: %v", err)
	}

	out := insightsGet(t, r, tok)

	// Trend picked up all 10 lookups; 7 of them were not-found.
	if out.Lookups14d.Total != 10 || out.Lookups14d.NotFound != 7 {
		t.Fatalf("lookups total/notFound = %d/%d, want 10/7", out.Lookups14d.Total, out.Lookups14d.NotFound)
	}

	// Exactly one hotspot: 5 checks this week vs 2 last week, linked to the
	// one report filed about it, channel attributed from that report.
	if len(out.Hotspots) != 1 {
		t.Fatalf("hotspots = %+v, want exactly one", out.Hotspots)
	}
	h := out.Hotspots[0]
	if h.Input != "ZZ-9999-9Z99" || h.Checks7d != 5 || h.ChecksPrev7d != 2 {
		t.Fatalf("hotspot = %+v, want ZZ-9999-9Z99 5 vs 2", h)
	}
	if len(h.LinkedReports) != 1 || h.LinkedReports[0] != "SR-2026-09999" {
		t.Fatalf("linkedReports = %v, want [SR-2026-09999]", h.LinkedReports)
	}
	if h.TopChannel == nil || *h.TopChannel != "Flipkart" {
		t.Fatalf("topChannel = %v, want Flipkart", h.TopChannel)
	}

	// Report KPIs moved with the injections: 4 seeds + 2 new; the 40-hour-old
	// report is past target-12 (36 h) so it is at risk; the hotspot report is
	// owned by Rohan, the aged one is not.
	if out.Reports.Total != 6 || out.Reports.Open != 6 {
		t.Fatalf("reports total/open = %d/%d, want 6/6", out.Reports.Total, out.Reports.Open)
	}
	if out.Reports.AtRisk != 1 {
		t.Fatalf("atRisk = %d, want 1 (40h > 48-12)", out.Reports.AtRisk)
	}
	if out.Reports.Unassigned != 3 {
		t.Fatalf("unassigned = %d, want 3", out.Reports.Unassigned)
	}
	// 5 = the 4 legacy-canonical-null seeds + the ZZ report; SR-2026-09998
	// carries a real canonical (PE-2610-WL01) so it is not suspected.
	if out.Reports.SuspectedCounterfeit != 5 {
		t.Fatalf("suspectedCounterfeit = %d, want 5 (4 seeds + ZZ report)", out.Reports.SuspectedCounterfeit)
	}
	for _, w := range out.Reports.Workload {
		if w.Name == "Rohan Desai" && w.Open != 1 {
			t.Fatalf("Rohan workload = %d, want 1", w.Open)
		}
	}
	if ch, ok := channelBy(out, "Flipkart"); !ok || ch.Total != 3 || ch.Suspected != 3 {
		t.Fatalf("Flipkart after injection = %+v ok=%v, want 3/3", ch, ok)
	}

	// Replies-on-target stays null until something is actually resolved.
	if out.Service.RepliesOnTargetPct != nil {
		t.Fatalf("repliesOnTargetPct = %v, want null", *out.Service.RepliesOnTargetPct)
	}

	// Sanity: generatedAt parses as RFC3339.
	if _, err := time.Parse(time.RFC3339, out.GeneratedAt); err != nil {
		t.Fatalf("generatedAt %q not RFC3339: %v", out.GeneratedAt, err)
	}
}
