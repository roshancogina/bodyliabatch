package main

// TDD: UIBatch canonical standard XX-NNNN-XXNN (spaces stripped/ignored).
// Mirrors src/lib/uibatch-standard.test.ts — server and client enforce identically.

import "testing"

func TestUIBatchPatternAcceptsWellFormed(t *testing.T) {
	for _, good := range []string{"PE-2610-WL01", "FE-2610-WL01", "FN-2610-WL01", "AB-0000-CD00", "ZZ-9999-ZZ99", "12-2610-WL01"} {
		if !isCanonicalBatch(good) {
			t.Errorf("isCanonicalBatch(%q) = false, want true", good)
		}
	}
}

func TestUIBatchPatternRejectsMalformed(t *testing.T) {
	bad := map[string]string{
		"F-2610-WL01":    "single-char prefix",
		"PE-261-WL01":    "3-digit middle",
		"PE-2610-WL0":    "3-char serial",
		"PE2610WL01":     "missing hyphens raw",
		"PE--2610--WL01": "double hyphens",
		"PE-261A-WL01":   "letter in middle",
		"PE-2610-01WL":   "digits-first serial",
		"PE-2610-WL01-X": "fourth group",
		"PE-2610":        "two groups only",
		"":               "empty",
		"BDL-PE-2610-WL01": "legacy BDL prefix",
		"PE-2610-WL01!":  "special char",
	}
	for input, why := range bad {
		if isCanonicalBatch(input) {
			t.Errorf("isCanonicalBatch(%q) = true, want false (%s)", input, why)
		}
	}
}

func TestUIBatchSpaceStripping(t *testing.T) {
	cases := map[string]string{
		"pe 2610 wl01":       "PE-2610-WL01",
		"PE2610WL01":         "PE-2610-WL01",
		"  pe-2610-wl01 ":    "PE-2610-WL01",
		"PE--2610--WL01":     "PE-2610-WL01",
		"P E - 2 6 1 0 - W L 0 1": "PE-2610-WL01",
	}
	for in, want := range cases {
		if got := normaliseBatch(in); got != want {
			t.Errorf("normaliseBatch(%q) = %q, want %q", in, got, want)
		}
		if !isCanonicalBatch(in) && in != "PE2610WL01" {
			// compact raw form is not canonical until normalised
			continue
		}
	}
	if got := stripSpaces("pe 2610 wl01"); got != "PE2610WL01" {
		t.Errorf("stripSpaces = %q", got)
	}
	if got := compactKey("pe 2610 wl01"); got != "PE2610WL01" {
		t.Errorf("compactKey = %q", got)
	}
	if got := normaliseAlias("mfg_fe/2610.wl01"); got != "MFG-FE-2610-WL01" {
		t.Errorf("normaliseAlias = %q", got)
	}
}

func TestUIBatchPerPositionErrors(t *testing.T) {
	cases := map[string]string{
		"":             "Enter the batch number",
		"F-2610-WL01":  "first 2 characters",
		"PE-261-WL01":  "middle 4 characters must be digits",
		"PE-25A0-WL01": "middle 4 characters must be digits",
		"PE-2610-WL0":  "last 4 characters",
		"PE-2610-01WL": "last 4 characters",
		"PE-2610":      "2 characters, a hyphen, 4 digits",
		"PE2610WL01!":  "only use letters, digits, spaces and hyphens",
	}
	for in, want := range cases {
		got := canonicalBatchError(in)
		if got == "" || !contains(got, want) {
			t.Errorf("canonicalBatchError(%q) = %q, want substring %q", in, got, want)
		}
	}
	for _, good := range []string{"PE-2610-WL01", "pe 2610 wl01", "PE2610WL01"} {
		if got := canonicalBatchError(good); got != "" {
			t.Errorf("canonicalBatchError(%q) = %q, want empty", good, got)
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
