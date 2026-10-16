import React from 'react'
import { SUPPORT_EMAIL } from '../../data/catalog-static'

type Page = 'accessibility' | 'privacy' | 'terms'

export function LegalPage({ page }: { page: Page }) {
  const content = CONTENT(SUPPORT_EMAIL, 12)[page]
  return (
    <div className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:px-8 lg:pt-16">
      <h1 data-autofocus tabIndex={-1} className="font-serif text-[2.25rem] font-semibold leading-tight text-burgundy focus:outline-none sm:text-5xl">
        {content.title}
      </h1>
      <p className="mt-2 text-sm text-muted">Last reviewed 2 January 2026</p>
      <p className="mt-6 text-lg leading-8 text-graphite">{content.lead}</p>
      {content.sections.map(([h, body]) => (
        <section key={h} className="mt-10">
          <h2 className="font-serif text-2xl font-semibold text-burgundy">{h}</h2>
          {Array.isArray(body) ? (
            <ul className="mt-3 list-disc space-y-2 pl-6 leading-7 text-graphite">
              {body.map((b) => <li key={b}>{b}</li>)}
            </ul>
          ) : (
            <p className="mt-3 leading-7 text-graphite">{body}</p>
          )}
        </section>
      ))}
      {page === 'accessibility' && (
        <section className="mt-10">
          <h2 className="font-serif text-2xl font-semibold text-burgundy">Human checks without puzzles</h2>
          <p className="mt-3 leading-7 text-graphite">
            Every form carries an automatic human check that runs on your own device — there is nothing to
            solve and no distorted text. Staff sign-in allows password managers and pasting.
          </p>
        </section>
      )}
    </div>
  )
}

const CONTENT = (email: string, months: number): Record<Page, { title: string; lead: string; sections: [string, string | string[]][] }> => ({
  accessibility: {
    title: 'Accessibility statement',
    lead: 'batch.bodylia.in is designed to conform to the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. Anyone, using any device or assistive technology, should be able to verify a pack.',
    sections: [
      ['What we do', [
        'Every page works with a keyboard alone, with a visible focus indicator that is never hidden behind other content.',
        'Text and controls meet a minimum 4.5:1 contrast ratio (3:1 for large text and interface components).',
        'Results are never shown by colour alone — each verdict has an icon and a written status.',
        'Pages reflow to a single column at 320 pixels wide and remain usable at 400% zoom.',
        'Animations are brief and switched off when your device asks for reduced motion.',
        'Staff sign-in allows password managers and pasting, and never uses a puzzle CAPTCHA.',
      ]],
      ['How we test', 'Automated checks (axe-core) run on every change, alongside keyboard-only and screen-reader testing with NVDA, VoiceOver and TalkBack before each release.'],
      ['Known limitations', 'Lab-report PDFs are generated documents and may not be fully tagged for screen readers. The same results are always available as an accessible table on the result page.'],
      ['Feedback', `If anything on this site is hard to use, email ${email}. We reply within 2 working days and treat accessibility issues as high priority.`],
    ],
  },
  privacy: {
    title: 'Privacy notice',
    lead: 'Checking a batch number is anonymous. We only ask for personal details if you choose to report a suspicious pack.',
    sections: [
      ['What we collect', [
        'Batch checks: the batch number and an approximate city derived from your connection — never your name or precise location.',
        'Reports: your name, email, optional phone number, where you bought the pack, an optional photo and your message.',
      ]],
      ['Why', 'To investigate your report, reply to you, and identify counterfeit sellers so we can act against them. Our lawful basis is your consent, given on the report form, under the Digital Personal Data Protection Act, 2023.'],
      ['How long', `Report details are deleted automatically ${months} months after submission. Anonymous check statistics are kept for trend analysis.`],
      ['Your rights', `You can ask to see, correct or delete your details at any time by emailing ${email}.`],
      ['Cookies', 'This site sets no tracking or advertising cookies. Staff sign-in uses one essential session cookie.'],
    ],
  },
  terms: {
    title: 'Terms of use',
    lead: 'This service confirms whether a batch number matches a batch released by Bodylia. It is provided free of charge to help you buy and use our products safely.',
    sections: [
      ['What a result means', 'A “genuine” result confirms the batch number exists in our release records. Because batch numbers can be copied, also check the seal, print quality and seller. If anything looks wrong, report the pack.'],
      ['Fair use', 'Automated or bulk checking is not permitted and is limited to protect the service for customers.'],
      ['Health information', 'Our products are dietary supplements, not medicines. Nothing on this site is medical advice. Speak to a doctor before use if you are pregnant, nursing or taking medication.'],
    ],
  },
})
