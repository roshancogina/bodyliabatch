import { z } from 'zod'
import { batchNumberSchema } from '../lib/schemas'
import { BATCH_PATTERN } from '../lib/schemas'
import { normaliseAlias } from '../lib/utils'

export const signInSchema = z.object({
  email: z.string().trim().min(1, 'Enter your work email.').email('Enter an email like name@bodylia.in.'),
  password: z.string().min(1, 'Enter your password.'),
})
export type SignInInput = z.infer<typeof signInSchema>

const isoDate = (label: string) =>
  z
    .string()
    .min(1, `Enter the ${label}.`)
    .refine((v) => !Number.isNaN(Date.parse(v)), `Enter a valid ${label}.`)

export const coaRowSchema = z.object({
  test: z.string().trim().min(2, 'Name the test.'),
  specification: z.string().trim().min(1, 'Enter the specification.'),
  result: z.string().trim().min(1, 'Enter the result.'),
  pass: z.boolean(),
})

export const registerBatchSchema = z
  .object({
    batch: batchNumberSchema,
    product: z.string().min(1, 'Choose the product.'),
    manufactured: isoDate('manufacture date'),
    expires: isoDate('expiry date'),
    facility: z.string().min(1, 'Choose the facility.'),
    lab: z.string().min(1, 'Choose the testing lab.'),
    coa: z.array(coaRowSchema).min(1, 'Add at least one lab test result.'),
    /** Vendor-printed aliases, one per line or comma-separated. Optional. */
    aliases: z
      .string()
      .optional()
      .transform((v) => parseAliases(v))
      .refine((list) => list.length <= 20, 'At most 20 aliases per batch.'),
  })
  .refine((v) => v.batch.slice(4, 6) === v.product, {
    path: ['product'],
    message: 'Product must match the two-letter code in the batch number.',
  })
  .refine((v) => Date.parse(v.expires) > Date.parse(v.manufactured), {
    path: ['expires'],
    message: 'Expiry date must be after the manufacture date.',
  })
  .refine((v) => Date.parse(v.manufactured) <= Date.now(), {
    path: ['manufactured'],
    message: 'Manufacture date can’t be in the future.',
  })
  .refine((v) => v.coa.every((r) => r.pass), {
    path: ['coa'],
    message: 'A batch with a failed test can’t be released. Fix the result or quarantine the batch.',
  })
  .refine((v) => !v.aliases.some((a) => a === v.batch), {
    path: ['aliases'],
    message: 'An alias can’t repeat the canonical batch number.',
  })
  .refine((v) => !v.aliases.some((a) => BATCH_PATTERN.test(a)), {
    path: ['aliases'],
    message: 'Aliases must be vendor codes — a value already looks like a canonical BDL- number.',
  })
  .refine((v) => new Set(v.aliases).size === v.aliases.length, {
    path: ['aliases'],
    message: 'Remove duplicate aliases.',
  })
  .refine((v) => v.aliases.every((a) => a.length >= 3 && a.length <= 40 && /[A-Z0-9]/.test(a)), {
    path: ['aliases'],
    message: 'Each alias needs 3–40 characters with at least one letter or number.',
  })
export type RegisterBatchInput = z.input<typeof registerBatchSchema>
export type RegisterBatchOutput = z.output<typeof registerBatchSchema>

/** Split admin-entered aliases on commas/newlines/semicolons, normalise each. */
export function parseAliases(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[\n,;]+/)
    .map((s) => normaliseAlias(s))
    .filter(Boolean)
}

export const recallSchema = (batch: string) =>
  z.object({
    reason: z
      .string()
      .trim()
      .min(20, 'Explain the recall in at least 20 characters — customers will read this.')
      .max(400, 'Keep the reason to 400 characters or fewer.'),
    confirm: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .refine((v) => v === batch, `Type ${batch} exactly to confirm.`),
  })
export type RecallInput = { reason: string; confirm: string }

export const reportUpdateSchema = z
  .object({
    status: z.enum(['new', 'investigating', 'resolved_genuine', 'resolved_counterfeit']),
    note: z.string().trim().max(1000, 'Keep notes to 1000 characters or fewer.'),
  })
  .refine((v) => !v.status.startsWith('resolved') || v.note.length >= 10, {
    path: ['note'],
    message: 'Add a resolution note of at least 10 characters before resolving.',
  })
export type ReportUpdateInput = z.infer<typeof reportUpdateSchema>

