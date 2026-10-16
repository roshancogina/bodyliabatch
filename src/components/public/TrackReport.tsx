import { hrefFor } from '../../lib/router'
import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { Check, Loader2, SearchX } from 'lucide-react'
import type { PublicPage } from '../../App'
import { trackSchema, type TrackInput } from '../../lib/schemas'
import { CaptchaError, trackReport, type TrackResult } from '../../lib/bff'
import { describeCaptchaError } from '../../lib/captcha'
import { SUPPORT_EMAIL } from '../../data/catalog-static'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { FormField } from '../ui/form-field'
import { CaptchaField } from '../CaptchaField'

const STEPS = ['Received', 'Investigating', 'Resolved'] as const

export function TrackReport({ prefill, navigate }: { prefill?: string; navigate: (p: PublicPage) => void }) {
  const [result, setResult] = useState<TrackResult | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaError, setCaptchaError] = useState<string | null>(null)
  const email = SUPPORT_EMAIL
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TrackInput>({ resolver: zodResolver(trackSchema), defaultValues: { reference: prefill ?? '', email: '' } })

  const submit = handleSubmit(async (v) => {
    setCaptchaError(null)
    setResult(null)
    if (!captchaToken) {
      setCaptchaError(describeCaptchaError('missing'))
      return
    }
    try {
      setResult(await trackReport(v.reference, v.email, captchaToken))
    } catch (e) {
      if (e instanceof CaptchaError) {
        setCaptchaError(describeCaptchaError(e.reason))
        return
      }
      throw e
    }
  })

  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pt-16">
      <div>
        <h1 data-autofocus tabIndex={-1} className="font-serif text-[2.25rem] font-semibold leading-tight text-burgundy focus:outline-none sm:text-5xl">
          Track a report
        </h1>
        <p className="mt-4 text-lg text-graphite">
          Use the reference from your confirmation email and the email address you reported with. No account needed.
        </p>
        <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
          <FormField id="tr-ref" label="Report reference" description="e.g. SR-2026-04821" error={errors.reference?.message}>
            {(a) => <Input {...a} {...register('reference')} autoCapitalize="characters" spellCheck={false} className="tabular font-semibold tracking-wide" />}
          </FormField>
          <FormField id="tr-email" label="Email address" error={errors.email?.message}>
            {(a) => <Input {...a} {...register('email')} type="email" autoComplete="email" />}
          </FormField>
          <CaptchaField
            onChange={(token) => {
              setCaptchaToken(token)
              if (token) setCaptchaError(null)
            }}
          />
          {captchaError && (
            <p role="alert" className="text-sm font-medium text-error">
              {captchaError}
            </p>
          )}
          <Button type="submit" size="lg" disabled={isSubmitting} className="self-start">
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? 'Finding your report…' : 'Show status'}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted">Preview: try SR-2026-04712 with divya.m@example.com</p>
      </div>

      <div aria-live="polite">
        {result === null && (
          <div className="rounded-lg bg-sand p-8 text-graphite">
            <h2 className="font-serif text-2xl font-semibold text-burgundy">What you’ll see</h2>
            <p className="mt-2">Where your report is in our process, the latest update from our team, and the outcome once it’s resolved.</p>
          </div>
        )}
        {result && !result.found && (
          <div className="rounded-lg bg-sand p-8">
            <SearchX className="size-10 text-burgundy" strokeWidth={1.75} aria-hidden="true" />
            <h2 className="mt-3 font-serif text-2xl font-semibold text-burgundy">We couldn’t match those details</h2>
            <p className="mt-2 text-graphite">
              Check the reference and use the same email you reported with. For your privacy we can’t say which of the two didn’t match.
            </p>
            <p className="mt-4 text-graphite">
              Still stuck? Email <a href={`mailto:${email}`} className="font-semibold text-burgundy underline underline-offset-4">{email}</a> or{' '}
              <a href={hrefFor('home')} onClick={(e) => { e.preventDefault(); navigate('home') }} className="font-semibold text-burgundy underline underline-offset-4">check your batch again</a>.
            </p>
          </div>
        )}
        {result && result.found && <Status report={result.report} />}
      </div>
    </div>
  )
}

function Status({ report }: { report: Extract<TrackResult, { found: true }>['report'] }) {
  const stepIndex = report.status === 'new' ? 0 : report.status === 'investigating' ? 1 : 2
  const outcome =
    report.status === 'resolved_genuine'
      ? { tone: 'text-success', text: 'Your pack is genuine. We’ve emailed you the details of our review.' }
      : report.status === 'resolved_counterfeit'
        ? { tone: 'text-error', text: 'Your pack is not a genuine Bodylia product. Please don’t consume it. We’ve emailed you about a replacement and how we’re acting against the seller.' }
        : null
  // Customers see replies and status changes — never internal notes or escalations.
  const publicEvents = report.timeline.filter((e) => e.kind === 'received' || e.kind === 'status' || e.kind === 'reply')

  return (
    <section aria-labelledby="st-title" className="rounded-lg bg-white p-6 ring-1 ring-mist sm:p-8">
      <p className="tabular text-sm text-muted">{report.reference} · batch {report.batch}</p>
      <h2 id="st-title" className="mt-1 font-serif text-3xl font-semibold text-burgundy">
        {stepIndex === 2 ? 'Resolved' : stepIndex === 1 ? 'We’re investigating' : 'Received — in the queue'}
      </h2>

      <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-col gap-2">
            <span className={cn('h-1.5 rounded-full', i <= stepIndex ? 'bg-burgundy' : 'bg-mist')} aria-hidden="true" />
            <span className={cn('flex items-center gap-1.5 text-sm', i <= stepIndex ? 'font-semibold text-graphite' : 'text-muted')}>
              {i < stepIndex && <Check className="size-4 text-success" aria-hidden="true" />}
              {s}
              <span className="sr-only">{i < stepIndex ? ' (done)' : i === stepIndex ? ' (current)' : ' (not started)'}</span>
            </span>
          </li>
        ))}
      </ol>

      {outcome && <p className={cn('mt-6 text-lg font-medium', outcome.tone)}>{outcome.text}</p>}

      <h3 className="mt-8 font-semibold text-graphite">Updates</h3>
      <ol className="mt-2 border-l-2 border-gold pl-5">
        {[...publicEvents].reverse().map((e, i) => (
          <li key={i} className="pb-4">
            <p className="text-sm text-muted">{format(new Date(e.at), 'd MMM yyyy, HH:mm')}</p>
            <p className="text-graphite">{e.kind === 'reply' ? 'We emailed you a reply.' : e.text.replace('Status → ', 'Status changed to ')}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
