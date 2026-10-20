import { useSearchParams } from 'react-router'
import { mdiAlertCircle, mdiCash, mdiCashLock, mdiCashRegister, mdiCheckCircle, mdiDownload, mdiPrinter, mdiScaleBalance } from '@mdi/js'
import type { ArqueoCaja, CobroCaja } from '@wasi/shared'
import { codigoMesa } from '@wasi/shared'
import { useRecurso } from '../../lib/recurso'
import { useSucursal } from '../../lib/sucursal'
import { useAjustes } from '../../lib/ajustes'
import { fechaCorta, fechaHora, hora, soles, textoDiferencia } from '../../lib/formato'
import { Boton, Rueda } from '../../componentes/boton'
import { Dialogo } from '../../componentes/dialogo'
import { Icono } from '../../componentes/icono'
import { HojaArqueo, TicketCierre } from '../caja/arqueo'
import { Imprimible } from '../caja/cobrar'
import { Kpi, Pagina, Panel, Tabla, descargarCsv, enSoles, solesCortos } from './piezas'
import { FiltroRango, useRango } from './rango'

interface TurnoCaja {
  id: number
  sucursalId: number
  sucursal: string
  estado: 'ABIERTA' | 'CERRADA'
  abiertaPor: string
  abiertaEn: string
  cerradaPor: string | null
  cerradaEn: string | null
  montoInicial: number
  notas: number
  ventas: number
  efectivo: number
  esperado: number
  contado: number | null
  diferencia: number | null
  reaperturas: number
}

const dia = (iso: string) => fechaCorta(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(iso)))
const tono = (d: number) => (d === 0 ? 'text-verde-2' : d < 0 ? 'text-rojo' : 'text-azul-oscuro')

/**
 * Cajas y arqueos: cada turno de caja con quién la abrió y la cerró, cuánto
 * vendió, cuánto efectivo debía haber y cuánto se contó. Lo que no cuadró se
 * ve en rojo; al tocar un turno se abre su arqueo completo, para imprimirlo.
 */
