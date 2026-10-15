import React from 'react'
import { PRODUCTS } from '../data/products'

/** Decorative arrangement of the six supplied pack shots on a sand plinth. */
export function ProductLineup() {
  const back = [PRODUCTS.CN, PRODUCTS.PD]
  const front = [PRODUCTS.FR, PRODUCTS.FN, PRODUCTS.MB, PRODUCTS.PH]

  return (
    <figure className="relative mx-auto w-full max-w-[560px]" aria-hidden="true">
      <div className="relative flex items-end justify-center gap-0 px-2">
        {back.map((p, i) => (
          <img
            key={p.code}
            src={p.image}
            alt=""
            className={
              i === 0
                ? 'relative z-0 -mr-6 w-[38%] translate-y-2 drop-shadow-[0_12px_18px_rgba(61,28,43,0.12)]'
                : 'relative z-0 -ml-6 w-[34%] translate-y-1 drop-shadow-[0_12px_18px_rgba(61,28,43,0.12)]'
            }
          />
        ))}
      </div>
      <div className="relative z-10 -mt-[22%] flex items-end justify-center px-4">
        {front.map((p) => (
          <img
            key={p.code}
            src={p.image}
            alt=""
            className="-mx-2 w-[27%] drop-shadow-[0_10px_14px_rgba(61,28,43,0.14)]"
          />
        ))}
      </div>
      <div className="relative z-0 -mt-3 h-7 rounded-[50%] bg-sand ring-1 ring-mist sm:h-9" />
    </figure>
  )
}
