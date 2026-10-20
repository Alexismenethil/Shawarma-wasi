import { Fragment, useEffect, useState } from 'react'
import { mdiChevronLeft, mdiChevronRight, mdiDownload, mdiMagnify } from '@mdi/js'
import { codigoMesa } from '@wasi/shared'
import { descargar } from '../../lib/api'
import { useRecurso } from '../../lib/recurso'
import { useAjustes } from '../../lib/ajustes'
import { useSucursal } from '../../lib/sucursal'
import { fechaCorta, hora, soles } from '../../lib/formato'
import { avisar } from '../../componentes/avisos'
import { Boton } from '../../componentes/boton'
import { Desplegable } from '../../componentes/desplegable'
import { Icono, iconoMedio } from '../../componentes/icono'
import { textoDetalle } from '../mozo/filas'
import { Pagina, Panel, Tabla } from './piezas'
import { FiltroRango, useRango } from './rango'
import type { PaginaConsolidado } from './tipos'

const POR_PAGINA = 100

/**
 * «Consolidado del Mes» y «Filtros Avanzados» del Excel: cada plato vendido
 * con su nota, mesa, fecha, hora, cliente y tipo de pago. Se filtra por texto
 * y por tipo de pago. La tabla llega por páginas de 100 líneas (el resumen sí
 * cuenta todo lo filtrado) y la descarga para Excel trae todo desde el servidor.
 */
