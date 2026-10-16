import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { feedbackSchema } from '../../lib/schemas'
import { describeCaptchaError } from '../../lib/captcha'

import { toast } from '../../lib/toast'
import { Button } from '../ui/button'
import { Textarea } from '../ui/input'
import { FormField } from '../ui/form-field'
import { CaptchaField } from '../CaptchaField'

/** Share link + "Was this helpful?" — shown under every verdict. */
export function ShareFeedback({ batch }: { batch: string }) {
  const [answer, setAnswer] = useState<null | boolean>(null)
  const [sent, setSent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaError, setCaptchaError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<{ comment?: string }>({ resolver: zodResolver(feedbackSchema), defaultValues: { comment: '' } })
  const len = (watch('comment') ?? '').length

  const share = async () => {
    const url = `https://batch.bodylia.in/?b=${encodeURIComponent(batch)}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied', { description: url, tone: 'info' })
    } catch {
      toast('Couldn’t copy automatically', { description: url, tone: 'error' })
    }
  }

  const record = (helpful: boolean, comment?: string) => {
    try {
      const key = 'bodylia-feedback'
      const prev = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[]
      prev.push({ at: new Date().toISOString(), batch, helpful, comment })
      localStorage.setItem(key, JSON.stringify(prev))
    } catch { /* private mode: feedback stays in memory only */ }
  }

  return (
    <section aria-labelledby="fb-title" className="mt-14 grid gap-8 border-t border-mist pt-8 md:grid-cols-[auto_1fr] md:gap-16">
      <div>
        <h2 className="text-lg font-semibold text-graphite">Share this result</h2>
        <p className="mt-1 text-sm text-muted">Send the link to family or your pharmacist.</p>
        <Button variant="outline" className="mt-3" onClick={share}>
          <Link2 aria-hidden="true" />
          Copy link
        </Button>
      </div>
      <div>
        <h2 id="fb-title" className="text-lg font-semibold text-graphite">
          Was this check helpful?
        </h2>
        {sent ? (
          <p role="status" className="mt-2 text-graphite">Thank you — your feedback helps us improve the check.</p>
        ) : answer === null ? (
          <div className="mt-3 flex gap-3">
            <Button variant="outline" onClick={() => { setAnswer(true); record(true) }}>
              <ThumbsUp aria-hidden="true" /> Yes
            </Button>
            <Button variant="outline" onClick={() => setAnswer(false)}>
              <ThumbsDown aria-hidden="true" /> No
            </Button>
          </div>
        ) : answer ? (
          <p role="status" className="mt-2 text-graphite">Glad it helped. Thank you.</p>
        ) : (
          <form
            noValidate
            onSubmit={handleSubmit(({ comment }) => {
              if (!captchaToken) {
                setCaptchaError(describeCaptchaError('missing'))
                return
              }
              setCaptchaError(null)
              record(false, comment)
              setSent(true)
            })}
            className="mt-3 flex max-w-xl flex-col gap-3"
          >
            <FormField id="fb-comment" label="What could be better?" optional description={`${len}/500 characters. Please don’t include personal details.`} error={errors.comment?.message}>
              {(a) => <Textarea {...a} {...register('comment')} className="min-h-24" />}
            </FormField>
            <CaptchaField
              compact
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
            <Button type="submit" className="self-start">Send feedback</Button>
          </form>
        )}
      </div>
    </section>
  )
}
