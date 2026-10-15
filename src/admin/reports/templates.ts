import type { SuspiciousReport } from '../../data/admin-seed'

export type TemplateId = 'genuine' | 'counterfeit' | 'recall' | 'more_info'

export const TEMPLATE_LABEL: Record<TemplateId, string> = {
  genuine: 'Your pack is genuine',
  counterfeit: 'Your pack is not genuine',
  recall: 'Recall — replacement',
  more_info: 'We need more information',
}

/** Customer replies. Placeholders in {{double braces}} must be replaced before sending (Zod-enforced). */
export function fillTemplate(id: TemplateId, r: SuspiciousReport, agent: string, product: string) {
  const first = r.fullName.split(' ')[0]
  const sign = `\n\nWarm regards,\n${agent}\nBodylia Customer Care`
  switch (id) {
    case 'genuine':
      return {
        subject: `Your ${product} pack is genuine (${r.reference})`,
        body: `Dear ${first},\n\nThank you for checking with us. We’ve reviewed batch ${r.batch} against our manufacturing and laboratory records, and your pack is a genuine Bodylia product that passed every release test.\n\n{{Explain the specific concern, e.g. natural colour variation between batches}}\n\nIf anything else about the pack worries you, simply reply to this email.${sign}`,
      }
    case 'counterfeit':
      return {
        subject: `Important: your pack is not a genuine Bodylia product (${r.reference})`,
        body: `Dear ${first},\n\nThank you for reporting this. Batch number ${r.batch} was never produced by Bodylia, so the pack you received is not genuine. Please don’t consume it.\n\nWhat we’re doing:\n• Sending you a genuine replacement free of charge within 5 working days.\n• Reporting the seller (${r.channel}) to the marketplace’s brand-protection team.\n\nPlease keep the pack until our courier collects it — it helps our investigation.${sign}`,
      }
    case 'recall':
      return {
        subject: `Your replacement for recalled batch ${r.batch} (${r.reference})`,
        body: `Dear ${first},\n\nThank you for letting us know. Batch ${r.batch} is part of a voluntary recall, and we’re sorry for the inconvenience.\n\nWe’ve arranged a replacement, which will arrive within 5 working days, and our courier will collect the recalled pack at the same time. You don’t need to do anything else.${sign}`,
      }
    case 'more_info':
      return {
        subject: `A little more information, please (${r.reference})`,
        body: `Dear ${first},\n\nThank you for your report about batch ${r.batch}. To investigate properly, could you reply with:\n\n• A clear photo of the batch number and expiry date\n• A photo of the seal under the cap or zip\n• {{Anything else specific to this case}}\n\nWe’ll come back to you within 2 working days of hearing from you.${sign}`,
      }
  }
}
