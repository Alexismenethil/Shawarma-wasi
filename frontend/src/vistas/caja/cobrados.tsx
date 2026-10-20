import { useState } from 'react'
import { mdiCashEdit, mdiCheckAll, mdiDotsVertical, mdiPrinter } from '@mdi/js'
import type { ArqueoCaja, CobroCaja, Pedido } from '@wasi/shared'
import { codigoMesa, nombreMesa } from '@wasi/shared'
import { idAlAzar } from '../../lib/azar'
import { api } from '../../lib/api'
import { useAjustes } from '../../lib/ajustes'
import { useRecurso } from '../../lib/recurso'
import { hora, soles } from '../../lib/formato'
import { avisar } from '../../componentes/avisos'
import { Boton, Rueda } from '../../componentes/boton'
import { Menu } from '../../componentes/desplegable'
import { Dialogo } from '../../componentes/dialogo'
import { Icono, iconoMedio } from '../../componentes/icono'
import { PieNota, aCentimos, cuadrarPago, type FilaPago } from '../mozo/pago'
import { Ticket } from '../mozo/ticket'
import { Imprimible } from './cobrar'

/**
 * La hoja «Cobrados»: lo que cobró este turno, la última nota primero. Desde
 * aquí se reimprime un comprobante o se corrige el tipo de pago (se marcó
 * Yape y era efectivo) mientras la caja siga abierta.
 */
