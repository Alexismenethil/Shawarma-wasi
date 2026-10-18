import { useState } from 'react'
import { mdiAccountCancel, mdiAccountCheck, mdiAccountEdit, mdiChartBar, mdiChefHat, mdiDotsVertical, mdiDiceMultiple, mdiKeyVariant, mdiPlus, mdiRoomService } from '@mdi/js'
import type { Rol } from '@wasi/shared'
import { ROLES } from '@wasi/shared'
import { api } from '../../lib/api'
import { useRecurso } from '../../lib/recurso'
import { useSesion } from '../../lib/sesion'
import { avisar } from '../../componentes/avisos'
import { Boton } from '../../componentes/boton'
import { Menu } from '../../componentes/desplegable'
import { Dialogo, confirmar } from '../../componentes/dialogo'
import { Icono } from '../../componentes/icono'
import { Pagina, Panel, Tabla, useAccion } from './piezas'

/**
 * El equipo del local. Cada persona entra con su propio PIN de cuatro cifras
 * a su área (administración entra a todas): así la nota dice quién atendió y
 * nadie usa la clave de otro. El PIN se muestra una sola vez, al crearlo.
 */

interface Miembro {
  id: number
  nombre: string
  rol: Rol
  activo: boolean
  creadoEn: string
  pedidos: number
}

const AREA: Record<Rol, { nombre: string; acceso: string; icono: string }> = {
  MOZO: { nombre: 'Mozo', acceso: 'Mesas, nota de pedido y cobro', icono: mdiRoomService },
  COCINA: { nombre: 'Cocina', acceso: 'Atención al cliente de las tres cocinas', icono: mdiChefHat },
  ADMIN: { nombre: 'Administración', acceso: 'Todo: reportes, gestión, mozo y cocina', icono: mdiChartBar },
}

const facil = (pin: string) => /^(\d)\1{3}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)
function pinAlAzar() {
  let pin = ''
  do pin = String(Math.floor(1000 + Math.random() * 9000))
  while (facil(pin))
  return pin
}

type Formulario =
  | { modo: 'nuevo' }
  | { modo: 'editar'; miembro: Miembro }
  | { modo: 'pin'; miembro: Miembro; reactivar?: boolean }
  | { modo: 'listo'; nombre: string; rol: Rol; pin: string; nuevo: boolean }

export function Equipo() {
  const sesion = useSesion()
  const { datos, recargar } = useRecurso<Miembro[]>('/admin/equipo', () => false)
  const accion = useAccion(recargar)
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const activos = datos?.filter((m) => m.activo).length ?? 0

  const desactivar = async (m: Miembro) => {
    if (!(await confirmar({ titulo: 'Desactivar', mensaje: `¿Desactivar a ${m.nombre}? Ya no podrá entrar con su PIN y su sesión se cierra al instante.`, aceptar: 'Desactivar', peligro: true }))) return
    void accion(() => api(`/admin/equipo/${m.id}`, { metodo: 'PATCH', cuerpo: { activo: false } }), `${m.nombre} quedó desactivado`)
  }

  return (
    <Pagina
      titulo="Equipo"
      detalle={datos ? `${activos} ${activos === 1 ? 'persona activa' : 'personas activas'} · cada una entra con su propio PIN` : 'cargando…'}
      acciones={
        <Boton variante="guardar" icono={mdiPlus} onClick={() => setFormulario({ modo: 'nuevo' })} className="h-9">
          Agregar persona
        </Boton>
      }
    >
      <div className="max-w-[980px]">
        <Panel titulo="Usuarios del sistema" estilo="excel" color="#93c47d" relleno={false}>
          <Tabla
            tono="verde"
            columnas={[{ titulo: 'Nombre' }, { titulo: 'Área', ancho: '170px' }, { titulo: 'Estado', ancho: '110px' }, { titulo: 'Notas', ancho: '84px' }, { titulo: 'Desde', ancho: '110px' }, { titulo: '', ancho: '48px' }]}
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
                  <td>{m.activo ? <span className="bg-menta px-2 py-0.5 text-[12.5px] text-verde-3">Activo</span> : <span className="bg-ambar px-2 py-0.5 text-[12.5px] text-ambar-oscuro">Inactivo</span>}</td>
                  <td className="text-center text-tinta-2 tabular-nums">{m.rol === 'MOZO' && m.pedidos ? m.pedidos.toLocaleString('es-PE') : ''}</td>
                  <td className="text-center text-tinta-2">{new Date(m.creadoEn).toLocaleDateString('es-PE', { month: 'short', year: 'numeric' })}</td>
                  <td className="px-0!">
                    <Menu
                      titulo={m.nombre}
                      disparador={<Icono d={mdiDotsVertical} className="size-5" />}
                      className="mx-auto grid size-8 place-items-center text-tinta-2 hover:bg-gris-150 hover:text-tinta"
                      acciones={
                        m.activo
                          ? [
                              { etiqueta: 'Editar nombre y área', icono: mdiAccountEdit, alElegir: () => setFormulario({ modo: 'editar', miembro: m }) },
                              { etiqueta: 'Asignar PIN nuevo', icono: mdiKeyVariant, alElegir: () => setFormulario({ modo: 'pin', miembro: m }) },
                              ...(soyYo ? [] : [{ etiqueta: 'Desactivar', icono: mdiAccountCancel, peligro: true, alElegir: () => void desactivar(m) }]),
                            ]
                          : [{ etiqueta: 'Reactivar con PIN nuevo', icono: mdiAccountCheck, alElegir: () => setFormulario({ modo: 'pin', miembro: m, reactivar: true }) }]
                      }
                    />
                  </td>
                </tr>
              )
            })}
          </Tabla>
        </Panel>
        <p className="mt-2 text-[12.5px] text-tinta-3">Dos personas activas no pueden tener el mismo PIN. Desactivar a alguien le cierra la sesión al instante.</p>
      </div>

      <FormularioMiembro
        formulario={formulario}
        alCerrar={() => setFormulario(null)}
        alListo={(f) => {
          setFormulario(f)
          void recargar()
        }}
      />
    </Pagina>
  )
}

