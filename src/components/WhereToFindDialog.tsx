import React from 'react'
import { HelpCircle } from 'lucide-react'
import { Dialog, DialogTrigger, DialogContent } from './ui/dialog'
import { PRODUCTS } from '../data/products'

export function WhereToFindDialog() {
  return (
    <Dialog>
      <DialogTrigger className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-burgundy underline decoration-1 underline-offset-4 hover:decoration-2">
        <HelpCircle className="size-4" aria-hidden="true" />
        Where do I find the batch number?
      </DialogTrigger>
      <DialogContent title="Finding your batch number" description="It’s always printed, never on a sticker.">
        <div className="grid gap-6 sm:grid-cols-3">
          <Spot image={PRODUCTS.FR.image} title="Bottles" text="On the base of the bottle, printed beside “EXP”." />
          <Spot image={PRODUCTS.CN.image} title="Sachet pouches" text="On the back, in the crimped strip above the barcode." />
          <Spot image={PRODUCTS.PD.image} title="Tubs" text="Under the lid rim, next to the manufacturing date." />
        </div>
        <div className="mt-6 border-t border-mist pt-4 text-sm text-graphite">
          <p>
            Bodylia codes start with <strong className="tabular">BDL-</strong>, then a two-letter product code, the year and month
            of manufacture, and four digits — for example <strong className="tabular">BDL-FR-2509-0312</strong>.
          </p>
          <p className="mt-2 text-muted">Some packs also carry the vendor&apos;s own lot code (e.g. FR-2509-312) — that verifies too. Enter whichever is printed most clearly.</p>
          <p className="mt-2 text-muted">Can’t read it? Letters O and I are never used — they’re always zero and one.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Spot({ image, title, text }: { image: string; title: string; text: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex h-32 items-end justify-center rounded-md bg-sand p-3">
        <img src={image} alt="" className="max-h-full w-auto" />
      </div>
      <h3 className="mt-3 font-semibold text-graphite">{title}</h3>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  )
}
