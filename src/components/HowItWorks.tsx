import { hrefFor } from '../lib/router'
import React from 'react'
import type { PublicPage } from '../App'

const STEPS = [
  {
    title: 'We match the batch to our production record',
    text: 'Every batch released from our facility is registered before it ships. A number we don’t recognise is a warning sign.',
  },
  {
    title: 'We check expiry and recall status live',
    text: 'If a batch is expired or recalled, you’ll see that first — before anything else on the page.',
  },
  {
    title: 'You see the independent lab report',
    text: 'Potency, microbial limits and heavy metals, tested by an accredited third-party lab for that exact batch.',
  },
]

export function HowItWorks({ navigate }: { navigate: (p: PublicPage) => void }) {
  return (
    <section aria-labelledby="how-title" className="border-t border-mist bg-sand">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_2fr] lg:py-20">
        <div>
          <h2 id="how-title" className="font-serif text-3xl font-semibold leading-tight text-burgundy sm:text-4xl">
            What a check tells you
          </h2>
          <p className="mt-3 text-graphite">
            Counterfeit supplements are a real risk online. A batch check takes seconds and needs no account.
          </p>
          <a
            href={hrefFor('faq')}
            onClick={(e) => {
              e.preventDefault()
              navigate('faq')
            }}
            className="mt-4 inline-flex min-h-11 items-center font-semibold text-burgundy underline underline-offset-4 hover:decoration-2"
          >
            Read the full FAQ
          </a>
        </div>
        <ol className="flex flex-col">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-4 border-t border-gold/60 py-6 first:border-t-0 first:pt-0">
              <span className="tabular font-serif text-2xl font-semibold text-burgundy" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold text-graphite">{s.title}</h3>
                <p className="mt-1 text-graphite/90">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
