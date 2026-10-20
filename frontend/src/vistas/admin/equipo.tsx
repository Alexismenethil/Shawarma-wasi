import { useState } from 'react'
import {
  mdiAccountCancel,
  mdiAccountCheck,
  mdiAccountEdit,
  mdiAccountTie,
  mdiCashRegister,
  mdiChefHat,
  mdiDiceMultiple,
  mdiDotsVertical,
  mdiKeyVariant,
  mdiPlus,
  mdiRoomService,
  mdiShieldAccount,
  mdiStorefront,
} from '@mdi/js'
import type { Rol } from '@wasi/shared'
import { ROLES, ROLES_PIN, entraConPin } from '@wasi/shared'
import { api } from '../../lib/api'
import { useRecurso } from '../../lib/recurso'
import { useSesion } from '../../lib/sesion'
import { useSucursal } from '../../lib/sucursal'
import { avisar } from '../../componentes/avisos'
import { Boton } from '../../componentes/boton'
import { Desplegable, Menu } from '../../componentes/desplegable'
import { Dialogo, confirmar } from '../../componentes/dialogo'
import { Icono } from '../../componentes/icono'
import { Pagina, Panel, Tabla, useAccion } from './piezas'

/**
 * El equipo. Mozo, cocina y caja entran con su propio PIN de cuatro cifras en
 * la tablet de su sucursal: así la nota dice quién atendió y quién cobró, y
 * nadie usa la clave de otro. La encargada y la administración entran con
 * usuario y contraseña. PIN y contraseña se muestran una sola vez, al darlos.
 *
 * La encargada agrega y edita a la gente de su sucursal; el administrador, a
 * todos, a las encargadas y a otros administradores.
 */

interface Miembro {
  id: number
  nombre: string
  rol: Rol
  sucursalId: number | null
  usuario: string | null
  activo: boolean
  creadoEn: string
  pedidos: number
}

export const AREA: Record<Rol, { nombre: string; acceso: string; icono: string }> = {
  MOZO: { nombre: 'Mozo', acceso: 'Mesas y nota de pedido; pide la cuenta a caja', icono: mdiRoomService },
  COCINA: { nombre: 'Cocina', acceso: 'Atención al cliente de las tres cocinas', icono: mdiChefHat },
  CAJA: { nombre: 'Caja', acceso: 'Cobra, abre y cierra la caja; también anota pedidos del mostrador', icono: mdiCashRegister },
  ENCARGADO: { nombre: 'Encargado(a)', acceso: 'Su sucursal: reportes, cajas, personal, mesas y agotados. Cubre cualquier puesto', icono: mdiAccountTie },
  ADMIN: { nombre: 'Administración', acceso: 'Todo, en todas las sucursales', icono: mdiShieldAccount },
}

const facil = (pin: string) => /^(\d)\1{3}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)
function pinAlAzar() {
  let pin = ''
  do pin = String(Math.floor(1000 + Math.random() * 9000))
  while (facil(pin))
  return pin
}

/** Una contraseña que se pueda dictar: sin letras que se confundan (l, 1, O, 0). */
function claveAlAzar() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const azar = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(azar, (n) => letras[n % letras.length]).join('')
}

const USUARIO = /^[a-z0-9._-]{3,30}$/

type Formulario =
  | { modo: 'nuevo' }
  | { modo: 'editar'; miembro: Miembro }
  | { modo: 'acceso'; miembro: Miembro; reactivar?: boolean }
  | { modo: 'listo'; nombre: string; rol: Rol; pin?: string; usuario?: string; clave?: string; nuevo: boolean }

