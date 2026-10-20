import { useState, type ReactNode } from 'react'
import { mdiAlertCircle, mdiCalculator, mdiCashLock, mdiCheckCircle, mdiFormatListChecks } from '@mdi/js'
import type { ArqueoCaja, Conteo } from '@wasi/shared'
import { DENOMINACIONES, sumarConteo } from '@wasi/shared'
import { api } from '../../lib/api'
import { useAjustes } from '../../lib/ajustes'
import { fechaHora, hora, soles, textoDiferencia } from '../../lib/formato'
import { avisar } from '../../componentes/avisos'
import { Boton } from '../../componentes/boton'
import { confirmar } from '../../componentes/dialogo'
import { Icono, iconoMedio } from '../../componentes/icono'
import { aCentimos } from '../mozo/pago'
import { ConteoEfectivo, denominacion } from './conteo'

/**
 * El arqueo, como la hoja «Arqueo» del Excel: cuánto entró por cada tipo de
 * pago y cuánto efectivo debería haber en el cajón. Lo usa la caja mientras
 * trabaja y el panel para ver cajas pasadas.
 */

const tonoDiferencia = (d: number) => (d === 0 ? 'text-verde-2' : d > 0 ? 'text-azul-oscuro' : 'text-rojo')

function Fila({ etiqueta, valor, signo, fuerte = false, className = '' }: { etiqueta: ReactNode; valor: ReactNode; signo?: string; fuerte?: boolean; className?: string }) {
  return (
    <div className={`flex min-h-10 items-center border-b border-reja text-[14px] ${fuerte ? 'bg-gris-100 font-medium' : ''} ${className}`}>
      <span className="w-7 shrink-0 text-center text-tinta-3">{signo}</span>
      <span className="min-w-0 flex-1 py-2 pr-2">{etiqueta}</span>
      <span className={`shrink-0 px-3 text-right tabular-nums ${fuerte ? 'text-[16px] font-bold' : ''}`}>{valor}</span>
    </div>
  )
}

/** Cabecera de hoja de reporte: blanco sobre rojo, centrada, como «Reporte Diario» del libro. */
export function CabeceraReporte({ children, color = '#a61c00' }: { children: ReactNode; color?: string }) {
  return (
    <h2 className="flex h-9 items-center justify-center gap-2 px-3 text-[14.5px] text-white" style={{ background: color }}>
      {children}
    </h2>
  )
}

