import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { mdiClose, mdiContentSave, mdiDelete, mdiDotsVertical, mdiFlask, mdiPercent, mdiPlus, mdiPackageVariant } from '@mdi/js'
import { api } from '../../lib/api'
import { useRecurso } from '../../lib/recurso'
import { soles } from '../../lib/formato'
import { avisar } from '../../componentes/avisos'
import { Boton } from '../../componentes/boton'
import { Desplegable, Menu } from '../../componentes/desplegable'
import { confirmar } from '../../componentes/dialogo'
import { Icono } from '../../componentes/icono'
import { CeldaEditable, Pagina, Panel, PestanasPagina, Tabla, useAccion } from './piezas'

/**
 * Las hojas «Costos» (lo que cuesta comprar cada insumo) e «Insumos» (cuánto
 * lleva cada producto) del Excel, más el margen que sale de cruzarlas.
 */

interface Insumo {
  id: number
  nombre: string
  costoCompra: number
  presentacion: string
  cantidadCompra: number
  unidad: string
  costoUnidad: number
  usos: number
}
interface Receta {
  productoId: number
  nombre: string
  familia: string
  precio: number
  costo: number
  margen: number
  completa: boolean
  lineas: { insumoId: number; insumo: string; cantidad: number | null; unidad: string; costo: number | null }[]
}
interface DatosCostos {
  insumos: Insumo[]
  productos: { id: number; nombre: string; familia: string; precio: number }[]
  recetas: Receta[]
}

type Hoja = 'insumos' | 'recetas' | 'margenes'

const costoTexto = (soles: number) => (soles >= 0.1 ? soles.toFixed(2) : soles.toFixed(4))

export function Costos() {
  const [params, setParams] = useSearchParams()
  const hoja = (params.get('hoja') as Hoja | null) ?? 'margenes'
  const productoId = Number(params.get('producto')) || null
  const { datos, recargar } = useRecurso<DatosCostos>('/admin/costos', () => false)
  const ir = (h: Hoja, producto?: number) => setParams({ hoja: h, ...(producto && { producto: String(producto) }) }, { replace: true })

  return (
    <Pagina titulo="Insumos y costos" detalle="Cuánto cuesta preparar cada producto y cuánto deja.">
      <PestanasPagina<Hoja>
        activa={hoja}
        alCambiar={(h) => ir(h)}
        pestanas={[
          { clave: 'margenes', etiqueta: 'Márgenes', icono: mdiPercent, cuenta: datos?.recetas.length },
          { clave: 'recetas', etiqueta: 'Recetas', icono: mdiFlask },
          { clave: 'insumos', etiqueta: 'Insumos', icono: mdiPackageVariant, cuenta: datos?.insumos.length },
        ]}
      />
      <div className="pt-4">
        {hoja === 'margenes' && <Margenes recetas={datos?.recetas ?? []} alAbrir={(id) => ir('recetas', id)} />}
        {hoja === 'recetas' && datos && <EditorReceta datos={datos} productoId={productoId} alElegir={(id) => ir('recetas', id)} recargar={recargar} />}
        {hoja === 'insumos' && <Insumos insumos={datos?.insumos ?? []} recargar={recargar} />}
      </div>
    </Pagina>
  )
}

function Margenes({ recetas, alAbrir }: { recetas: Receta[]; alAbrir: (id: number) => void }) {
  return (
    <Panel titulo="Costos y márgenes" estilo="excel" color="#e06666" relleno={false}>
      <Tabla
        tono="rojo"
        alto="calc(100dvh - 280px)"
        columnas={[
          { titulo: 'Producto' },
          { titulo: 'Familia', ancho: '170px' },
          { titulo: 'Precio', ancho: '90px' },
          { titulo: 'Costo', ancho: '90px' },
          { titulo: 'Margen', ancho: '90px' },
          { titulo: '%', ancho: '70px' },
          { titulo: 'Receta', ancho: '110px' },
        ]}
      >
        {recetas.map((r) => {
          const pct = r.precio ? (r.margen / r.precio) * 100 : 0
          return (
            <tr key={r.productoId} onClick={() => alAbrir(r.productoId)} className="cursor-pointer">
              <td className="truncate font-medium">{r.nombre}</td>
              <td className="truncate text-tinta-2">{r.familia}</td>
              <td className="text-right tabular-nums">{soles(r.precio)}</td>
              <td className="text-right tabular-nums">{soles(r.costo)}</td>
              <td className={`text-right font-medium tabular-nums ${r.margen < 0 ? 'text-rojo' : 'text-verde-2'}`}>{soles(r.margen)}</td>
              <td className="text-right text-tinta-2 tabular-nums">{pct.toFixed(0)}%</td>
              <td className="text-center">{r.completa ? <span className="bg-menta px-2 py-0.5 text-[12px] text-verde-3">Completa</span> : <span className="bg-ambar px-2 py-0.5 text-[12px] text-ambar-oscuro">Falta costo</span>}</td>
            </tr>
          )
        })}
        {recetas.length === 0 && (
          <tr>
            <td colSpan={7} className="h-24 text-center text-tinta-3">
              Ningún producto tiene receta todavía. Ármala en la pestaña «Recetas».
            </td>
          </tr>
        )}
      </Tabla>
    </Panel>
  )
}

