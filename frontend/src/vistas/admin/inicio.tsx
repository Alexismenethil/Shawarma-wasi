import { useSearchParams } from 'react-router'
import { mdiCash, mdiReceiptText, mdiScaleBalance, mdiTableFurniture } from '@mdi/js'
import { useRecurso } from '../../lib/recurso'
import { useSesion } from '../../lib/sesion'
import { useAjustes } from '../../lib/ajustes'
import { fechaLarga, hoyLima, soles } from '../../lib/formato'
import { iconoMedio } from '../../componentes/icono'
import { Icono } from '../../componentes/icono'
import { Barras, BarrasH, PALETA, Torta } from './graficos'
import { CampoFecha, Kpi, Pagina, Panel, Tabla, enSoles, solesCortos } from './piezas'
import type { ReporteDia } from './tipos'

function saludo() {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }))
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/**
 * Inicio: el día de un vistazo, como el panel de referencia. Cuatro tarjetas
 * (ventas, pedidos, ticket promedio y lo que está en curso), la venta por
 * hora, el tipo de pago, la preferencia de productos y el resumen de caja.
 */
export function Inicio() {
  const sesion = useSesion()
  const ajustes = useAjustes()
  const [params, setParams] = useSearchParams()
  const hoy = hoyLima()
  const fecha = params.get('fecha') ?? hoy
  const { datos: d } = useRecurso<ReporteDia>(`/reportes/dia?fecha=${fecha}`, (c) => !!c.mesas)
  const esHoy = fecha === hoy

  const horas = (() => {
    if (!d) return []
    const conVenta = d.porHora.map((h) => h.hora)
    const desde = Math.min(11, ...conVenta)
    const hasta = Math.max(22, ...conVenta)
    return Array.from({ length: hasta - desde + 1 }, (_, i) => {
      const h = desde + i
      const f = d.porHora.find((x) => x.hora === h)
      return { etiqueta: `${h}h`, valor: f?.ventas ?? 0, detalle: `${h}:00 – ${h}:59 · ${f?.pedidos ?? 0} pedidos` }
    })
  })()

  const top = d?.masVendidos ?? []
  const preferencia = [
    ...top.slice(0, 6).map((p) => ({ nombre: p.nombre, valor: p.unidades })),
    ...(top.length > 6 ? [{ nombre: 'Otros', valor: top.slice(6).reduce((s, p) => s + p.unidades, 0), color: '#bdc1c6' }] : []),
  ]

  return (
    <Pagina
      titulo={`${saludo()}, ${sesion?.usuario.nombre ?? ''}`}
      detalle={esHoy ? `Hoy, ${fechaLarga(fecha)}` : fechaLarga(fecha)}
      acciones={<CampoFecha etiqueta="Día" valor={fecha} max={hoy} alCambiar={(f) => setParams(f === hoy ? {} : { fecha: f }, { replace: true })} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi color="rojo" icono={mdiCash} titulo={esHoy ? 'Ventas de hoy' : 'Ventas del día'} valor={d ? solesCortos(d.totales.ventas) : '…'} detalle={d && `${d.totales.unidades} platos vendidos`} a="/admin/reporte-diario" />
        <Kpi color="turquesa" icono={mdiReceiptText} titulo="Pedidos cobrados" valor={d?.totales.pedidos ?? '…'} detalle="notas cerradas" a="/admin/consolidado" />
        <Kpi color="verde" icono={mdiScaleBalance} titulo="Ticket promedio" valor={d ? enSoles(d.totales.ticketPromedio) : '…'} detalle="por nota" a="/admin/ventas" />
        <Kpi
          color="magenta"
          icono={mdiTableFurniture}
          titulo="En curso ahora"
          valor={d ? `${d.enCurso.pedidos} mesa${d.enCurso.pedidos === 1 ? '' : 's'}` : '…'}
          detalle={d && `${enSoles(d.enCurso.total)} por cobrar`}
          a="/mozo"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel titulo="Ventas por hora">
          <Barras datos={horas} formato={(v) => enSoles(v)} formatoEje={(v) => (v >= 100000 ? `${v / 100000}k` : String(v / 100))} />
        </Panel>
        <Panel titulo="Tipo de pago">
          <Torta
            datos={(d?.metodos ?? []).filter((m) => m.monto > 0).map((m, i) => ({ nombre: m.nombre, valor: m.monto, color: PALETA[i % PALETA.length] }))}
            formato={enSoles}
            tamano={170}
          />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel titulo="Preferencia de productos">
          <Torta datos={preferencia} formato={(v) => `${v} u.`} dona tamano={170} />
        </Panel>
        <Panel titulo="Lo más pedido">
          {top.length ? (
            <BarrasH datos={top.slice(0, 8).map((p) => ({ nombre: p.nombre, valor: p.unidades, detalle: enSoles(p.monto) }))} formato={(v) => `${v} u.`} color={PALETA[3]} />
          ) : (
            <p className="py-10 text-center text-[13.5px] text-tinta-3">Sin ventas este día</p>
          )}
        </Panel>
        <Panel titulo="Resumen" estilo="excel" color="#e06666" relleno={false}>
          <Tabla
            tono="rojo"
            columnas={[{ titulo: 'Tipo de pago:' }, { titulo: 'Cobros', ancho: '70px' }, { titulo: 'SubTotal', ancho: '110px' }]}
            pie={
              <tr>
                <td>Suma total</td>
                <td className="text-center tabular-nums">{d?.metodos.reduce((s, m) => s + m.pagos, 0) ?? ''}</td>
                <td className="text-right tabular-nums">{d ? soles(d.totales.ventas) : ''}</td>
              </tr>
            }
          >
            {(d?.metodos ?? ajustes.medios.map((m) => ({ metodo: m.clave, nombre: m.nombre, monto: 0, pagos: 0, vuelto: 0 }))).map((m) => (
              <tr key={m.metodo}>
                <td>
                  <span className="flex items-center gap-2">
                    <Icono d={iconoMedio({ clave: m.metodo, nombre: m.nombre })} className="size-[18px] text-tinta-3" />
                    {m.nombre}
                  </span>
                </td>
                <td className="text-center text-tinta-2 tabular-nums">{m.pagos || ''}</td>
                <td className="text-right tabular-nums">{soles(m.monto)}</td>
              </tr>
            ))}
          </Tabla>
        </Panel>
      </div>
    </Pagina>
  )
}
