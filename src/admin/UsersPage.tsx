import React, { useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Check, Minus, UserPlus } from 'lucide-react'
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role, type StaffUser } from '../data/admin-seed'
import { store, useStore } from '../lib/store'
import { Button } from '../components/ui/button'
import { NativeSelect } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { PageHeader } from './PageHeader'
import { InviteUserDialog } from './InviteUserDialog'
import { ChangeRoleDialog, DeactivateDialog } from './users/UserDialogs'
import { toast } from '../lib/toast'

const ROLES: Role[] = ['admin', 'quality', 'support']
import { CAPABILITIES } from './users/capabilities'

export function UsersPage({ user }: { user: StaffUser }) {
  const users = useStore((s) => s.users)
  const [inviting, setInviting] = useState(false)
  const [roleChange, setRoleChange] = useState<{ user: StaffUser; to: Role } | null>(null)
  const [deactivating, setDeactivating] = useState<StaffUser | null>(null)

  const update = (target: StaffUser, patch: Partial<StaffUser>, action: string, detail?: string) => {
    store.set((s) => ({ users: s.users.map((u) => (u.id === target.id ? { ...u, ...patch } : u)) }))
    store.audit(user.name, action, target.email, detail)
  }

  return (
    <div>
      <PageHeader
        title="Staff & roles"
        description="Who can use the batch console and what they’re allowed to change."
        actions={
          <Button onClick={() => setInviting(true)}>
            <UserPlus aria-hidden="true" />
            Invite staff
          </Button>
        }
      />

      <div role="region" aria-label="Staff accounts (scrolls sideways on small screens)" tabIndex={0} className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Staff accounts</caption>
          <thead>
            <tr className="border-b border-gold/60 text-muted">
              <th scope="col" className="py-2.5 pr-4 font-medium">Name</th>
              <th scope="col" className="py-2.5 pr-4 font-medium">Role</th>
              <th scope="col" className="py-2.5 pr-4 font-medium">Status</th>
              <th scope="col" className="py-2.5 pr-4 font-medium">Last active</th>
              <th scope="col" className="py-2.5 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === user.id
              return (
                <tr key={u.id} className="border-b border-mist">
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <span className="block font-semibold text-graphite">{u.name}{self && <span className="font-normal text-muted"> (you)</span>}</span>
                    <span className="block text-muted">{u.email}</span>
                  </th>
                  <td className="py-3 pr-4">
                    {self ? (
                      <span className="text-graphite">{ROLE_LABEL[u.role]}</span>
                    ) : (
                      <>
                        <label htmlFor={`role-${u.id}`} className="sr-only">Role for {u.name}</label>
                        <NativeSelect
                          id={`role-${u.id}`}
                          value={u.role}
                          disabled={u.status === 'deactivated'}
                          onChange={(e) => setRoleChange({ user: u, to: e.target.value as Role })}
                          className="max-w-52"
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </NativeSelect>
                      </>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {u.status === 'active' && <Badge tone="success">Active</Badge>}
                    {u.status === 'invited' && <Badge tone="info">Invited</Badge>}
                    {u.status === 'deactivated' && <Badge>Deactivated</Badge>}
                  </td>
                  <td className="py-3 pr-4 text-graphite">{formatDistanceToNowStrict(new Date(u.lastActive))} ago</td>
                  <td className="py-3 text-right">
                    {!self && u.status === 'active' && (
                      <Button variant="ghost" size="sm" onClick={() => setDeactivating(u)}>
                        Deactivate<span className="sr-only"> {u.name}</span>
                      </Button>
                    )}
                    {u.status === 'deactivated' && (
                      <Button variant="ghost" size="sm" onClick={() => { update(u, { status: 'active' }, 'Reactivated account'); toast(`${u.name} reactivated`) }}>
                        Reactivate<span className="sr-only"> {u.name}</span>
                      </Button>
                    )}
                    {u.status === 'invited' && (
                      <Button variant="ghost" size="sm" onClick={() => { store.audit(user.name, 'Resent invitation', u.email); toast('Invitation resent', { description: `${u.email} · valid for 7 days` }) }}>
                        Resend invite<span className="sr-only"> to {u.name}</span>
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="perm-title" className="mt-12">
        <h2 id="perm-title" className="font-serif text-2xl font-semibold text-burgundy">What each role can do</h2>
        <div role="region" aria-label="Role permissions (scrolls sideways on small screens)" tabIndex={0} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">Role permissions</caption>
            <thead>
              <tr className="border-b border-gold/60">
                <th scope="col" className="py-2.5 pr-4 font-medium text-muted">Capability</th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="py-2.5 pr-4 align-bottom">
                    <span className="block font-semibold text-graphite">{ROLE_LABEL[r]}</span>
                    <span className="block text-xs font-normal text-muted">{ROLE_DESCRIPTION[r]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map(([cap, by]) => (
                <tr key={cap} className="border-b border-mist">
                  <th scope="row" className="py-2.5 pr-4 font-medium text-graphite">{cap}</th>
                  {ROLES.map((r) => (
                    <td key={r} className="py-2.5 pr-4">
                      {by[r] ? (
                        <span className="inline-flex items-center gap-1.5 text-success"><Check className="size-4" aria-hidden="true" /><span className="font-medium">Yes</span></span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted"><Minus className="size-4" aria-hidden="true" />No</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <InviteUserDialog user={user} open={inviting} onOpenChange={setInviting} />
      <ChangeRoleDialog
        change={roleChange}
        onCancel={() => setRoleChange(null)}
        onConfirm={() => {
          const { user: u, to } = roleChange!
          update(u, { role: to }, 'Changed role', `${ROLE_LABEL[u.role]} → ${ROLE_LABEL[to]}`)
          toast(`${u.name} is now ${ROLE_LABEL[to]}`, { description: 'Takes effect on their next page load.' })
          setRoleChange(null)
        }}
      />
      <DeactivateDialog
        actor={user}
        target={deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={(reassignTo) => {
          const u = deactivating!
          update(u, { status: 'deactivated' }, 'Deactivated account', reassignTo ? `Open reports → ${reassignTo}` : undefined)
          if (reassignTo) {
            store.get().reports.filter((r) => r.assignee === u.name && !r.status.startsWith('resolved')).forEach((r) =>
              store.updateReport(r.reference, { assignee: reassignTo }, { by: user.name, kind: 'assign', text: `Reassigned to ${reassignTo} (${u.name} deactivated)` }),
            )
          }
          toast(`${u.name} deactivated`, { description: 'Signed out everywhere.' })
          setDeactivating(null)
        }}
      />
    </div>
  )
}
