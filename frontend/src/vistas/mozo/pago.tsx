import { useEffect, type ReactNode } from 'react'
import { mdiClose, mdiPlus } from '@mdi/js'
import { MAX_PAGOS_NOTA, type MedioPago, type Pago } from '@wasi/shared'
import { soles } from '../../lib/formato'
import { aCentimos, cuadrarPago, filaPagoVacia, type FilaPago } from '../../lib/pagos'
import { Desplegable } from '../../componentes/desplegable'
import { Icono, iconoMedio } from '../../componentes/icono'

export { aCentimos, cuadrarPago, filaPagoVacia, type FilaPago } from '../../lib/pagos'

/** Los billetes con que se suele pagar: se ofrecen los que alcanzan para la cuenta. */
const BILLETES = [10, 20, 50, 100, 200]

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
    <div className={`flex min-h-12 items-stretch border-b border-reja lg:min-h-11 ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-[15px] lg:text-[14px]">{etiqueta}</div>
      <div
        className={`flex w-[112px] shrink-0 items-center justify-end border-l border-reja px-2 text-[16px] tabular-nums ${compacto ? 'lg:text-[15px]' : 'lg:w-[90px] lg:text-[14px]'}`}
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
  const varios = filas.length > 1
  // Un solo pago cubre la cuenta entera, aunque la cuenta cambie (en el mostrador se sigue anotando).
  const unico = !varios && filas[0]?.metodo ? filas[0] : null
  useEffect(() => {
    if (unico && aCentimos(unico.monto) !== total) setFilas([{ ...unico, monto: (total / 100).toFixed(2) }])
  }, [unico, total, setFilas])
  // Al volver a un solo pago, ese paga toda la cuenta.
  const quitar = (clave: string) => {
    const quedan = filas.filter((x) => x.clave !== clave)
    setFilas(
      quedan.length === 1
        ? [
            {
              ...quedan[0],
              monto: quedan[0].metodo ? (total / 100).toFixed(2) : '',
            },
          ]
        : quedan,
    )
  }
  const campo =
    'h-12 w-full min-w-0 border border-reja-2 bg-hoja px-2.5 text-right text-[19px] font-medium tabular-nums outline-none placeholder:text-[16px] placeholder:font-normal placeholder:text-tinta-4 focus:border-azul lg:h-11 lg:text-[17px]'

  return (
    <div>
      <Renglon
        compacto={compacto}
        etiqueta={<span className="w-full text-right font-medium">Monto Total:</span>}
        monto={<b className="text-[19px] font-bold lg:text-[17px]">{soles(total)}</b>}
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
                    <Icono
                      d={iconoMedio({
                        clave: g.metodo,
                        nombre: nombre(g.metodo),
                      })}
                      className="size-[18px] text-tinta-2"
                    />
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
          {filas.map((f, i) => {
            const efectivo = !!medios.find((m) => m.clave === f.metodo)?.efectivo
            const importe = aCentimos(f.monto)
            const entregado = f.recibido.trim() ? aCentimos(f.recibido) : importe
            const insuficiente = efectivo && entregado < importe
            return (
              <section key={f.clave} role="group" aria-label={`Pago ${i + 1}`} className="border-b border-reja px-3 py-3">
                {varios && <b className="mb-1.5 block text-[14px] text-tinta-2 lg:text-[13px]">Pago {i + 1}</b>}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Desplegable
                      titulo="Tipo de pago"
                      valor={f.metodo}
                      opciones={opciones}
                      vacio="Tipo de pago…"
                      buscador={false}
                      estilo="campo"
                      className="h-12 text-[16px] lg:h-10 lg:text-[14px]"
                      alCambiar={(metodo) => {
                        const resto = restoPara(f.clave)
                        cambiar(f.clave, {
                          metodo,
                          monto: varios ? f.monto || (resto ? (resto / 100).toFixed(2) : '') : (total / 100).toFixed(2),
                          recibido: metodo === f.metodo ? f.recibido : '',
                        })
                      }}
                      ancho={220}
                    />
                  </div>
                  {varios && (
                    <button
                      type="button"
                      onClick={() => quitar(f.clave)}
                      title="Quitar este pago"
                      aria-label="Quitar este pago"
                      className="grid size-12 shrink-0 place-items-center text-tinta-3 hover:bg-rosa hover:text-rojo lg:size-10"
                    >
                      <Icono d={mdiClose} className="size-5" />
                    </button>
                  )}
                </div>
                {/* Con un solo pago se cobra el total: «A cobrar» aparece solo al repartir la cuenta. */}
                <div className={`mt-2.5 grid gap-3 ${efectivo && varios ? 'grid-cols-2' : 'grid-cols-1'} ${!efectivo && !varios ? 'hidden' : ''}`}>
                  <label className={`min-w-0 text-[14px] text-tinta-2 lg:text-[13px] ${varios ? '' : 'hidden'}`}>
                    <span className="mb-1 flex h-8 items-center justify-between gap-1">
                      <span>A cobrar (S/)</span>
                      <button
                        type="button"
                        onClick={() =>
                          cambiar(f.clave, {
                            monto: (restoPara(f.clave) / 100).toFixed(2),
                          })
                        }
                        title="Poner el saldo pendiente en este pago"
                        className="h-8 px-2 text-[13px] font-medium text-azul hover:bg-azul-suave lg:text-[12px]"
                      >
                        Saldo
                      </button>
                    </span>
                    <input
                      value={f.monto}
                      onChange={(e) =>
                        cambiar(f.clave, {
                          monto: e.target.value.replace(/[^\d.,]/g, '').slice(0, 9),
                        })
                      }
                      onFocus={(e) => e.target.select()}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label="Monto a cobrar"
                      className={campo}
                    />
                  </label>
                  {efectivo && (
                    <label className="min-w-0 text-[14px] text-tinta-2 lg:text-[13px]">
                      <span className="mb-1 flex h-8 items-center">Recibido (S/)</span>
                      <input
                        value={f.recibido}
                        onChange={(e) =>
                          cambiar(f.clave, {
                            recibido: e.target.value.replace(/[^\d.,]/g, '').slice(0, 9),
                          })
                        }
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
                  // Con qué billete paga: un toque en vez de teclear.
                  <div role="group" aria-label="Billete recibido" className="mt-2 flex flex-wrap gap-1.5">
                    {[null, ...BILLETES.filter((b) => b * 100 > importe)].slice(0, 5).map((b) => {
                      const valor = b === null ? '' : String(b)
                      const elegido = b === null ? !f.recibido.trim() : aCentimos(f.recibido) === b * 100
                      return (
                        <button
                          key={b ?? 'exacto'}
                          type="button"
                          aria-pressed={elegido}
                          onClick={() => cambiar(f.clave, { recibido: valor })}
                          className={`h-11 min-w-[60px] flex-1 border px-2 text-[15px] font-medium tabular-nums lg:h-9 lg:text-[13.5px] ${
                            elegido ? 'border-verde-2 bg-menta-suave text-verde-2' : 'border-reja-2 bg-hoja text-tinta hover:bg-gris-50'
                          }`}
                        >
                          {b === null ? 'Exacto' : `S/ ${b}`}
                        </button>
                      )
                    })}
                  </div>
                )}
                {efectivo && importe > 0 && (
                  <p
                    aria-live="polite"
                    className={`mt-2 px-2.5 py-2.5 text-[16px] font-medium tabular-nums lg:py-2 lg:text-[14px] ${insuficiente ? 'bg-rosa text-rojo-oscuro' : 'bg-menta-suave text-verde-2'}`}
                  >
                    {insuficiente
                      ? `Faltan S/ ${soles(importe - entregado)}${varios ? ' en este pago' : ''}`
                      : `Vuelto${varios ? ' de este pago' : ''}: S/ ${soles(entregado - importe)}`}
                  </p>
                )}
              </section>
            )
          })}
          {filas.length < MAX_PAGOS_NOTA && (
            <button
              type="button"
              onClick={() => setFilas([...filas, filaPagoVacia()])}
              title="Dividir la cuenta: otra persona u otro medio"
              className="flex h-12 w-full items-center justify-center gap-2 border-b border-reja text-[15px] font-medium text-azul hover:bg-azul-suave lg:h-10 lg:text-[14px]"
            >
              <Icono d={mdiPlus} className="size-5" />
              Otro pago
            </button>
          )}
          <ResultadoPago c={c} compacto={compacto} varios={varios} />
        </>
      )}
    </div>
  )
}

/** El cuadre de la cuenta repartida. Con un solo pago basta lo que se ve junto al pago (salvo un error). */
function ResultadoPago({ c, compacto, varios }: { c: ReturnType<typeof cuadrarPago>; compacto: boolean; varios: boolean }) {
  if (c.error)
    return (
      <Renglon
        compacto={compacto}
        className="bg-rosa"
        etiqueta={
          <span role="status" className="text-[14px] font-medium text-rojo-oscuro lg:text-[13px]">
            {c.error}
          </span>
        }
      />
    )
  if (!c.usadas.length || !varios) return null
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
