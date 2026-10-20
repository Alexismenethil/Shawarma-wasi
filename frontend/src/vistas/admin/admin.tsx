import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { mdiBell, mdiCashRegister, mdiChefHat, mdiClose, mdiKeyVariant, mdiLogout, mdiMenu, mdiRoomService, mdiStorefront, mdiViewGridOutline } from '@mdi/js'
import type { MesaResumen, Rol } from '@wasi/shared'
import { NOMBRE_ROL, nombreMesa } from '@wasi/shared'
import { api } from '../../lib/api'
import { useSesion } from '../../lib/sesion'
import { elegirVista, useSucursal } from '../../lib/sucursal'
import { useRecurso } from '../../lib/recurso'
import { useAjustes } from '../../lib/ajustes'
import { Logo } from '../../componentes/marca'
import { Icono, ESTADO_HOJA } from '../../componentes/icono'
import { EnLinea, useSalir } from '../../componentes/barra'
import { Desplegable, Menu } from '../../componentes/desplegable'
import { Dialogo } from '../../componentes/dialogo'
import { Boton } from '../../componentes/boton'
import { avisar } from '../../componentes/avisos'
import { nombreSeccion, rutaDe, seccionesDe } from './secciones'
import { Inicio } from './inicio'
import { ReporteDiario } from './reporte-diario'
import { Ventas } from './ventas'
import { Preferencias } from './preferencias'
import { AcumuladoMes } from './acumulado'
import { Consolidado } from './consolidado'
import { CartaAdmin } from './carta'
import { Mesas } from './mesas'
import { TiposPago } from './pagos'
import { Equipo } from './equipo'
import { Costos } from './costos'
import { DatosLocal } from './local'
import { Sucursales } from './sucursales'
import { Cajas } from './cajas'

const PAGINAS: Record<string, ReactNode> = {
  '': <Inicio />,
  'reporte-diario': <ReporteDiario />,
  cajas: <Cajas />,
  ventas: <Ventas />,
  preferencias: <Preferencias />,
  acumulado: <AcumuladoMes />,
  consolidado: <Consolidado />,
  carta: <CartaAdmin />,
  mesas: <Mesas />,
  equipo: <Equipo />,
  sucursales: <Sucursales />,
  pagos: <TiposPago />,
  costos: <Costos />,
  local: <DatosLocal />,
}

/**
 * El panel de administración, como los sistemas de escritorio que el local
 * conoce: menú lateral de color con íconos, barra superior blanca con la
 * sucursal, el usuario y las alertas, y el contenido en paneles.
 *
 * El administrador elige arriba qué sucursal mira, o todas. La encargada ve
 * solo la suya y solo las páginas de su día a día.
 */
export function Admin() {
  const sesion = useSesion()
  const rol: Rol = sesion?.usuario.rol ?? 'ENCARGADO'
  const { id, sucursales, propia } = useSucursal()
  const [menu, setMenu] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setMenu(false), [pathname])

  // Con una sola sucursal no hay nada que elegir: el panel trabaja en ella.
  useEffect(() => {
    if (!propia && sucursales.length === 1 && id !== sucursales[0].id) elegirVista(sucursales[0].id)
  }, [propia, sucursales, id])

  const secciones = seccionesDe(rol)
  const actual = secciones.find((s) => rutaDe(s.ruta) === pathname.replace(/\/$/, '')) ?? secciones[0]

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 lg:block">
        <MenuLateral rol={rol} />
      </aside>
      <AnimatePresence>
        {menu && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)} />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-y-0 left-0 w-[264px] max-w-[85vw]"
            >
              <MenuLateral rol={rol} alCerrar={() => setMenu(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="min-w-0 flex-1">
        <BarraSuperior titulo={nombreSeccion(actual, rol)} hoja={actual.hoja} alMenu={() => setMenu(true)} />
        <Routes>
          {secciones.map((s) => (s.ruta ? <Route key={s.ruta} path={s.ruta} element={PAGINAS[s.ruta]} /> : <Route key="inicio" index element={PAGINAS['']} />))}
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  )
}

