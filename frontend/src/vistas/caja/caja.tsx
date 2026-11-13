import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { mdiCashLock, mdiCheckAll, mdiPencilPlus, mdiPrinter, mdiReceiptText, mdiScaleBalance, mdiSwapVertical } from '@mdi/js'
import type { ArqueoCaja, EstadoCaja, MesaResumen } from '@wasi/shared'
import { useRecurso } from '../../lib/recurso'
import { useCambios } from '../../lib/tiempo-real'
import { useSucursal } from '../../lib/sucursal'
import { diaLima, fechaHora, hoyLima, hora } from '../../lib/formato'
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
      <div className="min-h-dvh pb-[calc(64px+env(safe-area-inset-bottom))] sm:pb-[calc(44px+env(safe-area-inset-bottom))] print:hidden">
        <Barra
          color="bg-azul-oscuro"
          titulo={abierta ? 'Caja' : 'Caja · cerrada'}
          // En «Por cobrar» la lista ya tiene su botón «Anotar pedido»: arriba no se repite.
          derecha={
            abierta && hoja === 'cobrar' ? undefined : (
              <Link
                to="/mozo"
                title="Anotar un pedido (mostrador o mesa)"
                className="flex h-9 items-center gap-1.5 border border-white/30 px-2.5 text-[13px] text-white hover:bg-white/10"
              >
                <Icono d={mdiPencilPlus} className="size-[18px]" />
                <span className="hidden sm:inline">Anotar pedido</span>
              </Link>
            )
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
            {hoja === 'cobrar' && <PorCobrar mesas={mesas} />}
            {hoja === 'cobrados' && <Cobrados caja={abierta} />}
            {hoja === 'movimientos' && <Movimientos caja={abierta} />}
            {hoja === 'arqueo' && <ArqueoYCierre estado={estado} caja={abierta} pendientes={pendientes} sucursal={sucursal?.nombre} alCerrar={recargar} />}
          </>
        )}
      </div>
      {abierta && (
        <Pestanas
          activa={hoja}
          grandes
          grupos={[
            [
              { clave: 'cobrar', etiqueta: `Por cobrar (${pendientes.length})`, corta: `Cobrar (${pendientes.length})`, icono: mdiReceiptText, a: '/caja', aviso: pidenCuenta },
              { clave: 'cobrados', etiqueta: 'Cobrados', icono: mdiCheckAll, a: '/caja?hoja=cobrados' },
              { clave: 'movimientos', etiqueta: 'Ingresos y egresos', corta: 'Ingresos', icono: mdiSwapVertical, a: '/caja?hoja=movimientos' },
              { clave: 'arqueo', etiqueta: 'Arqueo y cierre', corta: 'Arqueo', icono: mdiScaleBalance, a: '/caja?hoja=arqueo', franja: 'bg-azul-oscuro' },
            ],
          ]}
        />
      )}
    </>
  )
}

/** La hoja «Arqueo y cierre»: el arqueo al momento, y el cierre cuando toca. */
function ArqueoYCierre({
  estado,
  caja,
  pendientes,
  sucursal,
  alCerrar,
}: {
  estado: EstadoCaja
  caja: ArqueoCaja
  pendientes: MesaResumen[]
  sucursal?: string
  alCerrar: () => void
}) {
  const [params, setParams] = useSearchParams()
  const [cerrando, setCerrando] = useState(params.get('cerrar') === '1')
  return (
    <div className="mx-auto grid max-w-[1200px] gap-4 sm:px-4 sm:py-4">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 sm:px-0 sm:pt-0">
        <div className="mr-auto w-full sm:w-auto">
          <h2 className="text-[19px] font-medium sm:text-[18px]">Arqueo del turno</h2>
          <p className="text-[14px] text-tinta-2 sm:text-[13px]">
            Abrió {caja.abiertaPor} · {diaLima(caja.abiertaEn) === hoyLima() ? hora(caja.abiertaEn) : fechaHora(caja.abiertaEn)}
          </p>
        </div>
        <Boton icono={mdiPrinter} onClick={() => window.print()} className="h-12 flex-1 text-[15px] sm:h-10 sm:flex-none sm:text-[14px]">
          Imprimir arqueo
        </Boton>
        {!cerrando && (
          <Boton
            variante="cobrar"
            icono={mdiCashLock}
            onClick={() => setCerrando(true)}
            className="h-12 flex-1 text-[15px] sm:h-10 sm:flex-none sm:text-[14px]"
          >
            Cerrar caja
          </Boton>
        )}
      </div>
      {cerrando && (
        <CierreCaja
          arqueo={caja}
          porCobrar={estado.porCobrar}
          pendientes={pendientes}
          alCerrar={() => {
            setParams({ cerrada: '1' }, { replace: true })
            alCerrar()
          }}
        />
      )}
      <HojaArqueo arqueo={caja} compacta />
      <Imprimible>
        <TicketCierre arqueo={caja} sucursal={sucursal} />
      </Imprimible>
    </div>
  )
}
