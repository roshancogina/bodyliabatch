import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  title: string
  description?: string
  tone: 'success' | 'info' | 'error'
}

let toasts: Toast[] = []
const subs = new Set<() => void>()
const emit = () => subs.forEach((s) => s())

export function toast(title: string, opts: { description?: string; tone?: Toast['tone'] } = {}) {
  toasts = [...toasts, { id: Date.now() + Math.random(), title, description: opts.description, tone: opts.tone ?? 'success' }].slice(-3)
  emit()
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      subs.add(l)
      return () => {
        subs.delete(l)
      }
    },
    () => toasts,
  )
}