export function Cobrados({ caja }: { caja: ArqueoCaja }) {
  const ajustes = useAjustes()
  const { datos: cobros, recargar } = useRecurso<CobroCaja[]>(`/caja/${caja.id}/cobros`, (c) => !!c.caja)
  const [corrigiendo, setCorrigiendo] = useState<CobroCaja | null>(null)
  const [imprimiendo, setImprimiendo] = useState<Pedido | null>(null)
  const nombre = (clave: string) => ajustes.medios.find((m) => m.clave === clave)?.nombre ?? clave

  const imprimir = async (c: CobroCaja) => {
    try {
      setImprimiendo(await api<Pedido>(`/pedidos/${c.pedidoId}`))
      // Se espera a que el comprobante se pinte antes de abrir la impresión.
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    } catch (e) {
      avisar((e as Error).message, 'error')
    }
  }

  const total = cobros?.reduce((s, c) => s + c.total, 0) ?? 0

  return (
    <div className="mx-auto max-w-[1100px] sm:px-4 sm:py-4">
      <section className="hoja sombra-hoja">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-reja px-3 py-2.5">
          <Icono d={mdiCheckAll} className="size-5 text-verde-2" />
          <h2 className="text-[15.5px] font-bold">Cobrados en este turno</h2>
          <span className="text-[13.5px] text-tinta-2 tabular-nums">
            {cobros?.length ?? 0} notas · S/ {soles(total)}
          </span>
        </div>
        <div className="cabecera hidden h-9 grid-cols-[64px_52px_64px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_96px_48px] sm:grid">
          {['Hora', 'N°', 'Hoja', 'Cliente', 'Tipo de pago', 'Cobró', 'Total', ''].map((t, i) => (
            <span key={i} className={`flex items-center border-r border-white/15 px-2 last:border-r-0 ${i === 6 ? 'justify-end' : i < 3 ? 'justify-center' : ''}`}>
              {t}
            </span>
          ))}
        </div>
        {!cobros ? (
          <p className="flex items-center justify-center gap-2 py-12 text-tinta-3">
            <Rueda /> Cargando…
          </p>
        ) : cobros.length === 0 ? (
          <p className="px-4 py-12 text-center text-[14px] text-tinta-3">Todavía no se cobra nada en este turno.</p>
        ) : (
          <ul>
            {cobros.map((c) => (
              <li
                key={c.pedidoId}
                className="grid grid-cols-[minmax(0,1fr)_auto_40px] items-center gap-x-2 border-b border-reja px-3 py-2 text-[14px] sm:grid-cols-[64px_52px_64px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_96px_48px] sm:gap-0 sm:px-0 sm:py-0"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 sm:hidden">
                  <b>{codigoMesa(c.mesa)}</b>
                  <span className="text-tinta-3">
                    N° {c.numero} · {hora(c.cobradoEn)}
                  </span>
                  <span className="w-full truncate text-[12.5px] text-tinta-2">{c.pagos.map((g) => nombre(g.metodo)).join(' + ')}</span>
                </span>
                <span className="hidden h-11 items-center justify-center border-r border-reja text-[13px] text-tinta-2 tabular-nums sm:flex">{hora(c.cobradoEn)}</span>
                <span className="hidden h-11 items-center justify-center border-r border-reja text-tinta-2 tabular-nums sm:flex">{c.numero}</span>
                <span className="hidden h-11 items-center justify-center border-r border-reja font-bold sm:flex">{codigoMesa(c.mesa)}</span>
                <span className="hidden h-11 items-center truncate border-r border-reja px-2 sm:flex">{c.cliente ?? <span className="text-tinta-4">—</span>}</span>
                <span className="hidden h-11 min-w-0 items-center gap-1.5 border-r border-reja px-2 sm:flex">
                  {c.pagos.map((g) => (
                    <span key={g.id} className="flex shrink-0 items-center gap-1 bg-gris-100 px-1.5 py-0.5 text-[12.5px]">
                      <Icono d={iconoMedio({ clave: g.metodo, nombre: nombre(g.metodo) })} className="size-3.5 text-tinta-3" />
                      {nombre(g.metodo)}
                      {c.pagos.length > 1 && <span className="text-tinta-3 tabular-nums">{soles(g.monto)}</span>}
                    </span>
                  ))}
                </span>
                <span className="hidden h-11 items-center truncate border-r border-reja px-2 text-tinta-2 sm:flex">{c.cobradoPor ?? ''}</span>
                <b className="flex items-center justify-end font-bold tabular-nums sm:h-11 sm:border-r sm:border-reja sm:px-2.5">{soles(c.total)}</b>
                <Menu
                  titulo={`${nombreMesa(c.mesa)} · N° ${c.numero}`}
                  disparador={<Icono d={mdiDotsVertical} className="size-5" />}
                  className="mx-auto grid size-9 place-items-center text-tinta-2 hover:bg-gris-150 hover:text-tinta"
                  acciones={[
                    { etiqueta: 'Reimprimir comprobante', icono: mdiPrinter, alElegir: () => void imprimir(c) },
                    { etiqueta: 'Corregir tipo de pago', icono: mdiCashEdit, alElegir: () => setCorrigiendo(c) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CorregirPago
        cobro={corrigiendo}
        alCerrar={() => setCorrigiendo(null)}
        alListo={() => {
          setCorrigiendo(null)
          void recargar()
        }}
      />
      {imprimiendo && (
        <Imprimible>
          <Ticket pedido={imprimiendo} mesa={imprimiendo.mesa} />
        </Imprimible>
      )}
    </div>
  )
}

/** Volver a poner el tipo de pago de una nota ya cobrada, con la misma regla de vuelto. */
function CorregirPago({ cobro, alCerrar, alListo }: { cobro: CobroCaja | null; alCerrar: () => void; alListo: () => void }) {
  const ajustes = useAjustes()
  const [filas, setFilas] = useState<FilaPago[]>([])
  const [guardando, setGuardando] = useState(false)
  const [antes, setAntes] = useState<CobroCaja | null>(null)
  if (cobro !== antes) {
    setAntes(cobro)
    if (cobro) setFilas(cobro.pagos.map((g) => ({ clave: idAlAzar(), metodo: g.metodo, monto: ((g.recibido ?? g.monto) / 100).toFixed(2) })))
  }
  const cuadre = cuadrarPago(cobro?.total ?? 0, filas, ajustes.medios)
  const valido = cuadre.usadas.length > 0 && !cuadre.excedeElectronico && cuadre.debe === 0

  const guardar = async () => {
    if (!cobro || !valido) return
    setGuardando(true)
    try {
      await api(`/pedidos/${cobro.pedidoId}/corregir-pago`, { cuerpo: { pagos: cuadre.usadas.map((f) => ({ metodo: f.metodo!, monto: aCentimos(f.monto) })) } })
      avisar('Tipo de pago corregido', 'ok')
      alListo()
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      abierto={!!cobro}
      titulo={cobro ? `Corregir pago · ${nombreMesa(cobro.mesa)} · N° ${cobro.numero}` : ''}
      alCerrar={alCerrar}
      ancho="max-w-[620px]"
      botones={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="cobrar" disabled={!valido} cargando={guardando} onClick={() => void guardar()} className="min-w-32">
            Guardar corrección
          </Boton>
        </>
      }
    >
      <p className="mb-3 text-[13.5px] text-tinta-2">El total no cambia: solo cómo se pagó. El arqueo se recalcula al instante.</p>
      <div className="border-x border-t border-reja">
        <PieNota total={cobro?.total ?? 0} filas={filas} setFilas={setFilas} medios={ajustes.medios} pagos={[]} pagado={false} compacto />
      </div>
    </Dialogo>
  )
}
