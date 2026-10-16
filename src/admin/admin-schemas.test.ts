import { describe, expect, it } from 'vitest'
import { csvRowSchema, parseAliases, registerBatchSchema } from './schemas'

const COA = [{ test: 'Assay (active)', specification: '18 mg ± 10 %', result: '18.1 mg', pass: true }]
// Dates stay relative to today so the "manufactured can't be in the future"
// refine never trips on the calendar (first batch ships NOV 2026).
const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const daysAhead = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }
const BASE = {
  batch: 'PE-2610-WL01',
  product: 'PE',
  manufactured: daysAgo(30),
  expires: daysAhead(300),
  facility: 'Unit 2, Baddi, Himachal Pradesh',
  lab: 'Eurofins Analytical Services India, Bengaluru',
  coa: COA,
}

describe('admin register schema (XX-NNNN-XXNN + mapped codes)', () => {
  it('accepts canonical with spaced input + mapped codes', () => {
    const r = registerBatchSchema.safeParse({ ...BASE, batch: 'pe 2610 wl01', aliases: '2K26006\nLBL-PE-0001' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.aliases).toEqual(['2K26006', 'LBL-PE-0001'])
  })

  it('rejects product mismatch (XX identifies product)', () => {
    const r = registerBatchSchema.safeParse({ ...BASE, product: 'CI' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toContain('two-letter code at the start')
  })

  it('rejects bad dates, future manufacture, failed COA', () => {
    expect(registerBatchSchema.safeParse({ ...BASE, expires: '2020-01-01' }).success).toBe(false)
    expect(registerBatchSchema.safeParse({ ...BASE, manufactured: '2999-01-01' }).success).toBe(false)
    expect(registerBatchSchema.safeParse({ ...BASE, coa: [{ ...COA[0], pass: false }] }).success).toBe(false)
  })

  it('rejects alias repeating batch, canonical-shaped, dupes, short, overflow', () => {
    expect(registerBatchSchema.safeParse({ ...BASE, aliases: 'PE-2610-WL01' }).success).toBe(false)
    expect(registerBatchSchema.safeParse({ ...BASE, aliases: 'CI-2610-WL01' }).success).toBe(false)
    expect(registerBatchSchema.safeParse({ ...BASE, aliases: 'MFG-1, MFG-1' }).success).toBe(false)
    expect(registerBatchSchema.safeParse({ ...BASE, aliases: 'x' }).success).toBe(false)
    const many = Array.from({ length: 21 }, (_, i) => `MFG-${i}`).join(',')
    expect(registerBatchSchema.safeParse({ ...BASE, aliases: many }).success).toBe(false)
  })

  it('parseAliases splits on commas/newlines/semicolons', () => {
    expect(parseAliases(undefined)).toEqual([])
    expect(parseAliases('')).toEqual([])
    expect(parseAliases(' a , b\nc;d ')).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('admin csv row schema', () => {
  const ROW = { batch: 'PE-2610-WL01', product: 'PE', manufactured: daysAgo(30), expires: daysAhead(300), facility: 'F', lab: 'L' }
  it('accepts plain rows, parses pipe-separated mapped codes', () => {
    expect(csvRowSchema.safeParse(ROW).success).toBe(true)
    const r = csvRowSchema.safeParse({ ...ROW, aliases: '2K26006 | LBL-PE-0001' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.aliases).toEqual(['2K26006', 'LBL-PE-0001'])
  })
  it('rejects mismatch, bad dates, repeats, canonical alias, overflow', () => {
    expect(csvRowSchema.safeParse({ ...ROW, product: 'CI' }).success).toBe(false)
    expect(csvRowSchema.safeParse({ ...ROW, expires: '2020-01-01' }).success).toBe(false)
    expect(csvRowSchema.safeParse({ ...ROW, aliases: 'PE-2610-WL01' }).success).toBe(false)
    expect(csvRowSchema.safeParse({ ...ROW, aliases: 'CI-2610-WL01' }).success).toBe(false)
    const many = Array.from({ length: 21 }, (_, i) => `M${i}`).join('|')
    expect(csvRowSchema.safeParse({ ...ROW, aliases: many }).success).toBe(false)
  })
})


describe('admin misc schemas', () => {
  it('signIn + coaRow + recall + reportUpdate', async () => {
    const m = await import('./schemas')
    expect(m.signInSchema.safeParse({ email: 'a@bodylia.in', password: 'x' }).success).toBe(true)
    expect(m.signInSchema.safeParse({ email: 'bad', password: '' }).success).toBe(false)
    expect(m.coaRowSchema.safeParse({ test: 'Assay', specification: 's', result: 'r', pass: true }).success).toBe(true)
    expect(m.coaRowSchema.safeParse({ test: 'x', specification: '', result: '', pass: true }).success).toBe(false)
    const rs = m.recallSchema('PE-2610-WL01')
    expect(rs.safeParse({ reason: 'x'.repeat(25), confirm: 'PE-2610-WL01' }).success).toBe(true)
    expect(rs.safeParse({ reason: 'short', confirm: 'PE-2610-WL01' }).success).toBe(false)
    expect(rs.safeParse({ reason: 'x'.repeat(25), confirm: 'WRONG' }).success).toBe(false)
    expect(m.reportUpdateSchema.safeParse({ status: 'investigating', note: '' }).success).toBe(true)
    expect(m.reportUpdateSchema.safeParse({ status: 'resolved_genuine', note: 'short' }).success).toBe(false)
    expect(m.reportUpdateSchema.safeParse({ status: 'resolved_genuine', note: 'long enough note' }).success).toBe(true)
  })

  it('invite/reply/escalate/edit/lift/product/site/settings/audit', async () => {
    const m = await import('./schemas')
    const inv = m.inviteUserSchema(['a@bodylia.in'])
    expect(inv.safeParse({ name: 'Jo', email: 'jo@bodylia.in', role: 'admin' }).success).toBe(true)
    expect(inv.safeParse({ name: 'J', email: 'jo@bodylia.in', role: 'admin' }).success).toBe(false)
    expect(inv.safeParse({ name: 'Jo', email: 'jo@gmail.com', role: 'admin' }).success).toBe(false)
    expect(inv.safeParse({ name: 'Jo', email: 'a@bodylia.in', role: 'admin' }).success).toBe(false)
    expect(m.replySchema.safeParse({ template: 'genuine', subject: 'Hello world', body: 'x'.repeat(50), resolve: true }).success).toBe(true)
    expect(m.replySchema.safeParse({ template: 'genuine', subject: 'Hi', body: 'short', resolve: false }).success).toBe(false)
    expect(m.escalateSchema.safeParse({ urgency: 'urgent', reason: 'x'.repeat(25) }).success).toBe(true)
    expect(m.escalateSchema.safeParse({ urgency: 'urgent', reason: 'short' }).success).toBe(false)
    expect(m.returnEscalationSchema.safeParse({ reason: 'x'.repeat(20) }).success).toBe(true)
    expect(m.returnEscalationSchema.safeParse({ reason: 'short' }).success).toBe(false)
    const good = { manufactured: '2025-01-01', expires: '2027-01-01', facility: 'F', lab: 'L', reason: '' }
    expect(m.editBatchSchema(false).safeParse(good).success).toBe(true)
    expect(m.editBatchSchema(true).safeParse({ ...good, reason: 'short' }).success).toBe(false)
    expect(m.editBatchSchema(true).safeParse({ ...good, reason: 'x'.repeat(25) }).success).toBe(true)
    expect(m.liftRecallSchema.safeParse({ reason: 'x'.repeat(25) }).success).toBe(true)
    expect(m.liftRecallSchema.safeParse({ reason: 'short' }).success).toBe(false)
    const prod = { code: 'FR', name: 'Ferrimune', claim: 'x'.repeat(15), format: '30 capsules', shelfLifeMonths: 24, image: 'https://x.test/i.png' }
    expect(m.productSchema([], undefined).safeParse(prod).success).toBe(true)
    expect(m.productSchema(['FR'], undefined).safeParse(prod).success).toBe(false)
    expect(m.siteSchema('lab').safeParse({ name: 'Eurofins Bengaluru', accreditation: 'NABL-1', accreditationExpires: '2999-01-01' }).success).toBe(true)
    expect(m.siteSchema('lab').safeParse({ name: 'x', accreditation: 'N', accreditationExpires: '2020-01-01' }).success).toBe(false)
    const set = { rateLimitPerMinute: 10, replyTargetHours: 48, supportEmail: 'a@b.in', retentionMonths: 12, sessionMinutes: 15, maintenance: false, maintenanceMessage: '', maintenanceUntil: '' }
    expect(m.settingsSchema.safeParse(set).success).toBe(true)
    expect(m.settingsSchema.safeParse({ ...set, rateLimitPerMinute: 1, supportEmail: 'bad', maintenance: true }).success).toBe(false)
    expect(m.auditExportSchema.safeParse({ from: '2025-01-01', to: '2025-02-01', format: 'csv' }).success).toBe(true)
    expect(m.auditExportSchema.safeParse({ from: '2025-03-01', to: '2025-02-01', format: 'csv' }).success).toBe(false)
  })

describe('admin access schemas (twoStep/forgot/passwords/profile)', () => {
  it('twoStep accepts 6 digits or recovery code', async () => {
    const m = await import('./schemas')
    expect(m.twoStepSchema.safeParse({ code: '246810' }).success).toBe(true)
    expect(m.twoStepSchema.safeParse({ code: 'BDLRC-7Q4M-9X2K' }).success).toBe(true)
    expect(m.twoStepSchema.safeParse({ code: '' }).success).toBe(false)
    expect(m.twoStepSchema.safeParse({ code: 'abc' }).success).toBe(false)
  })
  it('forgot requires work email', async () => {
    const m = await import('./schemas')
    expect(m.forgotSchema.safeParse({ email: 'a@bodylia.in' }).success).toBe(true)
    expect(m.forgotSchema.safeParse({ email: '' }).success).toBe(false)
    expect(m.forgotSchema.safeParse({ email: 'bad' }).success).toBe(false)
  })
  it('PASSWORD_RULES each rule independently', async () => {
    const m = await import('./schemas')
    const byId = Object.fromEntries(m.PASSWORD_RULES.map((r) => [r.id, r.test]))
    expect(byId.len('x'.repeat(12))).toBe(true)
    expect(byId.len('short')).toBe(false)
    expect(byId.upper('Ab')).toBe(true)
    expect(byId.upper('ab')).toBe(false)
    expect(byId.upper('AB')).toBe(false)
    expect(byId.num('a1')).toBe(true)
    expect(byId.num('ab')).toBe(false)
    expect(byId.sym('a@')).toBe(true)
    expect(byId.sym('ab')).toBe(false)
  })
  it('new/change password + profile', async () => {
    const m = await import('./schemas')
    const good = 'StrongPass1@x'
    expect(m.newPasswordSchema.safeParse({ password: good, confirm: good }).success).toBe(true)
    expect(m.newPasswordSchema.safeParse({ password: 'weak', confirm: 'weak' }).success).toBe(false)
    expect(m.newPasswordSchema.safeParse({ password: good, confirm: 'other' }).success).toBe(false)
    expect(m.changePasswordSchema.safeParse({ current: 'old', password: good, confirm: good }).success).toBe(true)
    expect(m.changePasswordSchema.safeParse({ current: 'old', password: 'weak', confirm: 'weak' }).success).toBe(false)
    expect(m.changePasswordSchema.safeParse({ current: good, password: good, confirm: good }).success).toBe(false)
    expect(m.changePasswordSchema.safeParse({ current: 'old', password: good, confirm: 'other' }).success).toBe(false)
    expect(m.profileSchema.safeParse({ name: 'Jo Smith', notifyEscalations: true, notifyDigest: false }).success).toBe(true)
    expect(m.profileSchema.safeParse({ name: 'J', notifyEscalations: true, notifyDigest: false }).success).toBe(false)
  })
  it('invite role errorMap + report/escalate error branches', async () => {
    const m = await import('./schemas')
    expect(m.inviteUserSchema([]).safeParse({ name: 'Jo Smith', email: 'jo@bodylia.in', role: 'wrong' }).success).toBe(false)
    expect(m.replySchema.safeParse({ template: 'wrong', subject: 'Hello world', body: 'x'.repeat(50), resolve: false }).success).toBe(false)
    expect(m.escalateSchema.safeParse({ urgency: 'wrong', reason: 'x'.repeat(25) }).success).toBe(false)
  })
})

})
