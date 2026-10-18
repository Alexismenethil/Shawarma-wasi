import { Fragment, useState } from 'react'
import { useSearchParams } from 'react-router'
import { mdiArrowDown, mdiArrowUp, mdiDelete, mdiDotsVertical, mdiFormatListBulleted, mdiMagnify, mdiPlus, mdiPlusBox, mdiShape, mdiSilverwareForkKnife, mdiTagMultiple } from '@mdi/js'
import type { Estacion } from '@wasi/shared'
import { ESTACIONES } from '@wasi/shared'
import { api } from '../../lib/api'
import { useRecurso } from '../../lib/recurso'
import { useAjustes, nombreCocina } from '../../lib/ajustes'
import { Boton } from '../../componentes/boton'
import { Desplegable, DesplegableMultiple, Menu } from '../../componentes/desplegable'
import { Dialogo, confirmar } from '../../componentes/dialogo'
import { ICONOS_FAMILIA, Icono, iconoFamilia } from '../../componentes/icono'
import { aCentimos } from '../mozo/pago'
import { Casilla, CeldaEditable, Pagina, Panel, PestanasPagina, Tabla, useAccion } from './piezas'

/**
 * La carta: las hojas «Productos», «Adicional» y «Detalle» del Excel, cada una
 * con la cabecera de su color. Todo se edita en la misma celda (se toca, se
 * escribe y se guarda al salir), y los mozos ven el cambio al instante.
 */

interface ProductoAdmin {
  id: number
  familiaId: number
  codigo: string | null
  variante: string
  nombre: string
  precio: number
  orden: number
  activo: boolean
  disponible: boolean
  vendidos: number
}
interface FamiliaAdmin {
  id: number
  clave: string
  nombre: string
  estacion: Estacion
  icono: string
  orden: number
  admiteCorte: boolean
  activa: boolean
  productos: ProductoAdmin[]
}
interface AdicionalAdmin {
  id: number
  codigo: string | null
  nombre: string
  precio: number
  orden: number
  activo: boolean
  estaciones: Estacion[]
  familia: string | null
}
interface DetalleAdmin {
  id: number
  nombre: string
  orden: number
  activo: boolean
}

type Hoja = 'productos' | 'familias' | 'adicionales' | 'detalles'

/** Mueve un id una posición y devuelve el nuevo orden de la lista. */
function moverEn(ids: number[], id: number, paso: -1 | 1) {
  const i = ids.indexOf(id)
  const j = i + paso
  if (i < 0 || j < 0 || j >= ids.length) return null
  const copia = [...ids]
  ;[copia[i], copia[j]] = [copia[j], copia[i]]
  return copia
}

function MenuFila({ alSubir, alBajar, alBorrar, borrarTexto = 'Borrar' }: { alSubir?: () => void; alBajar?: () => void; alBorrar: () => void; borrarTexto?: string }) {
  return (
    <Menu
      titulo="Acciones"
      disparador={<Icono d={mdiDotsVertical} className="size-5" />}
      className="mx-auto grid size-8 place-items-center text-tinta-2 hover:bg-gris-150 hover:text-tinta"
      acciones={[
        ...(alSubir ? [{ etiqueta: 'Subir', icono: mdiArrowUp, alElegir: alSubir }] : []),
        ...(alBajar ? [{ etiqueta: 'Bajar', icono: mdiArrowDown, alElegir: alBajar }] : []),
        { etiqueta: borrarTexto, icono: mdiDelete, peligro: true, alElegir: alBorrar },
      ]}
    />
  )
}

