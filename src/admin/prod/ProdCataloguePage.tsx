import React, { useState } from 'react'
import type { StaffUser } from '../../data/admin-seed'
import { Loader2 } from 'lucide-react'
import { adminApi } from '../admin-api'
import { toast } from '../../lib/toast'
import { PageHeader } from '../PageHeader'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { ProdError, ProdLoading, useAdminQuery, useProdActions, whenLabel } from './shared'

/**
 * Production Catalogue tab (API-backed). GET /api/admin/catalogue returns the
 * live products + sites; archive/unarchive via PATCH …/products/:code and
 * …/sites/:id — both admin-only server-side (403 for quality/support).
 */

interface CatalogueProduct {
  code: string
  name: string
  claim: string
  format: string
  image: string
  shelfLifeMonths: number
  archived: boolean
}

interface CatalogueSite {
  id: string
  kind: string
  name: string
  accreditation: string
  accreditationExpires: string
  archived: boolean
}

interface Catalogue {
  products: CatalogueProduct[]
  sites: CatalogueSite[]
}

export function ProdCataloguePage({ user, onSignOut }: { user: StaffUser; onSignOut: () => void }) {
  const isAdmin = user.role === 'admin'
  const { data, error, loading, reload } = useAdminQuery<Catalogue>('/api/admin/catalogue', onSignOut)
  const { busy, run } = useProdActions(onSignOut)

  const setArchived = async (kind: 'products' | 'sites', key: string, archived: boolean, label: string) => {
    const ok = await run(`${kind}:${key}`, async () => {
      await adminApi(`/api/admin/catalogue/${kind}/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: { archived },
      })
    })
    if (ok) {
      toast(`${label} ${archived ? 'archived' : 'restored'}`)
      reload()
    }
  }

  if (error) {
    return (
      <div className="mt-6">
        <PageHeader title="Product catalogue" description="Products, manufacturing facilities and accredited labs." />
        <div className="mt-6">
          <ProdError message={error} />
        </div>
      </div>
    )
  }
  if (loading || !data) {
    return (
      <div className="mt-6">
        <PageHeader title="Product catalogue" description="Products, manufacturing facilities and accredited labs." />
        <div className="mt-6">
          <ProdLoading label="Loading catalogue…" />
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <PageHeader
        title="Product catalogue"
        description="Products, manufacturing facilities and accredited labs behind every verification."
      />
      {!isAdmin && (
        <p className="mt-4 rounded-md border border-mist bg-sand p-3 text-sm text-graphite">
          You can review the catalogue here — only admins can archive or restore entries.
        </p>
      )}

      <section aria-labelledby="cat-products" className="mt-8">
        <h2 id="cat-products" className="text-lg font-semibold text-graphite">Products</h2>
        <div role="region" aria-label="Products (scrolls sideways)" tabIndex={0} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Catalogue products</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2.5 pr-4 font-medium">Code</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Name</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Claim</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Format</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium">Shelf life</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">State</th>
                <th scope="col" className="py-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.code} className="border-b border-mist">
                  <th scope="row" className="tabular py-2.5 pr-4 font-semibold text-graphite">{p.code}</th>
                  <td className="py-2.5 pr-4 text-graphite">{p.name}</td>
                  <td className="py-2.5 pr-4 text-graphite">{p.claim}</td>
                  <td className="py-2.5 pr-4 text-graphite">{p.format}</td>
                  <td className="tabular py-2.5 pr-4 text-right text-graphite">{p.shelfLifeMonths} mo</td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={p.archived ? 'neutral' : 'success'}>{p.archived ? 'Archived' : 'Active'}</Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `products:${p.code}`}
                        onClick={() => setArchived('products', p.code, !p.archived, p.name)}
                        aria-label={`${p.archived ? 'Restore' : 'Archive'} product ${p.name}`}
                      >
                        {busy === `products:${p.code}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                        {p.archived ? 'Restore' : 'Archive'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="cat-sites" className="mt-10">
        <h2 id="cat-sites" className="text-lg font-semibold text-graphite">Facilities & labs</h2>
        <div role="region" aria-label="Facilities and labs (scrolls sideways)" tabIndex={0} className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Catalogue sites</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2.5 pr-4 font-medium">Kind</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Name</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Accreditation</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Expires</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">State</th>
                <th scope="col" className="py-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.sites.map((s) => (
                <tr key={s.id} className="border-b border-mist">
                  <td className="py-2.5 pr-4">
                    <Badge tone={s.kind === 'lab' ? 'info' : 'neutral'}>{s.kind === 'lab' ? 'Lab' : 'Facility'}</Badge>
                  </td>
                  <th scope="row" className="py-2.5 pr-4 font-semibold text-graphite">{s.name}</th>
                  <td className="tabular py-2.5 pr-4 text-graphite">{s.accreditation}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-graphite">{whenLabel(s.accreditationExpires)}</td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={s.archived ? 'neutral' : 'success'}>{s.archived ? 'Archived' : 'Active'}</Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === `sites:${s.id}`}
                        onClick={() => setArchived('sites', s.id, !s.archived, s.name)}
                        aria-label={`${s.archived ? 'Restore' : 'Archive'} site ${s.name}`}
                      >
                        {busy === `sites:${s.id}` ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                        {s.archived ? 'Restore' : 'Archive'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.sites.length === 0 && <p className="mt-4 text-graphite">No sites registered yet.</p>}
        </div>
      </section>
    </div>
  )
}

