import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router'
import { mdiArrowLeft, mdiBellRing, mdiCashCheck, mdiCashRegister, mdiCheckBold, mdiCheckCircle, mdiPencilPlus, mdiPrinter, mdiReceiptTextOutline } from '@mdi/js'
import type { MesaResumen, Pedido } from '@wasi/shared'
import { codigoMesa, nombreMesa } from '@wasi/shared'
import { api } from '../../lib/api'
import { useAjustes } from '../../lib/ajustes'
import { useRecurso } from '../../lib/recurso'
import { useImprimirAlCobrar } from '../../lib/impresion'
import { huella } from '../../lib/azar'
import { diaLima, fechaHora, hora, hoyLima, minutosDesde, soles, useAhora } from '../../lib/formato'
import { sonarOk } from '../../lib/sonido'
import { avisar } from '../../componentes/avisos'
import { Boton, Rueda } from '../../componentes/boton'
import { confirmar } from '../../componentes/dialogo'
import { ESTADO_HOJA, Icono } from '../../componentes/icono'
import { PieNota, aCentimos, cuadrarPago, filaPagoVacia, type FilaPago } from '../mozo/pago'
import { textoDetalle } from '../mozo/filas'
import { Ticket } from '../mozo/ticket'

/**
 * La hoja «Por cobrar»: todas las notas abiertas de la sucursal que aún no se
 * pagan. Arriba, las mesas que pidieron la cuenta; después, las ya servidas;
 * al final, las que siguen comiendo (un pedido para llevar se cobra antes).
 * Se elige una y a la derecha se cobra, con su vuelto.
 */

type Nota = MesaResumen & { pedido: NonNullable<MesaResumen['pedido']> }

const ESTADO_EN_CAJA: Record<string, string> = { EN_COCINA: 'En cocina', LISTO: 'Por servir', POR_COBRAR: 'Servido' }

function prioridad(m: Nota) {
  if (m.pedido.cuentaPedidaEn) return 0
  return m.estado === 'POR_COBRAR' ? 1 : 2
}

/** La hora, y la fecha si la nota quedó abierta de otro día. */
const cuando = (iso: string) => (diaLima(iso) === hoyLima() ? hora(iso) : fechaHora(iso))

/** «hace 12 min» mientras es reciente; después, la hora (y la fecha si es de otro día). */
const haceCuanto = (iso: string, ahora: number) => {
  const minutos = minutosDesde(iso, ahora)
  return minutos < 60 ? `hace ${minutos} min` : `desde ${cuando(iso)}`
}

const enOrden = (a: Nota, b: Nota) =>
  prioridad(a) - prioridad(b) || Date.parse(a.pedido.cuentaPedidaEn ?? a.pedido.desde) - Date.parse(b.pedido.cuentaPedidaEn ?? b.pedido.desde)