export function CartaAdmin() {
  const [params, setParams] = useSearchParams()
  const hoja = (params.get('hoja') as Hoja | null) ?? 'productos'
  const { datos, recargar } = useRecurso<{ familias: FamiliaAdmin[]; adicionales: AdicionalAdmin[] }>('/admin/carta', (c) => !!c.carta)
  const { datos: detalles, recargar: recargarDetalles } = useRecurso<DetalleAdmin[]>('/admin/detalles', (c) => !!c.carta)
  const productos = datos?.familias.reduce((s, f) => s + f.productos.length, 0) ?? 0

  return (
    <Pagina titulo="Carta y precios" detalle="Los cambios llegan al instante a los celulares de los mozos.">
      <PestanasPagina<Hoja>
        activa={hoja}
        alCambiar={(h) => setParams({ hoja: h }, { replace: true })}
        pestanas={[
          { clave: 'productos', etiqueta: 'Productos', icono: mdiSilverwareForkKnife, cuenta: productos },
          { clave: 'familias', etiqueta: 'Familias', icono: mdiShape, cuenta: datos?.familias.length },
          { clave: 'adicionales', etiqueta: 'Adicionales', icono: mdiPlusBox, cuenta: datos?.adicionales.length },
          { clave: 'detalles', etiqueta: 'Detalles', icono: mdiTagMultiple, cuenta: detalles?.length },
        ]}
      />
      <div className="pt-4">
        {hoja === 'productos' && <HojaProductos familias={datos?.familias ?? []} recargar={recargar} />}
        {hoja === 'familias' && <HojaFamilias familias={datos?.familias ?? []} recargar={recargar} />}
        {hoja === 'adicionales' && <HojaAdicionales adicionales={datos?.adicionales ?? []} familias={datos?.familias ?? []} recargar={recargar} />}
        {hoja === 'detalles' && <HojaDetalles detalles={detalles ?? []} recargar={recargarDetalles} />}
      </div>
    </Pagina>
  )
}

/* ── Productos ─────────────────────────────────────────────────────────── */