export function HojaArqueo({ arqueo }: { arqueo: ArqueoCaja }) {
  const cerrada = arqueo.estado === 'CERRADA'
  // Todos los medios, también los que no cobraron: el cajero cuadra cada uno con su app o su voucher.
  const medios = arqueo.medios
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="hoja sombra-hoja self-start">
        <CabeceraReporte>
          <Icono d={mdiCalculator} className="size-[18px]" /> Arqueo de caja
        </CabeceraReporte>
        <Fila etiqueta="Fondo inicial (sencillo)" valor={soles(arqueo.montoInicial)} />
        <Fila signo="+" etiqueta="Cobros en efectivo" valor={soles(arqueo.efectivo)} />
        <Fila signo="+" etiqueta="Ingresos de caja" valor={soles(arqueo.ingresos)} />
        <Fila signo="−" etiqueta="Egresos de caja" valor={soles(arqueo.egresos)} />
        <Fila signo="=" fuerte etiqueta={cerrada ? 'Efectivo que debía haber' : 'Efectivo que debe haber en caja'} valor={`S/ ${soles(arqueo.esperado)}`} />
        {cerrada && arqueo.contado !== null && arqueo.diferencia !== null && (
          <>
            <Fila etiqueta="Contado al cerrar" valor={soles(arqueo.contado)} />
            <Fila
              fuerte
              className={arqueo.diferencia === 0 ? 'bg-menta-suave!' : arqueo.diferencia < 0 ? 'bg-rosa-suave!' : 'bg-azul-suave!'}
              etiqueta={
                <span className={`flex items-center gap-1.5 ${tonoDiferencia(arqueo.diferencia)}`}>
                  <Icono d={arqueo.diferencia === 0 ? mdiCheckCircle : mdiAlertCircle} className="size-[18px]" />
                  {arqueo.diferencia === 0 ? 'Cuadra' : arqueo.diferencia > 0 ? 'Sobra' : 'Falta'}
                </span>
              }
              valor={<span className={tonoDiferencia(arqueo.diferencia)}>{arqueo.diferencia === 0 ? '0.00' : `${arqueo.diferencia > 0 ? '+' : '−'}${soles(Math.abs(arqueo.diferencia))}`}</span>}
            />
            {arqueo.fondoSiguiente !== null && (
              <>
                <Fila etiqueta="Queda en caja para el siguiente turno" valor={soles(arqueo.fondoSiguiente)} />
                <Fila etiqueta="Se retira" valor={soles(arqueo.contado - arqueo.fondoSiguiente)} />
              </>
            )}
          </>
        )}
        {arqueo.observacion && <p className="border-b border-reja bg-crema px-3 py-2 text-[13.5px] text-ambar-oscuro">Observación: {arqueo.observacion}</p>}
      </section>

      <div className="grid content-start gap-4">
        <section className="hoja sombra-hoja">
          <CabeceraReporte color="#cc0000">Ventas del turno por tipo de pago</CabeceraReporte>
          <div className="grid grid-cols-[minmax(0,1fr)_64px_104px] border-b border-reja bg-gris-50 text-[12.5px] text-tinta-2">
            <span className="px-3 py-1.5">Tipo de pago</span>
            <span className="py-1.5 text-center">Cobros</span>
            <span className="px-3 py-1.5 text-right">Monto</span>
          </div>
          {medios.map((m) => (
            <div key={m.metodo} className="grid min-h-10 grid-cols-[minmax(0,1fr)_64px_104px] items-center border-b border-reja text-[14px]">
              <span className="flex min-w-0 items-center gap-2 px-3">
                <Icono d={iconoMedio({ clave: m.metodo, nombre: m.nombre, efectivo: m.efectivo })} className="size-[18px] text-tinta-3" />
                <span className="truncate">{m.nombre}</span>
                {m.vuelto > 0 && <span className="truncate text-[12px] text-tinta-3">· vuelto {soles(m.vuelto)}</span>}
              </span>
              <span className="text-center text-tinta-2 tabular-nums">{m.cobros || ''}</span>
              <span className="px-3 text-right tabular-nums">{soles(m.monto)}</span>
            </div>
          ))}
          <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_64px_104px] items-center bg-gris-100 text-[14px] font-medium">
            <span className="px-3">Total vendido · {arqueo.notas} nota{arqueo.notas === 1 ? '' : 's'}</span>
            <span className="text-center tabular-nums">{arqueo.medios.reduce((s, m) => s + m.cobros, 0) || ''}</span>
            <span className="px-3 text-right text-[15px] tabular-nums">{soles(arqueo.ventas)}</span>
          </div>
        </section>

        {cerrada && arqueo.conteo && Object.keys(arqueo.conteo).length > 0 && (
          <section className="hoja sombra-hoja">
            <CabeceraReporte color="#38761d">Billetes y monedas contados</CabeceraReporte>
            <p className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2.5 text-[13.5px] tabular-nums">
              {DENOMINACIONES.filter((d) => arqueo.conteo![d.valor]).map((d) => (
                <span key={d.valor}>
                  {arqueo.conteo![d.valor]} × {denominacion(d.valor)}
                </span>
              ))}
            </p>
          </section>
        )}

        <Bitacora arqueo={arqueo} />
      </div>
    </div>
  )
}

const EVENTO = { APERTURA: 'Abrió la caja', CIERRE: 'Cerró la caja', REAPERTURA: 'Reabrió la caja' } as const

