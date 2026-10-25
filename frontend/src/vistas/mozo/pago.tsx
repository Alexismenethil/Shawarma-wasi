import type { ReactNode } from 'react'
import { mdiClose, mdiPlus } from '@mdi/js'
import { MAX_PAGOS_NOTA, type MedioPago, type Pago } from '@wasi/shared'
import { soles } from '../../lib/formato'
import { aCentimos, cuadrarPago, filaPagoVacia, type FilaPago } from '../../lib/pagos'
import { Desplegable } from '../../componentes/desplegable'
import { Icono, iconoMedio } from '../../componentes/icono'

export { aCentimos, cuadrarPago, filaPagoVacia, type FilaPago } from '../../lib/pagos'

export function Renglon({
  etiqueta,
  monto,
  cola,
  compacto = false,
  className = '',
}: {
  etiqueta: ReactNode
  monto?: ReactNode
  cola?: ReactNode
  compacto?: boolean
  className?: string
}) {
  return (
    <div className={`flex min-h-11 items-stretch border-b border-reja ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-[14px]">{etiqueta}</div>
      <div
        className={`flex w-[112px] shrink-0 items-center justify-end border-l border-reja px-2 text-[15px] tabular-nums ${compacto ? '' : 'lg:w-[90px] lg:text-[14px]'}`}
      >
        {monto}
      </div>
      {!compacto && <div className="hidden w-[124px] shrink-0 items-center border-l border-reja px-1.5 lg:flex">{cola}</div>}
    </div>
  )
}

/** El mismo formulario sirve en caja, mostrador y corrección de pagos. */
export function PieNota({
  total,
  filas,
  setFilas,
  medios,
  pagos,
  pagado,
  sinCobro,
  compacto = false,
}: {
  total: number
  filas: FilaPago[]
  setFilas: (f: FilaPago[]) => void
  medios: MedioPago[]
  pagos: Pago[]
  pagado: boolean
  sinCobro?: ReactNode
  compacto?: boolean
}) {
  const c = cuadrarPago(total, filas, medios)
  const opciones = medios.filter((m) => m.activo).map((m) => ({ valor: m.clave, etiqueta: m.nombre, icono: iconoMedio(m) }))
  const nombre = (clave: string) => medios.find((m) => m.clave === clave)?.nombre ?? clave
  const cambiar = (clave: string, parcial: Partial<FilaPago>) => setFilas(filas.map((f) => (f.clave === clave ? { ...f, ...parcial } : f)))
  const restoPara = (clave: string) => Math.max(0, total - filas.filter((x) => x.clave !== clave && x.metodo).reduce((s, x) => s + aCentimos(x.monto), 0))
  const vuelto = pagos.reduce((s, g) => s + Math.max(0, (g.recibido ?? g.monto) - g.monto), 0)
  const campo =
    'h-11 w-full min-w-0 border border-reja-2 bg-hoja px-2 text-right text-[16px] tabular-nums outline-none placeholder:text-tinta-4 focus:border-azul'

  return (
    <div>
      <Renglon
        compacto={compacto}
        etiqueta={<span className="w-full text-right font-medium">Monto Total:</span>}
        monto={<b className="text-[17px] font-bold">{soles(total)}</b>}
      />
      {pagado ? (
        <>
          {pagos.map((g, i) => (
            <Renglon
              key={g.id}
              compacto={compacto}
              etiqueta={
                <div className="min-w-0 py-1">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-tinta-3">Pago {i + 1}</span>
                    <Icono d={iconoMedio({ clave: g.metodo, nombre: nombre(g.metodo) })} className="size-[18px] text-tinta-2" />
                    <b className="font-medium">{nombre(g.metodo)}</b>
                  </p>
                  {g.recibido !== null && (
                    <p className="mt-1 text-[13px] text-tinta-2">
                      Recibido S/ {soles(g.recibido)} · Vuelto S/ {soles(Math.max(0, g.recibido - g.monto))}
                    </p>
                  )}
                </div>
              }
              monto={soles(g.monto)}
            />
          ))}
          {vuelto > 0 && (
            <Renglon
              compacto={compacto}
              className="bg-menta-suave"
              etiqueta={<span className="w-full text-right font-medium text-verde-2">Vuelto total</span>}
              monto={<b className="text-verde-2">{soles(vuelto)}</b>}
            />
          )}
        </>
      ) : sinCobro ? (
        sinCobro
      ) : (
        <>
          <p className="border-b border-reja bg-gris-50 px-3 py-2 text-[13px] leading-relaxed text-tinta-2">
            Un pago por persona o medio. <b>A cobrar</b> es su parte de la cuenta; en efectivo, indica cuánto entrega en <b>Recibido</b>. Si paga exacto, déjalo
            vacío.
          </p>
          {filas.map((f, i) => {
            const efectivo = !!medios.find((m) => m.clave === f.metodo)?.efectivo
            const importe = aCentimos(f.monto)
            const entregado = f.recibido.trim() ? aCentimos(f.recibido) : importe
            const insuficiente = efectivo && entregado < importe
            return (
              <section key={f.clave} role="group" aria-label={`Pago ${i + 1}`} className="border-b border-reja px-3 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <b className="shrink-0 text-[13px] text-tinta-2">Pago {i + 1}</b>
                  <div className="min-w-0 flex-1">
                    <Desplegable
                      titulo="Tipo de pago"
                      valor={f.metodo}
                      opciones={opciones}
                      vacio="Tipo de pago…"
                      buscador={false}
                      alCambiar={(metodo) => {
                        const resto = restoPara(f.clave)
                        cambiar(f.clave, { metodo, monto: f.monto || (resto ? (resto / 100).toFixed(2) : ''), recibido: metodo === f.metodo ? f.recibido : '' })
                      }}
                      ancho={220}
                    />
                  </div>
                  {filas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFilas(filas.filter((x) => x.clave !== f.clave))}
                      title="Quitar este pago"
                      aria-label="Quitar este pago"
                      className="grid size-11 shrink-0 place-items-center text-tinta-3 hover:bg-rosa hover:text-rojo"
                    >
                      <Icono d={mdiClose} className="size-5" />
                    </button>
                  )}
                </div>
                <div className={`grid gap-3 ${efectivo ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <label className="min-w-0 text-[13px] text-tinta-2">
                    <span className="mb-1 flex h-7 items-center justify-between gap-1">
                      <span>A cobrar (S/)</span>
                      <button
                        type="button"
                        onClick={() => cambiar(f.clave, { monto: (restoPara(f.clave) / 100).toFixed(2) })}
                        title="Poner el saldo pendiente en este pago"
                        className="h-7 px-1 text-[12px] font-medium text-azul hover:bg-azul-suave"
                      >
                        Saldo
                      </button>
                    </span>
                    <input
                      value={f.monto}
                      onChange={(e) => cambiar(f.clave, { monto: e.target.value.replace(/[^\d.,]/g, '').slice(0, 9) })}
                      onFocus={(e) => e.target.select()}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label="Monto a cobrar"
                      className={campo}
                    />
                  </label>
                  {efectivo && (
                    <label className="min-w-0 text-[13px] text-tinta-2">
                      <span className="mb-1 flex h-7 items-center">Recibido (S/)</span>
                      <input
                        value={f.recibido}
                        onChange={(e) => cambiar(f.clave, { recibido: e.target.value.replace(/[^\d.,]/g, '').slice(0, 9) })}
                        onFocus={(e) => e.target.select()}
                        inputMode="decimal"
                        placeholder={`Exacto: ${soles(importe)}`}
                        aria-label="Monto recibido"
                        aria-invalid={insuficiente || undefined}
                        className={campo}
                      />
                    </label>
                  )}
                </div>
                {efectivo && importe > 0 && (
                  <p
                    aria-live="polite"
                    className={`mt-2 px-2 py-2 text-[14px] font-medium tabular-nums ${insuficiente ? 'bg-rosa text-rojo-oscuro' : 'bg-menta-suave text-verde-2'}`}
                  >
                    {insuficiente ? `Faltan S/ ${soles(importe - entregado)} en este pago` : `Vuelto de este pago: S/ ${soles(entregado - importe)}`}
                  </p>
                )}
              </section>
            )
          })}
          {filas.length < MAX_PAGOS_NOTA && (
            <div className="border-b border-reja px-3 py-2">
              <button
                type="button"
                onClick={() => setFilas([...filas, filaPagoVacia()])}
                className="flex h-11 w-full items-center justify-center gap-2 border border-reja-2 text-[14px] font-medium text-azul hover:bg-azul-suave"
              >
                <Icono d={mdiPlus} className="size-5" />
                Otro pago
              </button>
            </div>
          )}
          <ResultadoPago c={c} compacto={compacto} />
        </>
      )}
    </div>
  )
}

