import React, { useEffect, useRef, useState } from 'react'
import { Controller, useForm, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react'
import { PURCHASE_CHANNELS, reportSchema, type ReportInput, type ReportOutput } from '../lib/schemas'
import { CaptchaError, lookupBatch, submitReport, type LookupResult } from '../lib/bff'
import { describeCaptchaError } from '../lib/captcha'
import { Button } from './ui/button'
import { Input, NativeSelect, Textarea } from './ui/input'
import { FormField } from './ui/form-field'
import { Checkbox } from './ui/checkbox'
import { ErrorSummary } from './ErrorSummary'
import { CaptchaField } from './CaptchaField'
import { PhotoPicker } from './public/PhotoPicker'

const LABELS: Record<keyof ReportInput, string> = {
  fullName: 'Full name',
  email: 'Email',
  phone: 'Mobile number',
  batch: 'Batch number',
  channel: 'Where did you buy it?',
  orderNumber: 'Order or invoice number',
  purchaseDate: 'Date of purchase',
  photo: 'Photo of the pack or receipt',
  message: 'Details of the issue',
  consent: 'Consent',
}

export function ReportForm({
  defaultBatch,
  onCancel,
  onSubmitted,
}: {
  defaultBatch: string
  onCancel: () => void
  onSubmitted: (reference: string) => void
}) {
  const summaryRef = useRef<HTMLDivElement>(null)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaError, setCaptchaError] = useState<string | null>(null)
  const [batchStatus, setBatchStatus] = useState<LookupResult | null>(null)
  const [verifyingBatch, setVerifyingBatch] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ReportInput, unknown, ReportOutput>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      batch: defaultBatch,
      orderNumber: '',
      purchaseDate: '',
      message: '',
      consent: false as unknown as true,
    },
    shouldFocusError: false,
  })

  const batchValue = watch('batch')

  const verifyBatchCode = async (code: string) => {
    const trimmed = (code ?? '').trim()
    if (!trimmed || trimmed.length < 3) {
      setBatchStatus(null)
      return
    }
    setVerifyingBatch(true)
    try {
      const res = await lookupBatch(trimmed)
      setBatchStatus(res)
    } catch {
      setBatchStatus({ kind: 'error' })
    } finally {
      setVerifyingBatch(false)
    }
  }

  useEffect(() => {
    if (defaultBatch) {
      void verifyBatchCode(defaultBatch)
    }
  }, [defaultBatch])

  const onValid = async (data: ReportOutput) => {
    setCaptchaError(null)
    if (!captchaToken) {
      setCaptchaError(describeCaptchaError('missing'))
      return
    }
    try {
      const { reference } = await submitReport(data, captchaToken)
      onSubmitted(reference)
    } catch (e) {
      if (e instanceof CaptchaError) {
        setCaptchaError(describeCaptchaError(e.reason))
        return
      }
      throw e
    }
  }

  const onInvalid = (_e: FieldErrors<ReportInput>) => {
    setSubmitAttempted(true)
    requestAnimationFrame(() => summaryRef.current?.focus())
  }

  const errorList = (Object.keys(LABELS) as (keyof ReportInput)[])
    .filter((k) => errors[k]?.message)
    .map((k) => ({ id: k, label: LABELS[k], message: String(errors[k]?.message) }))

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-8 lg:pb-24">
      <Button variant="ghost" size="sm" onClick={onCancel} className="-ml-3">
        <ArrowLeft aria-hidden="true" />
        Back to batch check
      </Button>
      <h1 data-autofocus tabIndex={-1} className="mt-4 font-serif text-[2rem] font-semibold leading-tight text-burgundy sm:text-[2.75rem]">
        Report a batch issue
      </h1>
      <p className="mt-3 text-lg text-graphite">
        Our quality assurance team verifies every report within 2 working days. Please provide your purchase details and evidence below so we can investigate.
      </p>

      {submitAttempted && errorList.length > 0 && <ErrorSummary ref={summaryRef} errors={errorList} />}

      <form onSubmit={handleSubmit(onValid, onInvalid)} noValidate className="mt-8 flex flex-col gap-6">
        {/* Step 1: Purchase & Batch Verification */}
        <fieldset className="grid gap-6 sm:grid-cols-2">
          <legend className="mb-4 text-lg font-semibold text-graphite">1. Purchase & batch verification</legend>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <FormField id="batch" label={LABELS.batch} error={errors.batch?.message}>
                  {(a) => (
                    <Input
                      {...a}
                      {...register('batch')}
                      autoCapitalize="characters"
                      spellCheck={false}
                      className="tabular font-semibold tracking-wide"
                      onBlur={() => verifyBatchCode(batchValue)}
                    />
                  )}
                </FormField>
              </div>
              <Button
                type="button"
                variant="outline"
                size="default"
                className="mb-1"
                disabled={verifyingBatch || !batchValue || batchValue.trim().length < 3}
                onClick={() => verifyBatchCode(batchValue)}
              >
                {verifyingBatch && <Loader2 className="animate-spin size-4" aria-hidden="true" />}
                Verify batch
              </Button>
            </div>

            {batchStatus?.kind === 'genuine' && (
              <div role="status" className="flex items-start gap-2.5 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                <CheckCircle2 className="size-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Batch verified genuine: {batchStatus.record.batch}</p>
                  <p className="text-emerald-800">
                    Product: {batchStatus.record.product}
                    {batchStatus.record.manufactured && ` · Manufactured ${batchStatus.record.manufactured}`}
                    {batchStatus.record.expires && ` · Expires ${batchStatus.record.expires}`}
                  </p>
                </div>
              </div>
            )}

            {batchStatus?.kind === 'recalled' && (
              <div role="alert" className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="size-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Notice: Batch {batchStatus.record.batch} is recalled</p>
                  <p className="text-amber-800">{batchStatus.record.recallReason || 'This batch has an active recall notice.'}</p>
                </div>
              </div>
            )}

            {batchStatus && batchStatus.kind !== 'genuine' && batchStatus.kind !== 'recalled' && (
              <div role="status" className="flex items-start gap-2.5 rounded-md border border-mist bg-sand p-3 text-sm text-graphite">
                <Info className="size-5 text-burgundy shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Unregistered batch number</p>
                  <p className="text-muted">This code is not in our released production database. Please submit your photos and purchase details below so our quality team can investigate potential counterfeit or typo.</p>
                </div>
              </div>
            )}
          </div>

          <FormField id="channel" label={LABELS.channel} error={errors.channel?.message}>
            {(a) => (
              <NativeSelect {...a} {...register('channel')} defaultValue="">
                <option value="" disabled>
                  Choose where you purchased
                </option>
                {PURCHASE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>

          <FormField
            id="orderNumber"
            label={LABELS.orderNumber}
            optional
            description="e.g. Amazon Order ID, store receipt # or invoice #"
            error={errors.orderNumber?.message}
          >
            {(a) => <Input {...a} {...register('orderNumber')} placeholder="e.g. 402-1234567-8901234" />}
          </FormField>

          <FormField
            id="purchaseDate"
            label={LABELS.purchaseDate}
            optional
            error={errors.purchaseDate?.message}
            className="sm:col-span-2 sm:max-w-xs"
          >
            {(a) => <Input {...a} {...register('purchaseDate')} type="date" />}
          </FormField>
        </fieldset>

        {/* Step 2: Evidence & Details */}
        <fieldset className="grid gap-6 border-t border-mist pt-6 sm:grid-cols-2">
          <legend className="mb-4 pt-6 text-lg font-semibold text-graphite">2. Evidence & issue details</legend>

          <FormField
            id="photo"
            label={LABELS.photo}
            optional
            description="JPG, PNG or WebP, up to 5 MB. A clear shot of the batch code, seal, receipt or defect helps our team investigate."
            error={errors.photo?.message as string | undefined}
            className="sm:col-span-2"
          >
            {(a) => (
              <PhotoPicker
                a11y={a}
                files={watch('photo') as FileList | undefined}
                register={register('photo')}
                onClear={() => setValue('photo', undefined, { shouldValidate: true })}
              />
            )}
          </FormField>

          <FormField
            id="message"
            label={LABELS.message}
            description={`Describe what you noticed (e.g. broken seal, discolored capsules, packaging discrepancy). ${(watch('message') ?? '').length}/1000 characters.`}
            error={errors.message?.message}
            className="sm:col-span-2"
          >
            {(a) => <Textarea {...a} {...register('message')} maxLength={1000} />}
          </FormField>
        </fieldset>

        {/* Step 3: Customer Contact Details */}
        <fieldset className="grid gap-6 border-t border-mist pt-6 sm:grid-cols-2">
          <legend className="mb-4 pt-6 text-lg font-semibold text-graphite">3. Your contact details</legend>

          <FormField id="fullName" label={LABELS.fullName} error={errors.fullName?.message}>
            {(a) => <Input {...a} {...register('fullName')} autoComplete="name" />}
          </FormField>

          <FormField
            id="email"
            label={LABELS.email}
            description="We’ll send your tracking reference and investigation outcome here."
            error={errors.email?.message}
          >
            {(a) => <Input {...a} {...register('email')} type="email" autoComplete="email" />}
          </FormField>

          <FormField
            id="phone"
            label={LABELS.phone}
            optional
            description="Only if you’d prefer a call from our quality team."
            error={errors.phone?.message}
            className="sm:col-span-2 sm:max-w-sm"
          >
            {(a) => <Input {...a} {...register('phone')} type="tel" autoComplete="tel-national" inputMode="tel" />}
          </FormField>
        </fieldset>

        <Controller
          control={control}
          name="consent"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5 border-t border-mist pt-6">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent"
                  checked={field.value === true}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  aria-invalid={!!errors.consent}
                  aria-describedby={errors.consent ? 'consent-err' : undefined}
                  className="mt-0.5"
                />
                <label htmlFor="consent" className="text-graphite">
                  Bodylia may contact me regarding this report and store these details for quality and compliance records.
                </label>
              </div>
              {errors.consent && (
                <p id="consent-err" className="pl-9 text-sm font-medium text-error">
                  {errors.consent.message}
                </p>
              )}
            </div>
          )}
        />

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

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={isSubmitting} className="sm:min-w-44">
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? 'Sending…' : 'Send report'}
          </Button>
        </div>
      </form>
    </div>
  )
}
