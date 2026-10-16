package main

import (
	"math"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// GET /api/admin/insights — one aggregated read for the console Overview tab
// (ProdShell → ProdOverview). Everything is computed server-side from live
// tables (reports, lookups, escalations, batches, staff_users, settings) so
// the production console never touches src/data/admin-seed fixtures (those
// assert at module load in prod builds).
//
// Contract (mirrored in TS by src/admin/insights.ts, pinned by
// backend-go/insights_test.go):
//
//	{ generatedAt, replyTargetHours,
//	  reports:    { total, open, atRisk, unassigned, resolved,
//	                resolvedCounterfeit, suspectedCounterfeit,
//	                byChannel[], workload[] },
//	  escalations:{ open, oldest|null },
//	  batches:    { total, recalled, expiringSoon[] },
//	  lookups14d: { total, notFound, days[] }  // 14 buckets, oldest first
//	  hotspots:   [{ input, checks7d, checksPrev7d, topChannel, linkedReports[] }],
//	  staff:      { active, invited[] },
//	  service:    { repliesOnTargetPct|null } }

type InsightsChannel struct {
	Channel   string `json:"channel"`
	Total     int    `json:"total"`
	Suspected int    `json:"suspected"`
}

type InsightsWorkload struct {
	Name string `json:"name"`
	Open int    `json:"open"`
}

type InsightsEscalation struct {
	Reference string    `json:"reference"`
	At        time.Time `json:"at"`
	By        string    `json:"by"`
	Reason    string    `json:"reason"`
	Urgency   string    `json:"urgency"`
}

type InsightsExpiring struct {
	Batch       string `json:"batch"`
	ProductName string `json:"productName"`
	Expires     string `json:"expires"`
}

type InsightsDay struct {
	Day      string `json:"day"`
	Checks   int    `json:"checks"`
	NotFound int    `json:"notFound"`
}

type InsightsHotspot struct {
	Input         string   `json:"input"`
	Checks7d      int      `json:"checks7d"`
	ChecksPrev7d  int      `json:"checksPrev7d"`
	TopChannel    *string  `json:"topChannel"`
	LinkedReports []string `json:"linkedReports"`
}

type InsightsInvited struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

type InsightsReports struct {
	Total                int                `json:"total"`
	Open                 int                `json:"open"`
	AtRisk               int                `json:"atRisk"`
	Unassigned           int                `json:"unassigned"`
	Resolved             int                `json:"resolved"`
	ResolvedCounterfeit  int                `json:"resolvedCounterfeit"`
	SuspectedCounterfeit int                `json:"suspectedCounterfeit"`
	ByChannel            []InsightsChannel  `json:"byChannel"`
	Workload             []InsightsWorkload `json:"workload"`
}

type InsightsEscalations struct {
	Open   int                 `json:"open"`
	Oldest *InsightsEscalation `json:"oldest"`
}

type InsightsBatches struct {
	Total        int                `json:"total"`
	Recalled     int                `json:"recalled"`
	ExpiringSoon []InsightsExpiring `json:"expiringSoon"`
}

type InsightsLookups struct {
	Total    int           `json:"total"`
	NotFound int           `json:"notFound"`
	Days     []InsightsDay `json:"days"`
}

type InsightsStaff struct {
	Active  int               `json:"active"`
	Invited []InsightsInvited `json:"invited"`
}

type InsightsService struct {
	// RepliesOnTargetPct = share of resolved reports whose first reply landed
	// within replyTargetHours of receipt; null when nothing is resolved yet.
	RepliesOnTargetPct *float64 `json:"repliesOnTargetPct"`
}

type AdminInsights struct {
	GeneratedAt      string              `json:"generatedAt"`
	ReplyTargetHours int                 `json:"replyTargetHours"`
	Reports          InsightsReports     `json:"reports"`
	Escalations      InsightsEscalations `json:"escalations"`
	Batches          InsightsBatches     `json:"batches"`
	Lookups14d       InsightsLookups     `json:"lookups14d"`
	Hotspots         []InsightsHotspot   `json:"hotspots"`
	Staff            InsightsStaff       `json:"staff"`
	Service          InsightsService     `json:"service"`
}

func (a *App) handleAdminInsights(c *gin.Context) {
	out := AdminInsights{
		GeneratedAt: nowTime().UTC().Format(time.RFC3339),
		Reports: InsightsReports{
			ByChannel: []InsightsChannel{},
			Workload:  []InsightsWorkload{},
		},
		Batches:    InsightsBatches{ExpiringSoon: []InsightsExpiring{}},
		Lookups14d: InsightsLookups{Days: []InsightsDay{}},
		Hotspots:   []InsightsHotspot{},
		Staff:      InsightsStaff{Invited: []InsightsInvited{}},
	}
	db := a.store.db

	// Reply target (singleton settings row; default matches the schema).
	target := 48
	if err := db.QueryRow(`SELECT reply_target_hours FROM settings WHERE id=1`).Scan(&target); err != nil {
		target = 48
	}
	out.ReplyTargetHours = target

	// Report KPIs.
	// At risk mirrors the frontend `hoursLeft(r, target) < 12` rule:
	// age > target-12 hours (overdue reports included; a negative window when
	// the target itself is under 12 h, exactly like the frontend formula).
	err := db.QueryRow(`SELECT COUNT(*),
		COUNT(*) FILTER (WHERE status IN ('new','investigating')),
		COUNT(*) FILTER (WHERE status IN ('new','investigating')
			AND created_at < NOW() - make_interval(hours => $1 - 12)),
		COUNT(*) FILTER (WHERE status IN ('new','investigating') AND assignee IS NULL),
		COUNT(*) FILTER (WHERE status LIKE 'resolved%'),
		COUNT(*) FILTER (WHERE status = 'resolved_counterfeit'),
		COUNT(*) FILTER (WHERE status = 'resolved_counterfeit' OR batch_canonical IS NULL)
		FROM reports`, target).Scan(
		&out.Reports.Total, &out.Reports.Open, &out.Reports.AtRisk,
		&out.Reports.Unassigned, &out.Reports.Resolved,
		&out.Reports.ResolvedCounterfeit, &out.Reports.SuspectedCounterfeit)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load insights"})
		return
	}

	// Reports by purchase channel — "suspected" mirrors IntelligencePage:
	// confirmed counterfeit OR a batch number that was never registered.
	rows, err := db.Query(`SELECT channel, COUNT(*),
		COUNT(*) FILTER (WHERE status = 'resolved_counterfeit' OR batch_canonical IS NULL)
		FROM reports GROUP BY channel ORDER BY 3 DESC, 2 DESC, 1`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load insights"})
		return
	}
	for rows.Next() {
		var ch InsightsChannel
		if err := rows.Scan(&ch.Channel, &ch.Total, &ch.Suspected); err == nil {
			out.Reports.ByChannel = append(out.Reports.ByChannel, ch)
		}
	}
	rows.Close()

	// Open reports per active non-admin owner (workload bars).
	rows, err = db.Query(`SELECT u.name, COUNT(r.reference)
		FROM staff_users u
		LEFT JOIN reports r ON r.assignee = u.name AND r.status IN ('new','investigating')
		WHERE u.status = 'active' AND u.role <> 'admin'
		GROUP BY u.name ORDER BY COUNT(r.reference) DESC, u.name`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load insights"})
		return
	}
	for rows.Next() {
		var w InsightsWorkload
		if err := rows.Scan(&w.Name, &w.Open); err == nil {
			out.Reports.Workload = append(out.Reports.Workload, w)
		}
	}
	rows.Close()

	// Open escalations + the oldest one waiting on quality.
	if err := db.QueryRow(`SELECT COUNT(*) FROM escalations WHERE state='open'`).
		Scan(&out.Escalations.Open); err != nil {
		c.JSON(500, gin.H{"error": "Could not load insights"})
		return
	}
	if out.Escalations.Open > 0 {
		oldest := &InsightsEscalation{}
		if err := db.QueryRow(`SELECT reference, at, by, reason, urgency
			FROM escalations WHERE state='open' ORDER BY at LIMIT 1`).Scan(
			&oldest.Reference, &oldest.At, &oldest.By, &oldest.Reason, &oldest.Urgency); err == nil {
			out.Escalations.Oldest = oldest
		}
	}

	// Batch health: registered / recalled / expiring within 120 days.
	if err := db.QueryRow(`SELECT COUNT(*), COUNT(*) FILTER (WHERE status='recalled')
		FROM batches`).Scan(&out.Batches.Total, &out.Batches.Recalled); err != nil {
		c.JSON(500, gin.H{"error": "Could not load insights"})
		return
	}
	rows, err = db.Query(`SELECT b.batch, p.name, b.expires::text
		FROM batches b JOIN products p ON p.code = b.product_code
		WHERE b.status = 'released'
		  AND b.expires >= CURRENT_DATE AND b.expires <= CURRENT_DATE + 120
		ORDER BY b.expires LIMIT 20`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load insights"})
		return
	}
	for rows.Next() {
		var e InsightsExpiring
		if err := rows.Scan(&e.Batch, &e.ProductName, &e.Expires); err == nil {
			out.Batches.ExpiringSoon = append(out.Batches.ExpiringSoon, e)
		}
	}
	rows.Close()

	// 14-day public check trend (UTC day buckets, oldest first).
	rows, err = db.Query(`SELECT to_char(d, 'YYYY-MM-DD'),
		COUNT(l.id), COUNT(l.id) FILTER (WHERE l.verdict = 'not_found')
		FROM generate_series((NOW() AT TIME ZONE 'UTC' - interval '13 days')::date,
		                     (NOW() AT TIME ZONE 'UTC')::date, '1 day') d
		LEFT JOIN lookups l ON (l.at AT TIME ZONE 'UTC')::date = d::date
		GROUP BY d ORDER BY d`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load insights"})
		return
	}
	for rows.Next() {
		var d InsightsDay
		if err := rows.Scan(&d.Day, &d.Checks, &d.NotFound); err == nil {
			out.Lookups14d.Days = append(out.Lookups14d.Days, d)
			out.Lookups14d.Total += d.Checks
			out.Lookups14d.NotFound += d.NotFound
		}
	}
	rows.Close()

	// Counterfeit hotspots: not-found checks on numbers that were never
	// produced, this week vs the week before, ranked by this week's volume.
	rows, err = db.Query(`SELECT upper(regexp_replace(input, '[^A-Za-z0-9]', '', 'g')) AS key,
		MIN(input),
		COUNT(*) FILTER (WHERE at >= NOW() - interval '7 days'),
		COUNT(*) FILTER (WHERE at < NOW() - interval '7 days')
		FROM lookups
		WHERE verdict = 'not_found' AND at >= NOW() - interval '14 days'
		GROUP BY key
		HAVING COUNT(*) FILTER (WHERE at >= NOW() - interval '7 days') > 0
		ORDER BY 3 DESC, key LIMIT 8`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load insights"})
		return
	}
	var hotKeys []string
	for rows.Next() {
		var key, input string
		var c7, cprev int
		if err := rows.Scan(&key, &input, &c7, &cprev); err == nil {
			out.Hotspots = append(out.Hotspots, InsightsHotspot{
				Input: input, Checks7d: c7, ChecksPrev7d: cprev,
				LinkedReports: []string{},
			})
			hotKeys = append(hotKeys, key)
		}
	}
	rows.Close()
	for i, key := range hotKeys {
		linked, err := a.hotspotReports(key)
		if err != nil {
			continue
		}
		for _, lr := range linked {
			out.Hotspots[i].LinkedReports = append(out.Hotspots[i].LinkedReports, lr.reference)
		}
		out.Hotspots[i].TopChannel = topChannelOf(linked)
	}

	// Staff: active headcount + invitations nobody has accepted yet.
	if err := db.QueryRow(`SELECT COUNT(*) FILTER (WHERE status='active')
		FROM staff_users`).Scan(&out.Staff.Active); err != nil {
		c.JSON(500, gin.H{"error": "Could not load insights"})
		return
	}
	rows, err = db.Query(`SELECT name, email FROM staff_users
		WHERE status='invited' ORDER BY name`)
	if err != nil {
		c.JSON(500, gin.H{"error": "Could not load insights"})
		return
	}
	for rows.Next() {
		var inv InsightsInvited
		if err := rows.Scan(&inv.Name, &inv.Email); err == nil {
			out.Staff.Invited = append(out.Staff.Invited, inv)
		}
	}
	rows.Close()

	// Service health we can honestly measure: first reply within target.
	var resolved, onTarget int
	if err := db.QueryRow(`SELECT COUNT(*),
		COUNT(*) FILTER (WHERE x.first_reply IS NOT NULL
			AND x.first_reply <= r.created_at + make_interval(hours => $1))
		FROM reports r
		LEFT JOIN LATERAL (
			SELECT MIN(t.at) AS first_reply FROM report_timeline t
			WHERE t.reference = r.reference AND t.kind = 'reply'
		) x ON TRUE
		WHERE r.status LIKE 'resolved%'`, target).Scan(&resolved, &onTarget); err == nil && resolved > 0 {
		pct := math.Round(float64(onTarget)/float64(resolved)*1000) / 10
		out.Service.RepliesOnTargetPct = &pct
	}

	c.JSON(200, out)
}