function ResultadoPago({ c, compacto }: { c: ReturnType<typeof cuadrarPago>; compacto: boolean }) {
  if (c.error)
    return (
      <Renglon
        compacto={compacto}
        className="bg-rosa"
        etiqueta={
          <span role="status" className="text-[13px] font-medium text-rojo-oscuro">
            {c.error}
          </span>
        }
      />
    )
  if (!c.usadas.length)
    return <Renglon compacto={compacto} etiqueta={<span className="text-[13px] text-tinta-3">Elige el medio e indica cuánto paga cada persona.</span>} />
  return (
    <>
      <Renglon
        compacto={compacto}
        className={c.debe > 0 ? 'bg-rosa' : 'bg-menta-suave'}
        etiqueta={
          <span className={`w-full text-right font-medium ${c.debe > 0 ? 'text-rojo-oscuro' : 'text-verde-2'}`}>
            {c.debe > 0 ? 'Falta repartir' : 'Pago completo'}
          </span>
        }
        monto={<b className={c.debe > 0 ? 'text-rojo-oscuro' : 'text-verde-2'}>{c.debe > 0 ? soles(c.debe) : soles(c.aplicado)}</b>}
      />
      {c.vuelto > 0 && (
        <Renglon
          compacto={compacto}
          className="bg-menta-suave"
          etiqueta={<span className="w-full text-right font-medium text-verde-2">Vuelto total</span>}
          monto={<b className="text-verde-2">{soles(c.vuelto)}</b>}
        />
      )}
    </>
  )
}

/** Confirmación con el mismo desglose que se guardará y aparecerá en el ticket. */
export function ResumenPagos({ c, medios }: { c: ReturnType<typeof cuadrarPago>; medios: MedioPago[] }) {
  return (
    <div className="space-y-2">
      {c.pagos.map((p, i) => {
        const medio = medios.find((m) => m.clave === p.metodo)
        return (
          <div key={i} className="border border-reja bg-gris-50 px-3 py-2 text-[14px]">
            <p className="font-medium">
              Pago {i + 1} · {medio?.nombre ?? p.metodo} · A cobrar S/ {soles(p.monto)}
            </p>
            {medio?.efectivo && (
              <p className="mt-1 text-tinta-2">
                Recibido S/ {soles(p.recibido)} · Vuelto S/ {soles(p.recibido - p.monto)}
              </p>
            )}
          </div>
        )
      })}
      {c.vuelto > 0 && <p className="font-medium text-verde-2">Vuelto: S/ {soles(c.vuelto)} en total. Entrega a cada persona el vuelto de su pago.</p>}
    </div>
  )
}
