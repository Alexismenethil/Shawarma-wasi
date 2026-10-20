import { mdiCash, mdiDownload, mdiReceiptText, mdiScaleBalance, mdiSilverwareForkKnife } from '@mdi/js'
import { useRecurso } from '../../lib/recurso'
import { fechaCorta, soles } from '../../lib/formato'
import { Boton } from '../../componentes/boton'
import { Barras, Delta, PALETA, Torta } from './graficos'
import { Kpi, Pagina, Panel, Tabla, descargarCsv, enSoles, solesCortos } from './piezas'
import { FiltroRango, useRango } from './rango'
import type { ReporteRango } from './tipos'

const diaSemana = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'short' }).replace('.', '')

/** «VentasFecha» y «Tendencia» del Excel: cuánto se vendió cada día del rango y con qué se pagó. */
export function Ventas() {
  const rango = useRango('30')
  const { datos: d } = useRecurso<ReporteRango>(`/reportes/rango?desde=${rango.desde}&hasta=${rango.hasta}`, () => false)
  const conVenta = d?.serie.filter((s) => s.ventas > 0).length ?? 0
  const mejor = d?.serie.reduce((m, s) => (s.ventas > m.ventas ? s : m), d.serie[0])

  const descargar = () =>
    d &&
    descargarCsv(`ventas-${d.desde}-a-${d.hasta}.csv`, [
      ['Fecha', 'Día', 'Pedidos', 'Ventas'],
      ...d.serie.map((s) => [s.fecha, diaSemana(s.fecha), s.pedidos, soles(s.ventas)]),
    ])

  return (
    <Pagina
      titulo="Ventas por fecha"
      detalle={d ? `${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)} · ${conVenta} días con venta` : 'cargando…'}
      acciones={
        <>
          <FiltroRango rango={rango} />
          <Boton icono={mdiDownload} onClick={descargar} disabled={!d} className="h-9">
            Descargar
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi color="rojo" icono={mdiCash} titulo="Ventas del periodo" valor={d ? solesCortos(d.totales.ventas) : '…'} detalle={d && <Delta actual={d.totales.ventas} anterior={d.anterior.ventas} />} />
        <Kpi color="turquesa" icono={mdiReceiptText} titulo="Pedidos" valor={d?.totales.pedidos.toLocaleString('es-PE') ?? '…'} detalle={d && <Delta actual={d.totales.pedidos} anterior={d.anterior.pedidos} />} />
        <Kpi color="verde" icono={mdiScaleBalance} titulo="Ticket promedio" valor={d ? enSoles(d.totales.ticketPromedio) : '…'} detalle={d && <Delta actual={d.totales.ticketPromedio} anterior={d.anterior.ticketPromedio} />} />
        <Kpi color="magenta" icono={mdiSilverwareForkKnife} titulo="Platos vendidos" valor={d?.totales.unidades.toLocaleString('es-PE') ?? '…'} detalle={mejor && mejor.ventas > 0 && `Mejor día: ${fechaCorta(mejor.fecha)} (${solesCortos(mejor.ventas)})`} />
      </div>

      {d?.sucursales && d.sucursales.length > 1 && (
        <Panel titulo="Por sucursal" estilo="excel" color="#134f5c" relleno={false} className="mt-4">
          <Tabla
            tono="turquesa"
            columnas={[{ titulo: 'Sucursal' }, { titulo: 'Pedidos', ancho: '90px' }, { titulo: 'Ventas', ancho: '120px' }, { titulo: 'Ticket prom.', ancho: '110px' }, { titulo: 'Parte', ancho: '160px' }]}
          >
            {d.sucursales.map((s) => {
              const parte = d.totales.ventas ? s.ventas / d.totales.ventas : 0
              return (
                <tr key={s.id}>
                  <td className="font-medium">{s.nombre}</td>
                  <td className="text-center tabular-nums">{s.pedidos.toLocaleString('es-PE')}</td>
                  <td className="text-right tabular-nums">{soles(s.ventas)}</td>
                  <td className="text-right tabular-nums">{soles(s.ticketPromedio)}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 flex-1 bg-gris-150">
                        <span className="block h-full bg-turquesa-2" style={{ width: `${Math.round(parte * 100)}%` }} />
                      </span>
                      <span className="w-10 text-right text-[13px] text-tinta-2 tabular-nums">{Math.round(parte * 100)}%</span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </Tabla>
        </Panel>
      )}

      <Panel titulo="Tendencia de Ventas" className="mt-4">
        <Barras
          alto={260}
          datos={(d?.serie ?? []).map((s) => ({ etiqueta: s.fecha.slice(8), valor: s.ventas, detalle: `${diaSemana(s.fecha)} ${fechaCorta(s.fecha)} · ${s.pedidos} pedidos`, resaltar: s === mejor && s.ventas > 0 }))}
          formato={enSoles}
          formatoEje={(v) => (v >= 100000 ? `${(v / 100000).toLocaleString('es-PE')}k` : String(v / 100))}
        />
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel titulo="Ventas por día" estilo="excel" color="#e06666" relleno={false}>
          <Tabla
            tono="rojo"
            alto="420px"
            columnas={[{ titulo: 'Fecha' }, { titulo: 'Pedidos', ancho: '80px' }, { titulo: 'Ventas', ancho: '110px' }]}
            pie={
              <tr>
                <td>Total</td>
                <td className="text-center tabular-nums">{d?.totales.pedidos}</td>
                <td className="text-right tabular-nums">{d && soles(d.totales.ventas)}</td>
              </tr>
            }
          >
            {[...(d?.serie ?? [])].reverse().map((s) => (
              <tr key={s.fecha} className={s.ventas ? '' : 'text-tinta-3'}>
                <td>
                  <span className="inline-block w-9 text-tinta-3 capitalize">{diaSemana(s.fecha)}</span> {fechaCorta(s.fecha)}
                </td>
                <td className="text-center tabular-nums">{s.pedidos || ''}</td>
                <td className="text-right tabular-nums">{s.ventas ? soles(s.ventas) : s.fecha === rango.hoy ? '' : 'cerrado'}</td>
              </tr>
            ))}
          </Tabla>
        </Panel>
        <Panel titulo="Tipo de pago" estilo="excel" color="#e06666" relleno={false}>
          <Tabla
            tono="rojo"
            columnas={[{ titulo: 'Tipo de pago:' }, { titulo: 'Cobros', ancho: '70px' }, { titulo: 'SubTotal', ancho: '110px' }]}
            pie={
              <tr>
                <td>Suma total</td>
                <td className="text-center tabular-nums">{d?.metodos.reduce((s, m) => s + m.pagos, 0)}</td>
                <td className="text-right tabular-nums">{d && soles(d.totales.ventas)}</td>
              </tr>
            }
          >
            {(d?.metodos ?? []).map((m) => (
              <tr key={m.metodo}>
                <td>{m.nombre}</td>
                <td className="text-center tabular-nums">{m.pagos || ''}</td>
                <td className="text-right tabular-nums">{soles(m.monto)}</td>
              </tr>
            ))}
          </Tabla>
          <div className="border-t border-reja p-4">
            <Torta datos={(d?.metodos ?? []).filter((m) => m.monto > 0).map((m, i) => ({ nombre: m.nombre, valor: m.monto, color: PALETA[i % PALETA.length] }))} formato={enSoles} tamano={150} />
          </div>
        </Panel>
        <Panel titulo="Ventas por familia" estilo="excel" color="#e06666" relleno={false}>
          <Tabla tono="rojo" alto="420px" columnas={[{ titulo: 'Familia' }, { titulo: 'Unid.', ancho: '64px' }, { titulo: 'Monto', ancho: '100px' }]}>
            {(d?.familias ?? []).map((f) => (
              <tr key={f.familia}>
                <td className="truncate">{f.familia}</td>
                <td className="text-center tabular-nums">{f.unidades}</td>
                <td className="text-right tabular-nums">{soles(f.monto)}</td>
              </tr>
            ))}
          </Tabla>
        </Panel>
      </div>
    </Pagina>
  )
}
