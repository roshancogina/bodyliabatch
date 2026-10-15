import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { dismissToast, useToasts, type Toast } from '../../lib/toast'
import { cn } from '../../lib/utils'

/** Polite live region. 6 s lifetime, paused while hovered or focused (WCAG 2.2.1). */
export function Toaster() {
  const toasts = useToasts()
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ t }: { t: Toast }) {
  const reduce = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const remaining = useRef(6000)
  const started = useRef(Date.now())

  useEffect(() => {
    if (paused) return
    started.current = Date.now()
    const id = setTimeout(() => dismissToast(t.id), remaining.current)
    return () => {
      clearTimeout(id)
      remaining.current -= Date.now() - started.current
    }
  }, [paused, t.id])

  const Icon = t.tone === 'error' ? AlertCircle : t.tone === 'info' ? Info : CheckCircle2
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-start gap-3 rounded-lg bg-plum p-4 text-ivory shadow-lg"
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', t.tone === 'error' ? 'text-[#ffb4b4]' : t.tone === 'info' ? 'text-[#b9d4ff]' : 'text-[#a8dcaa]')} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t.title}</p>
        {t.description && <p className="mt-0.5 text-sm text-ivory/90">{t.description}</p>}
      </div>
      <button onClick={() => dismissToast(t.id)} aria-label="Dismiss notification" className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10">
        <X className="size-4" aria-hidden="true" />
      </button>
    </motion.div>
  )
}