export function Cajas() {
  const rango = useRango('7')
  const { id: vista } = useSucursal()
  const [params, setParams] = useSearchParams()
  const elegida = Number(params.get('caja')) || null
  const { datos } = useRecurso<TurnoCaja[]>(`/reportes/cajas?desde=${rango.desde}&hasta=${rango.hasta}`, (c) => !!c.caja)
  const todas = !vista

  const cerradas = datos?.filter((c) => c.diferencia !== null) ?? []
  const faltante = cerradas.reduce((s, c) => s + Math.min(0, c.diferencia!), 0)
  const sobrante = cerradas.reduce((s, c) => s + Math.max(0, c.diferencia!), 0)
  const abiertas = datos?.filter((c) => c.estado === 'ABIERTA').length ?? 0

  const abrir = (id: number | null) =>
    setParams(
      (ps) => {
        if (id) ps.set('caja', String(id))
        else ps.delete('caja')
        return ps
      },
      { replace: true },
    )

  const descargar = () =>
    datos &&
    descargarCsv(`cajas-${rango.desde}-a-${rango.hasta}.csv`, [
      ['Sucursal', 'Abrió', 'Apertura', 'Cerró', 'Cierre', 'Fondo', 'Notas', 'Vendido', 'Efectivo esperado', 'Contado', 'Diferencia', 'Reaperturas'],
      ...datos.map((c) => [
        c.sucursal,
        c.abiertaPor,
        fechaHora(c.abiertaEn),
        c.cerradaPor,
        c.cerradaEn ? fechaHora(c.cerradaEn) : 'abierta',
        soles(c.montoInicial),
        c.notas,
        soles(c.ventas),
        soles(c.esperado),
        c.contado === null ? '' : soles(c.contado),
        c.diferencia === null ? '' : soles(c.diferencia),
        c.reaperturas,
      ]),
    ])

  return (
    <Pagina
      titulo="Cajas y arqueos"
      detalle="Cada turno de caja: quién abrió y cerró, cuánto vendió y si el dinero cuadró."
      acciones={
        <>
          <FiltroRango rango={rango} />
          <Boton icono={mdiDownload} onClick={descargar} disabled={!datos?.length} className="h-9">
            Descargar
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi color="turquesa" icono={mdiCashRegister} titulo="Turnos de caja" valor={datos?.length ?? '…'} detalle={abiertas ? `${abiertas} abierta${abiertas === 1 ? '' : 's'} ahora` : 'todas cerradas'} />
        <Kpi color="verde" icono={mdiCash} titulo="Vendido en esas cajas" valor={datos ? solesCortos(datos.reduce((s, c) => s + c.ventas, 0)) : '…'} detalle="con todos los medios de pago" />
        <Kpi color="rojo" icono={mdiAlertCircle} titulo="Faltó en total" valor={datos ? enSoles(-faltante) : '…'} detalle={`${cerradas.filter((c) => c.diferencia! < 0).length} cierres con faltante`} />
        <Kpi color="magenta" icono={mdiScaleBalance} titulo="Sobró en total" valor={datos ? enSoles(sobrante) : '…'} detalle={`${cerradas.filter((c) => c.diferencia === 0).length} de ${cerradas.length} cierres cuadraron`} />
      </div>

      <Panel titulo="Turnos de caja" estilo="excel" color="#1c4587" relleno={false} className="mt-4">
        <Tabla
          tono="turquesa"
          alto="calc(100dvh - 330px)"
          columnas={[
            { titulo: 'Día', ancho: '78px' },
            ...(todas ? [{ titulo: 'Sucursal', ancho: '130px' }] : []),
            { titulo: 'Abrió', ancho: '150px' },
            { titulo: 'Cerró', ancho: '150px' },
            { titulo: 'Fondo', ancho: '84px' },
            { titulo: 'Notas', ancho: '64px' },
            { titulo: 'Vendido', ancho: '100px' },
            { titulo: 'Debía haber', ancho: '104px' },
            { titulo: 'Contado', ancho: '100px' },
            { titulo: 'Diferencia' },
          ]}
        >
          {!datos ? (
            <tr>
              <td colSpan={todas ? 10 : 9} className="py-10 text-center text-tinta-3">
                <Rueda /> Cargando…
              </td>
            </tr>
          ) : datos.length === 0 ? (
            <tr>
              <td colSpan={todas ? 10 : 9} className="py-10 text-center text-tinta-3">
                Sin turnos de caja en estas fechas.
              </td>
            </tr>
          ) : (
            datos.map((c) => (
              <tr key={c.id} onClick={() => abrir(c.id)} className="cursor-pointer">
                <td className="text-center text-tinta-2">{dia(c.abiertaEn)}</td>
                {todas && <td className="truncate">{c.sucursal}</td>}
                <td className="truncate">
                  {c.abiertaPor} <span className="text-tinta-3">· {hora(c.abiertaEn)}</span>
                </td>
                <td className="truncate">
                  {c.cerradaEn ? (
                    <>
                      {c.cerradaPor} <span className="text-tinta-3">· {hora(c.cerradaEn)}</span>
                    </>
                  ) : (
                    <span className="flex items-center gap-1.5 text-verde-2">
                      <span className="size-2 rounded-full bg-verde-2" /> Abierta
                    </span>
                  )}
                </td>
                <td className="text-right tabular-nums">{soles(c.montoInicial)}</td>
                <td className="text-center text-tinta-2 tabular-nums">{c.notas}</td>
                <td className="text-right tabular-nums">{soles(c.ventas)}</td>
                <td className="text-right tabular-nums">{soles(c.esperado)}</td>
                <td className="text-right tabular-nums">{c.contado === null ? '' : soles(c.contado)}</td>
                <td>
                  {c.diferencia !== null && (
                    <span className={`flex items-center gap-1.5 font-medium ${tono(c.diferencia)}`}>
                      <Icono d={c.diferencia === 0 ? mdiCheckCircle : mdiAlertCircle} className="size-4" />
                      {textoDiferencia(c.diferencia)}
                      {c.reaperturas > 0 && <span className="ml-auto bg-crema px-1.5 text-[12px] font-normal text-naranja">reabierta {c.reaperturas}×</span>}
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </Tabla>
      </Panel>

      {elegida && <DetalleCaja id={elegida} alCerrar={() => abrir(null)} />}
    </Pagina>
  )
}

function DetalleCaja({ id, alCerrar }: { id: number; alCerrar: () => void }) {
  const ajustes = useAjustes()
  const { datos } = useRecurso<ArqueoCaja & { sucursal: string; cobros: CobroCaja[] }>(`/reportes/cajas/${id}`, (c) => !!c.caja)
  const nombre = (clave: string) => ajustes.medios.find((m) => m.clave === clave)?.nombre ?? clave
  return (
    <Dialogo
      abierto
      titulo={datos ? `Caja N° ${datos.id} · ${datos.sucursal} · ${dia(datos.abiertaEn)}` : 'Caja'}
      alCerrar={alCerrar}
      ancho="max-w-[1180px]"
      botones={
        <>
          <Boton icono={mdiPrinter} onClick={() => window.print()} disabled={!datos}>
            Imprimir arqueo
          </Boton>
          <Boton variante="oscuro" onClick={alCerrar} className="min-w-28">
            Cerrar
          </Boton>
        </>
      }
    >
      {!datos ? (
        <p className="flex items-center justify-center gap-2 py-16 text-tinta-3">
          <Rueda /> Abriendo el arqueo…
        </p>
      ) : (
        <div className="grid gap-4">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-tinta-2">
            <span className="flex items-center gap-1.5">
              <Icono d={mdiCashLock} className="size-4" /> Abrió {datos.abiertaPor} · {fechaHora(datos.abiertaEn)}
            </span>
            {datos.cerradaEn && (
              <span>
                Cerró {datos.cerradaPor} · {fechaHora(datos.cerradaEn)}
              </span>
            )}
          </p>
          <HojaArqueo arqueo={datos} />
          <section className="hoja">
            <h3 className="cabecera flex h-9 items-center justify-center text-[14px]">Notas cobradas en el turno ({datos.cobros.length})</h3>
            <Tabla tono="verde" alto="320px" columnas={[{ titulo: 'Hora', ancho: '64px' }, { titulo: 'N°', ancho: '52px' }, { titulo: 'Hoja', ancho: '64px' }, { titulo: 'Cliente' }, { titulo: 'Tipo de pago' }, { titulo: 'Cobró', ancho: '120px' }, { titulo: 'Total', ancho: '96px' }]}>
              {datos.cobros.map((c) => (
                <tr key={c.pedidoId}>
                  <td className="text-center text-tinta-2 tabular-nums">{hora(c.cobradoEn)}</td>
                  <td className="text-center text-tinta-2 tabular-nums">{c.numero}</td>
                  <td className="text-center font-bold">{codigoMesa(c.mesa)}</td>
                  <td className="truncate">{c.cliente ?? ''}</td>
                  <td className="truncate">{c.pagos.map((g) => nombre(g.metodo)).join(' + ')}</td>
                  <td className="truncate text-tinta-2">{c.cobradoPor ?? ''}</td>
                  <td className="text-right font-medium tabular-nums">{soles(c.total)}</td>
                </tr>
              ))}
            </Tabla>
          </section>
          <Imprimible>
            <TicketCierre arqueo={datos} sucursal={datos.sucursal} />
          </Imprimible>
        </div>
      )}
    </Dialogo>
  )
}