function FormularioMiembro({ formulario, alCerrar, alListo }: { formulario: Formulario | null; alCerrar: () => void; alListo: (f: Formulario | null) => void }) {
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<Rol>('MOZO')
  const [pin, setPin] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [antes, setAntes] = useState<Formulario | null>(null)
  if (formulario !== antes) {
    setAntes(formulario)
    if (formulario && formulario.modo !== 'listo') {
      setNombre(formulario.modo === 'nuevo' ? '' : formulario.miembro.nombre)
      setRol(formulario.modo === 'nuevo' ? 'MOZO' : formulario.miembro.rol)
      setPin(formulario.modo === 'editar' ? '' : pinAlAzar())
    }
  }

  const pidePin = formulario?.modo === 'nuevo' || formulario?.modo === 'pin'
  const pideDatos = formulario?.modo === 'nuevo' || formulario?.modo === 'editar'
  const valido = (!pideDatos || nombre.trim().length >= 2) && (!pidePin || /^\d{4}$/.test(pin))

  const guardar = async () => {
    if (!formulario || !valido) return
    setEnviando(true)
    try {
      if (formulario.modo === 'nuevo') {
        await api('/admin/equipo', { cuerpo: { nombre: nombre.trim(), rol, pin } })
        alListo({ modo: 'listo', nombre: nombre.trim(), rol, pin, nuevo: true })
      } else if (formulario.modo === 'editar') {
        await api(`/admin/equipo/${formulario.miembro.id}`, { metodo: 'PATCH', cuerpo: { nombre: nombre.trim(), rol } })
        avisar('Cambios guardados', 'ok')
        alListo(null)
      } else if (formulario.modo === 'pin') {
        await api(`/admin/equipo/${formulario.miembro.id}`, { metodo: 'PATCH', cuerpo: { pin, ...(formulario.reactivar && { activo: true }) } })
        alListo({ modo: 'listo', nombre: formulario.miembro.nombre, rol: formulario.miembro.rol, pin, nuevo: false })
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
        titulo={formulario.nuevo ? 'Persona agregada' : 'PIN actualizado'}
        alCerrar={alCerrar}
        botones={
          <Boton variante="guardar" onClick={alCerrar} className="min-w-28" data-foco>
            Hecho
          </Boton>
        }
      >
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
        <p className="text-[13px] text-tinta-2">Anótalo y entrégaselo en persona. Por seguridad, el sistema no lo vuelve a mostrar.</p>
      </Dialogo>
    )
  }

  const titulo =
    formulario?.modo === 'nuevo' ? 'Agregar persona' : formulario?.modo === 'editar' ? `Editar · ${formulario.miembro.nombre}` : formulario?.modo === 'pin' ? `${formulario.reactivar ? 'Reactivar' : 'PIN nuevo'} · ${formulario.miembro.nombre}` : ''

  return (
    <Dialogo
      abierto={!!formulario}
      titulo={titulo}
      alCerrar={alCerrar}
      botones={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="guardar" disabled={!valido} cargando={enviando} onClick={() => void guardar()} className="min-w-32">
            {formulario?.modo === 'nuevo' ? 'Agregar' : formulario?.modo === 'editar' ? 'Guardar' : 'Guardar PIN'}
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
              <div role="radiogroup" className="grid grid-cols-3 border border-reja-2">
                {ROLES.map((r) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={rol === r}
                    key={r}
                    onClick={() => setRol(r)}
                    className={`flex h-16 flex-col items-center justify-center gap-1 border-r border-reja-2 text-[13px] last:border-r-0 ${rol === r ? 'bg-verde-3 font-medium text-white' : 'bg-hoja text-tinta-2 hover:bg-gris-50'}`}
                  >
                    <Icono d={AREA[r].icono} className={`size-[22px] ${rol === r ? 'text-white' : 'text-verde-2'}`} />
                    {AREA[r].nombre}
                  </button>
                ))}
              </div>
              <span className="text-[12.5px] text-tinta-3">{AREA[rol].acceso}</span>
            </div>
          </>
        )}
        {pidePin && (
          <div className="grid gap-1.5 text-[13px] text-tinta-2">
            <span className="flex items-center justify-between">
              PIN de 4 cifras
              <button type="button" onClick={() => setPin(pinAlAzar())} className="flex items-center gap-1 px-2 py-1 text-[12.5px] text-azul hover:bg-azul-suave">
                <Icono d={mdiDiceMultiple} className="size-4" /> Otro al azar
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
              {pin.length === 4 && facil(pin) ? 'Es fácil de adivinar: mejor otro.' : formulario?.modo === 'pin' ? 'El PIN anterior deja de funcionar al guardar.' : 'Que no sea el de otra persona del equipo.'}
            </span>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Dialogo>
  )
}