/** Quién abrió, cerró o reabrió, y cuándo: lo que se mira cuando algo no cuadra. */
function Bitacora({ arqueo }: { arqueo: ArqueoCaja }) {
  return (
    <section className="hoja sombra-hoja">
      <CabeceraReporte color="#134f5c">
        <Icono d={mdiFormatListChecks} className="size-[18px]" /> Bitácora de la caja
      </CabeceraReporte>
      <ol>
        {arqueo.eventos.map((e, i) => (
          <li key={i} className="flex min-h-10 flex-wrap items-center gap-x-2 border-b border-reja px-3 py-1.5 text-[13.5px] last:border-b-0">
            <span className="w-[86px] shrink-0 text-tinta-3 tabular-nums">{fechaHora(e.creadoEn)}</span>
            <span className={`font-medium ${e.tipo === 'REAPERTURA' ? 'text-naranja' : 'text-tinta'}`}>{EVENTO[e.tipo]}</span>
            <span className="text-tinta-2">· {e.usuario}</span>
            {e.monto !== null && (
              <span className="ml-auto text-tinta-2 tabular-nums">
                {e.tipo === 'APERTURA' ? 'fondo' : 'contó'} {soles(e.monto)}
                {e.diferencia !== null && e.diferencia !== 0 && <b className={`ml-1.5 font-medium ${tonoDiferencia(e.diferencia)}`}>({textoDiferencia(e.diferencia).toLowerCase()})</b>}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Cerrar la caja: contar el dinero (billete por billete o el total), ver al
 * instante si cuadra, decidir cuánto queda para el siguiente turno y cerrar.
 */
export function CierreCaja({ arqueo, porCobrar, alCerrar }: { arqueo: ArqueoCaja; porCobrar: { notas: number; total: number }; alCerrar: () => void }) {
  const [modo, setModo] = useState<'billetes' | 'total'>('billetes')
  const [conteo, setConteo] = useState<Conteo>({})
  const [totalTexto, setTotalTexto] = useState('')
  const [fondoTexto, setFondoTexto] = useState((arqueo.montoInicial / 100).toFixed(2))
  const [observacion, setObservacion] = useState('')
  const [cerrando, setCerrando] = useState(false)

  const contado = modo === 'billetes' ? sumarConteo(conteo) : aCentimos(totalTexto)
  const hayConteo = modo === 'billetes' ? Object.values(conteo).some((n) => n > 0) : totalTexto.trim() !== ''
  const diferencia = contado - arqueo.esperado
  const fondo = aCentimos(fondoTexto)
  const fondoInvalido = hayConteo && fondo > contado

  const cerrar = async () => {
    if (!hayConteo) return avisar('Cuenta el dinero del cajón antes de cerrar.', 'error')
    if (fondoInvalido) return avisar('Lo que queda en caja no puede ser más de lo contado.', 'error')
    const ok = await confirmar({
      titulo: 'Cerrar caja',
      aceptar: 'Cerrar caja',
      variante: 'cobrar',
      mensaje: (
        <div className="space-y-2">
          <p>
            Contaste <b className="font-medium">S/ {soles(contado)}</b>; debía haber S/ {soles(arqueo.esperado)}:{' '}
            <b className={`font-medium ${tonoDiferencia(diferencia)}`}>{textoDiferencia(diferencia).toLowerCase()}</b>.
          </p>
          <p>
            Quedan S/ {soles(fondo)} para el siguiente turno y se retiran <b className="font-medium">S/ {soles(contado - fondo)}</b>.
          </p>
          {porCobrar.notas > 0 && (
            <p className="text-ambar-oscuro">
              {porCobrar.notas} nota{porCobrar.notas === 1 ? '' : 's'} sin cobrar (S/ {soles(porCobrar.total)}) se cobrarán en la siguiente caja.
            </p>
          )}
        </div>
      ),
    })
    if (!ok) return
    setCerrando(true)
    try {
      await api('/caja/cerrar', {
        cuerpo: { contado, conteo: modo === 'billetes' ? conteo : null, fondoSiguiente: fondo, observacion: observacion.trim() || null },
      })
      avisar(`Caja cerrada · ${textoDiferencia(diferencia)}`, diferencia === 0 ? 'ok' : 'info')
      alCerrar()
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setCerrando(false)
    }
  }

  return (
    <section className="hoja sombra-hoja">
      <CabeceraReporte color="#1c4587">
        <Icono d={mdiCashLock} className="size-[18px]" /> Cierre de caja
      </CabeceraReporte>
      <div className="grid gap-5 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[14px] font-medium">1. Cuenta el dinero del cajón</p>
            <div role="radiogroup" aria-label="Cómo contar" className="flex border border-reja-2 text-[13px]">
              {(['billetes', 'total'] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={modo === m}
                  onClick={() => setModo(m)}
                  className={`h-8 px-3 ${modo === m ? 'bg-azul-oscuro font-medium text-white' : 'bg-hoja text-tinta-2 hover:bg-gris-50'}`}
                >
                  {m === 'billetes' ? 'Billete por billete' : 'Solo el total'}
                </button>
              ))}
            </div>
          </div>
          {modo === 'billetes' ? (
            <ConteoEfectivo conteo={conteo} alCambiar={setConteo} />
          ) : (
            <label className="grid gap-1.5 text-[13px] text-tinta-2">
              Total contado en el cajón (S/)
              <input
                value={totalTexto}
                onChange={(e) => setTotalTexto(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Total contado"
                className="campo h-14 text-right text-[26px] font-bold tabular-nums"
              />
            </label>
          )}
        </div>

        <div className="grid content-start gap-4">
          <div className="border border-reja">
            <div className="flex h-11 items-center justify-between border-b border-reja px-3 text-[14px]">
              <span className="text-tinta-2">Debe haber en caja</span>
              <b className="text-[16px] font-medium tabular-nums">S/ {soles(arqueo.esperado)}</b>
            </div>
            <div className="flex h-11 items-center justify-between border-b border-reja px-3 text-[14px]">
              <span className="text-tinta-2">Contado</span>
              <b className="text-[16px] font-medium tabular-nums">{hayConteo ? `S/ ${soles(contado)}` : '—'}</b>
            </div>
            <div
              className={`flex h-14 items-center justify-between px-3 ${!hayConteo ? 'bg-gris-50 text-tinta-3' : diferencia === 0 ? 'bg-menta text-verde-3' : diferencia < 0 ? 'bg-rosa text-rojo-oscuro' : 'bg-celeste text-azul-oscuro'}`}
              role="status"
            >
              <span className="flex items-center gap-2 text-[15px] font-medium">
                <Icono d={hayConteo && diferencia === 0 ? mdiCheckCircle : mdiAlertCircle} className="size-5" />
                {hayConteo ? (diferencia === 0 ? 'Cuadra' : diferencia > 0 ? 'Sobra' : 'Falta') : 'Esperando el conteo'}
              </span>
              <b className="text-[20px] tabular-nums">{hayConteo ? soles(Math.abs(diferencia)) : ''}</b>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[14px] font-medium">2. ¿Cuánto queda en caja para el siguiente turno?</p>
            <div className="flex items-center gap-2">
              <input
                value={fondoTexto}
                onChange={(e) => setFondoTexto(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))}
                onFocus={(e) => e.target.select()}
                inputMode="decimal"
                aria-label="Queda en caja"
                className={`campo h-10 w-32 text-right text-[16px] tabular-nums ${fondoInvalido ? 'border-rojo' : ''}`}
              />
              <span className="text-[13.5px] text-tinta-2">
                Se retira <b className="font-medium text-tinta tabular-nums">S/ {soles(Math.max(0, contado - fondo))}</b>
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-tinta-3">El sencillo con que abrirá la siguiente caja. El resto se entrega.</p>
          </div>

          <label className="grid gap-1.5 text-[14px] font-medium">
            <span>
              3. Observación{' '}
              {hayConteo && diferencia !== 0 ? <span className="font-normal text-naranja">(explica la diferencia)</span> : <span className="font-normal text-tinta-3">(opcional)</span>}
            </span>
            <textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value.slice(0, 200))}
              rows={2}
              placeholder="Ej. Se pagó al proveedor de pan sin anotarlo"
              className="campo h-auto py-2 font-normal"
            />
          </label>

          {porCobrar.notas > 0 && (
            <p className="border border-ambar-oscuro/30 bg-crema px-3 py-2 text-[13px] text-ambar-oscuro">
              {porCobrar.notas} nota{porCobrar.notas === 1 ? '' : 's'} sin cobrar (S/ {soles(porCobrar.total)}): puedes cerrar igual, las cobra la siguiente caja.
            </p>
          )}

          <Boton variante="cobrar" icono={mdiCashLock} cargando={cerrando} disabled={!hayConteo || fondoInvalido} onClick={() => void cerrar()} className="h-12 text-[15px]">
            Cerrar caja
          </Boton>
        </div>
      </div>
    </section>
  )
}

/** El cierre impreso en la ticketera: lo que se firma y se guarda con el dinero. */
export function TicketCierre({ arqueo, sucursal }: { arqueo: ArqueoCaja; sucursal?: string }) {
  const a = useAjustes()
  const linea = (etiqueta: ReactNode, valor: ReactNode, fuerte = false) => (
    <p className={`flex justify-between gap-2 ${fuerte ? 'font-bold' : ''}`}>
      <span>{etiqueta}</span>
      <span className="tabular-nums">{valor}</span>
    </p>
  )
  return (
    <div className="hidden w-[72mm] font-sans text-[11px] leading-snug text-black print:block">
      <p className="text-center text-[14px] font-bold uppercase">{a.nombre}</p>
      {sucursal && <p className="text-center">{sucursal}</p>}
      <p className="my-1.5 border-y border-dashed border-black py-1 text-center font-bold">{arqueo.estado === 'CERRADA' ? 'CIERRE DE CAJA' : 'ARQUEO PARCIAL'} N° {arqueo.id}</p>
      <p>
        Abrió: {arqueo.abiertaPor} · {fechaHora(arqueo.abiertaEn)}
      </p>
      {arqueo.cerradaEn && (
        <p>
          Cerró: {arqueo.cerradaPor} · {fechaHora(arqueo.cerradaEn)}
        </p>
      )}
      <div className="mt-1.5 border-t border-dashed border-black pt-1">
        {linea('Fondo inicial', soles(arqueo.montoInicial))}
        {linea('+ Cobros en efectivo', soles(arqueo.efectivo))}
        {linea('+ Ingresos', soles(arqueo.ingresos))}
        {linea('− Egresos', soles(arqueo.egresos))}
        {linea('= Debe haber en caja', soles(arqueo.esperado), true)}
        {arqueo.contado !== null && arqueo.diferencia !== null && (
          <>
            {linea('Contado', soles(arqueo.contado))}
            {linea('Diferencia', textoDiferencia(arqueo.diferencia), true)}
            {arqueo.fondoSiguiente !== null && linea('Queda en caja', soles(arqueo.fondoSiguiente))}
            {arqueo.fondoSiguiente !== null && linea('Se retira', soles(arqueo.contado - arqueo.fondoSiguiente))}
          </>
        )}
      </div>
      <div className="mt-1.5 border-t border-dashed border-black pt-1">
        <p className="font-bold">Ventas por tipo de pago</p>
        {arqueo.medios
          .filter((m) => m.cobros > 0)
          .map((m) => (
            <div key={m.metodo}>{linea(`${m.nombre} (${m.cobros})`, soles(m.monto))}</div>
          ))}
        {linea(`TOTAL · ${arqueo.notas} notas`, soles(arqueo.ventas), true)}
      </div>
      {arqueo.movimientos.length > 0 && (
        <div className="mt-1.5 border-t border-dashed border-black pt-1">
          {arqueo.movimientos.map((m) => (
            <div key={m.id}>{linea(`${m.tipo === 'INGRESO' ? '+' : '−'} ${m.concepto}`, soles(m.monto))}</div>
          ))}
        </div>
      )}
      {arqueo.conteo && (
        <p className="mt-1.5 border-t border-dashed border-black pt-1">
          {DENOMINACIONES.filter((d) => arqueo.conteo![d.valor])
            .map((d) => `${arqueo.conteo![d.valor]}×${denominacion(d.valor).replace('S/ ', '')}`)
            .join('  ')}
        </p>
      )}
      {arqueo.observacion && <p className="mt-1">Obs.: {arqueo.observacion}</p>}
      <p className="mt-1">Impreso: {hora(new Date())}</p>
      <div className="mt-10 grid grid-cols-2 gap-4 text-center">
        <p className="border-t border-black pt-0.5">Cajero(a)</p>
        <p className="border-t border-black pt-0.5">Encargado(a)</p>
      </div>
    </div>
  )
}
