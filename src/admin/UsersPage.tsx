import React, { useCallback, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Check, Minus, UserPlus, Loader2 } from 'lucide-react'
import { type Role, type StaffUser } from '../data/admin-seed'
import { ROLE_DESCRIPTION, ROLE_LABEL } from '../data/roles'
import { adminApi, AuthExpired } from './admin-api'
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
  const [users, setUsers] = useState<StaffUser[]>([])
  const [inviting, setInviting] = useState(false)
  const [roleChange, setRoleChange] = useState<{ user: StaffUser; to: Role } | null>(null)
  const [deactivating, setDeactivating] = useState<StaffUser | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setUsers(await adminApi<StaffUser[]>(`/api/admin/staff`))
    } catch (e) {
      if (!(e instanceof AuthExpired)) {
        toast('Could not load staff accounts.', { description: (e as Error).message })
      }
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const update = async (
    target: StaffUser,
    patch: Partial<StaffUser>,
    action: string,
    detail?: string,
  ) => {
    setBusyId(target.id)
    try {
      const updates: Record<string, unknown> = {}
      if (patch.role !== undefined) updates.role = patch.role
      if (patch.status !== undefined) updates.status = patch.status
      await adminApi(`/api/admin/staff/${target.id}`, {
        method: 'PATCH',
        body: updates,
      })
      setUsers((cur) => cur.map((u) => (u.id === target.id ? { ...u, ...patch } : u)))
      toast(`${target.name} updated`, { description: detail })
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const createStaff = async (input: { name: string; email: string; role: Role }) => {
    setBusyId('create')
    try {
      await adminApi('/api/admin/staff', {
        method: 'POST',
        body: input,
      })
      void load()
      toast(`Invitation sent to ${input.email}`, { description: `${ROLE_LABEL[input.role]} · temporary password shown by the admin` })
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const deactivateStaff = async (target: StaffUser) => {
    setBusyId(target.id)
    try {
      await adminApi(`/api/admin/staff/${target.id}`, { method: 'DELETE' })
      setUsers((cur) => cur.filter((u) => u.id !== target.id))
      toast(`${target.name} deactivated`, { description: 'Signed out everywhere.' })
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Staff & roles"
        description="Who can use the batch console and what they’re allowed to change."
        actions={
          <Button
            onClick={() => setInviting(true)}
            disabled={busyId === 'create'}
          >
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
                          disabled={u.status === 'deactivated' || busyId === u.id}
                          onChange={(e) => {
                            setRoleChange({ user: u, to: e.target.value as Role })
                          }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </NativeSelect>
                      </>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={u.status === 'active' ? 'success' : 'neutral'}>
                      {u.status === 'active' ? 'Active' : u.status === 'invited' ? 'Invited' : 'Deactivated'}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-graphite">
                    {u.lastActive ? formatDistanceToNowStrict(new Date(u.lastActive), { addSuffix: true }) : '—'}
                  </td>
                  <td className="py-3">
                    {self ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRoleChange({ user: u, to: u.role === 'admin' ? 'quality' : 'admin' })}
                          disabled={busyId === u.id}
                        >
                          {busyId === u.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                          {u.role === 'admin' ? 'Downgrade' : 'Promote'}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setDeactivating(u)}
                          disabled={busyId === u.id}
                        >
                          Deactivate
                        </Button>
                      </div>
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

      <InviteUserDialog
        user={user}
        open={inviting}
        onOpenChange={(o) => {
          if (!o) setInviting(false)
          else setInviting(true)
        }}
      />
      <ChangeRoleDialog
        change={roleChange}
        onCancel={() => setRoleChange(null)}
        onConfirm={async () => {
          if (!roleChange) return
          const { user: u, to } = roleChange
          await update(u, { role: to }, 'Changed role', `${ROLE_LABEL[u.role]} → ${ROLE_LABEL[to]}`)
          toast(`${u.name} is now ${ROLE_LABEL[to]}`, { description: 'Takes effect on their next page load.' })
          setRoleChange(null)
        }}
      />
      <DeactivateDialog
        actor={user}
        target={deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={async (_reassignTo) => {
          if (!deactivating) return
          await deactivateStaff(deactivating)
          setDeactivating(null)
        }}
      />
    </div>
  )
}