export const inviteUserSchema = (existing: string[]) =>
  z.object({
    name: z.string().trim().min(2, 'Enter their full name.').max(80, 'Name must be 80 characters or fewer.'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter an email like name@bodylia.in.')
      .refine((v) => v.endsWith('@bodylia.in'), 'Staff accounts must use a @bodylia.in address.')
      .refine((v) => !existing.includes(v), 'Someone already has an account with this email.'),
    role: z.enum(['admin', 'quality', 'support'], { errorMap: () => ({ message: 'Choose a role.' }) }),
  })
export type InviteUserInput = { name: string; email: string; role: 'admin' | 'quality' | 'support' }

/* ----------------------------- Access ----------------------------- */

export const twoStepSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Enter the 6-digit code from your authenticator app.')
    .refine((v) => /^\d{6}$/.test(v.replace(/\s/g, '')) || /^[A-Z0-9]{5}-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(v), 'Enter 6 digits, or a recovery code like BDLRC-7Q4M-9X2K.'),
})

export const forgotSchema = z.object({
  email: z.string().trim().min(1, 'Enter your work email.').email('Enter an email like name@bodylia.in.'),
})

export const PASSWORD_RULES: { id: string; label: string; test: (v: string) => boolean }[] = [
  { id: 'len', label: 'At least 12 characters', test: (v) => v.length >= 12 },
  { id: 'upper', label: 'An uppercase and a lowercase letter', test: (v) => /[A-Z]/.test(v) && /[a-z]/.test(v) },
  { id: 'num', label: 'A number', test: (v) => /\d/.test(v) },
  { id: 'sym', label: 'A symbol, e.g. @ # !', test: (v) => /[^A-Za-z0-9]/.test(v) },
]

export const newPasswordSchema = z
  .object({
    password: z.string().refine((v) => PASSWORD_RULES.every((r) => r.test(v)), 'Your password doesn’t meet all the rules below.'),
    confirm: z.string().min(1, 'Re-enter your new password.'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords don’t match.' })
export type NewPasswordInput = z.infer<typeof newPasswordSchema>

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password.'),
    password: z.string().refine((v) => PASSWORD_RULES.every((r) => r.test(v)), 'Your new password doesn’t meet all the rules.'),
    confirm: z.string().min(1, 'Re-enter your new password.'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords don’t match.' })
  .refine((v) => v.password !== v.current, { path: ['password'], message: 'Choose a password you haven’t used here before.' })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(80, 'Name must be 80 characters or fewer.'),
  notifyEscalations: z.boolean(),
  notifyDigest: z.boolean(),
})
export type ProfileInput = z.infer<typeof profileSchema>

/* ----------------------------- Batches ----------------------------- */

export const editBatchSchema = (requiresReason: boolean) =>
  z
    .object({
      manufactured: isoDate('manufacture date'),
      expires: isoDate('expiry date'),
      facility: z.string().min(1, 'Choose the facility.'),
      lab: z.string().min(1, 'Choose the testing lab.'),
      reason: z.string().trim(),
    })
    .refine((v) => Date.parse(v.expires) > Date.parse(v.manufactured), { path: ['expires'], message: 'Expiry date must be after the manufacture date.' })
    .refine((v) => !requiresReason || v.reason.length >= 20, {
      path: ['reason'],
      message: 'Customers have already checked this batch. Explain the correction in at least 20 characters.',
    })
export type EditBatchInput = { manufactured: string; expires: string; facility: string; lab: string; reason: string }

export const liftRecallSchema = z.object({
  reason: z.string().trim().min(20, 'Explain why the recall is being lifted in at least 20 characters.').max(400, 'Keep it to 400 characters or fewer.'),
})
export type LiftRecallInput = z.infer<typeof liftRecallSchema>

/** One CSV row in a bulk import. Header: batch,product,manufactured,expires,facility,lab[,aliases] */
export const csvRowSchema = z
  .object({
    batch: batchNumberSchema,
    product: z.string().trim().length(2, 'Product code must be 2 letters.'),
    manufactured: isoDate('manufacture date'),
    expires: isoDate('expiry date'),
    facility: z.string().trim().min(1, 'Facility is missing.'),
    lab: z.string().trim().min(1, 'Lab is missing.'),
    /** Optional vendor aliases, pipe- or semicolon-separated within the cell. */
    aliases: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(/[|;]+/).map((s) => normaliseAlias(s)).filter(Boolean) : []))
      .refine((list) => list.length <= 20, 'At most 20 aliases per batch.'),
  })
  .refine((v) => v.batch.slice(4, 6) === v.product.toUpperCase(), { path: ['product'], message: 'Product code doesn’t match the batch number.' })
  .refine((v) => Date.parse(v.expires) > Date.parse(v.manufactured), { path: ['expires'], message: 'Expiry is before manufacture.' })
  .refine((v) => !v.aliases.some((a) => a === v.batch), { path: ['aliases'], message: 'An alias can’t repeat the canonical batch number.' })
  .refine((v) => !v.aliases.some((a) => BATCH_PATTERN.test(a)), { path: ['aliases'], message: 'Aliases must be vendor codes, not canonical BDL- numbers.' })

