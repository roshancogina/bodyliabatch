import React, { useState } from 'react'
import { differenceInDays, format } from 'date-fns'
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-react'
import type { Site, StaffUser } from '../../data/admin-seed'
import type { Product } from '../../data/products'
import { store, useStore } from '../../lib/store'
import { toast } from '../../lib/toast'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { PageHeader } from '../PageHeader'
import { ProductDialog } from './ProductDialog'
import { SiteDialog } from './SiteDialog'

type Tab = 'products' | 'facilities' | 'labs'

export function CataloguePage({ user }: { user: StaffUser }) {
  const [tab, setTab] = useState<Tab>('products')
  const products = useStore((s) => s.products)
  const facilities = useStore((s) => s.facilities)
  const labs = useStore((s) => s.labs)
  const batches = useStore((s) => s.batches)
  const [editingProduct, setEditingProduct] = useState<Product | 'new' | null>(null)
  const [editingSite, setEditingSite] = useState<{ kind: 'facility' | 'lab'; site: Site | 'new' } | null>(null)

  const toggleProduct = (p: Product) => {
    store.set((s) => ({ products: s.products.map((x) => (x.code === p.code ? { ...x, archived: !x.archived } : x)) }))
    store.audit(user.name, p.archived ? 'Restored product' : 'Archived product', p.name)
    toast(p.archived ? `${p.name} restored` : `${p.name} archived`, { description: p.archived ? undefined : 'Existing batches still verify; new batches can’t use it.' })
  }
  const toggleSite = (kind: 'facility' | 'lab', site: Site) => {
    const key = kind === 'facility' ? 'facilities' : 'labs'
    store.set((s) => ({ [key]: s[key].map((x) => (x.id === site.id ? { ...x, archived: !x.archived } : x)) }))
    store.audit(user.name, site.archived ? `Restored ${kind}` : `Archived ${kind}`, site.name)
    toast(site.archived ? 'Restored' : 'Archived', { description: site.name })
  }

  const TABS: [Tab, string, number][] = [
    ['products', 'Products', products.length],
    ['facilities', 'Facilities', facilities.length],
    ['labs', 'Testing labs', labs.length],
  ]

  return (
    <div>
      <PageHeader
        title="Catalogue"
        description="The products, manufacturing sites and laboratories that batches can reference."
        actions={
          <Button onClick={() => (tab === 'products' ? setEditingProduct('new') : setEditingSite({ kind: tab === 'labs' ? 'lab' : 'facility', site: 'new' }))}>
            <Plus aria-hidden="true" />
            Add {tab === 'products' ? 'product' : tab === 'labs' ? 'lab' : 'facility'}
          </Button>
        }
      />

      <div role="tablist" aria-label="Catalogue sections" className="mt-6 flex gap-1 border-b border-mist">
        {TABS.map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={cn('-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium', tab === id ? 'border-burgundy text-burgundy' : 'border-transparent text-muted hover:text-graphite')}
          >
            {label} <span className="tabular text-xs">{n}</span>
          </button>
        ))}
      </div>

      {tab === 'products' && (
        <div role="tabpanel" id="panel-products" aria-labelledby="tab-products" tabIndex={0} className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Products</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2.5 pr-4 font-medium">Product</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Code</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Format</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium">Shelf life</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium">Batches</th>
                <th scope="col" className="py-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.code} className={cn('border-b border-mist align-middle', p.archived && 'text-muted')}>
                  <th scope="row" className="py-2 pr-4 font-normal">
                    <span className="flex items-center gap-3">
                      <span className="flex size-12 shrink-0 items-end justify-center rounded bg-sand p-1"><img src={p.image} alt="" className="max-h-full w-auto" /></span>
                      <span>
                        <span className="block font-semibold text-graphite">{p.name} {p.archived && <Badge>Archived</Badge>}</span>
                        <span className="block max-w-xs truncate text-muted">{p.claim}</span>
                      </span>
                    </span>
                  </th>
                  <td className="tabular py-2 pr-4 font-semibold text-graphite">{p.code}</td>
                  <td className="py-2 pr-4 text-graphite">{p.format}</td>
                  <td className="tabular py-2 pr-4 text-right text-graphite">{p.shelfLifeMonths} mo</td>
                  <td className="tabular py-2 pr-4 text-right text-graphite">{batches.filter((b) => b.product === p.code).length}</td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditingProduct(p)}><Pencil aria-hidden="true" />Edit<span className="sr-only"> {p.name}</span></Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleProduct(p)}>
                      {p.archived ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />}
                      {p.archived ? 'Restore' : 'Archive'}<span className="sr-only"> {p.name}</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(tab === 'facilities' || tab === 'labs') && (
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <caption className="sr-only">{tab === 'labs' ? 'Testing labs' : 'Facilities'}</caption>
            <thead>
              <tr className="border-b border-gold text-muted">
                <th scope="col" className="py-2.5 pr-4 font-medium">Name</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">{tab === 'labs' ? 'NABL certificate' : 'GMP licence'}</th>
                <th scope="col" className="py-2.5 pr-4 font-medium">Valid until</th>
                <th scope="col" className="py-2.5 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {(tab === 'labs' ? labs : facilities).map((s) => {
                const days = s.accreditationExpires ? differenceInDays(new Date(s.accreditationExpires), new Date()) : null
                const kind = tab === 'labs' ? 'lab' : 'facility'
                return (
                  <tr key={s.id} className={cn('border-b border-mist', s.archived && 'text-muted')}>
                    <th scope="row" className="py-3 pr-4 font-semibold text-graphite">{s.name} {s.archived && <Badge>Archived</Badge>}</th>
                    <td className="tabular py-3 pr-4 text-graphite">{s.accreditation}</td>
                    <td className="py-3 pr-4">
                      {s.accreditationExpires && <span className="tabular text-graphite">{format(new Date(s.accreditationExpires), 'd MMM yyyy')}</span>}
                      {days !== null && days < 240 && <span className={cn('ml-2 text-sm font-semibold', days < 60 ? 'text-error' : 'text-warning-ink')}>{days < 0 ? 'Expired' : `${days} days left`}</span>}
                    </td>
                    <td className="py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditingSite({ kind, site: s })}><Pencil aria-hidden="true" />Edit<span className="sr-only"> {s.name}</span></Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleSite(kind, s)}>
                        {s.archived ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />}
                        {s.archived ? 'Restore' : 'Archive'}<span className="sr-only"> {s.name}</span>
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProductDialog user={user} editing={editingProduct} onClose={() => setEditingProduct(null)} />
      <SiteDialog user={user} editing={editingSite} onClose={() => setEditingSite(null)} />
    </div>
  )
}
