import { useState } from 'react'
import { mdiArrowDownBold, mdiArrowUpBold, mdiDelete, mdiPlus, mdiSwapVertical } from '@mdi/js'
import type { ArqueoCaja } from '@wasi/shared'
import { esJefe } from '@wasi/shared'
import { huella, idAlAzar } from '../../lib/azar'
import { api } from '../../lib/api'
import { useSesion } from '../../lib/sesion'
import { hora, soles } from '../../lib/formato'
import { avisar } from '../../componentes/avisos'
import { Boton } from '../../componentes/boton'
import { confirmar } from '../../componentes/dialogo'
import { Icono } from '../../componentes/icono'
import { aCentimos } from '../mozo/pago'

/** Lo que más se anota: la lista se ofrece al escribir el concepto. */
const CONCEPTOS = ['Compra de gas', 'Pago al proveedor', 'Compra de insumos', 'Pan del día', 'Movilidad', 'Sencillo para vuelto', 'Adelanto de sueldo']

/**
 * Ingresos y egresos: el dinero que entra o sale del cajón sin ser una venta
 * (la compra de gas, el pago al proveedor, más sencillo). Sin anotarlos, el
 * arqueo nunca cuadraría.
 */
export function Movimientos({ caja }: { caja: ArqueoCaja }) {
  const sesion = useSesion()
  const [tipo, setTipo] = useState<'EGRESO' | 'INGRESO'>('EGRESO')
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')
  const [guardando, setGuardando] = useState(false)
  // Este formulario lleno: si «Anotar» se pulsa otra vez tras un corte, el egreso no se anota dos veces.
  const [formulario, setFormulario] = useState(idAlAzar)
  const centimos = aCentimos(monto)
  const valido = centimos > 0 && concepto.trim().length > 0

  const registrar = async () => {
    if (!valido) return
    setGuardando(true)
    try {
      const cuerpo = { tipo, monto: centimos, concepto: concepto.trim() }
      await api('/caja/movimientos', { cuerpo, clave: `mov-${formulario}-${huella(JSON.stringify(cuerpo))}` })
      avisar(`${tipo === 'EGRESO' ? 'Egreso' : 'Ingreso'} de S/ ${soles(centimos)} anotado`, 'ok')
      setMonto('')
      setConcepto('')
      setFormulario(idAlAzar())
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  const quitar = async (id: number, texto: string) => {
    if (!(await confirmar({ titulo: 'Quitar movimiento', mensaje: `¿Quitar «${texto}»? El arqueo se recalcula.`, aceptar: 'Quitar', peligro: true }))) return
    try {
      await api(`/caja/movimientos/${id}`, { metodo: 'DELETE' })
      avisar('Movimiento quitado', 'ok')
    } catch (e) {
      avisar((e as Error).message, 'error')
    }
  }

  const puedeQuitar = (usuarioId: number) => !!sesion && (sesion.usuario.id === usuarioId || esJefe(sesion.usuario.rol))

  return (
    <div className="mx-auto grid max-w-[1000px] gap-4 sm:px-4 sm:py-4">
      <section className="hoja sombra-hoja">
        <div className="flex items-center gap-2 border-b border-reja px-3 py-2.5">
          <Icono d={mdiSwapVertical} className="size-5 text-azul-oscuro" />
          <h2 className="text-[15.5px] font-bold">Anotar un ingreso o egreso de caja</h2>
        </div>
        <form
          className="grid gap-3 p-3 sm:grid-cols-[auto_150px_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            void registrar()
          }}
        >
          <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-2 border border-reja-2">
            {(['EGRESO', 'INGRESO'] as const).map((t) => (
              <button
                type="button"
                key={t}
                role="radio"
                aria-checked={tipo === t}
                onClick={() => setTipo(t)}
                className={`flex h-10 items-center justify-center gap-1.5 px-3 text-[14px] ${
                  tipo === t ? (t === 'EGRESO' ? 'bg-rojo-oscuro font-medium text-white' : 'bg-verde-2 font-medium text-white') : 'bg-hoja text-tinta-2 hover:bg-gris-50'
                }`}
              >
                <Icono d={t === 'EGRESO' ? mdiArrowUpBold : mdiArrowDownBold} className="size-4" />
                {t === 'EGRESO' ? 'Sale' : 'Entra'}
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-[12.5px] text-tinta-2">
            Monto (S/)
            <input
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, '').slice(0, 8))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Monto"
              className="campo h-10 text-right text-[15px] tabular-nums"
            />
          </label>
          <label className="grid gap-1 text-[12.5px] text-tinta-2">
            Concepto
            <input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value.slice(0, 80))}
              list="conceptos-caja"
              placeholder={tipo === 'EGRESO' ? 'Ej. Compra de gas' : 'Ej. Sencillo para vuelto'}
              aria-label="Concepto"
              className="campo h-10"
            />
          </label>
          <Boton type="submit" variante={tipo === 'EGRESO' ? 'peligro' : 'guardar'} icono={mdiPlus} disabled={!valido} cargando={guardando} className="h-10">
            Anotar
          </Boton>
          <datalist id="conceptos-caja">
            {CONCEPTOS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </form>
      </section>

      <section className="hoja sombra-hoja">
        <div className="cabecera grid h-9 grid-cols-[60px_minmax(0,1fr)_96px_48px] sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,0.5fr)_110px_48px]">
          <span className="flex items-center justify-center border-r border-white/15">Hora</span>
          <span className="flex items-center border-r border-white/15 px-2">Concepto</span>
          <span className="hidden items-center border-r border-white/15 px-2 sm:flex">Anotó</span>
          <span className="flex items-center justify-end border-r border-white/15 px-2">Monto</span>
          <span />
        </div>
        {caja.movimientos.length === 0 ? (
          <p className="px-4 py-10 text-center text-[14px] text-tinta-3">Sin ingresos ni egresos en este turno.</p>
        ) : (
          caja.movimientos.map((m) => (
            <div key={m.id} className="grid min-h-11 grid-cols-[60px_minmax(0,1fr)_96px_48px] items-center border-b border-reja text-[14px] sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,0.5fr)_110px_48px]">
              <span className="text-center text-[13px] text-tinta-2 tabular-nums">{hora(m.creadoEn)}</span>
              <span className="flex min-w-0 items-center gap-2 px-2">
                <Icono d={m.tipo === 'EGRESO' ? mdiArrowUpBold : mdiArrowDownBold} className={`size-4 shrink-0 ${m.tipo === 'EGRESO' ? 'text-rojo' : 'text-verde-2'}`} />
                <span className="truncate">{m.concepto}</span>
              </span>
              <span className="hidden truncate px-2 text-tinta-2 sm:block">{m.usuario}</span>
              <b className={`px-2 text-right font-medium tabular-nums ${m.tipo === 'EGRESO' ? 'text-rojo-oscuro' : 'text-verde-3'}`}>
                {m.tipo === 'EGRESO' ? '−' : '+'}
                {soles(m.monto)}
              </b>
              {puedeQuitar(m.usuarioId) ? (
                <button onClick={() => void quitar(m.id, m.concepto)} title="Quitar" aria-label={`Quitar ${m.concepto}`} className="mx-auto grid size-9 place-items-center text-tinta-3 hover:bg-rosa hover:text-rojo">
                  <Icono d={mdiDelete} className="size-[18px]" />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))
        )}
        <div className="grid grid-cols-2 bg-gris-100 text-[13.5px]">
          <span className="flex h-10 items-center gap-1.5 border-r border-reja px-3">
            <Icono d={mdiArrowDownBold} className="size-4 text-verde-2" /> Entró <b className="ml-auto font-medium tabular-nums">{soles(caja.ingresos)}</b>
          </span>
          <span className="flex h-10 items-center gap-1.5 px-3">
            <Icono d={mdiArrowUpBold} className="size-4 text-rojo" /> Salió <b className="ml-auto font-medium tabular-nums">{soles(caja.egresos)}</b>
          </span>
        </div>
      </section>
      <p className="px-3 text-[12.5px] text-tinta-3 sm:px-0">
        Hora de apertura: {hora(caja.abiertaEn)}. Cada movimiento queda con su hora y quién lo anotó; solo esa persona o la encargada puede quitarlo mientras la caja siga abierta.
      </p>
    </div>
  )
}
