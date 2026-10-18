import { Fragment } from 'react'
import { useSearchParams } from 'react-router'
import { mdiDownload } from '@mdi/js'
import { codigoMesa } from '@wasi/shared'
import { useRecurso } from '../../lib/recurso'
import { useAjustes } from '../../lib/ajustes'
import { fechaLarga, hora, hoyLima, soles } from '../../lib/formato'
import { Boton } from '../../componentes/boton'
import { textoDetalle } from '../mozo/filas'
import { CampoFecha, Pagina, Panel, Tabla, descargarCsv } from './piezas'
import type { ReporteDia } from './tipos'

/**
 * «Reporte Diario»: las hojas Arqueo y Resumen del Excel. Cada plato cobrado
 * en el día con su nota (total, tipo de pago, pago, vuelto y mesa en la
 * primera fila de cada nota) y, al lado, lo cobrado por tipo de pago.
 */
export function ReporteDiario() {
  const [params, setParams] = useSearchParams()
  const hoy = hoyLima()
  const fecha = params.get('fecha') ?? hoy
  const { medios } = useAjustes()
  const { datos: d } = useRecurso<ReporteDia>(`/reportes/dia?fecha=${fecha}`, (c) => !!c.mesas)
  const nombre = (clave: string) => medios.find((m) => m.clave === clave)?.nombre ?? clave
  const pedidos = [...(d?.pedidos ?? [])].reverse()

  const descargar = () => {
    if (!d) return
    const filas: (string | number | null)[][] = [['Nro', 'Hora', 'Mesa', 'Cant', 'Producto', 'Adicional', 'Detalle', 'Obs', 'Precio', 'PAdic', 'Subtotal', 'Total', 'Tipo Pago', 'Pago', 'Vuelto', 'Mozo']]
    // El archivo lleva también el mozo; la pantalla lo omite para que la hoja quepa.
    pedidos.forEach((p, n) =>
      p.items.forEach((i, k) =>
        filas.push([
          k === 0 ? n + 1 : null,
          k === 0 ? hora(p.cobradoEn) : null,
          k === 0 ? codigoMesa(p.mesa) : null,
          i.cantidad,
          i.nombre,
          i.adicionales.join(' + '),
          textoDetalle(i.paraLlevar, i.detalle),
          i.observacion,
          soles(i.precio),
          i.precioAdicionales ? soles(i.precioAdicionales) : null,
          soles(i.subtotal),
          k === 0 ? soles(p.total) : null,
          k === 0 ? p.pagos.map((g) => nombre(g.metodo)).join(' + ') : null,
          k === 0 ? soles(p.pagos.reduce((s, g) => s + (g.recibido ?? g.monto), 0)) : null,
          k === 0 ? soles(p.pagos.reduce((s, g) => s + Math.max(0, (g.recibido ?? g.monto) - g.monto), 0)) : null,
          k === 0 ? p.mozo : null,
        ]),
      ),
    )
    descargarCsv(`reporte-diario-${fecha}.csv`, filas)
  }

  return (
    <Pagina
      titulo="Reporte diario"
      detalle={`${fechaLarga(fecha)} · ${d ? `${d.totales.pedidos} notas cobradas · ${d.totales.unidades} platos` : 'cargando…'}`}
      acciones={
        <>
          <CampoFecha etiqueta="Día" valor={fecha} max={hoy} alCambiar={(f) => setParams(f === hoy ? {} : { fecha: f }, { replace: true })} />
          <Boton icono={mdiDownload} onClick={descargar} disabled={!d?.pedidos.length} className="h-9">
            Descargar (Excel)
          </Boton>
        </>
      }
    >
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel titulo="Reporte Diario" estilo="excel" color="#e06666" relleno={false}>
          <Tabla
            tono="rojo"
            alto="calc(100dvh - 220px)"
            columnas={[
              { titulo: 'Nro', ancho: '44px' },
              { titulo: 'Hora', ancho: '54px' },
              { titulo: 'Mesa', ancho: '54px' },
              { titulo: 'Cant:', ancho: '48px' },
              { titulo: 'Producto:', ancho: '200px' },
              { titulo: 'Adicional:', ancho: '104px' },
              { titulo: 'Detalle:', ancho: '104px' },
              { titulo: 'Obs:', ancho: '104px' },
              { titulo: 'Precio:', ancho: '68px' },
              { titulo: 'PAdic:', ancho: '60px' },
              { titulo: 'Subtotal:', ancho: '76px' },
              { titulo: 'Total', ancho: '76px' },
              { titulo: 'Tipo Pago', ancho: '104px' },
              { titulo: 'Pago', ancho: '72px' },
              { titulo: 'V/PE', ancho: '64px' },
            ]}
          >
            {pedidos.map((p, n) => {
              const pago = p.pagos.reduce((s, g) => s + (g.recibido ?? g.monto), 0)
              const vuelto = p.pagos.reduce((s, g) => s + Math.max(0, (g.recibido ?? g.monto) - g.monto), 0)
              return (
                <Fragment key={p.id}>
                  {p.items.map((i, k) => (
                    <tr key={k} className={k === 0 ? '[&>td]:border-t-2 [&>td]:border-t-tinta-4' : ''}>
                      <td className="text-center font-medium tabular-nums">{k === 0 && n + 1}</td>
                      <td className="text-center text-tinta-2 tabular-nums">{k === 0 && hora(p.cobradoEn)}</td>
                      <td className="text-center font-medium">{k === 0 && codigoMesa(p.mesa)}</td>
                      <td className="text-center tabular-nums">{i.cantidad}</td>
                      <td className="max-w-[220px] truncate">{i.nombre}</td>
                      <td className="max-w-[140px] truncate text-tinta-2">{i.adicionales.join(' + ')}</td>
                      <td className="truncate text-tinta-2">{textoDetalle(i.paraLlevar, i.detalle)}</td>
                      <td className="max-w-[140px] truncate text-tinta-2">{i.observacion}</td>
                      <td className="text-right tabular-nums">{soles(i.precio)}</td>
                      <td className="text-right tabular-nums">{i.precioAdicionales ? soles(i.precioAdicionales) : ''}</td>
                      <td className="text-right tabular-nums">{soles(i.subtotal)}</td>
                      <td className="text-right font-medium tabular-nums">{k === 0 && soles(p.total)}</td>
                      <td className="truncate">{k === 0 && p.pagos.map((g) => nombre(g.metodo)).join(' + ')}</td>
                      <td className="text-right tabular-nums">{k === 0 && soles(pago)}</td>
                      <td className="text-right text-verde-2 tabular-nums">{k === 0 && vuelto > 0 && soles(vuelto)}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
            {d && !pedidos.length && (
              <tr>
                <td colSpan={15} className="h-24 text-center text-tinta-3">
                  No hay notas cobradas este día.
                </td>
              </tr>
            )}
          </Tabla>
        </Panel>

        <div className="space-y-4">
          <Panel titulo="Resumen" estilo="excel" color="#e06666" relleno={false}>
            <Tabla
              tono="rojo"
              columnas={[{ titulo: 'Tipo de pago:' }, { titulo: 'SubTotal', ancho: '110px' }]}
              pie={
                <tr>
                  <td className="bg-campo!">Suma total</td>
                  <td className="bg-campo! text-right tabular-nums">{d ? soles(d.totales.ventas) : ''}</td>
                </tr>
              }
            >
              {(d?.metodos ?? []).map((m) => (
                <tr key={m.metodo}>
                  <td>{m.nombre}</td>
                  <td className="text-right tabular-nums">{soles(m.monto)}</td>
                </tr>
              ))}
            </Tabla>
          </Panel>
          {d && d.metodos.some((m) => m.vuelto > 0) && (
            <Panel titulo="Efectivo en caja" estilo="excel" color="#6aa84f" relleno={false}>
              <Tabla tono="verde" columnas={[{ titulo: 'Concepto' }, { titulo: 'Monto', ancho: '110px' }]}>
                {d.metodos
                  .filter((m) => m.vuelto > 0 || m.monto > 0)
                  .filter((m) => medios.find((x) => x.clave === m.metodo)?.efectivo)
                  .map((m) => (
                    <Fragment key={m.metodo}>
                      <tr>
                        <td>Recibido en {m.nombre.toLowerCase()}</td>
                        <td className="text-right tabular-nums">{soles(m.monto + m.vuelto)}</td>
                      </tr>
                      <tr>
                        <td>Vuelto entregado</td>
                        <td className="text-right text-rojo-oscuro tabular-nums">−{soles(m.vuelto)}</td>
                      </tr>
                      <tr>
                        <td className="font-medium">Queda en caja</td>
                        <td className="text-right font-medium tabular-nums">{soles(m.monto)}</td>
                      </tr>
                    </Fragment>
                  ))}
              </Tabla>
            </Panel>
          )}
        </div>
      </div>
    </Pagina>
  )
}
