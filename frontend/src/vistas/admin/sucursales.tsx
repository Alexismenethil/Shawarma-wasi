import { useState } from 'react'
import { useNavigate } from 'react-router'
import { mdiAccountGroup, mdiCheckBold, mdiChefHat, mdiDotsVertical, mdiEye, mdiPlus, mdiStorefront, mdiTableFurniture } from '@mdi/js'
import type { CocinaCompartida, Estacion } from '@wasi/shared'
import { ESTACIONES } from '@wasi/shared'
import { api } from '../../lib/api'
import { useRecurso } from '../../lib/recurso'
import { elegirVista } from '../../lib/sucursal'
import { hora } from '../../lib/formato'
import { nombreCocina, useAjustes } from '../../lib/ajustes'
import { avisar } from '../../componentes/avisos'
import { Boton } from '../../componentes/boton'
import { Desplegable, Menu } from '../../componentes/desplegable'
import { Dialogo, confirmar } from '../../componentes/dialogo'
import { Icono } from '../../componentes/icono'
import { Casilla, CeldaEditable, Pagina, Panel, Tabla, useAccion } from './piezas'

interface SucursalAdmin {
  id: number
  nombre: string
  direccion: string
  telefono: string
  activa: boolean
  creadaEn: string
  mesas: number
  llevar: number
  personal: number
  notasAbiertas: number
  caja: { abiertaPor: string; abiertaEn: string } | null
  /** Temporal: qué cocinas manda a la de otra sucursal. */
  cocinaCompartida: CocinaCompartida | null
  /** Las sucursales activas a las que les cocina. */
  cocinaPara: number[]
}

/** «Carta y Shawarmas», con los nombres que el local puso a sus cocinas. */
const listaCocinas = (estaciones: Record<Estacion, string>, cuales: Estacion[]) => {
  const nombres = ESTACIONES.filter((e) => cuales.includes(e)).map((e) => estaciones[e])
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : (nombres[0] ?? '')
}
const sePreparan = (n: number) => (n === 1 ? 'se prepara' : 'se preparan')

/**
 * Las sucursales del negocio. Una base para todas: cada sucursal tiene sus
 * mesas, su personal, su caja y sus notas, y comparte la carta, los medios de
 * pago y los datos generales. Una sucursal nueva nace con sus hojas M y L.
 */