export function Equipo() {
  const sesion = useSesion()
  const esAdmin = sesion?.usuario.rol === 'ADMIN'
  const { id: vista, sucursales } = useSucursal()
  const { datos, recargar } = useRecurso<Miembro[]>('/admin/equipo', () => false)
  const accion = useAccion(recargar)
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const activos = datos?.filter((m) => m.activo).length ?? 0
  const verSucursal = esAdmin && !vista && sucursales.length > 1
  const nombreSucursal = (id: number | null) => (id ? (sucursales.find((s) => s.id === id)?.nombre ?? '—') : 'Todas')

  const desactivar = async (m: Miembro) => {
    if (!(await confirmar({ titulo: 'Desactivar', mensaje: `¿Desactivar a ${m.nombre}? Ya no podrá entrar y su sesión se cierra al instante.`, aceptar: 'Desactivar', peligro: true }))) return
    void accion(() => api(`/admin/equipo/${m.id}`, { metodo: 'PATCH', cuerpo: { activo: false } }), `${m.nombre} quedó desactivado`)
  }

  return (
    <Pagina
      titulo="Equipo"
      detalle={datos ? `${activos} ${activos === 1 ? 'persona activa' : 'personas activas'} · cada una entra con su propio PIN o contraseña` : 'cargando…'}
      acciones={
        <Boton variante="guardar" icono={mdiPlus} onClick={() => setFormulario({ modo: 'nuevo' })} className="h-9">
          Agregar persona
        </Boton>
      }
    >
      <div className="max-w-[1100px]">
        <Panel titulo="Usuarios del sistema" estilo="excel" color="#93c47d" relleno={false}>
          <Tabla
            tono="verde"
            columnas={[
              { titulo: 'Nombre' },
              { titulo: 'Área', ancho: '160px' },
              ...(verSucursal ? [{ titulo: 'Sucursal', ancho: '140px' }] : []),
              { titulo: 'Entra con', ancho: '150px' },
              { titulo: 'Estado', ancho: '100px' },
              { titulo: 'Notas', ancho: '76px' },
              { titulo: '', ancho: '48px' },
            ]}
          >
            {ROLES.flatMap((rol) => datos?.filter((m) => m.rol === rol) ?? []).map((m) => {
              const soyYo = m.id === sesion?.usuario.id
              return (
                <tr key={m.id} className={m.activo ? '' : 'text-tinta-3'}>
                  <td>
                    <span className="flex items-center gap-2.5">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white uppercase ${m.activo ? 'bg-verde-2' : 'bg-tinta-4'}`}>{m.nombre.slice(0, 1)}</span>
                      <span className="truncate font-medium">{m.nombre}</span>
                      {soyYo && <span className="bg-gris-150 px-1.5 text-[12px] text-tinta-2">Tú</span>}
                    </span>
                  </td>
                  <td>
                    <span className="flex items-center gap-2">
                      <Icono d={AREA[m.rol].icono} className="size-[18px] text-tinta-3" />
                      {AREA[m.rol].nombre}
                    </span>
                  </td>
                  {verSucursal && <td className="truncate text-tinta-2">{nombreSucursal(m.sucursalId)}</td>}
                  <td className="text-tinta-2">{m.usuario ? <span className="font-mono text-[13px]">{m.usuario}</span> : 'PIN de 4 cifras'}</td>
                  <td>{m.activo ? <span className="bg-menta px-2 py-0.5 text-[12.5px] text-verde-3">Activo</span> : <span className="bg-ambar px-2 py-0.5 text-[12.5px] text-ambar-oscuro">Inactivo</span>}</td>
                  <td className="text-center text-tinta-2 tabular-nums">{m.pedidos ? m.pedidos.toLocaleString('es-PE') : ''}</td>
                  <td className="px-0!">
                    <Menu
                      titulo={m.nombre}
                      disparador={<Icono d={mdiDotsVertical} className="size-5" />}
                      className="mx-auto grid size-8 place-items-center text-tinta-2 hover:bg-gris-150 hover:text-tinta"
                      acciones={
                        m.activo
                          ? [
                              { etiqueta: 'Editar nombre, área o sucursal', icono: mdiAccountEdit, alElegir: () => setFormulario({ modo: 'editar', miembro: m }), deshabilitada: soyYo && !esAdmin },
                              { etiqueta: entraConPin(m.rol) ? 'Asignar PIN nuevo' : 'Poner contraseña nueva', icono: mdiKeyVariant, alElegir: () => setFormulario({ modo: 'acceso', miembro: m }) },
                              ...(soyYo ? [] : [{ etiqueta: 'Desactivar', icono: mdiAccountCancel, peligro: true, alElegir: () => void desactivar(m) }]),
                            ]
                          : [{ etiqueta: 'Reactivar', icono: mdiAccountCheck, alElegir: () => setFormulario({ modo: 'acceso', miembro: m, reactivar: true }) }]
                      }
                    />
                  </td>
                </tr>
              )
            })}
          </Tabla>
        </Panel>
        <p className="mt-2 text-[12.5px] text-tinta-3">
          Cada PIN es de una sola persona en todo el negocio, ni entre sucursales se repite: así nadie entra por error a otro local. Lo usual son los últimos 4
          dígitos de su DNI. Desactivar a alguien le cierra la sesión al instante y libera su PIN.
          {!esAdmin && ' Las encargadas y la administración las maneja el dueño.'}
        </p>
      </div>

      <FormularioMiembro
        formulario={formulario}
        esAdmin={esAdmin}
        alCerrar={() => setFormulario(null)}
        alListo={(f) => {
          setFormulario(f)
          void recargar()
        }}
      />
    </Pagina>
  )
}

function FormularioMiembro({
  formulario,
  esAdmin,
  alCerrar,
  alListo,
}: {
  formulario: Formulario | null
  esAdmin: boolean
  alCerrar: () => void
  alListo: (f: Formulario | null) => void
}) {
  const { id: vista, sucursales, propia } = useSucursal()
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<Rol>('MOZO')
  const [sucursalId, setSucursalId] = useState<number | null>(null)
  const [pin, setPin] = useState('')
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [antes, setAntes] = useState<Formulario | null>(null)
  if (formulario !== antes) {
    setAntes(formulario)
    if (formulario && formulario.modo !== 'listo') {
      const m = formulario.modo === 'nuevo' ? null : formulario.miembro
      setNombre(m?.nombre ?? '')
      setRol(m?.rol ?? 'MOZO')
      setSucursalId(m?.sucursalId ?? vista ?? sucursales[0]?.id ?? null)
      // Se escribe a mano: lo usual son los últimos 4 dígitos de su DNI.
      setPin('')
      setUsuario(m?.usuario ?? '')
      setClave(formulario.modo === 'editar' || (formulario.modo === 'acceso' && formulario.reactivar && m && !entraConPin(m.rol)) ? '' : claveAlAzar())
    }
  }

  const miembro = formulario && formulario.modo !== 'nuevo' && formulario.modo !== 'listo' ? formulario.miembro : null
  const roles: Rol[] = esAdmin ? [...ROLES] : [...ROLES_PIN]
  const conPin = entraConPin(rol)
  const pideDatos = formulario?.modo === 'nuevo' || formulario?.modo === 'editar'
  // Al editar, pide acceso nuevo solo si cambia cómo entra (PIN ↔ contraseña). Su PIN es único
  // en todo el negocio, así que al cambiar de sucursal se lo lleva.
  const cambiaTipo = !!miembro && entraConPin(miembro.rol) !== conPin
  const cambiaSucursal = !!miembro && conPin && !cambiaTipo && sucursalId !== miembro.sucursalId
  const reactiva = formulario?.modo === 'acceso' && !!formulario.reactivar
  const reactivaConClave = reactiva && !conPin
  const pideAcceso = formulario?.modo === 'nuevo' || formulario?.modo === 'acceso' || cambiaTipo
  const pidePin = pideAcceso && conPin
  const pideClave = pideAcceso && !conPin && !reactivaConClave
  const pideSucursal = pideDatos && esAdmin && rol !== 'ADMIN' && sucursales.length > 1

  const valido =
    (!pideDatos || nombre.trim().length >= 2) &&
    (!pidePin || /^\d{4}$/.test(pin)) &&
    (!pideClave || (USUARIO.test(usuario.trim().toLowerCase()) && clave.length >= 8)) &&
    (rol === 'ADMIN' || !!sucursalId || propia)

  const guardar = async () => {
    if (!formulario || !valido) return
    setEnviando(true)
    const acceso = pidePin ? { pin } : pideClave ? { usuario: usuario.trim().toLowerCase(), clave } : {}
    const listo = (nuevo: boolean): Formulario => ({ modo: 'listo', nombre: nombre.trim() || miembro?.nombre || '', rol, nuevo, ...(pidePin && { pin }), ...(pideClave && { usuario: usuario.trim().toLowerCase(), clave }) })
    try {
      if (formulario.modo === 'nuevo') {
        await api('/admin/equipo', { cuerpo: { nombre: nombre.trim(), rol, ...(esAdmin && rol !== 'ADMIN' && { sucursalId }), ...acceso } })
        alListo(listo(true))
      } else if (formulario.modo === 'editar') {
        await api(`/admin/equipo/${formulario.miembro.id}`, {
          metodo: 'PATCH',
          cuerpo: { nombre: nombre.trim(), rol, ...(esAdmin && rol !== 'ADMIN' && { sucursalId }), ...acceso },
        })
        if (pideAcceso) alListo(listo(false))
        else {
          avisar('Cambios guardados', 'ok')
          alListo(null)
        }
      } else if (formulario.modo === 'acceso') {
        await api(`/admin/equipo/${formulario.miembro.id}`, { metodo: 'PATCH', cuerpo: { ...acceso, ...(formulario.reactivar && { activo: true }) } })
        if (reactivaConClave) {
          avisar(`${formulario.miembro.nombre} puede entrar otra vez`, 'ok')
          alListo(null)
        } else alListo(listo(false))
      }
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setEnviando(false)
    }
  }

  if (formulario?.modo === 'listo') {
    return (
      <Dialogo
        abierto
        titulo={formulario.nuevo ? 'Persona agregada' : 'Acceso actualizado'}
        alCerrar={alCerrar}
        botones={
          <Boton variante="guardar" onClick={alCerrar} className="min-w-28" data-foco>
            Hecho
          </Boton>
        }
      >
        {formulario.pin ? (
          <>
            <p className="text-[14.5px]">
              <b className="font-medium">{formulario.nombre}</b> entra a <b className="font-medium">{AREA[formulario.rol].nombre}</b> con este PIN:
            </p>
            <div className="my-4 grid grid-cols-4 gap-2">
              {formulario.pin.split('').map((d, i) => (
                <span key={i} className="grid h-16 place-items-center border-2 border-verde-2 bg-menta-suave text-[34px] font-bold text-verde-3 tabular-nums">
                  {d}
                </span>
              ))}
            </div>
          </>
        ) : formulario.usuario ? (
          <>
            <p className="text-[14.5px]">
              <b className="font-medium">{formulario.nombre}</b> entra a Administración con:
            </p>
            <dl className="my-4 grid grid-cols-[110px_minmax(0,1fr)] border border-verde-2 text-[15px]">
              <dt className="rotulo-negro h-11">Usuario</dt>
              <dd className="flex h-11 items-center bg-menta-suave px-3 font-mono font-bold text-verde-3">{formulario.usuario}</dd>
              <dt className="rotulo-negro h-11 border-t border-white/20">Contraseña</dt>
              <dd className="flex h-11 items-center border-t border-verde-2/30 bg-menta-suave px-3 font-mono font-bold text-verde-3">{formulario.clave}</dd>
            </dl>
            <p className="mb-2 text-[13px] text-tinta-2">Puede cambiarla después en su menú: «Cambiar mi contraseña».</p>
          </>
        ) : (
          <p className="text-[14.5px]">Listo.</p>
        )}
        <p className="text-[13px] text-tinta-2">Anótalo y entrégaselo en persona. Por seguridad, el sistema no lo vuelve a mostrar.</p>
      </Dialogo>
    )
  }

  const titulo =
    formulario?.modo === 'nuevo'
      ? 'Agregar persona'
      : formulario?.modo === 'editar'
        ? `Editar · ${formulario.miembro.nombre}`
        : formulario?.modo === 'acceso'
          ? `${formulario.reactivar ? 'Reactivar' : conPin ? 'PIN nuevo' : 'Contraseña nueva'} · ${formulario.miembro.nombre}`
          : ''

  return (
    <Dialogo
      abierto={!!formulario}
      titulo={titulo}
      alCerrar={alCerrar}
      ancho="max-w-[520px]"
      botones={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="guardar" disabled={!valido} cargando={enviando} onClick={() => void guardar()} className="min-w-32">
            {formulario?.modo === 'nuevo' ? 'Agregar' : formulario?.modo === 'editar' ? 'Guardar' : reactivaConClave ? 'Reactivar' : conPin ? 'Guardar PIN' : 'Guardar contraseña'}
          </Boton>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
      >
        {pideDatos && (
          <>
            <label className="grid gap-1.5 text-[13px] text-tinta-2">
              Nombre
              <input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value.slice(0, 40))} placeholder="Ej. María Quispe" />
            </label>
            <div className="grid gap-1.5 text-[13px] text-tinta-2">
              Área
              <div role="radiogroup" className={`grid border-t border-l border-reja-2 ${roles.length > 3 ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-3'}`}>
                {roles.map((r) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={rol === r}
                    key={r}
                    onClick={() => setRol(r)}
                    className={`flex h-16 flex-col items-center justify-center gap-1 border-r border-b border-reja-2 px-1 text-[12.5px] ${rol === r ? 'bg-verde-3 font-medium text-white' : 'bg-hoja text-tinta-2 hover:bg-gris-50'}`}
                  >
                    <Icono d={AREA[r].icono} className={`size-[22px] ${rol === r ? 'text-white' : 'text-verde-2'}`} />
                    <span className="max-w-full truncate">{AREA[r].nombre}</span>
                  </button>
                ))}
              </div>
              <span className="text-[12.5px] text-tinta-3">{AREA[rol].acceso}</span>
            </div>
            {pideSucursal && (
              <div className="grid gap-1.5 text-[13px] text-tinta-2">
                Sucursal donde trabaja
                <Desplegable
                  titulo="Sucursal"
                  estilo="campo"
                  valor={sucursalId}
                  opciones={sucursales.map((s) => ({ valor: s.id, etiqueta: s.nombre, icono: mdiStorefront }))}
                  alCambiar={setSucursalId}
                  vacio="Elige la sucursal…"
                  buscador={false}
                />
                {cambiaSucursal && (
                  <span className="text-[12.5px] text-tinta-3">
                    Su PIN no cambia: desde ahora entra solo en {sucursales.find((s) => s.id === sucursalId)?.nombre ?? 'la nueva sucursal'}.
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {pidePin && (
          <div className="grid gap-1.5 text-[13px] text-tinta-2">
            <span className="flex items-center justify-between">
              PIN de 4 cifras {reactiva && <span className="text-tinta-3">(puede ser el mismo de antes)</span>}
              <button type="button" onClick={() => setPin(pinAlAzar())} className="flex items-center gap-1 px-2 py-1 text-[12.5px] text-azul hover:bg-azul-suave">
                <Icono d={mdiDiceMultiple} className="size-4" /> Uno al azar
              </button>
            </span>
            <input
              className="campo h-14 text-center text-[30px] font-bold tracking-[0.5em] tabular-nums"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoComplete="off"
              aria-label="PIN de cuatro cifras"
            />
            <span className={`text-[12.5px] ${pin.length === 4 && facil(pin) ? 'text-naranja' : 'text-tinta-3'}`}>
              {pin.length === 4 && facil(pin)
                ? 'Es fácil de adivinar: mejor otro.'
                : formulario?.modo === 'acceso' && !reactiva
                  ? 'El PIN anterior deja de funcionar al guardar. No se repite en ninguna sucursal.'
                  : 'Lo usual: los últimos 4 dígitos de su DNI. No se repite en ninguna sucursal.'}
            </span>
          </div>
        )}

        {pideClave && (
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-[13px] text-tinta-2">
              Usuario (para entrar)
              <input
                className="campo font-mono"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value.toLowerCase().replace(/\s/g, '').slice(0, 30))}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                placeholder="ej. maria"
              />
              {usuario && !USUARIO.test(usuario) && <span className="text-[12.5px] text-rojo">Solo minúsculas, números, punto o guion (3 a 30).</span>}
            </label>
            <label className="grid gap-1.5 text-[13px] text-tinta-2">
              <span className="flex items-center justify-between">
                Contraseña
                <button type="button" onClick={() => setClave(claveAlAzar())} className="flex items-center gap-1 px-2 py-1 text-[12.5px] text-azul hover:bg-azul-suave">
                  <Icono d={mdiDiceMultiple} className="size-4" /> Generar otra
                </button>
              </span>
              <input className="campo font-mono" value={clave} onChange={(e) => setClave(e.target.value.slice(0, 72))} autoComplete="new-password" spellCheck={false} />
              <span className={`text-[12.5px] ${clave && clave.length < 8 ? 'text-rojo' : 'text-tinta-3'}`}>Mínimo 8 caracteres. Después la puede cambiar en su menú.</span>
            </label>
          </div>
        )}

        {reactivaConClave && <p className="text-[14px]">Vuelve a entrar con su mismo usuario y contraseña.</p>}
        <button type="submit" hidden />
      </form>
    </Dialogo>
  )
}