type hotspotReport struct {
	reference string
	channel   string
}

// hotspotReports finds customer reports filed against the same (unregistered)
// batch number — compact-insensitive, same normalisation the lookup path uses.
func (a *App) hotspotReports(compactKey string) ([]hotspotReport, error) {
	rows, err := a.store.db.Query(`SELECT reference, COALESCE(channel, '')
		FROM reports
		WHERE upper(regexp_replace(batch_input, '[^A-Za-z0-9]', '', 'g')) = $1
		ORDER BY created_at DESC`, compactKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []hotspotReport
	for rows.Next() {
		var r hotspotReport
		if err := rows.Scan(&r.reference, &r.channel); err == nil {
			out = append(out, r)
		}
	}
	return out, nil
}

// topChannelOf picks the most common purchase channel (alphabetical tie-break
// so the payload stays deterministic between polls).
func topChannelOf(rs []hotspotReport) *string {
	if len(rs) == 0 {
		return nil
	}
	counts := map[string]int{}
	for _, r := range rs {
		counts[strings.TrimSpace(r.channel)]++
	}
	best, bestN := "", -1
	for ch, n := range counts {
		if n > bestN || (n == bestN && (best == "" || ch < best)) {
			best, bestN = ch, n
		}
	}
	if best == "" {
		return nil
	}
	return &best
}