export function Sucursales() {
  const navegar = useNavigate()
  const { datos, recargar } = useRecurso<SucursalAdmin[]>('/admin/sucursales', (c) => !!c.ajustes || !!c.caja || !!c.mesas)
  const accion = useAccion(recargar)
  const { estaciones } = useAjustes()
  const [nueva, setNueva] = useState(false)
  const [cocinaDe, setCocinaDe] = useState<SucursalAdmin | null>(null)
  const guardar = (id: number, d: object) => api(`/admin/sucursales/${id}`, { metodo: 'PATCH', cuerpo: d }).then(recargar)
  const activas = datos?.filter((s) => s.activa).length ?? 0
  const nombre = (id: number) => datos?.find((s) => s.id === id)?.nombre ?? `Sucursal ${id}`
  const compartidas = datos?.filter((s) => s.activa && s.cocinaCompartida) ?? []

  const ir = (id: number, ruta: string) => {
    elegirVista(id)
    navegar(ruta)
  }

  const cambiarActiva = async (s: SucursalAdmin, activa: boolean) => {
    if (!activa && !(await confirmar({ titulo: 'Desactivar sucursal', mensaje: `¿Desactivar ${s.nombre}? Su personal ya no podrá entrar y desaparece de la entrada. Sus ventas siguen en los reportes.`, aceptar: 'Desactivar', peligro: true })))
      return
    void accion(() => guardar(s.id, { activa }), activa ? `${s.nombre} activa otra vez` : `${s.nombre} desactivada`)
  }

  return (
    <Pagina
      titulo="Sucursales"
      detalle={datos ? `${activas} ${activas === 1 ? 'sucursal activa' : 'sucursales activas'} · una sola base, cada una con sus mesas, su caja y su personal` : 'cargando…'}
      acciones={
        <Boton variante="guardar" icono={mdiPlus} onClick={() => setNueva(true)} className="h-9">
          Agregar sucursal
        </Boton>
      }
    >
      {compartidas.map((s) => (
        <div key={s.id} className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border border-[#f1c232] bg-crema px-3 py-2.5 text-[13.5px] text-ambar-oscuro">
          <Icono d={mdiChefHat} className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <b className="font-medium">Cocina compartida (temporal):</b> {listaCocinas(estaciones, s.cocinaCompartida!.estaciones)} de {s.nombre}{' '}
            {sePreparan(s.cocinaCompartida!.estaciones.length)} en la cocina de {nombre(s.cocinaCompartida!.en)}. Lo demás, cada local en la suya.
          </span>
          <Boton onClick={() => setCocinaDe(s)} className="h-8 !border-[#f1c232] !bg-hoja">
            Cambiar
          </Boton>
        </div>
      ))}

      <Panel titulo="Sucursales del negocio" estilo="excel" color="#134f5c" relleno={false}>
        <Tabla
          tono="turquesa"
          columnas={[
            { titulo: 'Sucursal', ancho: '180px' },
            { titulo: 'Dirección (sale en la nota)' },
            { titulo: 'Teléfono', ancho: '130px' },
            { titulo: 'Mesas', ancho: '84px' },
            { titulo: 'Personal', ancho: '84px' },
            { titulo: 'Cocina', ancho: '200px' },
            { titulo: 'Caja ahora', ancho: '190px' },
            { titulo: 'Activa', ancho: '70px' },
            { titulo: '', ancho: '48px' },
          ]}
        >
          {datos?.map((s) => (
            <tr key={s.id} className={s.activa ? '' : 'text-tinta-3'}>
              <td className="editable">
                <CeldaEditable etiqueta="Nombre de la sucursal" valor={s.nombre} maximo={40} alGuardar={(v) => (v ? guardar(s.id, { nombre: v }) : Promise.reject(new Error('El nombre no puede quedar vacío.')))} />
              </td>
              <td className="editable">
                <CeldaEditable etiqueta="Dirección" valor={s.direccion} maximo={120} placeholder="Jr. …, Huamanga" alGuardar={(v) => guardar(s.id, { direccion: v ?? '' })} />
              </td>
              <td className="editable">
                <CeldaEditable etiqueta="Teléfono" valor={s.telefono} maximo={30} alGuardar={(v) => guardar(s.id, { telefono: v ?? '' })} />
              </td>
              <td className="text-center text-tinta-2 tabular-nums">
                {s.mesas} <span className="text-tinta-4">+</span> {s.llevar}
              </td>
              <td className="text-center text-tinta-2 tabular-nums">{s.personal}</td>
              <td className="px-0!">
                <button
                  type="button"
                  disabled={!s.activa}
                  onClick={() => setCocinaDe(s)}
                  aria-label={`Cocina de ${s.nombre}: ${s.cocinaCompartida ? `en ${nombre(s.cocinaCompartida.en)}` : 'propia'}`}
                  className="flex min-h-9 w-full flex-col justify-center px-2.5 py-1 text-left text-[13px] leading-tight enabled:hover:bg-gris-100"
                >
                  {s.cocinaCompartida ? (
                    <>
                      <span className="font-medium text-ambar-oscuro">En {nombre(s.cocinaCompartida.en)}</span>
                      <span className="text-[12px] text-tinta-3">{listaCocinas(estaciones, s.cocinaCompartida.estaciones)} · temporal</span>
                    </>
                  ) : (
                    <>
                      <span>Propia</span>
                      {s.cocinaPara.length > 0 && <span className="text-[12px] text-tinta-3">también cocina para {s.cocinaPara.map(nombre).join(' y ')}</span>}
                    </>
                  )}
                </button>
              </td>
              <td>
                {s.caja ? (
                  <span className="flex items-center gap-1.5 text-[13px]">
                    <span className="size-2 rounded-full bg-verde-2" />
                    Abierta · {s.caja.abiertaPor} · {hora(s.caja.abiertaEn)}
                  </span>
                ) : (
                  <span className="text-[13px] text-tinta-3">Cerrada</span>
                )}
              </td>
              <td>
                <Casilla etiqueta="Activa" marcada={s.activa} alCambiar={(v) => void cambiarActiva(s, v)} />
              </td>
              <td className="px-0!">
                <Menu
                  titulo={s.nombre}
                  disparador={<Icono d={mdiDotsVertical} className="size-5" />}
                  className="mx-auto grid size-8 place-items-center text-tinta-2 hover:bg-gris-150 hover:text-tinta"
                  acciones={[
                    { etiqueta: 'Ver sus reportes', icono: mdiEye, alElegir: () => ir(s.id, '/admin') },
                    { etiqueta: 'Sus mesas', icono: mdiTableFurniture, alElegir: () => ir(s.id, '/admin/mesas') },
                    { etiqueta: 'Su personal', icono: mdiAccountGroup, alElegir: () => ir(s.id, '/admin/equipo') },
                    ...(s.activa ? [{ etiqueta: 'Su cocina', icono: mdiChefHat, alElegir: () => setCocinaDe(s) }] : []),
                  ]}
                />
              </td>
            </tr>
          ))}
        </Tabla>
      </Panel>
      <p className="mt-2 max-w-[900px] text-[12.5px] text-tinta-3">
        Cada sucursal tiene su M1 y su L1, su caja y sus notas: nada se mezcla. La carta es una para todas; los precios propios, los productos exclusivos y los agotados de
        cada sucursal se ponen en Carta y precios. Una sucursal con ventas no se borra: se desactiva. «Cocina» dice dónde se preparan sus pedidos: si comparte la de otra
        sucursal, esas comandas salen en una sola pantalla con el nombre de cada local.
      </p>

      {cocinaDe && datos && (
        <DialogoCocina
          sucursal={cocinaDe}
          todas={datos}
          alCerrar={() => setCocinaDe(null)}
          alGuardar={async (cocina) => {
            const ok = await accion(
              () => guardar(cocinaDe.id, { cocinaCompartida: cocina }),
              cocina
                ? `${cocinaDe.nombre}: ${listaCocinas(estaciones, cocina.estaciones)} ${sePreparan(cocina.estaciones.length)} en ${nombre(cocina.en)}`
                : `${cocinaDe.nombre} vuelve a su cocina propia`,
            )
            if (ok) setCocinaDe(null)
          }}
        />
      )}

      <DialogoSucursal
        abierto={nueva}
        alCerrar={() => setNueva(false)}
        alCrear={(s) => {
          setNueva(false)
          void recargar()
          void confirmar({
            titulo: 'Sucursal creada',
            mensaje: `${s.nombre} ya tiene sus mesas. Falta su personal: agrega a sus mozos, cocina y caja (y su encargada, si tiene).`,
            aceptar: 'Agregar su personal',
            variante: 'guardar',
            cancelar: 'Después',
          }).then((ok) => ok && ir(s.id, '/admin/equipo'))
        }}
      />
    </Pagina>
  )
}

function DialogoSucursal({ abierto, alCerrar, alCrear }: { abierto: boolean; alCerrar: () => void; alCrear: (s: { id: number; nombre: string }) => void }) {
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [mesas, setMesas] = useState('10')
  const [llevar, setLlevar] = useState('5')
  const [guardando, setGuardando] = useState(false)
  const [antes, setAntes] = useState(abierto)
  if (abierto !== antes) {
    setAntes(abierto)
    if (abierto) {
      setNombre('')
      setDireccion('')
      setTelefono('')
      setMesas('10')
      setLlevar('5')
    }
  }
  const n = (t: string, max: number) => Math.max(0, Math.min(max, Number(t) || 0))

  const crear = async () => {
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      const s = await api<{ id: number; nombre: string }>('/admin/sucursales', {
        cuerpo: { nombre: nombre.trim(), direccion: direccion.trim(), telefono: telefono.trim(), mesas: n(mesas, 80), llevar: n(llevar, 40) },
      })
      avisar(`${s.nombre} creada con ${n(mesas, 80)} mesas y ${n(llevar, 40)} para llevar`, 'ok')
      alCrear(s)
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      titulo="Agregar sucursal"
      alCerrar={alCerrar}
      botones={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="guardar" icono={mdiStorefront} disabled={!nombre.trim()} cargando={guardando} onClick={() => void crear()} className="min-w-32">
            Crear sucursal
          </Boton>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void crear()
        }}
      >
        <label className="grid gap-1.5 text-[13px] text-tinta-2">
          Nombre
          <input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value.slice(0, 40))} placeholder="Ej. Wasi Centro" />
        </label>
        <label className="grid gap-1.5 text-[13px] text-tinta-2">
          Dirección (sale en la nota impresa)
          <input className="campo" value={direccion} onChange={(e) => setDireccion(e.target.value.slice(0, 120))} placeholder="Jr. …, Huamanga" />
        </label>
        <label className="grid gap-1.5 text-[13px] text-tinta-2">
          Teléfono
          <input className="campo" value={telefono} onChange={(e) => setTelefono(e.target.value.slice(0, 30))} inputMode="tel" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-[13px] text-tinta-2">
            Mesas de salón (M1…)
            <input className="campo text-center tabular-nums" value={mesas} onChange={(e) => setMesas(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" />
          </label>
          <label className="grid gap-1.5 text-[13px] text-tinta-2">
            Para llevar (L1…)
            <input className="campo text-center tabular-nums" value={llevar} onChange={(e) => setLlevar(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" />
          </label>
        </div>
        <p className="text-[12.5px] text-tinta-3">Las mesas se pueden agregar o retirar después en Mesas.</p>
        <button type="submit" hidden />
      </form>
    </Dialogo>
  )
}

/**
 * Dónde se preparan los pedidos de una sucursal: en su cocina, o (por ahora)
 * algunas de sus cocinas en la de otra sucursal. Volver a «Cocina propia»
 * deshace lo compartido al instante, en todas las pantallas.
 */
function DialogoCocina({
  sucursal,
  todas,
  alCerrar,
  alGuardar,
}: {
  sucursal: SucursalAdmin
  todas: SucursalAdmin[]
  alCerrar: () => void
  alGuardar: (cocina: CocinaCompartida | null) => Promise<void>
}) {
  const ajustes = useAjustes()
  // Solo cocina para otras una sucursal activa con cocina propia: no hay cadenas.
  const posibles = todas.filter((o) => o.activa && o.id !== sucursal.id && !o.cocinaCompartida)
  const atiende = sucursal.cocinaPara.map((id) => todas.find((o) => o.id === id)?.nombre ?? `Sucursal ${id}`)
  const [comparte, setComparte] = useState(!!sucursal.cocinaCompartida)
  const [en, setEn] = useState<number | null>(sucursal.cocinaCompartida?.en ?? (posibles.length === 1 ? posibles[0].id : null))
  const [cuales, setCuales] = useState<Estacion[]>(sucursal.cocinaCompartida?.estaciones ?? ['CARTA', 'SHAWARMAS'])
  const [guardando, setGuardando] = useState(false)
  const anfitriona = posibles.find((o) => o.id === en)
  const sinOpcion = atiende.length > 0 || posibles.length === 0
  const listo = !comparte || (!!anfitriona && cuales.length > 0)

  const guardar = async () => {
    if (!listo) return
    setGuardando(true)
    try {
      await alGuardar(comparte && en ? { en, estaciones: ESTACIONES.filter((e) => cuales.includes(e)) } : null)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      abierto
      titulo={`Cocina de ${sucursal.nombre}`}
      alCerrar={alCerrar}
      ancho="max-w-[520px]"
      botones={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="guardar" icono={mdiChefHat} disabled={!listo} cargando={guardando} onClick={() => void guardar()} className="min-w-28">
            Guardar
          </Boton>
        </>
      }
    >
      <div className="grid gap-4 text-[13.5px]">
        <div role="radiogroup" aria-label="Dónde se preparan sus pedidos" className="grid grid-cols-2 border-t border-l border-reja-2">
          {[
            { valor: false, titulo: 'Cocina propia', detalle: 'Todo se prepara en su local' },
            { valor: true, titulo: 'Compartida', detalle: 'Parte se prepara en otra sucursal' },
          ].map((o) => (
            <button
              key={o.titulo}
              type="button"
              role="radio"
              aria-checked={comparte === o.valor}
              disabled={o.valor && sinOpcion}
              onClick={() => setComparte(o.valor)}
              className={`flex flex-col items-start gap-0.5 border-r border-b border-reja-2 px-3 py-2.5 text-left disabled:opacity-45 ${comparte === o.valor ? 'bg-verde-3 text-white' : 'bg-hoja text-tinta hover:bg-gris-50'}`}
            >
              <span className="font-medium">{o.titulo}</span>
              <span className={`text-[12.5px] ${comparte === o.valor ? 'text-white/80' : 'text-tinta-3'}`}>{o.detalle}</span>
            </button>
          ))}
        </div>

        {atiende.length > 0 && (
          <p className="text-[12.5px] text-tinta-3">
            {sucursal.nombre} les cocina a {atiende.join(' y ')}: no puede mandar sus pedidos a otra cocina.
          </p>
        )}
        {!atiende.length && posibles.length === 0 && <p className="text-[12.5px] text-tinta-3">No hay otra sucursal activa con cocina propia.</p>}

        {comparte && !sinOpcion && (
          <>
            <div className="grid gap-1.5 text-[13px] text-tinta-2">
              Se prepara en la cocina de
              <Desplegable
                titulo="Sucursal que cocina"
                estilo="campo"
                valor={en}
                opciones={posibles.map((o) => ({ valor: o.id, etiqueta: o.nombre, icono: mdiStorefront }))}
                alCambiar={setEn}
                vacio="Elige la sucursal…"
                buscador={false}
              />
            </div>
            <div className="grid gap-1.5 text-[13px] text-tinta-2">
              Qué cocinas van allá
              <div className="grid border-t border-l border-reja-2">
                {ESTACIONES.map((e) => {
                  const marcada = cuales.includes(e)
                  return (
                    <button
                      key={e}
                      type="button"
                      role="checkbox"
                      aria-checked={marcada}
                      onClick={() => setCuales((c) => (marcada ? c.filter((x) => x !== e) : [...c, e]))}
                      className="flex h-11 items-center gap-3 border-r border-b border-reja-2 bg-hoja px-3 text-left text-[13.5px] text-tinta hover:bg-gris-50"
                    >
                      <span className={`grid size-[18px] shrink-0 place-items-center border-2 ${marcada ? 'border-verde-2 bg-verde-2 text-white' : 'border-tinta-3 bg-hoja'}`}>
                        {marcada && <Icono d={mdiCheckBold} className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{nombreCocina(ajustes, e)}</span>
                      <span className={`shrink-0 text-[12.5px] ${marcada ? 'font-medium text-ambar-oscuro' : 'text-tinta-3'}`}>
                        {marcada ? `en ${anfitriona?.nombre ?? 'la otra'}` : 'en su local'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="text-[12.5px] leading-relaxed text-tinta-3">
              Mientras compartan, esas comandas de las dos sucursales salen en una sola pantalla de cocina, cada una con el nombre de su local para que el mozo sepa a
              dónde llevarla, y al mozo le llega el aviso de dónde recogerla. Lo que se agota en esa cocina se agota en las dos. Es temporal: cuando tenga su cocina,
              vuelve a «Cocina propia».
            </p>
          </>
        )}
      </div>
    </Dialogo>
  )
}
