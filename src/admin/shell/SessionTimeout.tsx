import React, { useEffect, useRef, useState } from 'react'
import * as AlertDialog from '@radix-ui/react-dialog'
import { Clock } from 'lucide-react'
import { useStore } from '../../lib/store'
import { Button } from '../../components/ui/button'

const WARN_SECONDS = 120

/**
 * WCAG 2.2.1 Timing Adjustable: warn 2 minutes before an idle session ends and let
 * the user extend it with a single action.
 */
export function SessionTimeout({ previewTrigger, onTimeout }: { previewTrigger: number; onTimeout: () => void }) {
  const minutes = useStore((s) => s.settings.sessionMinutes)
  const [left, setLeft] = useState<number | null>(null)
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    const bump = () => {
      if (left === null) lastActivity.current = Date.now()
    }
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const id = setInterval(() => {
      const idle = (Date.now() - lastActivity.current) / 1000
      const remaining = Math.round(minutes * 60 - idle)
      if (remaining <= 0) onTimeout()
      else if (remaining <= WARN_SECONDS) setLeft(remaining)
    }, 1000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump))
      clearInterval(id)
    }
  }, [minutes, left, onTimeout])

  // "Preview the timeout warning" from My account.
  useEffect(() => {
    if (previewTrigger > 0) lastActivity.current = Date.now() - (minutes * 60 - WARN_SECONDS) * 1000
  }, [previewTrigger, minutes])

  const stay = () => {
    lastActivity.current = Date.now()
    setLeft(null)
  }

  const mm = left !== null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : ''

  return (
    <AlertDialog.Root open={left !== null} onOpenChange={(o) => !o && stay()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dlg-overlay fixed inset-0 z-[70] bg-plum/60" />
        <AlertDialog.Content role="alertdialog" className="dlg-content fixed left-1/2 top-1/2 z-[71] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">
          <Clock className="size-8 text-warning-ink" aria-hidden="true" />
          <AlertDialog.Title className="mt-3 font-serif text-2xl font-semibold text-burgundy">Still there?</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-graphite">
            For security, you’ll be signed out in <strong className="tabular">{mm}</strong> because you’ve been inactive. Unsaved changes will be lost.
          </AlertDialog.Description>
          {/* Announce only at the start and at 30s, not every second. */}
          <p className="sr-only" aria-live="assertive">{left === WARN_SECONDS || left === 30 ? `You will be signed out in ${mm}` : ''}</p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onTimeout}>Sign out now</Button>
            <Button onClick={stay} autoFocus>Stay signed in</Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
