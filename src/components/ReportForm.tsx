import React, { useRef, useState } from 'react'
import { Controller, useForm, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { PURCHASE_CHANNELS, reportSchema, type ReportInput, type ReportOutput } from '../lib/schemas'
import { submitReport } from '../lib/bff'
import { Button } from './ui/button'
import { Input, NativeSelect, Textarea } from './ui/input'
import { FormField } from './ui/form-field'
import { Checkbox } from './ui/checkbox'
import { ErrorSummary } from './ErrorSummary'
import { PhotoPicker } from './public/PhotoPicker'

const LABELS: Record<keyof ReportInput, string> = {
  fullName: 'Full name',
  email: 'Email',
  phone: 'Mobile number',
  batch: 'Batch number',
  channel: 'Where did you buy it?',
  photo: 'Photo of the pack',
  message: 'What made you suspicious?',
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
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ReportInput, unknown, ReportOutput>({
    resolver: zodResolver(reportSchema),
    // Redundant Entry (WCAG 3.3.7): carry the batch number the user already typed.
    defaultValues: { fullName: '', email: '', phone: '', batch: defaultBatch, message: '', consent: false as unknown as true },
    shouldFocusError: false,
  })

  const onValid = async (data: ReportOutput) => {
    const { reference } = await submitReport(data)
    onSubmitted(reference)
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
        Report a suspicious pack
      </h1>
      <p className="mt-3 text-lg text-graphite">
        Our quality team reads every report within 2 working days. All fields are required unless marked optional.
      </p>

      {submitAttempted && errorList.length > 0 && <ErrorSummary ref={summaryRef} errors={errorList} />}

      <form onSubmit={handleSubmit(onValid, onInvalid)} noValidate className="mt-8 flex flex-col gap-6">
        <fieldset className="grid gap-6 sm:grid-cols-2">
          <legend className="mb-4 text-lg font-semibold text-graphite">Your details</legend>
          <FormField id="fullName" label={LABELS.fullName} error={errors.fullName?.message}>
            {(a) => <Input {...a} {...register('fullName')} autoComplete="name" />}
          </FormField>
          <FormField id="email" label={LABELS.email} error={errors.email?.message}>
            {(a) => <Input {...a} {...register('email')} type="email" autoComplete="email" />}
          </FormField>
          <FormField
            id="phone"
            label={LABELS.phone}
            optional
            description="Only if you’d prefer a call."
            error={errors.phone?.message}
            className="sm:col-span-2 sm:max-w-sm"
          >
            {(a) => <Input {...a} {...register('phone')} type="tel" autoComplete="tel-national" inputMode="tel" />}
          </FormField>
        </fieldset>

        <fieldset className="grid gap-6 border-t border-mist pt-6 sm:grid-cols-2">
          <legend className="mb-4 pt-6 text-lg font-semibold text-graphite">About the pack</legend>
          <FormField id="batch" label={LABELS.batch} error={errors.batch?.message}>
            {(a) => <Input {...a} {...register('batch')} autoCapitalize="characters" spellCheck={false} className="tabular font-semibold tracking-wide" />}
          </FormField>
          <FormField id="channel" label={LABELS.channel} error={errors.channel?.message}>
            {(a) => (
              <NativeSelect {...a} {...register('channel')} defaultValue="">
                <option value="" disabled>
                  Choose one
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
            id="photo"
            label={LABELS.photo}
            optional
            description="JPG, PNG or WebP, up to 5 MB. A clear shot of the label helps most."
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
            description={`E.g. packaging looks different, seal was broken, price seemed too low. ${(watch('message') ?? '').length}/1000 characters.`}
            error={errors.message?.message}
            className="sm:col-span-2"
          >
            {(a) => <Textarea {...a} {...register('message')} maxLength={1000} />}
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
                  Bodylia may contact me about this report and store the details for up to 12 months.
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
