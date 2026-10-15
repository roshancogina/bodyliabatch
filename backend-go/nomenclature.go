package main

import (
	"regexp"
	"strings"
)

// Canonical nomenclature: BDL-<PRODUCT>-<YYMM>-<NNNN>, e.g. BDL-FR-2509-0312.
// Ports src/lib/utils.ts + src/lib/schemas.ts so server and client
// enforce/normalise identically.

var canonicalPattern = regexp.MustCompile(`^BDL-[A-Z]{2}-[0-9]{2}(0[1-9]|1[0-2])-[0-9]{4}$`)
var aliasChars = regexp.MustCompile(`^[A-Z0-9][A-Z0-9\-#]*[A-Z0-9]$`)

// normaliseBatch: trim, uppercase, collapse spaces to hyphens (canonical input).
func normaliseBatch(raw string) string {
	s := strings.TrimSpace(strings.ToUpper(raw))
	s = regexp.MustCompile(`\s+`).ReplaceAllString(s, "-")
	s = regexp.MustCompile(`-+`).ReplaceAllString(s, "-")
	return s
}

// normaliseAlias: trim, uppercase, spaces/underscores/slashes/dots -> hyphen, collapse.
func normaliseAlias(raw string) string {
	s := strings.TrimSpace(strings.ToUpper(raw))
	s = regexp.MustCompile(`[\s_/\.]+`).ReplaceAllString(s, "-")
	s = regexp.MustCompile(`-+`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return s
}

// compactKey: strip every non-alphanumeric (punctuation-blind matching).
func compactKey(v string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(v) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func isCanonicalBatch(v string) bool { return canonicalPattern.MatchString(v) }

func isValidAlias(v string) bool {
	return len(v) >= 3 && len(v) <= 40 && aliasChars.MatchString(v) && !canonicalPattern.MatchString(v)
}
