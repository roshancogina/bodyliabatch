import { z } from 'zod'
import { canonicalBatchError, normaliseAlias, normaliseBatch, stripSpaces } from './utils'

/**
 * UIBatch canonical standard: XX-NNNN-NNNN (spaces stripped/ignored).
 *   XX   — 2 uppercase letters, e.g. FR
 *   NNNN — 4 digits, e.g. 2509
 *   NNNN — 4 digits, e.g. 0312
 * Full example: FR-2509-0312.
 *
 * Manufacturer batch codes and label batch codes are stored as `aliases`
 * (see data/batches.ts) and resolved by the BFF — entering ANY mapped code
 * returns the same product details.
 */
export const BATCH_PATTERN = /^[A-Z]{2}-\d{4}-\d{4}$/

/** Alias kinds an admin can attach to a canonical UIBatch code. */
export const ALIAS_KINDS = ['manufacturer', 'label'] as const
export type AliasKind = (typeof ALIAS_KINDS)[number]

/** Strict canonical schema — REGISTERING (admin) / CSV import. */
export const batchNumberSchema = z
  .string({ required_error: 'Enter the batch number printed on your pack.' })
  .min(1, 'Enter the batch number printed on your pack.')
  .transform((v) => normaliseBatch(v))
  .superRefine((v, ctx) => {
    const err = canonicalBatchError(v)
    if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err })
  })

/**
 * Permissive lookup schema — PUBLIC search + report forms.
 * Accepts canonical UIBatch codes AND mapped manufacturer/label codes.
 * Spaces are stripped; resolution to canonical happens in lib/bff.ts
 * resolveBatch() (exact canonical → exact alias → compact match).
 */
export const batchLookupSchema = z
  .string({ required_error: 'Enter the batch number printed on your pack.' })
  .min(1, 'Enter the batch number printed on your pack.')
  .transform((v) => normaliseAlias(v))
  .refine((v) => v.length >= 3, 'Enter at least 3 characters from the printed code.')
  .refine((v) => v.length <= 40, 'That is longer than any printed batch code we support (40 characters).')
  .refine((v) => /[A-Z0-9]/.test(v), 'Batch codes contain letters or numbers — check what is printed on the pack.')

export const canonicalBatchInputSchema = z
  .string()
  .transform((v) => stripSpaces(v))
  .refine((v) => v.length === 10 || v.length === 12, 'Batch numbers are 10 characters plus hyphens, like FR-2509-0312 (spaces are ignored).')

/** Alias schema — for admin alias entry (per-alias, already split). */
export const batchAliasSchema = z
  .string()
  .transform((v) => normaliseAlias(v))
  .refine((v) => v.length >= 3, 'Each alias needs at least 3 characters.')
  .refine((v) => v.length <= 40, 'Each alias must be 40 characters or fewer.')
  .refine((v) => /[A-Z0-9]/.test(v), 'Each alias must contain a letter or number.')
  .refine((v) => !BATCH_PATTERN.test(v), 'That is already a canonical batch number — map it as a batch instead of an alias.')

export const batchSearchSchema = z.object({
  batch: batchLookupSchema,
})
export type BatchSearchInput = z.input<typeof batchSearchSchema>

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export const PURCHASE_CHANNELS = [
  'bodylia.in',
  'Amazon',
  'Flipkart',
  'Pharmacy or store',
  'Other',
] as const

export const reportSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full name.')
    .max(80, 'Name must be 80 characters or fewer.'),
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter an email like name@example.com.'),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^(\+91[ -]?)?[6-9]\d{9}$/.test(v.replace(/\s/g, '')), 'Enter a 10-digit Indian mobile number, e.g. 98765 43210.'),
  batch: batchLookupSchema,
  channel: z.enum(PURCHASE_CHANNELS, {
    errorMap: () => ({ message: 'Choose where you bought the pack.' }),
  }),
  photo: z
    .custom<FileList | undefined>()
    .optional()
    .refine((files) => !files || files.length === 0 || PHOTO_TYPES.includes(files[0].type), 'Photo must be a JPG, PNG or WebP image.')
    .refine((files) => !files || files.length === 0 || files[0].size <= MAX_PHOTO_BYTES, 'Photo must be 5 MB or smaller.'),
  message: z
    .string()
    .trim()
    .min(20, 'Tell us a little more — at least 20 characters.')
    .max(1000, 'Keep your message to 1000 characters or fewer.'),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Confirm we may contact you about this report.' }),
  }),
})
export type ReportInput = z.input<typeof reportSchema>
export type ReportOutput = z.output<typeof reportSchema>

/* ----------------------------- Public ----------------------------- */

export const trackSchema = z.object({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Enter the reference from your confirmation email.')
    .regex(/^SR-\d{4}-\d{5}$/, 'References look like SR-2026-04821.'),
  email: z.string().trim().min(1, 'Enter the email you used for the report.').email('Enter an email like name@example.com.'),
})
export type TrackInput = z.infer<typeof trackSchema>

export const feedbackSchema = z.object({
  comment: z.string().trim().max(500, 'Keep your comment to 500 characters or fewer.').optional(),
})
