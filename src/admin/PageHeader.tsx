import React from 'react'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-mist pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 tabIndex={-1} className="font-serif text-[2rem] font-semibold leading-tight text-burgundy focus:outline-none sm:text-4xl">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-graphite">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </div>
  )
}
