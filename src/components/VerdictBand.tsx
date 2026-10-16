import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { format } from 'date-fns'
import { AlertOctagon, AlertTriangle, Clock, SearchX, ShieldCheck, WifiOff } from 'lucide-react'
import type { LookupResult } from '../lib/bff'
import { getProduct, listProducts } from '../lib/products'
import { cn } from '../lib/utils'

export function VerdictBand({ batch, result }: { batch: string; result: LookupResult }) {
  const reduce = useReducedMotion()
  const v = verdictFor(result)
  const Icon = v.icon

  return (
    <motion.section
      aria-labelledby="verdict-title"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className={cn('mt-4 rounded-lg px-5 py-6 sm:px-8 sm:py-8', v.bg)}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <Icon className={cn('size-10 shrink-0 sm:size-12', v.ink)} strokeWidth={1.75} aria-hidden="true" />
        <div className="min-w-0">
          <h1
            id="verdict-title"
            data-autofocus
            tabIndex={-1}
            className={cn('font-serif text-[1.75rem] font-semibold leading-tight sm:text-4xl', v.ink)}
          >
            {v.title}
          </h1>
          <p className="mt-2 text-base text-graphite sm:text-lg">{v.body}</p>
          {'matchedAlias' in result && result.matchedAlias && 'record' in result && (
            <p className="mt-3 inline-flex flex-wrap items-center gap-1.5 rounded-full border border-current/20 bg-white/60 px-3 py-1 text-sm">
              <span className="font-semibold">
                {'matchedKind' in result && result.matchedKind === 'label' ? 'Label code' : 'Manufacturer code'} {batch}
              </span>
              <span aria-hidden="true">→</span>
              <span>
                mapped to <span className="tabular font-semibold">{result.record.batch}</span>
              </span>
            </p>
          )}
          <p className="mt-3 text-sm text-muted">
            Batch{' '}
            <span className="tabular font-semibold text-graphite">
              {'record' in result ? result.record.batch : batch}
            </span>
            {'record' in result && result.record.batch !== batch && (
              <span>
                {' '}(you entered <span className="tabular">{batch}</span>)
              </span>
            )}
          </p>
        </div>
      </div>
    </motion.section>
  )
}

function verdictFor(result: LookupResult) {
  switch (result.kind) {
    case 'genuine':
      return {
        icon: ShieldCheck,
        bg: 'bg-success-bg',
        ink: 'text-success',
        title: 'Genuine Bodylia batch',
        body: `This ${getProduct(result.record.product).name} batch was made and released by Bodylia, and it is within its shelf life.`,
      }
    case 'expired':
      return {
        icon: Clock,
        bg: 'bg-warning-bg',
        ink: 'text-warning-ink',
        title: 'Genuine, but expired',
        body: `This batch expired on ${format(new Date(result.record.expires), 'd MMM yyyy')}. Please don’t consume it.`,
      }
    case 'recalled':
      return {
        icon: AlertOctagon,
        bg: 'bg-error-bg',
        ink: 'text-error',
        title: 'This batch has been recalled',
        body: 'Stop using this pack. We’ll replace it or refund you — see the details below.',
      }
    case 'not_found':
      return {
        icon: SearchX,
        bg: 'bg-sand',
        ink: 'text-burgundy',
        title: 'We couldn’t find this batch',
        body: 'That doesn’t always mean the pack is fake — a single mistyped character is the most common cause.',
      }
    case 'rate_limited':
      return {
        icon: AlertTriangle,
        bg: 'bg-warning-bg',
        ink: 'text-warning-ink',
        title: 'Too many checks in a row',
        body: `To protect the service, please wait ${result.retryAfterSeconds} seconds before trying again.`,
      }
    case 'error':
      return {
        icon: WifiOff,
        bg: 'bg-info-bg',
        ink: 'text-info',
        title: 'We couldn’t complete the check',
        body: 'Something went wrong on our side or with your connection. Your pack hasn’t been judged either way.',
      }
  }
}
