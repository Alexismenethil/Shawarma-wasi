import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { mdiAlert, mdiCashLock, mdiCheckAll, mdiPencilPlus, mdiPrinter, mdiReceiptText, mdiScaleBalance, mdiSwapVertical } from '@mdi/js'
import type { ArqueoCaja, EstadoCaja, MesaResumen } from '@wasi/shared'
import { useRecurso } from '../../lib/recurso'
import { useCambios } from '../../lib/tiempo-real'
import { useSucursal } from '../../lib/sucursal'
import { diaLima, fechaLarga, hoyLima, hora, soles } from '../../lib/formato'
import { sonarListo } from '../../lib/sonido'
import { avisar } from '../../componentes/avisos'
import { Barra } from '../../componentes/barra'
import { Boton, Rueda } from '../../componentes/boton'
import { Icono } from '../../componentes/icono'
import { Pestanas } from '../../componentes/pestanas'
import { Apertura } from './apertura'
import { CierreCaja, HojaArqueo, TicketCierre } from './arqueo'
import { Cobrados } from './cobrados'
import { Imprimible, PorCobrar } from './cobrar'
import { Movimientos } from './movimientos'

/**
 * La caja de la sucursal. Es la encargada de cobrar: abre con un fondo,
 * cobra las notas que anotan los mozos (y las del mostrador), anota lo que
 * entra y sale del cajón, y cierra contando el dinero. Como el libro del
 * mozo, cada parte es una hoja con su pestaña al pie.
 */

type Hoja = 'cobrar' | 'cobrados' | 'movimientos' | 'arqueo'
const HOJAS: Hoja[] = ['cobrar', 'cobrados', 'movimientos', 'arqueo']

export function Caja() {
  const { sucursal } = useSucursal()
  const { datos: estado, recargar } = useRecurso<EstadoCaja>('/caja', (c) => !!c.caja || !!c.mesas)
  const { datos: mesas } = useRecurso<MesaResumen[]>('/mesas', (c) => !!c.mesas)
  const [params] = useSearchParams()
  const hoja = HOJAS.find((h) => h === params.get('hoja')) ?? 'cobrar'

  // El mozo avisa que una mesa pide la cuenta: suena aunque caja esté en otra hoja.
  useCambios((c) => {
    if (c.aviso?.tipo === 'cuenta') {
      sonarListo()
      avisar(`${c.aviso.mesa} pide la cuenta`, 'info')
    }
  })

  const abierta = estado?.abierta ?? null
  const pendientes = mesas?.filter((m) => m.pedido && !m.pedido.pagado && m.pedido.total > 0) ?? []
  const pidenCuenta = pendientes.some((m) => m.pedido?.cuentaPedidaEn)

  return (
    <>
      <div className="min-h-dvh pb-[calc(44px+env(safe-area-inset-bottom))] print:hidden">
        <Barra
          color="bg-azul-oscuro"
          titulo={abierta ? 'Caja' : 'Caja · cerrada'}
          derecha={
            <Link to="/mozo" title="Anotar un pedido (mostrador o mesa)" className="flex h-9 items-center gap-1.5 border border-white/30 px-2.5 text-[13px] text-white hover:bg-white/10">
              <Icono d={mdiPencilPlus} className="size-[18px]" />
              <span className="hidden sm:inline">Anotar pedido</span>
            </Link>
          }
        />
        {!estado ? (
          <p className="flex items-center justify-center gap-2 py-24 text-[14px] text-tinta-3">
            <Rueda /> Abriendo la caja…
          </p>
        ) : !abierta ? (
          <Apertura estado={estado} alCambiar={recargar} />
        ) : (
          <>
            <Resumen caja={abierta} sucursal={sucursal?.nombre} />
            {hoja === 'cobrar' && <PorCobrar mesas={mesas} />}
            {hoja === 'cobrados' && <Cobrados caja={abierta} />}
            {hoja === 'movimientos' && <Movimientos caja={abierta} />}
            {hoja === 'arqueo' && <ArqueoYCierre estado={estado} caja={abierta} sucursal={sucursal?.nombre} alCerrar={recargar} />}
          </>
        )}
      </div>
      {abierta && (
        <Pestanas
          activa={hoja}
          grupos={[
            [
              { clave: 'cobrar', etiqueta: `Por cobrar (${pendientes.length})`, corta: `Cobrar (${pendientes.length})`, icono: mdiReceiptText, a: '/caja', aviso: pidenCuenta },
              { clave: 'cobrados', etiqueta: 'Cobrados', icono: mdiCheckAll, a: '/caja?hoja=cobrados' },
              { clave: 'movimientos', etiqueta: 'Ingresos y egresos', corta: 'Mov.', icono: mdiSwapVertical, a: '/caja?hoja=movimientos' },
              { clave: 'arqueo', etiqueta: 'Arqueo y cierre', corta: 'Arqueo', icono: mdiScaleBalance, a: '/caja?hoja=arqueo', franja: 'bg-azul-oscuro' },
            ],
          ]}
        />
      )}
    </>
  )
}

