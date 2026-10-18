import { Fragment, useState } from 'react'
import { useSearchParams } from 'react-router'
import { mdiDownload } from '@mdi/js'
import { useRecurso } from '../../lib/recurso'
import { hoyLima } from '../../lib/formato'
import { Boton } from '../../componentes/boton'
import { CampoFecha, Pagina, Panel, descargarCsv } from './piezas'
import type { Acumulado } from './tipos'

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * La hoja «Acumulado»: cuántas unidades de cada producto salieron cada día del
 * mes, con Total, Mín, Máx y Prom. La cabecera roja del libro y un formato
 * condicional de un solo tono: más intenso, más vendido.
 */
export function AcumuladoMes() {
  const [params, setParams] = useSearchParams()
  const mes = params.get('mes') ?? hoyLima().slice(0, 7)
  const { datos: a, cargando } = useRecurso<Acumulado>(`/reportes/acumulado?mes=${mes}`, () => false)
  const [foco, setFoco] = useState<{ fila: string; dia: number } | null>(null)
  const max = Math.max(1, ...(a?.productos.flatMap((p) => Object.values(p.dias)) ?? [1]))
  const [anio, m] = mes.split('-').map(Number)

  // Escala de verdes de Sheets: de casi blanco a verde oscuro.
  const tono = (v: number) => {
    if (!v) return { color: 'var(--color-tinta-4)' }
    const t = Math.sqrt(v / max)
    return {
      background: `color-mix(in srgb, #38761d ${Math.round(10 + t * 80)}%, #ffffff)`,
      color: t > 0.6 ? '#fff' : 'var(--color-tinta)',
    }
  }

  const descargar = () =>
    a &&
    descargarCsv(`acumulado-${mes}.csv`, [
      ['Producto', 'Familia', ...a.diasConVenta.map(String), 'Total', 'Mín', 'Máx', 'Prom'],
      ...a.productos.map((p) => [p.nombre, p.familia, ...a.diasConVenta.map((d) => p.dias[d] ?? 0), p.total, p.minimo, p.maximo, p.promedio.toFixed(1)]),
    ])

  let familiaPrevia = ''
  const th = 'sticky top-0 z-[2] h-9 border-r border-white/20 bg-rojo px-1 text-center text-[12.5px] font-normal text-white'
  return (
    <Pagina
      titulo="Acumulado del mes"
      detalle={`${MES[m - 1]} de ${anio} · unidades por producto y día`}
      acciones={
        <>
          <CampoFecha etiqueta="Mes" tipo="month" valor={mes} max={hoyLima().slice(0, 7)} alCambiar={(v) => setParams({ mes: v }, { replace: true })} />
          <Boton icono={mdiDownload} onClick={descargar} disabled={!a?.productos.length} className="h-9">
            Descargar
          </Boton>
        </>
      }
    >
      <Panel relleno={false} className={cargando ? 'opacity-70' : ''}>
        {a && a.productos.length === 0 ? (
          <p className="py-16 text-center text-tinta-3">No hubo ventas este mes.</p>
        ) : (
          <div className="barra-fina max-h-[calc(100dvh-200px)] overflow-auto">
            <table className="min-w-full border-collapse text-[12.5px] tabular-nums">
              <thead>
                <tr>
                  <th className={`${th} left-0 z-[3] min-w-[210px] px-3 text-left`}>Detalle</th>
                  {a?.diasConVenta.map((d) => (
                    <th key={d} className={`${th} min-w-[34px] ${foco?.dia === d ? 'bg-vino' : ''}`}>
                      {d}
                    </th>
                  ))}
                  {['Total', 'Mín', 'Máx', 'Prom'].map((t) => (
                    <th key={t} className={`${th} min-w-[54px] bg-rojo-reporte`}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a?.productos.map((p) => {
                  const nuevaFamilia = p.familia !== familiaPrevia
                  familiaPrevia = p.familia
                  return (
                    <Fragment key={p.nombre}>
                      {nuevaFamilia && (
                        <tr>
                          <td colSpan={a.diasConVenta.length + 5} className="sticky left-0 border-b border-reja bg-gris-100 px-3 py-1 text-[12px] font-medium text-tinta-2">
                            {p.familia}
                          </td>
                        </tr>
                      )}
                      <tr className="group">
                        <td className={`sticky left-0 z-[1] h-8 max-w-[260px] truncate border-r border-b border-reja bg-hoja px-3 text-[13px] group-hover:bg-azul-suave ${foco?.fila === p.nombre ? 'font-medium' : ''}`}>
                          {p.nombre}
                        </td>
                        {a.diasConVenta.map((d) => (
                          <td
                            key={d}
                            onPointerEnter={() => setFoco({ fila: p.nombre, dia: d })}
                            onPointerLeave={() => setFoco(null)}
                            className="h-8 border-r border-b border-white text-center"
                            style={tono(p.dias[d] ?? 0)}
                            title={`${p.nombre} · día ${d}: ${p.dias[d] ?? 0} u.`}
                          >
                            {p.dias[d] || '·'}
                          </td>
                        ))}
                        <td className="border-r border-b border-reja bg-gris-50 px-2 text-right font-bold">{p.total}</td>
                        <td className="border-r border-b border-reja bg-gris-50 px-2 text-right">{p.minimo}</td>
                        <td className="border-r border-b border-reja bg-gris-50 px-2 text-right">{p.maximo}</td>
                        <td className="border-b border-reja bg-gris-50 px-2 text-right">{p.promedio.toLocaleString('es-PE', { maximumFractionDigits: 1 })}</td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Pagina>
  )
}
