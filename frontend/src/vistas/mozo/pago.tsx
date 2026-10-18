import type { ReactNode } from 'react'
import { mdiClose, mdiPlus } from '@mdi/js'
import type { MedioPago, Pago } from '@wasi/shared'
import { soles } from '../../lib/formato'
import { Desplegable } from '../../componentes/desplegable'
import { Icono, iconoMedio } from '../../componentes/icono'

/**
 * El pie de la nota, fila por fila como en el Excel:
 *   Monto Total:                     26,00
 *   Tipo y Monto de Pago: [Yape ▾]   20,00
 *   Vuelto / Debe                     6,00
 * Los pagos electrónicos van exactos; el efectivo cubre lo que falta y lo
 * que sobra es vuelto (la misma regla que aplica el servidor al cobrar).
 */

export interface FilaPago {
  clave: string
  metodo: string | null
  /** Lo que se escribió, tal cual: «50», «12.5», «12,50». */
  monto: string
}

export const filaPagoVacia = (): FilaPago => ({ clave: crypto.randomUUID(), metodo: null, monto: '' })

/** «12,5» → 1250 céntimos. Vacío o inválido → 0. */
export function aCentimos(texto: string) {
  const n = Number(texto.replace(',', '.').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function cuadrarPago(total: number, filas: FilaPago[], medios: MedioPago[]) {
  const usadas = filas.filter((f) => f.metodo && aCentimos(f.monto) > 0)
  const esEfectivo = (clave: string | null) => !!medios.find((m) => m.clave === clave)?.efectivo
  const electronico = usadas.filter((f) => !esEfectivo(f.metodo)).reduce((s, f) => s + aCentimos(f.monto), 0)
  const efectivo = usadas.filter((f) => esEfectivo(f.metodo)).reduce((s, f) => s + aCentimos(f.monto), 0)
  const falta = total - electronico
  return {
    usadas,
    /** Un pago electrónico no puede pasarse del total: no hay vuelto por Yape. */
    excedeElectronico: electronico > total,
    vuelto: falta >= 0 && efectivo > falta ? efectivo - falta : 0,
    debe: Math.max(0, falta - efectivo),
  }
}

/**
 * Un renglón del pie: la etiqueta ocupa el ancho de la tabla y el monto cae
 * bajo la columna «Subtotal:»; en pantalla grande queda debajo la columna
 * «Estado:» para quitar un pago.
 */
function Renglon({ etiqueta, monto, cola, className = '' }: { etiqueta: ReactNode; monto?: ReactNode; cola?: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-11 items-stretch border-b border-reja ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-[14px]">{etiqueta}</div>
      <div className="flex w-[112px] shrink-0 items-center justify-end border-l border-reja px-2 text-[15px] tabular-nums lg:w-[90px] lg:text-[14px]">{monto}</div>
      <div className="hidden w-[124px] shrink-0 items-center border-l border-reja px-1.5 lg:flex">{cola}</div>
    </div>
  )
}

export function PieNota({
  total,
  filas,
  setFilas,
  medios,
  pagos,
  pagado,
}: {
  total: number
  filas: FilaPago[]
  setFilas: (f: FilaPago[]) => void
  medios: MedioPago[]
  /** Lo ya cobrado: la nota pagada muestra sus pagos y no se vuelve a cobrar. */
  pagos: Pago[]
  pagado: boolean
}) {
  const c = cuadrarPago(total, filas, medios)
  const opciones = medios.map((m) => ({ valor: m.clave, etiqueta: m.nombre, icono: iconoMedio(m) }))
  const nombre = (clave: string) => medios.find((m) => m.clave === clave)?.nombre ?? clave
  const cambiar = (clave: string, parcial: Partial<FilaPago>) => setFilas(filas.map((f) => (f.clave === clave ? { ...f, ...parcial } : f)))
  const restoPara = (clave: string) => Math.max(0, total - filas.filter((x) => x.clave !== clave).reduce((s, x) => s + aCentimos(x.monto), 0))
  const vuelto = pagos.reduce((s, g) => s + Math.max(0, (g.recibido ?? g.monto) - g.monto), 0)

  return (
    <div>
      <Renglon
        etiqueta={<span className="w-full text-right font-medium lg:text-center">Monto Total:</span>}
        monto={<b className="text-[17px] font-bold lg:text-[15px]">{soles(total)}</b>}
      />

      {pagado ? (
        <>
          {pagos.map((g) => (
            <Renglon
              key={g.id}
              etiqueta={
                <>
                  <span className="hidden text-tinta-2 sm:inline">Tipo y Monto de Pago:</span>
                  <Icono d={iconoMedio({ clave: g.metodo, nombre: nombre(g.metodo) })} className="size-[18px] text-tinta-2" />
                  <b className="font-medium">{nombre(g.metodo)}</b>
                  {g.recibido !== null && g.recibido > g.monto && <span className="text-[13px] text-tinta-3">· recibido {soles(g.recibido)}</span>}
                </>
              }
              monto={soles(g.monto)}
            />
          ))}
          {vuelto > 0 && (
            <Renglon
              className="bg-menta-suave"
              etiqueta={<span className="w-full text-right font-medium text-verde-2 lg:text-center">Vuelto</span>}
              monto={<b className="text-verde-2">{soles(vuelto)}</b>}
            />
          )}
        </>
      ) : (
        <>
          {filas.map((f, i) => {
            const quitar =
              filas.length > 1 ? (
                <button onClick={() => setFilas(filas.filter((x) => x.clave !== f.clave))} title="Quitar este pago" aria-label="Quitar este pago" className="grid size-8 shrink-0 place-items-center text-tinta-3 hover:bg-rosa hover:text-rojo">
                  <Icono d={mdiClose} className="size-[18px]" />
                </button>
              ) : null
            return (
              <Renglon
                key={f.clave}
                etiqueta={
                  <>
                    <span className="hidden shrink-0 text-tinta-2 sm:inline">Tipo y Monto de Pago:</span>
                    <span className="w-full max-w-[240px] min-w-0">
                      <Desplegable
                        titulo="Tipo de pago"
                        valor={f.metodo}
                        opciones={opciones}
                        vacio="Tipo de pago…"
                        buscador={false}
                        alCambiar={(metodo) => {
                          // Al elegir el medio se propone lo que falta: casi siempre es eso.
                          const resto = restoPara(f.clave)
                          cambiar(f.clave, { metodo, monto: f.monto || (resto ? (resto / 100).toFixed(2) : '') })
                        }}
                        ancho={220}
                      />
                    </span>
                    {f.metodo && (
                      <button
                        onClick={() => cambiar(f.clave, { monto: (restoPara(f.clave) / 100).toFixed(2) })}
                        title="Poner el monto exacto que falta"
                        className="h-8 shrink-0 border border-reja-2 px-2 text-[12.5px] text-tinta-2 hover:border-verde-2 hover:text-verde-2"
                      >
                        Exacto
                      </button>
                    )}
                    {i === filas.length - 1 && filas.length < 4 && f.metodo && (
                      <button onClick={() => setFilas([...filas, filaPagoVacia()])} title="Repartir la cuenta entre dos medios" className="flex h-8 shrink-0 items-center gap-1 px-1.5 text-[13px] text-azul hover:bg-azul-suave">
                        <Icono d={mdiPlus} className="size-4" />
                        <span className="hidden sm:inline">Otro pago</span>
                      </button>
                    )}
                    <span className="lg:hidden">{quitar}</span>
                  </>
                }
                monto={
                  <input
                    value={f.monto}
                    onChange={(e) => cambiar(f.clave, { monto: e.target.value.replace(/[^\d.,]/g, '').slice(0, 9) })}
                    onFocus={(e) => e.target.select()}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label="Monto recibido"
                    className="h-[30px] w-full min-w-0 border border-reja-2 bg-hoja px-2 text-right text-[15px] tabular-nums outline-none placeholder:text-tinta-4 focus:border-azul lg:text-[14px]"
                  />
                }
                cola={quitar}
              />
            )
          })}
          <ResultadoPago c={c} />
        </>
      )}
    </div>
  )
}

/** El renglón que el Excel calculaba con una fórmula: «Vuelto», «Debe» o nada. */
function ResultadoPago({ c }: { c: ReturnType<typeof cuadrarPago> }) {
  if (!c.usadas.length) {
    return <Renglon etiqueta={<span className="w-full text-right text-[13px] text-tinta-3 lg:text-center">Elige el tipo de pago cuando el cliente pague</span>} />
  }
  if (c.excedeElectronico) {
    return <Renglon className="bg-rosa" etiqueta={<span className="w-full text-right font-medium text-rojo-oscuro lg:text-center">El pago electrónico supera el total</span>} />
  }
  const debe = c.debe > 0
  const tono = debe ? 'text-rojo-oscuro' : 'text-verde-2'
  return (
    <Renglon
      className={debe ? 'bg-rosa' : c.vuelto ? 'bg-menta-suave' : ''}
      etiqueta={<span className={`w-full text-right font-medium lg:text-center ${tono}`}>{debe ? 'Debe' : c.vuelto ? 'Vuelto' : 'Pago completo'}</span>}
      monto={<b className={tono}>{debe ? soles(c.debe) : c.vuelto ? soles(c.vuelto) : ''}</b>}
    />
  )
}
