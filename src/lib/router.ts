/**
 * Hash routing. Every in-app link is a fragment (#/track, #/?b=BDL-…), so a click,
 * middle-click, refresh or open-in-new-tab never asks the server for a path it doesn't
 * serve — no "Cannot GET /" in the preview or behind a static host.
 *
 * Production deep links from pack QR codes keep the query form
 * (batch.bodylia.in/?b=BDL-…) and are read here too.
 */
export interface Route {
  p: string | null
  b: string | null
}

export function readRoute(): Route {
  // Only "#/…" fragments are routes; "#main" etc. are in-page anchors (skip links).
  const raw = window.location.hash
  const hash = raw.startsWith('#/') ? raw.slice(2) : ''
  if (raw.startsWith('#/')) {
    const [path, query = ''] = hash.split('?')
    const q = new URLSearchParams(query)
    return { p: path || null, b: q.get('b') }
  }
  const q = new URLSearchParams(window.location.search)
  return { p: q.get('p'), b: q.get('b') }
}

export function hrefFor(page: string) {
  return page === 'home' ? '#/' : `#/${page}`
}

export function hrefForBatch(batch: string) {
  return `#/?b=${encodeURIComponent(batch)}`
}

let suppressNext = false

/** True when the hashchange was caused by writeRoute itself (ignore it). */
export function consumeSuppressed() {
  const s = suppressNext
  suppressNext = false
  return s
}

export function writeRoute(route: { p?: string; b?: string }) {
  const h = route.b ? hrefForBatch(route.b) : hrefFor(route.p ?? 'home')
  if (window.location.hash === h || (h === '#/' && !window.location.hash)) return
  try {
    window.history.pushState(null, '', h)
  } catch {
    try {
      suppressNext = true
      window.location.hash = h
    } catch {
      suppressNext = false
      /* fully sandboxed frame: in-memory view state still works */
    }
  }
}