function HojaProductos({ familias, recargar }: { familias: FamiliaAdmin[]; recargar: () => unknown }) {
  const [familiaId, setFamiliaId] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const accion = useAccion(recargar)
  const guardar = (id: number, datos: object) => api(`/admin/productos/${id}`, { metodo: 'PATCH', cuerpo: datos }).then(recargar)

  const filtro = q.trim().toLowerCase()
  const visibles = familias
    .filter((f) => familiaId === null || f.id === familiaId)
    .map((f) => ({ ...f, productos: f.productos.filter((p) => !filtro || `${p.nombre} ${p.codigo ?? ''}`.toLowerCase().includes(filtro)) }))
    .filter((f) => f.productos.length > 0 || familiaId === f.id)

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="w-56">
          <Desplegable
            titulo="Familia"
            estilo="campo"
            valor={familiaId}
            opciones={familias.map((f) => ({ valor: f.id, etiqueta: f.nombre, icono: iconoFamilia(f.icono), detalle: String(f.productos.length) }))}
            alCambiar={setFamiliaId}
            limpiar={{ etiqueta: 'Todas las familias', alElegir: () => setFamiliaId(null) }}
            vacio="Todas las familias"
            className="!h-9"
          />
        </span>
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 border border-reja-2 bg-hoja px-2.5 focus-within:border-azul sm:max-w-[300px]">
          <Icono d={mdiMagnify} className="size-[18px] text-tinta-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-tinta-4" />
        </label>
        <Boton variante="guardar" icono={mdiPlus} onClick={() => setNuevo(true)} className="ml-auto h-9">
          Agregar producto
        </Boton>
      </div>

      <Panel titulo="Producto" estilo="excel" color="#ea9999" relleno={false}>
        <Tabla
          tono="rojoClaro"
          alto="calc(100dvh - 300px)"
          columnas={[
            { titulo: 'Código', ancho: '84px' },
            { titulo: 'Familia', ancho: '190px' },
            { titulo: 'Detalle (variante)', ancho: '200px' },
            { titulo: 'Nombre' },
            { titulo: 'Precio', ancho: '96px' },
            { titulo: 'Disponible', ancho: '92px' },
            { titulo: 'En carta', ancho: '80px' },
            { titulo: '', ancho: '48px' },
          ]}
        >
          {visibles.map((f) => (
            <Fragment key={f.id}>
              <tr>
                <td colSpan={8} className="!h-8 bg-gris-100! text-[12.5px] font-medium text-tinta-2">
                  <span className="flex items-center gap-2">
                    <Icono d={iconoFamilia(f.icono)} className="size-4" /> {f.nombre} · {nombreCocinaCorta(f.estacion)}
                    {!f.activa && <span className="bg-ambar px-1.5 text-ambar-oscuro">familia oculta</span>}
                  </span>
                </td>
              </tr>
              {f.productos.map((p) => {
                const ids = f.productos.map((x) => x.id)
                const mover = (paso: -1 | 1) => {
                  const orden = moverEn(ids, p.id, paso)
                  if (orden) void accion(() => api('/admin/orden', { metodo: 'PUT', cuerpo: { que: 'producto', ids: orden } }))
                }
                return (
                  <tr key={p.id} className={p.activo ? '' : 'text-tinta-3'}>
                    <td className="editable">
                      <CeldaEditable etiqueta="Código" valor={p.codigo} maximo={12} alinear="centro" alGuardar={(v) => guardar(p.id, { codigo: v })} />
                    </td>
                    <td className="editable px-1!">
                      <Desplegable
                        titulo="Mover a la familia"
                        valor={p.familiaId}
                        opciones={familias.map((x) => ({ valor: x.id, etiqueta: x.nombre, icono: iconoFamilia(x.icono) }))}
                        alCambiar={(id) => void accion(() => guardar(p.id, { familiaId: id }), 'Producto movido')}
                        className="!bg-transparent hover:!bg-gris-150"
                      />
                    </td>
                    <td className="editable">
                      <CeldaEditable etiqueta="Variante" valor={p.variante} alGuardar={(v) => (v ? guardar(p.id, { variante: v }) : Promise.reject(new Error('La variante no puede quedar vacía.')))} />
                    </td>
                    <td className="editable">
                      <CeldaEditable etiqueta="Nombre" valor={p.nombre} alGuardar={(v) => (v ? guardar(p.id, { nombre: v }) : Promise.reject(new Error('El nombre no puede quedar vacío.')))} />
                    </td>
                    <td className="editable">
                      <CeldaEditable etiqueta="Precio" tipo="soles" alinear="derecha" valor={p.precio} alGuardar={(v) => guardar(p.id, { precio: v ?? 0 })} />
                    </td>
                    <td>
                      <Casilla etiqueta="Disponible hoy" marcada={p.disponible} alCambiar={(v) => void accion(() => guardar(p.id, { disponible: v }), v ? `${p.nombre}: disponible` : `${p.nombre}: agotado por hoy`)} />
                    </td>
                    <td>
                      <Casilla etiqueta="En la carta" marcada={p.activo} alCambiar={(v) => void accion(() => guardar(p.id, { activo: v }))} />
                    </td>
                    <td className="px-0!">
                      <MenuFila
                        alSubir={() => mover(-1)}
                        alBajar={() => mover(1)}
                        alBorrar={async () => {
                          if (p.vendidos > 0) {
                            if (await confirmar({ titulo: 'Sacar de la carta', mensaje: `${p.nombre} ya tiene ventas, así que no se borra: se saca de la carta (los reportes lo siguen mostrando).`, aceptar: 'Sacar de la carta', variante: 'oscuro' }))
                              void accion(() => guardar(p.id, { activo: false }), 'Fuera de la carta')
                            return
                          }
                          if (await confirmar({ titulo: 'Borrar producto', mensaje: `¿Borrar ${p.nombre}?`, aceptar: 'Borrar', peligro: true }))
                            void accion(() => api(`/admin/productos/${p.id}`, { metodo: 'DELETE' }), 'Producto borrado')
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </Tabla>
      </Panel>
      <p className="mt-2 text-[12.5px] text-tinta-3">«Disponible» sin marcar = agotado por hoy: el mozo lo ve pero no puede pedirlo. «En carta» sin marcar = ya no se ofrece.</p>

      <DialogoProducto
        abierto={nuevo}
        familias={familias}
        familiaInicial={familiaId}
        alCerrar={() => setNuevo(false)}
        alGuardar={(d) => accion(() => api('/admin/productos', { cuerpo: d }), 'Producto agregado')}
      />
    </>
  )
}

function nombreCocinaCorta(e: Estacion) {
  return `Cocina ${ESTACIONES.indexOf(e) + 1}`
}

function DialogoProducto({
  abierto,
  familias,
  familiaInicial,
  alCerrar,
  alGuardar,
}: {
  abierto: boolean
  familias: FamiliaAdmin[]
  familiaInicial: number | null
  alCerrar: () => void
  alGuardar: (d: { familiaId: number; variante: string; precio: number; codigo: string | null; nombre?: string }) => Promise<boolean>
}) {
  const [familiaId, setFamiliaId] = useState<number | null>(familiaInicial)
  const [variante, setVariante] = useState('')
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [codigo, setCodigo] = useState('')
  const [antes, setAntes] = useState(abierto)
  if (abierto !== antes) {
    setAntes(abierto)
    if (abierto) {
      setFamiliaId(familiaInicial)
      setVariante('')
      setNombre('')
      setPrecio('')
      setCodigo('')
    }
  }
  const familia = familias.find((f) => f.id === familiaId)
  const valido = !!familiaId && variante.trim() && aCentimos(precio) > 0
  const guardar = async () => {
    if (!valido) return
    const ok = await alGuardar({ familiaId: familiaId!, variante: variante.trim(), precio: aCentimos(precio), codigo: codigo.trim() || null, ...(nombre.trim() && { nombre: nombre.trim() }) })
    if (ok) alCerrar()
  }
  return (
    <Dialogo
      abierto={abierto}
      titulo="Agregar producto"
      alCerrar={alCerrar}
      botones={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="guardar" disabled={!valido} onClick={() => void guardar()} className="min-w-28">
            Agregar
          </Boton>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5 text-[13px] text-tinta-2">
          Familia (columna «Producto» del Excel)
          <Desplegable titulo="Familia" estilo="campo" valor={familiaId} opciones={familias.map((f) => ({ valor: f.id, etiqueta: f.nombre, icono: iconoFamilia(f.icono) }))} alCambiar={setFamiliaId} vacio="Elegir familia…" />
        </div>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <label className="grid gap-1.5 text-[13px] text-tinta-2">
            Variante (columna «Detalle»)
            <input className="campo" value={variante} onChange={(e) => setVariante(e.target.value.slice(0, 60))} placeholder="Ej. Huamanguina" />
          </label>
          <label className="grid gap-1.5 text-[13px] text-tinta-2">
            Precio (S/)
            <input className="campo text-right tabular-nums" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, '').slice(0, 8))} placeholder="0.00" />
          </label>
        </div>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <label className="grid gap-1.5 text-[13px] text-tinta-2">
            Nombre (opcional)
            <input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value.slice(0, 90))} placeholder={familia && variante ? `${familia.clave.replace(/-/g, ' ')} ${variante}` : 'Se arma solo'} />
          </label>
          <label className="grid gap-1.5 text-[13px] text-tinta-2">
            Código
            <input className="campo text-center uppercase" value={codigo} onChange={(e) => setCodigo(e.target.value.slice(0, 12))} placeholder="SH" />
          </label>
        </div>
      </div>
    </Dialogo>
  )
}

/* ── Familias ──────────────────────────────────────────────────────────── */

const OPCIONES_ICONO = Object.entries(ICONOS_FAMILIA).map(([clave, i]) => ({ valor: clave, etiqueta: i.nombre, icono: i.d }))

function HojaFamilias({ familias, recargar }: { familias: FamiliaAdmin[]; recargar: () => unknown }) {
  const ajustes = useAjustes()
  const accion = useAccion(recargar)
  const [nueva, setNueva] = useState(false)
  const guardar = (id: number, datos: object) => api(`/admin/familias/${id}`, { metodo: 'PATCH', cuerpo: datos }).then(recargar)
  const ids = familias.map((f) => f.id)
  const opcionesCocina = ESTACIONES.map((e) => ({ valor: e, etiqueta: nombreCocina(ajustes, e) }))

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Boton variante="guardar" icono={mdiPlus} onClick={() => setNueva(true)} className="h-9">
          Agregar familia
        </Boton>
      </div>
      <Panel titulo="Familias de la carta" estilo="excel" color="#93c47d" relleno={false}>
        <Tabla
          tono="verde"
          columnas={[
            { titulo: 'N°', ancho: '48px' },
            { titulo: 'Ícono', ancho: '150px' },
            { titulo: 'Familia (Producto)' },
            { titulo: 'Va a', ancho: '250px' },
            { titulo: 'Admite detalle', ancho: '110px' },
            { titulo: 'Visible', ancho: '76px' },
            { titulo: 'Productos', ancho: '86px' },
            { titulo: '', ancho: '48px' },
          ]}
        >
          {familias.map((f, i) => (
            <tr key={f.id} className={f.activa ? '' : 'text-tinta-3'}>
              <td className="text-center text-tinta-3 tabular-nums">{i + 1}</td>
              <td className="editable px-1!">
                <Desplegable titulo="Ícono" valor={f.icono} opciones={OPCIONES_ICONO} alCambiar={(icono) => void accion(() => guardar(f.id, { icono }))} className="!bg-transparent hover:!bg-gris-150" ancho={220} />
              </td>
              <td className="editable">
                <CeldaEditable etiqueta="Familia" valor={f.nombre} maximo={40} alGuardar={(v) => (v ? guardar(f.id, { nombre: v }) : Promise.reject(new Error('El nombre no puede quedar vacío.')))} />
              </td>
              <td className="editable px-1!">
                <Desplegable titulo="Cocina" valor={f.estacion} opciones={opcionesCocina} alCambiar={(estacion) => void accion(() => guardar(f.id, { estacion }), 'Cocina cambiada')} buscador={false} className="!bg-transparent hover:!bg-gris-150" />
              </td>
              <td>
                <Casilla etiqueta="Admite detalle de corte" marcada={f.admiteCorte} alCambiar={(v) => void accion(() => guardar(f.id, { admiteCorte: v }))} />
              </td>
              <td>
                <Casilla etiqueta="Visible para el mozo" marcada={f.activa} alCambiar={(v) => void accion(() => guardar(f.id, { activa: v }))} />
              </td>
              <td className="text-center text-tinta-2 tabular-nums">{f.productos.length}</td>
              <td className="px-0!">
                <MenuFila
                  alSubir={() => {
                    const orden = moverEn(ids, f.id, -1)
                    if (orden) void accion(() => api('/admin/orden', { metodo: 'PUT', cuerpo: { que: 'familia', ids: orden } }))
                  }}
                  alBajar={() => {
                    const orden = moverEn(ids, f.id, 1)
                    if (orden) void accion(() => api('/admin/orden', { metodo: 'PUT', cuerpo: { que: 'familia', ids: orden } }))
                  }}
                  alBorrar={async () => {
                    if (f.productos.length) return void confirmar({ titulo: 'No se puede borrar', mensaje: `${f.nombre} todavía tiene ${f.productos.length} productos. Muévelos o desmarca «Visible».`, aceptar: 'Entendido', variante: 'oscuro' })
                    if (await confirmar({ titulo: 'Borrar familia', mensaje: `¿Borrar ${f.nombre}?`, aceptar: 'Borrar', peligro: true }))
                      void accion(() => api(`/admin/familias/${f.id}`, { metodo: 'DELETE' }), 'Familia borrada')
                  }}
                />
              </td>
            </tr>
          ))}
        </Tabla>
      </Panel>
      <p className="mt-2 text-[12.5px] text-tinta-3">«Admite detalle» ofrece en la nota los cortes de la hoja Detalles (Corte 2 =, Individual…). «Va a» es la cocina que recibe el pedido.</p>
      <DialogoFamilia abierto={nueva} alCerrar={() => setNueva(false)} alGuardar={(d) => accion(() => api('/admin/familias', { cuerpo: d }), 'Familia agregada')} />
    </>
  )
}

function DialogoFamilia({ abierto, alCerrar, alGuardar }: { abierto: boolean; alCerrar: () => void; alGuardar: (d: { nombre: string; estacion: Estacion; icono: string; admiteCorte: boolean }) => Promise<boolean> }) {
  const ajustes = useAjustes()
  const [nombre, setNombre] = useState('')
  const [estacion, setEstacion] = useState<Estacion>('CARTA')
  const [icono, setIcono] = useState('plato')
  const [corte, setCorte] = useState(false)
  const [antes, setAntes] = useState(abierto)
  if (abierto !== antes) {
    setAntes(abierto)
    if (abierto) {
      setNombre('')
      setEstacion('CARTA')
      setIcono('plato')
      setCorte(false)
    }
  }
  const guardar = async () => {
    if (!nombre.trim()) return
    if (await alGuardar({ nombre: nombre.trim(), estacion, icono, admiteCorte: corte })) alCerrar()
  }
  return (
    <Dialogo
      abierto={abierto}
      titulo="Agregar familia"
      alCerrar={alCerrar}
      botones={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="guardar" disabled={!nombre.trim()} onClick={() => void guardar()} className="min-w-28">
            Agregar
          </Boton>
        </>
      }
    >
      <div className="grid gap-4">
        <label className="grid gap-1.5 text-[13px] text-tinta-2">
          Nombre de la familia
          <input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value.slice(0, 40))} placeholder="Ej. Salchipapas" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5 text-[13px] text-tinta-2">
            Ícono
            <Desplegable titulo="Ícono" estilo="campo" valor={icono} opciones={OPCIONES_ICONO} alCambiar={setIcono} />
          </div>
          <div className="grid gap-1.5 text-[13px] text-tinta-2">
            Va a
            <Desplegable titulo="Cocina" estilo="campo" valor={estacion} opciones={ESTACIONES.map((e) => ({ valor: e, etiqueta: nombreCocina(ajustes, e) }))} alCambiar={setEstacion} buscador={false} />
          </div>
        </div>
        <label className="flex items-center gap-1 text-[14px]">
          <Casilla etiqueta="Admite detalle de corte" marcada={corte} alCambiar={setCorte} />
          Admite detalle de corte (Corte 2 =, Individual…)
        </label>
      </div>
    </Dialogo>
  )
}

/* ── Adicionales ───────────────────────────────────────────────────────── */

function HojaAdicionales({ adicionales, familias, recargar }: { adicionales: AdicionalAdmin[]; familias: FamiliaAdmin[]; recargar: () => unknown }) {
  const ajustes = useAjustes()
  const accion = useAccion(recargar)
  const guardar = (id: number, datos: object) => api(`/admin/adicionales/${id}`, { metodo: 'PATCH', cuerpo: datos }).then(recargar)
  const ids = adicionales.map((a) => a.id)
  const ordenar = (id: number, paso: -1 | 1) => {
    const orden = moverEn(ids, id, paso)
    if (orden) void accion(() => api('/admin/orden', { metodo: 'PUT', cuerpo: { que: 'adicional', ids: orden } }))
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Boton
          variante="guardar"
          icono={mdiPlus}
          onClick={() => {
            let n = 1
            while (adicionales.some((a) => a.nombre === `Nuevo adicional${n > 1 ? ` ${n}` : ''}`)) n++
            void accion(() => api('/admin/adicionales', { cuerpo: { nombre: `Nuevo adicional${n > 1 ? ` ${n}` : ''}`, precio: 100 } }), 'Fila agregada: escribe su nombre y precio')
          }}
          className="h-9"
        >
          Agregar adicional
        </Boton>
      </div>
      <Panel titulo="Adicional" estilo="excel" color="#93c47d" relleno={false}>
        <Tabla
          tono="verde"
          columnas={[
            { titulo: 'Cód', ancho: '64px' },
            { titulo: 'Descripción' },
            { titulo: 'Precio', ancho: '90px' },
            { titulo: 'Se ofrece en', ancho: '250px' },
            { titulo: 'Solo para la familia', ancho: '190px' },
            { titulo: 'Activo', ancho: '70px' },
            { titulo: '', ancho: '48px' },
          ]}
        >
          {adicionales.map((a) => (
            <tr key={a.id} className={a.activo ? '' : 'text-tinta-3'}>
              <td className="editable">
                <CeldaEditable etiqueta="Código" valor={a.codigo} maximo={12} alinear="centro" alGuardar={(v) => guardar(a.id, { codigo: v })} />
              </td>
              <td className="editable">
                <CeldaEditable etiqueta="Descripción" valor={a.nombre} maximo={40} alGuardar={(v) => (v ? guardar(a.id, { nombre: v }) : Promise.reject(new Error('El nombre no puede quedar vacío.')))} />
              </td>
              <td className="editable">
                <CeldaEditable etiqueta="Precio" tipo="soles" alinear="derecha" valor={a.precio} alGuardar={(v) => guardar(a.id, { precio: v ?? 0 })} />
              </td>
              <td className="editable px-1!">
                <DesplegableMultiple
                  titulo="Cocinas donde se ofrece"
                  valores={a.estaciones}
                  opciones={ESTACIONES.map((e) => ({ valor: e, etiqueta: nombreCocina(ajustes, e) }))}
                  alCambiar={(estaciones) => void accion(() => guardar(a.id, { estaciones }))}
                  vacio="Todas las cocinas"
                  buscador={false}
                  className="!bg-transparent hover:!bg-gris-150"
                  ancho={260}
                />
              </td>
              <td className="editable px-1!">
                <Desplegable
                  titulo="Solo para la familia"
                  valor={a.familia}
                  opciones={familias.map((f) => ({ valor: f.clave, etiqueta: f.nombre, icono: iconoFamilia(f.icono) }))}
                  alCambiar={(familia) => void accion(() => guardar(a.id, { familia }))}
                  limpiar={{ etiqueta: '— Cualquier familia', alElegir: () => void accion(() => guardar(a.id, { familia: null })) }}
                  vacio="Cualquier familia"
                  className="!bg-transparent hover:!bg-gris-150"
                />
              </td>
              <td>
                <Casilla etiqueta="Activo" marcada={a.activo} alCambiar={(v) => void accion(() => guardar(a.id, { activo: v }))} />
              </td>
              <td className="px-0!">
                <MenuFila
                  alSubir={() => ordenar(a.id, -1)}
                  alBajar={() => ordenar(a.id, 1)}
                  alBorrar={async () => {
                    if (await confirmar({ titulo: 'Borrar adicional', mensaje: `¿Borrar ${a.nombre}? Las ventas pasadas lo conservan.`, aceptar: 'Borrar', peligro: true }))
                      void accion(() => api(`/admin/adicionales/${a.id}`, { metodo: 'DELETE' }), 'Adicional borrado')
                  }}
                />
              </td>
            </tr>
          ))}
        </Tabla>
      </Panel>
    </>
  )
}

/* ── Detalles ──────────────────────────────────────────────────────────── */

function HojaDetalles({ detalles, recargar }: { detalles: DetalleAdmin[]; recargar: () => unknown }) {
  const accion = useAccion(recargar)
  const [nuevo, setNuevo] = useState('')
  const guardar = (id: number, datos: object) => api(`/admin/detalles/${id}`, { metodo: 'PATCH', cuerpo: datos }).then(recargar)
  const ids = detalles.map((d) => d.id)
  const ordenar = (id: number, paso: -1 | 1) => {
    const orden = moverEn(ids, id, paso)
    if (orden) void accion(() => api('/admin/orden', { metodo: 'PUT', cuerpo: { que: 'detalle', ids: orden } }))
  }
  const agregar = async () => {
    if (!nuevo.trim()) return
    if (await accion(() => api('/admin/detalles', { cuerpo: { nombre: nuevo.trim() } }), 'Detalle agregado')) setNuevo('')
  }
  const enNota = (d: string) => `M: ${d}  ·  L: ${d}`

  return (
    <div className="max-w-[760px]">
      <Panel titulo="Detalle" estilo="excel" color="#b45f06" relleno={false}>
        <Tabla tono="naranja" columnas={[{ titulo: 'Detalle' }, { titulo: 'Así aparece en la nota', ancho: '260px' }, { titulo: 'Activo', ancho: '70px' }, { titulo: '', ancho: '48px' }]}>
          {detalles.map((d) => (
            <tr key={d.id} className={d.activo ? '' : 'text-tinta-3'}>
              <td className="editable">
                <CeldaEditable etiqueta="Detalle" valor={d.nombre} maximo={40} alGuardar={(v) => (v ? guardar(d.id, { nombre: v }) : Promise.reject(new Error('No puede quedar vacío.')))} />
              </td>
              <td className="text-tinta-2">{enNota(d.nombre)}</td>
              <td>
                <Casilla etiqueta="Activo" marcada={d.activo} alCambiar={(v) => void accion(() => guardar(d.id, { activo: v }))} />
              </td>
              <td className="px-0!">
                <MenuFila
                  alSubir={() => ordenar(d.id, -1)}
                  alBajar={() => ordenar(d.id, 1)}
                  alBorrar={async () => {
                    if (await confirmar({ titulo: 'Borrar detalle', mensaje: `¿Borrar «${d.nombre}»? Las notas pasadas lo conservan.`, aceptar: 'Borrar', peligro: true }))
                      void accion(() => api(`/admin/detalles/${d.id}`, { metodo: 'DELETE' }), 'Detalle borrado')
                  }}
                />
              </td>
            </tr>
          ))}
          <tr>
            <td className="editable" colSpan={2}>
              <input
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value.slice(0, 40))}
                onKeyDown={(e) => e.key === 'Enter' && void agregar()}
                placeholder="Escribe un detalle nuevo (ej. Corte 4 =) y pulsa Enter"
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
      <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-tinta-3">
        <Icono d={mdiFormatListBulleted} className="mt-px size-4 shrink-0" />
        Como en el Excel, cada detalle se ofrece con M: (en mesa) y L: (para llevar). Solo aparece en las familias que «admiten detalle».
      </p>
    </div>
  )
}