function MenuLateral({ rol, alCerrar }: { rol: Rol; alCerrar?: () => void }) {
  const { nombre } = useAjustes()
  const { sucursal, propia } = useSucursal()
  const secciones = seccionesDe(rol)
  const enlace = ({ isActive }: { isActive: boolean }) =>
    `relative flex h-10 items-center gap-3 pr-3 pl-5 text-[14px] transition-colors ${
      isActive ? 'bg-white/16 font-medium text-white' : 'text-white/80 hover:bg-white/8 hover:text-white'
    }`

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,#134f5c_0%,#1c5e45_52%,#38761d_100%)] text-white">
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <Logo className="size-11 ring-2 ring-white/50" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-bold uppercase">{nombre}</p>
          <p className="truncate text-[12.5px] text-white/70">{propia && sucursal ? `${NOMBRE_ROL.ENCARGADO} · ${sucursal.nombre}` : 'Administración'}</p>
        </div>
        {alCerrar && (
          <button onClick={alCerrar} aria-label="Cerrar menú" className="grid size-9 place-items-center text-white/80 hover:text-white">
            <Icono d={mdiClose} />
          </button>
        )}
      </div>
      <nav className="sin-barra min-h-0 flex-1 overflow-y-auto pb-4">
        {(['Reportes', 'Gestión'] as const).map((g) => (
          <div key={g} className="mt-3">
            <p className="px-5 pb-1.5 text-[11.5px] tracking-wider text-white/55 uppercase">{g}</p>
            {secciones
              .filter((s) => s.grupo === g)
              .map((s) => (
                <NavLink key={s.ruta} to={rutaDe(s.ruta)} end className={enlace}>
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId="menu-activo" className="absolute inset-y-0 left-0 w-1 bg-white" />}
                      <Icono d={s.icono} className="size-5" />
                      <span className="truncate">{nombreSeccion(s, rol)}</span>
                    </>
                  )}
                </NavLink>
              ))}
          </div>
        ))}
        <div className="mt-3">
          <p className="px-5 pb-1.5 text-[11.5px] tracking-wider text-white/55 uppercase">Ir a</p>
          <NavLink to="/mozo" className={enlace({ isActive: false })}>
            <Icono d={mdiRoomService} className="size-5" /> Mozo
          </NavLink>
          <NavLink to="/cocina" className={enlace({ isActive: false })}>
            <Icono d={mdiChefHat} className="size-5" /> Cocina
          </NavLink>
          <NavLink to="/caja" className={enlace({ isActive: false })}>
            <Icono d={mdiCashRegister} className="size-5" /> Caja
          </NavLink>
        </div>
      </nav>
    </div>
  )
}

/** El selector de sucursal del administrador: una, otra o todas a la vez. */
function SelectorSucursal() {
  const { id, sucursales, propia, sucursal } = useSucursal()
  if (propia)
    return sucursal ? (
      <span className="hidden h-9 items-center gap-1.5 border border-reja-2 bg-gris-50 px-2.5 text-[13.5px] font-medium text-tinta sm:flex">
        <Icono d={mdiStorefront} className="size-[18px] text-verde-2" /> {sucursal.nombre}
      </span>
    ) : null
  if (sucursales.length < 2) return null
  return (
    <span className="w-[150px] sm:w-[220px]">
      <Desplegable<number | null>
        titulo="Ver sucursal"
        estilo="campo"
        valor={id}
        opciones={[
          { valor: null, etiqueta: 'Todas las sucursales', icono: mdiViewGridOutline },
          ...sucursales.map((s) => ({ valor: s.id, etiqueta: s.nombre, icono: mdiStorefront, detalle: s.direccion || undefined })),
        ]}
        alCambiar={elegirVista}
        buscador={false}
        className="!h-9"
      />
    </span>
  )
}

