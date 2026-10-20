import { mdiCash, mdiCircleMultiple } from '@mdi/js'
import type { Conteo } from '@wasi/shared'
import { DENOMINACIONES, sumarConteo } from '@wasi/shared'
import { soles } from '../../lib/formato'
import { Icono } from '../../componentes/icono'

/** «S/ 200», «S/ 5», «S/ 0.50». */
export const denominacion = (centimos: number) => `S/ ${centimos >= 100 ? centimos / 100 : (centimos / 100).toFixed(2)}`

/**
 * El conteo del cajón, billete por billete, como la hoja de arqueo en papel:
 * cuántos de S/ 200, cuántos de S/ 100… y el sistema hace las sumas.
 */
export function ConteoEfectivo({ conteo, alCambiar }: { conteo: Conteo; alCambiar?: (c: Conteo) => void }) {
  const total = sumarConteo(conteo)
  const piezas = DENOMINACIONES.reduce((s, d) => s + (conteo[d.valor] ?? 0), 0)
  const fila = 'grid grid-cols-[minmax(0,1.1fr)_84px_minmax(0,1fr)] items-stretch border-b border-reja'

  return (
    <div className="border border-reja bg-hoja" role="table" aria-label="Conteo de billetes y monedas">
      <div className={`${fila} cabecera border-b-0`} role="row">
        <span className="flex h-9 items-center px-3" role="columnheader">
          Billete o moneda
        </span>
        <span className="flex h-9 items-center justify-center border-x border-white/15" role="columnheader">
          Cantidad
        </span>
        <span className="flex h-9 items-center justify-end px-3" role="columnheader">
          Importe
        </span>
      </div>
      {DENOMINACIONES.map((d, i) => {
        const cantidad = conteo[d.valor] ?? 0
        const nombre = `${d.tipo === 'Billete' ? 'Billetes' : 'Monedas'} de ${denominacion(d.valor)}`
        return (
          <div key={d.valor} className={`${fila} ${i === 5 ? 'border-t border-t-reja-2' : ''} ${cantidad ? 'bg-menta-suave' : ''}`} role="row">
            <span className="flex h-10 items-center gap-2 px-3 text-[14px]" role="cell">
              <Icono d={d.tipo === 'Billete' ? mdiCash : mdiCircleMultiple} className={`size-[18px] ${d.tipo === 'Billete' ? 'text-verde-2' : 'text-ambar-oscuro'}`} />
              <span className="text-tinta-3">{d.tipo}</span>
              <b className="font-medium tabular-nums">{denominacion(d.valor)}</b>
            </span>
            <span className="border-x border-reja" role="cell">
              {alCambiar ? (
                <input
                  value={cantidad || ''}
                  onChange={(e) => {
                    const n = Math.min(99999, Number(e.target.value.replace(/\D/g, '')) || 0)
                    alCambiar({ ...conteo, [d.valor]: n })
                  }}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  placeholder="0"
                  aria-label={nombre}
                  className="h-full w-full bg-campo/40 px-2 text-center text-[15px] tabular-nums outline-none placeholder:text-tinta-4 focus:bg-hoja focus:shadow-[inset_0_0_0_2px_var(--color-azul)]"
                />
              ) : (
                <span className="flex h-full items-center justify-center tabular-nums">{cantidad || ''}</span>
              )}
            </span>
            <span className="flex items-center justify-end px-3 text-[14px] tabular-nums" role="cell">
              {cantidad ? soles(d.valor * cantidad) : <span className="text-tinta-4">—</span>}
            </span>
          </div>
        )
      })}
      <div className={`${fila} border-b-0 bg-gris-100 font-medium`} role="row">
        <span className="flex h-10 items-center px-3" role="cell">
          Total contado
        </span>
        <span className="flex items-center justify-center border-x border-reja text-tinta-2 tabular-nums" role="cell">
          {piezas || ''}
        </span>
        <span className="flex items-center justify-end px-3 text-[15px] tabular-nums" role="cell">
          S/ {soles(total)}
        </span>
      </div>
    </div>
  )
}