/** La fila de celdas de arriba: quién abrió, desde cuándo, cuánto se vendió y cuánto debe haber en el cajón. */
function Resumen({ caja, sucursal }: { caja: ArqueoCaja; sucursal?: string }) {
  const deOtroDia = diaLima(caja.abiertaEn) !== hoyLima()
  const celda = (rotulo: string, valor: string, fuerte = false) => (
    <div className={`flex min-w-0 flex-col justify-center border-r border-b border-reja px-3 py-1.5 sm:flex-row sm:items-center sm:justify-start sm:gap-2 sm:py-0 ${fuerte ? 'col-span-3 bg-azul-suave sm:col-span-1' : ''}`}>
      <span className="text-[11.5px] text-tinta-3 sm:text-[12.5px]">{rotulo}</span>
      <b className={`truncate tabular-nums ${fuerte ? 'text-[16px] font-bold text-azul-oscuro' : 'text-[14px] font-medium'}`}>{valor}</b>
    </div>
  )
  return (
    <div className="border-b border-reja bg-hoja">
      <div className="grid grid-cols-3 sm:h-11 sm:grid-cols-[auto_repeat(4,minmax(0,1fr))]">
        <div className="col-span-3 flex items-center gap-2 border-r border-b border-reja bg-menta px-3 py-2 text-[13.5px] font-medium text-verde-3 sm:col-span-1 sm:py-0">
          <span className="size-2.5 rounded-full bg-verde-2" />
          Caja abierta{sucursal ? ` · ${sucursal}` : ''}
        </div>
        {celda('Abrió', `${caja.abiertaPor} · ${hora(caja.abiertaEn)}`)}
        {celda('Fondo', soles(caja.montoInicial))}
        {celda('Vendido', soles(caja.ventas))}
        {celda('Efectivo en caja', `S/ ${soles(caja.esperado)}`, true)}
      </div>
      {deOtroDia && (
        <Link to="/caja?hoja=arqueo&cerrar=1" className="flex items-center gap-2 border-b border-ambar-oscuro/30 bg-ambar px-3 py-2 text-[13.5px] text-ambar-oscuro hover:underline">
          <Icono d={mdiAlert} className="size-5 shrink-0" />
          Esta caja se abrió el {fechaLarga(diaLima(caja.abiertaEn))}: ciérrala con su arqueo y abre la de hoy.
        </Link>
      )}
    </div>
  )
}

/** La hoja «Arqueo y cierre»: el arqueo al momento, y el cierre cuando toca. */
function ArqueoYCierre({ estado, caja, sucursal, alCerrar }: { estado: EstadoCaja; caja: ArqueoCaja; sucursal?: string; alCerrar: () => void }) {
  const [params, setParams] = useSearchParams()
  const [cerrando, setCerrando] = useState(params.get('cerrar') === '1')
  return (
    <div className="mx-auto grid max-w-[1200px] gap-4 sm:px-4 sm:py-4">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 sm:px-0 sm:pt-0">
        <div className="mr-auto">
          <h2 className="text-[18px] font-medium">Arqueo del turno</h2>
          <p className="text-[13px] text-tinta-2">Al momento: se actualiza solo con cada cobro, ingreso o egreso.</p>
        </div>
        <Boton icono={mdiPrinter} onClick={() => window.print()} className="h-10">
          Imprimir arqueo
        </Boton>
        {!cerrando && (
          <Boton variante="cobrar" icono={mdiCashLock} onClick={() => setCerrando(true)} className="h-10">
            Cerrar caja
          </Boton>
        )}
      </div>
      {cerrando && (
        <CierreCaja
          arqueo={caja}
          porCobrar={estado.porCobrar}
          alCerrar={() => {
            setParams({ cerrada: '1' }, { replace: true })
            alCerrar()
          }}
        />
      )}
      <HojaArqueo arqueo={caja} />
      <Imprimible>
        <TicketCierre arqueo={caja} sucursal={sucursal} />
      </Imprimible>
    </div>
  )
}
