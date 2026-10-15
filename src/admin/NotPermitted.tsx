import React from 'react'
import { ShieldOff } from 'lucide-react'
import { ROLE_LABEL } from '../data/admin-seed'
import { MATRIX, type Permission } from '../lib/auth'
import { useStore } from '../lib/store'
import { Button } from '../components/ui/button'
import { SECTION_TITLE, type Go, type Section } from './AdminShell'

export function NotPermitted({ section, permission, go }: { section: Section; permission: Permission; go: Go }) {
  const admins = useStore((s) => s.users.filter((u) => u.role === 'admin' && u.status === 'active'))
  const roles = (Object.keys(MATRIX) as (keyof typeof MATRIX)[]).filter((r) => MATRIX[r].includes(permission))
  return (
    <div className="max-w-xl py-8">
      <ShieldOff className="size-10 text-burgundy" strokeWidth={1.75} aria-hidden="true" />
      <h1 tabIndex={-1} className="mt-4 font-serif text-[2rem] font-semibold leading-tight text-burgundy focus:outline-none">
        Your role can’t open this page
      </h1>
      <p className="mt-3 text-graphite">
        <strong>{SECTION_TITLE[section]}</strong> is available to {roles.map((r) => ROLE_LABEL[r]).join(' and ')}. If you need access, ask an
        administrator: {admins.map((a) => a.name).join(', ')}.
      </p>
      <Button className="mt-6" onClick={() => go('overview')}>Back to overview</Button>
    </div>
  )
}
