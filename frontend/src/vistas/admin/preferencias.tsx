import { mdiDownload } from '@mdi/js'
import { useRecurso } from '../../lib/recurso'
import { useAjustes, nombreCocina } from '../../lib/ajustes'
import { fechaCorta, soles } from '../../lib/formato'
import { Boton } from '../../componentes/boton'
import { PALETA, Torta } from './graficos'
import { Pagina, Panel, Tabla, descargarCsv, enSoles } from './piezas'
import { FiltroRango, useRango } from './rango'
import type { ReporteRango } from './tipos'

/** «Preferencias»: qué se pide más, por producto, por familia y por cocina. */
export function Preferencias() {
  const rango = useRango('30')
  const ajustes = useAjustes()
  const { datos: d } = useRecurso<ReporteRango>(`/reportes/rango?desde=${rango.desde}&hasta=${rango.hasta}`, () => false)
  const lista = d?.masVendidos ?? []
  const totalUnidades = lista.reduce((s, p) => s + p.unidades, 0)
  const torta = [
    ...lista.slice(0, 8).map((p) => ({ nombre: p.nombre, valor: p.unidades })),
    ...(lista.length > 8 ? [{ nombre: 'Otros', valor: lista.slice(8).reduce((s, p) => s + p.unidades, 0), color: '#bdc1c6' }] : []),
  ]

  const descargar = () =>
    descargarCsv(`preferencias-${rango.desde}-a-${rango.hasta}.csv`, [
      ['N°', 'Producto', 'Familia', 'Cantidad', 'Monto'],
      ...lista.map((p, i) => [i + 1, p.nombre, p.familia, p.unidades, soles(p.monto)]),
    ])

  return (
    <Pagina
      titulo="Preferencias"
      detalle={d ? `Lo más pedido del ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}` : 'cargando…'}
      acciones={
        <>
          <FiltroRango rango={rango} />
          <Boton icono={mdiDownload} onClick={descargar} disabled={!lista.length} className="h-9">
            Descargar
          </Boton>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <Panel titulo="Preferencia de Productos Vendidos">
            <Torta datos={torta} formato={(v) => `${v} u.`} dona tamano={200} />
          </Panel>
          <Panel titulo="Por cocina">
            <Torta
              datos={(d?.estaciones ?? []).map((e, i) => ({ nombre: nombreCocina(ajustes, e.estacion), valor: e.monto, color: [PALETA[4], PALETA[1], PALETA[5]][i] }))}
              formato={enSoles}
              tamano={150}
            />
          </Panel>
        </div>
        <Panel titulo="Productos más vendidos" estilo="excel" color="#e06666" relleno={false}>
          <Tabla
            tono="rojo"
            alto="calc(100dvh - 230px)"
            columnas={[
              { titulo: 'N°', ancho: '44px' },
              { titulo: 'Producto:' },
              { titulo: 'Familia', ancho: '150px' },
              { titulo: 'Cant:', ancho: '64px' },
              { titulo: '%', ancho: '58px' },
              { titulo: 'Monto', ancho: '100px' },
            ]}
          >
            {lista.map((p, i) => (
              <tr key={p.nombre}>
                <td className="text-center text-tinta-3 tabular-nums">{i + 1}</td>
                <td className="truncate font-medium">{p.nombre}</td>
                <td className="truncate text-tinta-2">{p.familia}</td>
                <td className="text-center tabular-nums">{p.unidades}</td>
                <td className="text-right text-tinta-2 tabular-nums">{totalUnidades ? `${((p.unidades / totalUnidades) * 100).toFixed(1)}%` : ''}</td>
                <td className="text-right tabular-nums">{soles(p.monto)}</td>
              </tr>
            ))}
            {d && !lista.length && (
              <tr>
                <td colSpan={6} className="h-24 text-center text-tinta-3">
                  Sin ventas en este periodo.
                </td>
              </tr>
            )}
          </Tabla>
        </Panel>
      </div>
    </Pagina>
  )
}