export function Consolidado() {
  const { id: vista, sucursales } = useSucursal()
  const todas = !vista && sucursales.length > 1
  const rango = useRango('7')
  const { medios } = useAjustes()
  const [q, setQ] = useState('')
  const [buscado, setBuscado] = useState('')
  const [metodo, setMetodo] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)
  const [bajando, setBajando] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setBuscado(q), 300)
    return () => clearTimeout(t)
  }, [q])
  // Otro filtro, otra búsqueda: se vuelve a la primera página.
  useEffect(() => setPagina(1), [rango.desde, rango.hasta, buscado, metodo])

  const filtro = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta, ...(buscado && { q: buscado }), ...(metodo && { metodo }) })
  const { datos: d, cargando } = useRecurso<PaginaConsolidado>(`/reportes/consolidado?${filtro}&pagina=${pagina}&porPagina=${POR_PAGINA}`, () => false)
  const filas = d?.filas
  const nombre = (clave: string) => medios.find((m) => m.clave === clave)?.nombre ?? clave

  const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: '2-digit', year: 'numeric' })

  const bajar = async () => {
    setBajando(true)
    try {
      await descargar(`/reportes/consolidado.csv?${filtro}`, `consolidado-${rango.desde}-a-${rango.hasta}.csv`)
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setBajando(false)
    }
  }

  let notaPrevia = 0
  return (
    <Pagina
      titulo="Consolidado"
      detalle={`Cada plato vendido del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)}`}
      acciones={<FiltroRango rango={rango} />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[240px] flex-1 items-center gap-2 border border-reja-2 bg-hoja px-2.5 focus-within:border-azul sm:max-w-[360px]">
          <Icono d={mdiMagnify} className="size-[18px] text-tinta-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, familia, cliente u observación" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-tinta-4" />
        </label>
        <span className="w-48">
          <Desplegable
            titulo="Tipo de pago"
            estilo="campo"
            valor={metodo}
            opciones={medios.map((m) => ({ valor: m.clave, etiqueta: m.nombre, icono: iconoMedio(m) }))}
            alCambiar={setMetodo}
            limpiar={{ etiqueta: 'Todos los tipos de pago', alElegir: () => setMetodo(null) }}
            vacio="Todos los pagos"
            buscador={false}
            className="!h-9"
          />
        </span>
        <span className="ml-auto text-[13.5px] text-tinta-2 tabular-nums">
          {d ? (
            <>
              {d.notas.toLocaleString('es-PE')} notas · {d.unidades.toLocaleString('es-PE')} platos · <b className="font-medium text-tinta">S/ {soles(d.monto)}</b>
            </>
          ) : (
            'cargando…'
          )}
        </span>
        <Boton icono={mdiDownload} onClick={() => void bajar()} cargando={bajando} disabled={!d?.lineas} className="h-9">
          Descargar (Excel)
        </Boton>
      </div>

      <Panel titulo="Consolidado del Mes" estilo="excel" color="#e06666" relleno={false} className={cargando ? 'opacity-70' : ''}>
        <Tabla
          tono="rojo"
          alto="calc(100dvh - 260px)"
          columnas={[
            ...(todas ? [{ titulo: 'Sucursal', ancho: '110px' }] : []),
            { titulo: 'Nro', ancho: '58px' },
            { titulo: 'Cant:', ancho: '50px' },
            { titulo: 'Producto:', ancho: '190px' },
            { titulo: 'Adicional:', ancho: '110px' },
            { titulo: 'Detalle:', ancho: '110px' },
            { titulo: 'Obs:', ancho: '110px' },
            { titulo: 'Precio:', ancho: '70px' },
            { titulo: 'PAdic:', ancho: '62px' },
            { titulo: 'Subtotal:', ancho: '78px' },
            { titulo: 'Total', ancho: '78px' },
            { titulo: 'Tipo Pago', ancho: '110px' },
            { titulo: 'Mesa', ancho: '56px' },
            { titulo: 'Fecha', ancho: '92px' },
            { titulo: 'Hora', ancho: '56px' },
            { titulo: 'Cliente', ancho: '100px' },
          ]}
        >
          {filas?.map((f) => {
            const primera = f.pedidoId !== notaPrevia
            notaPrevia = f.pedidoId
            return (
              <Fragment key={f.id}>
                <tr className={primera ? '[&>td]:border-t-2 [&>td]:border-t-tinta-4' : ''}>
                  {todas && <td className="truncate text-tinta-2">{primera && f.sucursal}</td>}
                  <td className="text-center text-tinta-2 tabular-nums">{primera && f.pedidoId}</td>
                  <td className="text-center tabular-nums">{f.cantidad}</td>
                  <td className="max-w-[210px] truncate">{f.nombre}</td>
                  <td className="max-w-[130px] truncate text-tinta-2">{f.adicionales.map((a) => a.nombre).join(' + ')}</td>
                  <td className="truncate text-tinta-2">{textoDetalle(f.paraLlevar, f.detalle)}</td>
                  <td className="max-w-[130px] truncate text-tinta-2">{f.observacion}</td>
                  <td className="text-right tabular-nums">{soles(f.precio)}</td>
                  <td className="text-right tabular-nums">{f.precioAdicionales ? soles(f.precioAdicionales) : ''}</td>
                  <td className="text-right tabular-nums">{soles(f.subtotal)}</td>
                  <td className="text-right font-medium tabular-nums">{primera && soles(f.total)}</td>
                  <td className="truncate">{primera && f.metodos.map(nombre).join(' + ')}</td>
                  <td className="text-center font-medium">{primera && codigoMesa({ tipo: f.mesaTipo, numero: f.mesaNumero })}</td>
                  <td className="text-center text-tinta-2 tabular-nums">{primera && fecha(f.cobradoEn)}</td>
                  <td className="text-center text-tinta-2 tabular-nums">{primera && hora(f.cobradoEn)}</td>
                  <td className="truncate text-tinta-2">{primera && f.cliente}</td>
                </tr>
              </Fragment>
            )
          })}
          {filas && !filas.length && (
            <tr>
              <td colSpan={todas ? 16 : 15} className="h-24 text-center text-tinta-3">
                Nada coincide con el filtro.
              </td>
            </tr>
          )}
        </Tabla>
      </Panel>
      {d && d.paginas > 1 && (
        <nav aria-label="Páginas" className="mt-3 flex flex-wrap items-center justify-end gap-2 text-[13.5px] text-tinta-2">
          <span className="mr-2 tabular-nums">
            Líneas {((d.pagina - 1) * d.porPagina + 1).toLocaleString('es-PE')}–{Math.min(d.pagina * d.porPagina, d.lineas).toLocaleString('es-PE')} de {d.lineas.toLocaleString('es-PE')}
          </span>
          <div className="flex border border-reja-2 bg-hoja">
            <button onClick={() => setPagina(d.pagina - 1)} disabled={d.pagina <= 1} className="flex h-9 items-center gap-1 border-r border-reja pr-3 pl-1.5 hover:bg-gris-50 disabled:text-tinta-4">
              <Icono d={mdiChevronLeft} className="size-5" /> Anterior
            </button>
            <span className="flex h-9 items-center px-3 tabular-nums">
              Página {d.pagina} de {d.paginas}
            </span>
            <button onClick={() => setPagina(d.pagina + 1)} disabled={d.pagina >= d.paginas} className="flex h-9 items-center gap-1 border-l border-reja pr-1.5 pl-3 hover:bg-gris-50 disabled:text-tinta-4">
              Siguiente <Icono d={mdiChevronRight} className="size-5" />
            </button>
          </div>
        </nav>
      )}
    </Pagina>
  )
}