/* ----------------------------- Reports ----------------------------- */

export const replySchema = z.object({
  template: z.enum(['genuine', 'counterfeit', 'recall', 'more_info']),
  subject: z.string().trim().min(5, 'Add a subject of at least 5 characters.').max(120, 'Keep the subject to 120 characters or fewer.'),
  body: z
    .string()
    .trim()
    .min(40, 'The reply is too short to be helpful — at least 40 characters.')
    .max(3000, 'Keep the reply to 3000 characters or fewer.')
    .refine((v) => !/\{\{.+?\}\}/.test(v), 'Replace every {{placeholder}} before sending.'),
  resolve: z.boolean(),
})
export type ReplyInput = z.infer<typeof replySchema>

export const escalateSchema = z.object({
  urgency: z.enum(['standard', 'urgent'], { errorMap: () => ({ message: 'Choose how urgent this is.' }) }),
  reason: z.string().trim().min(20, 'Tell quality what you’ve found — at least 20 characters.').max(600, 'Keep it to 600 characters or fewer.'),
})
export type EscalateInput = z.infer<typeof escalateSchema>

export const returnEscalationSchema = z.object({
  reason: z.string().trim().min(15, 'Tell support what to do next — at least 15 characters.'),
})

/* ----------------------------- Admin ----------------------------- */

export const productSchema = (existingCodes: string[], editing?: string) =>
  z.object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Code must be exactly 2 letters.')
      .refine((v) => v === editing || !existingCodes.includes(v), 'That code is already used by another product.'),
    name: z.string().trim().min(2, 'Enter the product name.').max(40, 'Keep the name to 40 characters.'),
    claim: z.string().trim().min(10, 'Enter the on-pack claim (at least 10 characters).').max(120, 'Keep the claim to 120 characters.'),
    format: z.string().trim().min(3, 'Describe the pack format, e.g. 30 veg. HPMC capsules.'),
    shelfLifeMonths: z.coerce.number({ invalid_type_error: 'Enter a number of months.' }).int('Use whole months.').min(6, 'Shelf life must be at least 6 months.').max(60, 'Shelf life can’t exceed 60 months.'),
    image: z.string().trim().url('Enter the full image URL, starting https://'),
  })
export type ProductInput = { code: string; name: string; claim: string; format: string; shelfLifeMonths: number | string; image: string }

export const siteSchema = (kind: 'facility' | 'lab') =>
  z.object({
    name: z.string().trim().min(5, `Enter the ${kind}’s full name and city.`),
    accreditation: z.string().trim().min(3, kind === 'lab' ? 'Enter the NABL certificate number.' : 'Enter the GMP licence number.'),
    accreditationExpires: isoDate('accreditation expiry date').refine((v) => Date.parse(v) > Date.now(), 'Accreditation has already expired — it can’t be added.'),
  })
export type SiteInput = { name: string; accreditation: string; accreditationExpires: string }

export const settingsSchema = z
  .object({
    rateLimitPerMinute: z.coerce.number().int().min(3, 'At least 3 checks per minute — lower blocks families sharing Wi-Fi.').max(60, 'At most 60 per minute.'),
    replyTargetHours: z.coerce.number().int().min(4, 'At least 4 hours.').max(120, 'At most 120 hours (5 days).'),
    supportEmail: z.string().trim().email('Enter a valid email.'),
    retentionMonths: z.coerce.number().int().min(6, 'At least 6 months.').max(36, 'At most 36 months — the consent text promises this limit.'),
    sessionMinutes: z.coerce.number().int().min(5, 'At least 5 minutes.').max(60, 'At most 60 minutes.'),
    maintenance: z.boolean(),
    maintenanceMessage: z.string().trim().max(240, 'Keep the message to 240 characters.'),
    maintenanceUntil: z.string(),
  })
  .refine((v) => !v.maintenance || v.maintenanceMessage.length >= 20, { path: ['maintenanceMessage'], message: 'Write a customer message of at least 20 characters before turning on maintenance.' })
  .refine((v) => !v.maintenance || !!v.maintenanceUntil, { path: ['maintenanceUntil'], message: 'Tell customers when you expect to be back.' })
export type SettingsInput = {
  rateLimitPerMinute: number | string
  replyTargetHours: number | string
  supportEmail: string
  retentionMonths: number | string
  sessionMinutes: number | string
  maintenance: boolean
  maintenanceMessage: string
  maintenanceUntil: string
}

export const auditExportSchema = z
  .object({
    from: isoDate('start date'),
    to: isoDate('end date'),
    format: z.enum(['csv', 'pdf']),
  })
  .refine((v) => Date.parse(v.to) >= Date.parse(v.from), { path: ['to'], message: 'End date must be on or after the start date.' })
export type AuditExportInput = z.infer<typeof auditExportSchema>
