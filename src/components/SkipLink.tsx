import React from 'react'

export function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(e) => {
        e.preventDefault()
        document.getElementById('main')?.focus()
      }}
      className="sr-only z-50 rounded-md bg-burgundy px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      Skip to main content
    </a>
  )
}