function EditorReceta({ datos, productoId, alElegir, recargar }: { datos: DatosCostos; productoId: number | null; alElegir: (id: number) => void; recargar: () => unknown }) {
  const receta = datos.recetas.find((r) => r.productoId === productoId)
  const producto = datos.productos.find((p) => p.id === productoId)
  const inicial = useMemo(
    () => receta?.lineas.map((l) => ({ insumoId: l.insumoId as number | null, cantidad: l.cantidad === null ? '' : String(l.cantidad), unidad: l.unidad as string | null })) ?? [],
    [receta],
  )
  const [lineas, setLineas] = useState(inicial)
  const [base, setBase] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  if (inicial !== base) {
    setBase(inicial)
    setLineas(inicial)
  }
  const cambiado = JSON.stringify(lineas) !== JSON.stringify(inicial)
  const insumo = (id: number | null) => datos.insumos.find((i) => i.id === id)
  /** La unidad de la línea: la suya si la receta la trae, si no la del insumo. */
  const unidadDe = (l: (typeof lineas)[number]) => l.unidad ?? insumo(l.insumoId)?.unidad ?? ''
  /** Sin costo cuando la receta mide en otra unidad que la de compra (como en el Excel). */
  const costoLinea = (l: (typeof lineas)[number]) => {
    const i = insumo(l.insumoId)
    const c = Number(l.cantidad.replace(',', '.'))
    if (!i || !(c > 0)) return 0
    return unidadDe(l) === i.unidad ? Math.round(c * i.costoUnidad * 100) : null
  }
  const costo = lineas.reduce((s, l) => s + (costoLinea(l) ?? 0), 0)
  const incompleta = lineas.some((l) => costoLinea(l) === null)

  const guardar = async () => {
    if (!productoId) return
    const validas = lineas.filter((l) => l.insumoId)
    setGuardando(true)
    try {
      await api(`/admin/productos/${productoId}/receta`, {
        metodo: 'PUT',
        cuerpo: {
          lineas: validas.map((l) => ({
            insumoId: l.insumoId,
            cantidad: Number(l.cantidad.replace(',', '.')) > 0 ? Number(l.cantidad.replace(',', '.')) : null,
            unidad: unidadDe(l),
          })),
        },
      })
      avisar('Receta guardada', 'ok')
      await recargar()
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="max-w-[900px]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="w-full sm:w-80">
          <Desplegable
            titulo="Producto"
            estilo="campo"
            valor={productoId}
            opciones={datos.productos.map((p, i) => ({
              valor: p.id,
              etiqueta: p.nombre,
              detalle: datos.recetas.some((r) => r.productoId === p.id) ? 'con receta' : undefined,
              grupo: i === 0 || datos.productos[i - 1].familia !== p.familia ? p.familia : undefined,
            }))}
            alCambiar={alElegir}
            vacio="Elegir un producto…"
            className="!h-9"
          />
        </span>
        {producto && (
          <Boton variante="guardar" icono={mdiContentSave} disabled={!cambiado} cargando={guardando} onClick={() => void guardar()} className="ml-auto h-9">
            Guardar receta
          </Boton>
        )}
      </div>
      {!producto ? (
        <p className="border border-dashed border-reja-2 bg-hoja px-4 py-12 text-center text-[14px] text-tinta-3">Elige un producto para ver o armar su receta.</p>
      ) : (
        <Panel titulo={`Insumos · ${producto.nombre}`} estilo="excel" color="#93c47d" relleno={false}>
          <Tabla tono="verde" columnas={[{ titulo: 'Insumo' }, { titulo: 'Cantidad', ancho: '110px' }, { titulo: 'Unid', ancho: '70px' }, { titulo: 'Costo', ancho: '96px' }, { titulo: '', ancho: '48px' }]}>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td className="editable px-1!">
                  <Desplegable
                    titulo="Insumo"
                    valor={l.insumoId}
                    opciones={datos.insumos.map((x) => ({ valor: x.id, etiqueta: x.nombre, detalle: x.unidad, deshabilitada: lineas.some((o, j) => j !== i && o.insumoId === x.id) }))}
                    alCambiar={(id) => setLineas(lineas.map((x, j) => (j === i ? { ...x, insumoId: id, unidad: null } : x)))}
                    vacio="Elegir insumo…"
                    className="!bg-transparent hover:!bg-gris-150"
                  />
                </td>
                <td className="editable">
                  <input
                    value={l.cantidad}
                    onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value.replace(/[^\d.,]/g, '').slice(0, 9) } : x)))}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="Cantidad"
                    className="h-[38px] w-full bg-transparent px-2 text-right text-[14px] tabular-nums outline-none focus:shadow-[inset_0_0_0_2px_var(--color-azul)]"
                  />
                </td>
                <td className="text-center text-tinta-2">{unidadDe(l)}</td>
                <td className="text-right tabular-nums">
                  {costoLinea(l) === null ? (
                    <span className="text-[12.5px] text-naranja" title={`Se compra por ${insumo(l.insumoId)?.unidad}: corrige el insumo para calcularlo`}>
                      sin costo
                    </span>
                  ) : (
                    soles(costoLinea(l) ?? 0)
                  )}
                </td>
                <td className="px-0!">
                  <button onClick={() => setLineas(lineas.filter((_, j) => j !== i))} aria-label="Quitar" className="mx-auto grid size-8 place-items-center text-tinta-3 hover:bg-rosa hover:text-rojo">
                    <Icono d={mdiClose} className="size-[18px]" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} className="px-1!">
                <button onClick={() => setLineas([...lineas, { insumoId: null, cantidad: '', unidad: null }])} className="flex h-8 items-center gap-1 px-2 text-[13px] text-verde-2 hover:bg-menta-suave">
                  <Icono d={mdiPlus} className="size-4" /> Agregar insumo
                </button>
              </td>
            </tr>
          </Tabla>
          {incompleta && (
            <p className="border-t border-reja bg-ambar/50 px-4 py-2 text-[13px] text-ambar-oscuro">
              Hay insumos que la receta mide en otra unidad que la de compra (por ejemplo, gramos de algo que se compra por unidad). Corrige su presentación en la pestaña «Insumos» para que sumen al costo.
            </p>
          )}
          <div className="grid grid-cols-3 border-t border-reja text-center">
            {[
              ['Precio de venta', producto.precio],
              ['Costo', costo],
              ['Margen', producto.precio - costo],
            ].map(([t, v]) => (
              <div key={t as string} className="border-r border-reja py-3 last:border-r-0">
                <p className="text-[12.5px] text-tinta-2">{t}</p>
                <p className={`text-[19px] font-bold tabular-nums ${t === 'Margen' ? ((v as number) < 0 ? 'text-rojo' : 'text-verde-2') : 'text-tinta'}`}>S/ {soles(v as number)}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function Insumos({ insumos, recargar }: { insumos: Insumo[]; recargar: () => unknown }) {
  const accion = useAccion(recargar)
  const [nuevo, setNuevo] = useState('')
  const guardar = (id: number, d: object) => api(`/admin/insumos/${id}`, { metodo: 'PATCH', cuerpo: d }).then(recargar)
  const agregar = async () => {
    if (!nuevo.trim()) return
    const ok = await accion(() => api('/admin/insumos', { cuerpo: { nombre: nuevo.trim(), costoCompra: 0, presentacion: '1 unidad', cantidadCompra: 1, unidad: 'un' } }), 'Insumo agregado: completa su costo')
    if (ok) setNuevo('')
  }
  return (
    <Panel titulo="Costos" estilo="excel" color="#e06666" relleno={false}>
      <Tabla
        tono="rojo"
        alto="calc(100dvh - 280px)"
        columnas={[
          { titulo: 'Detalle (insumo)' },
          { titulo: 'Presentación', ancho: '170px' },
          { titulo: 'Costo', ancho: '100px' },
          { titulo: 'Trae', ancho: '96px' },
          { titulo: 'Unidad', ancho: '80px' },
          { titulo: 'Costo unit.', ancho: '100px' },
          { titulo: 'Recetas', ancho: '80px' },
          { titulo: '', ancho: '48px' },
        ]}
      >
        {insumos.map((i) => (
          <tr key={i.id}>
            <td className="editable">
              <CeldaEditable etiqueta="Insumo" valor={i.nombre} maximo={60} alGuardar={(v) => (v ? guardar(i.id, { nombre: v }) : Promise.reject(new Error('El nombre no puede quedar vacío.')))} />
            </td>
            <td className="editable">
              <CeldaEditable etiqueta="Presentación" valor={i.presentacion} maximo={40} alGuardar={(v) => (v ? guardar(i.id, { presentacion: v }) : Promise.reject(new Error('Escribe la presentación.')))} />
            </td>
            <td className="editable">
              <CeldaEditable etiqueta="Costo de compra" tipo="soles" alinear="derecha" valor={i.costoCompra} alGuardar={(v) => guardar(i.id, { costoCompra: v ?? 0 })} />
            </td>
            <td className="editable">
              <CeldaEditable
                etiqueta="Cantidad que trae"
                tipo="numero"
                alinear="derecha"
                valor={i.cantidadCompra}
                alGuardar={(v) => (typeof v === 'number' && v > 0 ? guardar(i.id, { cantidadCompra: v }) : Promise.reject(new Error('Debe ser mayor que cero.')))}
              />
            </td>
            <td className="editable">
              <CeldaEditable etiqueta="Unidad" valor={i.unidad} maximo={10} alinear="centro" alGuardar={(v) => (v ? guardar(i.id, { unidad: v }) : Promise.reject(new Error('Escribe la unidad.')))} />
            </td>
            <td className="text-right text-tinta-2 tabular-nums">{costoTexto(i.costoUnidad)}</td>
            <td className="text-center text-tinta-2 tabular-nums">{i.usos || ''}</td>
            <td className="px-0!">
              <Menu
                titulo={i.nombre}
                disparador={<Icono d={mdiDotsVertical} className="size-5" />}
                className="mx-auto grid size-8 place-items-center text-tinta-2 hover:bg-gris-150 hover:text-tinta"
                acciones={[
                  {
                    etiqueta: i.usos ? 'Borrar (está en recetas)' : 'Borrar',
                    icono: mdiDelete,
                    peligro: true,
                    deshabilitada: i.usos > 0,
                    alElegir: async () => {
                      if (await confirmar({ titulo: 'Borrar insumo', mensaje: `¿Borrar ${i.nombre}?`, aceptar: 'Borrar', peligro: true }))
                        void accion(() => api(`/admin/insumos/${i.id}`, { metodo: 'DELETE' }), 'Insumo borrado')
                    },
                  },
                ]}
              />
            </td>
          </tr>
        ))}
        <tr>
          <td className="editable" colSpan={6}>
            <input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value.slice(0, 60))}
              onKeyDown={(e) => e.key === 'Enter' && void agregar()}
              placeholder="Nuevo insumo (ej. Mayonesa) y Enter"
              className="h-[38px] w-full bg-transparent px-2 text-[14px] outline-none placeholder:text-tinta-4 focus:shadow-[inset_0_0_0_2px_var(--color-azul)]"
            />
          </td>
          <td colSpan={2} className="px-1!">
            <button onClick={() => void agregar()} disabled={!nuevo.trim()} className="flex h-8 w-full items-center justify-center gap-1 text-[13px] text-verde-2 hover:bg-menta-suave disabled:text-tinta-4">
              <Icono d={mdiPlus} className="size-4" /> Agregar
            </button>
          </td>
        </tr>
      </Tabla>
    </Panel>
  )
}
