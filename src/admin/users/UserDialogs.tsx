import React, { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { type Role, type StaffUser } from '../../data/admin-seed'
import { ROLE_LABEL } from '../../data/roles'
import { Dialog, DialogContent } from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
import { NativeSelect } from '../../components/ui/input'
import { diffRoles } from './capabilities'

export function ChangeRoleDialog({ change, onCancel, onConfirm }: { change: { user: StaffUser; to: Role } | null; onCancel: () => void; onConfirm: () => void }) {
  if (!change) return null
  const { gains, loses } = diffRoles(change.user.role, change.to)
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        title={`Make ${change.user.name.split(' ')[0]} ${ROLE_LABEL[change.to]}?`}
        description={`Currently ${ROLE_LABEL[change.user.role]}. The change is recorded in the audit log.`}
        className="max-w-xl"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="font-semibold text-success">Gains ({gains.length})</h3>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm text-graphite">
              {gains.length ? gains.map((g) => <li key={g} className="flex gap-2"><Plus className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />{g}</li>) : <li className="text-muted">Nothing new</li>}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-error">Loses ({loses.length})</h3>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm text-graphite">
              {loses.length ? loses.map((g) => <li key={g} className="flex gap-2"><Minus className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />{g}</li>) : <li className="text-muted">Nothing</li>}
            </ul>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Change role</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function DeactivateDialog({ actor, target, onClose, onConfirm }: { actor: StaffUser; target: StaffUser | null; onClose: () => void; onConfirm: (reassignTo?: string) => void }) {
  if (!target) return null

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() } }>
      <DialogContent title={`Deactivate ${target.name}?`} description="They’ll be signed out everywhere and can’t sign in again until reactivated. Their history stays in the audit log." className="max-w-lg">
        <p className="text-graphite">Open reports will be handled by the remaining team.</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-error hover:bg-error/90"
            onClick={() => onConfirm()}
          >
            Deactivate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