function BarraSuperior({ titulo, hoja, alMenu }: { titulo: string; hoja?: string; alMenu: () => void }) {
  const sesion = useSesion()
  const salir = useSalir()
  const navegar = useNavigate()
  const { id } = useSucursal()
  const [clave, setClave] = useState(false)
  // Las alertas son de una sucursal: con «todas» elegidas no hay mesas que mirar.
  const { datos: mesas } = useRecurso<MesaResumen[]>(id ? '/mesas' : null, (c) => !!c.mesas)
  const pendientes = (id && mesas?.filter((m) => m.estado === 'LISTO' || m.estado === 'POR_COBRAR' || m.pedido?.cuentaPedidaEn)) || []
  const nombre = sesion?.usuario.nombre ?? ''

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-reja bg-hoja pr-2 pl-2 sm:pr-4 lg:pl-6">
      <button onClick={alMenu} aria-label="Abrir menú" className="grid size-10 place-items-center text-tinta-2 hover:bg-gris-100 lg:hidden">
        <Icono d={mdiMenu} />
      </button>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[15px] font-medium text-tinta">{titulo}</p>
        {hoja && <p className="hidden truncate text-[12px] text-tinta-3 sm:block">Hoja del Excel: {hoja}</p>}
      </div>
      <SelectorSucursal />
      <span className="hidden xl:block">
        <EnLinea />
      </span>
      {id && (
        <Menu
          titulo={pendientes.length ? `${pendientes.length} mesas esperan` : 'Sin alertas'}
          acciones={
            pendientes.length
              ? pendientes.map((m) => ({
                  etiqueta: `${nombreMesa(m)} · ${m.pedido?.cuentaPedidaEn && !m.pedido.pagado ? 'pide la cuenta' : ESTADO_HOJA[m.estado].nombre === 'Atendido' ? 'por servir' : 'por cobrar'}`,
                  icono: ESTADO_HOJA[m.estado].d,
                  alElegir: () => navegar(m.estado === 'LISTO' ? `/mozo/${m.id}` : `/caja?nota=${m.pedido?.id}`),
                }))
              : [{ etiqueta: 'Todo en orden: nada por servir ni cobrar', alElegir: () => {} }]
          }
          disparador={
            <span className="relative grid size-10 place-items-center">
              <Icono d={mdiBell} className="size-[22px]" />
              {pendientes.length > 0 && (
                <span className="absolute top-1 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rojo px-1 text-[11px] font-bold text-white tabular-nums">
                  {pendientes.length}
                </span>
              )}
            </span>
          }
          className="text-tinta-2 hover:bg-gris-100 hover:text-tinta"
        />
      )}
      <Menu
        titulo={`${nombre} · ${sesion ? NOMBRE_ROL[sesion.usuario.rol] : ''}`}
        acciones={[
          { etiqueta: 'Cambiar mi contraseña', icono: mdiKeyVariant, alElegir: () => setClave(true) },
          { etiqueta: 'Cerrar sesión', icono: mdiLogout, alElegir: () => void salir() },
        ]}
        disparador={
          <span className="flex items-center gap-2 border-l border-reja pl-3">
            <span className="grid size-9 place-items-center rounded-full bg-verde-2 text-[15px] font-bold text-white uppercase">{nombre.slice(0, 1)}</span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-[14px] font-medium text-tinta">{nombre}</span>
              <span className="block text-[11.5px] text-tinta-3">{sesion ? NOMBRE_ROL[sesion.usuario.rol] : ''}</span>
            </span>
          </span>
        }
        className="ml-1 h-11 pr-1 hover:bg-gris-100"
      />
      <DialogoClave abierto={clave} alCerrar={() => setClave(false)} />
    </header>
  )
}

/** Cambiar la propia contraseña: la actual y la nueva dos veces. */
function DialogoClave({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repite, setRepite] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [antes, setAntes] = useState(abierto)
  if (abierto !== antes) {
    setAntes(abierto)
    setActual('')
    setNueva('')
    setRepite('')
  }
  const problema = nueva && nueva.length < 8 ? 'Al menos 8 caracteres.' : repite && repite !== nueva ? 'No coinciden.' : null
  const valido = !!actual && nueva.length >= 8 && nueva === repite

  const guardar = async () => {
    if (!valido) return
    setGuardando(true)
    try {
      await api('/auth/clave', { cuerpo: { actual, nueva } })
      avisar('Contraseña cambiada', 'ok')
      alCerrar()
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      titulo="Cambiar mi contraseña"
      alCerrar={alCerrar}
      botones={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="guardar" disabled={!valido} cargando={guardando} onClick={() => void guardar()} className="min-w-32">
            Cambiar
          </Boton>
        </>
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
      >
        <label className="grid gap-1.5 text-[13px] text-tinta-2">
          Contraseña actual
          <input type="password" className="campo" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="grid gap-1.5 text-[13px] text-tinta-2">
          Contraseña nueva
          <input type="password" className="campo" value={nueva} onChange={(e) => setNueva(e.target.value.slice(0, 72))} autoComplete="new-password" />
        </label>
        <label className="grid gap-1.5 text-[13px] text-tinta-2">
          Repite la nueva
          <input type="password" className="campo" value={repite} onChange={(e) => setRepite(e.target.value.slice(0, 72))} autoComplete="new-password" />
        </label>
        <p className={`text-[12.5px] ${problema ? 'text-rojo' : 'text-tinta-3'}`}>{problema ?? 'Mínimo 8 caracteres. Mejor una frase que solo tú recuerdes.'}</p>
        <button type="submit" hidden />
      </form>
    </Dialogo>
  )
}
