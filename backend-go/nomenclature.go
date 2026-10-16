package main

import (
"fmt"
"regexp"
"strings"
)

// UIBatch canonical standard: XX-NNNN-XXNN (spaces stripped/ignored).
//   XX   — exactly 2 alphanumeric chars (A–Z, 0–9), e.g. PE
//   NNNN — exactly 4 digits, e.g. 2610
//   XXNN — exactly 2 alphanumerics + 2 digits, e.g. WL01
// e.g. PE-2610-WL01. Ports src/lib/utils.ts + src/lib/schemas.ts so server
// and client enforce/normalise identically.

var canonicalPattern = regexp.MustCompile(`^[A-Z0-9]{2}-[0-9]{4}-[A-Z0-9]{2}[0-9]{2}$`)
var aliasChars = regexp.MustCompile(`^[A-Z0-9][A-Z0-9\-#]*[A-Z0-9]$`)
var spaceRe = regexp.MustCompile(`\s+`)
var sepRe = regexp.MustCompile(`[-_/.]+`)
var multiHyphenRe = regexp.MustCompile(`-+`)
var compactUIBatchRe = regexp.MustCompile(`^[A-Z0-9]{2}[0-9]{4}[A-Z0-9]{2}[0-9]{2}$`)
var nonAlnumRe = regexp.MustCompile(`[^A-Z0-9]`)
var badCharRe = regexp.MustCompile(`[^A-Za-z0-9\s\-_/.]`)
var twoAlnumRe = regexp.MustCompile(`^[A-Z0-9]{2}$`)
var fourDigitsRe = regexp.MustCompile(`^[0-9]{4}$`)
var serialRe = regexp.MustCompile(`^[A-Z0-9]{2}[0-9]{2}$`)

// stripSpaces removes ALL whitespace, then uppercases. Spaces are ignored.
func stripSpaces(raw string) string {
	return strings.ToUpper(spaceRe.ReplaceAllString(raw, ""))
}

// normaliseBatch strips spaces, uppercases, ensures the two hyphens are
// present (auto-insert for 10-char compact input). No validation here.
func normaliseBatch(raw string) string {
	s := stripSpaces(raw)
	s = sepRe.ReplaceAllString(s, "-")
	s = multiHyphenRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	compact := nonAlnumRe.ReplaceAllString(s, "")
	if compactUIBatchRe.MatchString(compact) {
		return compact[0:2] + "-" + compact[2:6] + "-" + compact[6:10]
	}
	return strings.ToUpper(s)
}

// normaliseAlias strips spaces, uppercases, separators to hyphens.
func normaliseAlias(raw string) string {
	s := stripSpaces(raw)
	s = regexp.MustCompile(`[_/.]+`).ReplaceAllString(s, "-")
	s = multiHyphenRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return s
}

// compactKey strips every non-alphanumeric (punctuation-blind matching).
func compactKey(v string) string {
	var b strings.Builder
	for _, r := range stripSpaces(v) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func isCanonicalBatch(v string) bool { return canonicalPattern.MatchString(stripSpaces(v)) }

// canonicalBatchError returns a sensible per-position message, or "" when valid.
func canonicalBatchError(raw string) string {
	if stripSpaces(raw) == "" {
		return "Enter the batch number printed on your pack."
	}
	s := stripSpaces(raw)
	if badCharRe.MatchString(raw) {
		return "Batch numbers only use letters, digits, spaces and hyphens \u2014 check what is printed on the pack."
	}
	n := normaliseBatch(raw)
	parts := strings.Split(n, "-")
	if len(parts) != 3 {
		return fmt.Sprintf("Batch numbers look like PE-2610-WL01: 2 characters, a hyphen, 4 digits, a hyphen, then 2 characters and 2 digits. You entered %q.", s)
	}
	xx, mid, serial := parts[0], parts[1], parts[2]
	// parts always has 3 non-empty strings here (normaliseBatch strips
	// leading/trailing hyphens and collapses repeats), so no empty fallbacks.
	if !twoAlnumRe.MatchString(xx) {
		return fmt.Sprintf("The first 2 characters can be letters or digits (A\u2013Z, 0\u20139), e.g. %q in PE-2610-WL01. You entered %q.", "PE", xx)
	}
	if !fourDigitsRe.MatchString(mid) {
		return fmt.Sprintf("The middle 4 characters must be digits, e.g. %q in PE-2610-WL01. You entered %q.", "2610", mid)
	}
	if !serialRe.MatchString(serial) {
		return fmt.Sprintf("The last 4 characters must be 2 letters or digits followed by 2 digits, e.g. %q in PE-2610-WL01. You entered %q.", "WL01", serial)
	}
	if len(n) != 12 {
		return fmt.Sprintf("Batch numbers are 12 characters like PE-2610-WL01 (spaces are ignored). You entered %q.", s)
	}
	return ""
}

func isValidAlias(v string) bool {
	return len(v) >= 3 && len(v) <= 40 && aliasChars.MatchString(v) && !canonicalPattern.MatchString(v)
}