/** Lo que se imprime va fuera de la pantalla (que no se imprime). */
export function Imprimible({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}


export function PorCobrar({ mesas }: { mesas: MesaResumen[] | null }) {
  const [params, setParams] = useSearchParams()
  const elegida = Number(params.get('nota')) || null
  const ahora = useAhora(30_000)
  const notas = useMemo(() => (mesas ?? []).filter((m): m is Nota => !!m.pedido && !m.pedido.pagado && m.pedido.total > 0).sort(enOrden), [mesas])
  const total = notas.reduce((s, m) => s + m.pedido.total, 0)
  const elegir = (id: number | null) => setParams(id ? { nota: String(id) } : {}, { replace: true })

  return (
    <div className="mx-auto grid max-w-[1440px] gap-4 sm:px-4 sm:py-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
      <section className={`hoja sombra-hoja self-start ${elegida ? 'hidden lg:block' : ''}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-reja px-3 py-2.5">
          <Icono d={mdiReceiptTextOutline} className="size-5 text-azul-oscuro" />
          <h2 className="text-[15.5px] font-bold">Notas por cobrar</h2>
          <span className="text-[13.5px] text-tinta-2 tabular-nums">
            {notas.length} · S/ {soles(total)}
          </span>
          <Link to="/mozo" className="boton boton-claro ml-auto h-9">
            <Icono d={mdiPencilPlus} className="size-[18px]" /> Anotar pedido
          </Link>
        </div>

        <div className="cabecera hidden h-9 grid-cols-[52px_64px_minmax(0,1fr)_minmax(0,0.8fr)_128px_84px_96px] lg:grid" role="row">
          {['N°', 'Hoja', 'Cliente', 'Mozo', 'Estado', 'Desde', 'Total'].map((t, i) => (
            <span key={t} className={`flex items-center border-r border-white/15 px-2 ${i === 6 ? 'justify-end border-r-0' : i < 2 ? 'justify-center' : ''}`}>
              {t}
            </span>
          ))}
        </div>

        {mesas === null ? (
          <p className="flex items-center justify-center gap-2 py-14 text-[14px] text-tinta-3">
            <Rueda /> Cargando notas…
          </p>
        ) : notas.length === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-16 text-center">
            <Icono d={mdiCheckCircle} className="size-10 text-verde-1" />
            <p className="text-[15px] font-medium">No hay nada por cobrar</p>
            <p className="text-[13.5px] text-tinta-2">Las notas que anoten los mozos aparecen aquí al instante.</p>
          </div>
        ) : (
          <ul>
            {notas.map((m) => {
              const p = m.pedido
              const pide = !!p.cuentaPedidaEn
              const tono = pide ? 'bg-azul-suave text-azul' : ESTADO_HOJA[m.estado].fondo + ' ' + ESTADO_HOJA[m.estado].texto
              const activa = elegida === p.id
              return (
                <li key={p.id}>
                  <button
                    onClick={() => elegir(p.id)}
                    aria-current={activa || undefined}
                    className={`relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-reja px-3 py-2.5 text-left text-[14px] transition-colors lg:grid-cols-[52px_64px_minmax(0,1fr)_minmax(0,0.8fr)_128px_84px_96px] lg:gap-0 lg:px-0 lg:py-0 ${
                      activa ? 'bg-azul-suave' : 'hover:bg-gris-50'
                    }`}
                  >
                    {activa && <span className="absolute inset-y-0 left-0 w-1 bg-azul-oscuro" />}
                    {/* Celular: dos renglones */}
                    <span className="flex min-w-0 items-center gap-2 lg:hidden">
                      <b className="font-bold">{codigoMesa(m)}</b>
                      <span className="text-tinta-3">N° {p.numero}</span>
                      <span className="truncate text-tinta-2">{p.cliente ?? p.mozo ?? ''}</span>
                    </span>
                    <b className="text-right text-[15px] font-bold tabular-nums lg:hidden">{soles(p.total)}</b>
                    <span className="flex items-center gap-2 text-[12.5px] lg:hidden">
                      <span className={`flex items-center gap-1 px-1.5 py-px ${tono}`}>
                        {pide && <Icono d={mdiBellRing} className="animate-latido size-3.5" />}
                        {pide ? 'Pide la cuenta' : ESTADO_EN_CAJA[m.estado]}
                      </span>
                      <span className="text-tinta-3">{haceCuanto(p.cuentaPedidaEn ?? p.desde, ahora)}</span>
                    </span>
                    {/* Pantalla grande: la planilla */}
                    <span className="hidden h-11 items-center justify-center border-r border-reja text-tinta-2 tabular-nums lg:flex">{p.numero}</span>
                    <span className="hidden h-11 items-center justify-center border-r border-reja font-bold lg:flex">{codigoMesa(m)}</span>
                    <span className="hidden h-11 items-center truncate border-r border-reja px-2 lg:flex">{p.cliente ?? <span className="text-tinta-4">—</span>}</span>
                    <span className="hidden h-11 items-center truncate border-r border-reja px-2 text-tinta-2 lg:flex">{p.mozo ?? ''}</span>
                    <span className="hidden h-11 items-center border-r border-reja px-1.5 lg:flex">
                      <span className={`flex w-full items-center justify-center gap-1 py-1 text-[12.5px] font-medium ${tono}`}>
                        {pide && <Icono d={mdiBellRing} className="animate-latido size-3.5" />}
                        {pide ? 'Pide la cuenta' : ESTADO_EN_CAJA[m.estado]}
                      </span>
                    </span>
                    <span className="hidden h-11 items-center justify-center border-r border-reja text-[12.5px] whitespace-nowrap text-tinta-2 tabular-nums lg:flex">{cuando(p.desde)}</span>
                    <span className="hidden h-11 items-center justify-end px-2.5 font-bold tabular-nums lg:flex">{soles(p.total)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={elegida ? '' : 'hidden lg:block'}>
        {elegida ? (
          <CobroNota key={elegida} pedidoId={elegida} alVolver={() => elegir(null)} siguiente={notas.find((n) => n.pedido.id !== elegida)?.pedido.id ?? null} alSiguiente={elegir} />
        ) : (
          <div className="hoja grid min-h-[320px] place-items-center px-6 py-16 text-center">
            <div className="grid place-items-center gap-2">
              <Icono d={mdiCashRegister} className="size-12 text-tinta-4" />
              <p className="text-[15px] font-medium text-tinta-2">Elige una nota de la lista para cobrarla</p>
              <p className="text-[13px] text-tinta-3">Las mesas que piden la cuenta aparecen primero, en azul.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

/** Una nota a la vista, con el pie de pago de la nota del Excel: tipo de pago, monto, vuelto y «Cobrar». */
function CobroNota({ pedidoId, alVolver, siguiente, alSiguiente }: { pedidoId: number; alVolver: () => void; siguiente: number | null; alSiguiente: (id: number) => void }) {
  const ajustes = useAjustes()
  const { datos: pedido, setDatos, error } = useRecurso<Pedido>(`/pedidos/${pedidoId}`, (c) => !!c.mesas)
  const [filas, setFilas] = useState<FilaPago[]>(() => [filaPagoVacia()])
  const [cobrando, setCobrando] = useState(false)
  // El comprobante sale solo al cobrar (si este equipo no lo apagó).
  const impresion = useImprimirAlCobrar(pedido?.cobradoEn)

  const volver = (
    <button onClick={alVolver} className="flex h-10 items-center gap-1.5 px-2 text-[14px] text-azul hover:bg-azul-suave lg:hidden">
      <Icono d={mdiArrowLeft} className="size-5" /> Todas las notas
    </button>
  )

  if (error && !pedido) {
    return (
      <div className="hoja px-4 py-10 text-center">
        {volver}
        <p className="mt-4 text-[14.5px] text-tinta-2">{error}</p>
      </div>
    )
  }
  if (!pedido) {
    return (
      <div className="hoja flex min-h-[320px] items-center justify-center gap-2 text-[14px] text-tinta-3">
        <Rueda /> Abriendo la nota…
      </div>
    )
  }

  const pagado = !!pedido.cobradoEn
  const vivos = pedido.items.filter((i) => i.estado !== 'ANULADO')
  const cuadre = cuadrarPago(pedido.total, filas, ajustes.medios)
  const nombreMedio = (clave: string | null) => ajustes.medios.find((m) => m.clave === clave)?.nombre ?? clave

  const cobrar = async () => {
    if (!cuadre.usadas.length) return avisar('Elige el tipo de pago y el monto.', 'error')
    if (cuadre.excedeElectronico) return avisar('El pago electrónico supera el total.', 'error')
    if (cuadre.debe > 0) return avisar(`Falta cubrir S/ ${soles(cuadre.debe)}.`, 'error')
    const ok = await confirmar({
      titulo: `Cobrar ${nombreMesa(pedido.mesa)}`,
      aceptar: `Cobrar S/ ${soles(pedido.total)}`,
      variante: 'cobrar',
      mensaje: (
        <div className="space-y-2">
          <p>
            Nota N° {pedido.numero} por <b className="font-medium">S/ {soles(pedido.total)}</b>:{' '}
            {cuadre.usadas.map((f) => `${nombreMedio(f.metodo)} S/ ${soles(aCentimos(f.monto))}`).join(' + ')}.
          </p>
          {cuadre.vuelto > 0 && <p className="border border-verde-1/40 bg-menta-suave px-3 py-2 text-[17px] font-bold text-verde-3">Vuelto: S/ {soles(cuadre.vuelto)}</p>}
        </div>
      ),
    })
    if (!ok) return
    setCobrando(true)
    try {
      const pagos = cuadre.usadas.map((f) => ({ metodo: f.metodo!, monto: aCentimos(f.monto) }))
      // El mismo cobro lleva la misma clave: si se pulsa otra vez tras un corte, no se cobra dos veces.
      const p = await api<Pedido>(`/pedidos/${pedido.id}/cobrar`, { cuerpo: { pagos }, clave: `cobro-${pedido.id}-${huella(JSON.stringify(pagos))}` })
      setDatos(p)
      setFilas([filaPagoVacia()])
      sonarOk()
      avisar(cuadre.vuelto ? `Cobrado · vuelto S/ ${soles(cuadre.vuelto)}` : 'Cobrado', 'ok')
      impresion.alCobrar()
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setCobrando(false)
    }
  }

  return (
    <div className="hoja sombra-hoja relative">
      <div className="flex items-center justify-between border-b border-reja pr-2 lg:hidden">{volver}</div>

      {/* Cabecera de la nota */}
      <div className="flex items-stretch border-b border-black">
        <span className="rotulo-negro">N°</span>
        <span className="flex items-center bg-campo px-3 font-bold tabular-nums">{pedido.numero}</span>
        <span className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
          <b className="text-[17px] font-bold text-vino-3">{nombreMesa(pedido.mesa)}</b>
          {pedido.cliente && <span className="truncate text-[14px] text-tinta-2">· {pedido.cliente}</span>}
        </span>
        <span className="hidden items-center px-3 text-[13px] text-tinta-3 sm:flex">{hora(pedido.creadoEn)}</span>
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 border-b border-reja bg-gris-50 px-3 py-1.5 text-[12.5px] text-tinta-2">
        {pedido.mozo && <span>Atendió: {pedido.mozo}</span>}
        {pedido.cuentaPedidaEn && !pagado && (
          <span className="flex items-center gap-1 font-medium text-azul">
            <Icono d={mdiBellRing} className="size-3.5" /> Pidió la cuenta a las {hora(pedido.cuentaPedidaEn)}
          </span>
        )}
        {pagado && pedido.cobradoPor && (
          <span className="font-medium text-verde-2">
            Cobró: {pedido.cobradoPor} · {hora(pedido.cobradoEn!)}
          </span>
        )}
      </p>

      {/* Lo pedido */}
      <div className="cabecera grid h-8 grid-cols-[44px_minmax(0,1fr)_96px]">
        <span className="flex items-center justify-center border-r border-white/15">Cant:</span>
        <span className="flex items-center border-r border-white/15 px-2">Producto:</span>
        <span className="flex items-center justify-end bg-verde-2 px-2">Subtotal:</span>
      </div>
      <ul className="barra-fina max-h-[42dvh] overflow-y-auto">
        {vivos.map((i) => (
          <li key={i.id} className="grid grid-cols-[44px_minmax(0,1fr)_96px] border-b border-reja text-[14px]">
            <span className="flex items-start justify-center border-r border-reja pt-2 font-medium tabular-nums">{i.cantidad}</span>
            <span className="min-w-0 border-r border-reja px-2 py-1.5">
              <span className="block truncate">{i.nombre}</span>
              {(i.adicionales.length > 0 || i.detalle || i.paraLlevar || i.observacion) && (
                <span className="block truncate text-[12.5px] text-tinta-3">
                  {[i.adicionales.length ? `+ ${i.adicionales.map((a) => a.nombre).join(' + ')}` : '', textoDetalle(i.paraLlevar, i.detalle), i.observacion ?? ''].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            <span className="flex items-start justify-end px-2 pt-2 tabular-nums">{soles(i.subtotal)}</span>
          </li>
        ))}
      </ul>

      <PieNota total={pedido.total} filas={filas} setFilas={setFilas} medios={ajustes.medios} pagos={pedido.pagos} pagado={pagado} compacto />

      <div className="flex flex-wrap items-center justify-end gap-2 bg-gris-50 px-3 py-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={impresion.activo}
          onClick={() => impresion.cambiar(!impresion.activo)}
          className="mr-auto flex h-11 items-center gap-2 px-1 text-[13.5px] text-tinta-2"
        >
          <span className={`grid size-[18px] place-items-center border-2 ${impresion.activo ? 'border-verde-2 bg-verde-2 text-white' : 'border-tinta-3 bg-hoja'}`}>
            {impresion.activo && <Icono d={mdiCheckBold} className="size-3.5" />}
          </span>
          Imprimir al cobrar
        </button>
        <Boton icono={mdiPrinter} onClick={() => window.print()} className="h-11">
          {pagado ? 'Imprimir comprobante' : 'Imprimir cuenta'}
        </Boton>
        {pagado ? (
          siguiente && (
            <Boton variante="oscuro" onClick={() => alSiguiente(siguiente)} className="h-11 min-w-36">
              Siguiente nota
            </Boton>
          )
        ) : (
          <Boton variante="cobrar" icono={mdiCashCheck} onClick={() => void cobrar()} cargando={cobrando} className="h-11 min-w-44 text-[15px]">
            Cobrar S/ {soles(pedido.total)}
          </Boton>
        )}
      </div>

      {pagado && <span className="sello pointer-events-none absolute right-6 bottom-20 px-3 py-1 text-[20px] text-verde-2 opacity-80">PAGADO</span>}

      <Imprimible>
        <Ticket pedido={pedido} mesa={pedido.mesa} />
      </Imprimible>
    </div>
  )
}
