import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { mdiBell, mdiChefHat, mdiClose, mdiLogout, mdiMenu, mdiRoomService } from '@mdi/js'
import type { MesaResumen } from '@wasi/shared'
import { nombreMesa } from '@wasi/shared'
import { useSesion } from '../../lib/sesion'
import { useRecurso } from '../../lib/recurso'
import { useAjustes } from '../../lib/ajustes'
import { Logo } from '../../componentes/marca'
import { Icono, ESTADO_HOJA } from '../../componentes/icono'
import { EnLinea, salir } from '../../componentes/barra'
import { Menu } from '../../componentes/desplegable'
import { SECCIONES, rutaDe } from './secciones'
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

/**
 * El panel de administración, como los sistemas de escritorio que el local
 * conoce: menú lateral de color con íconos, barra superior blanca con el
 * usuario y las alertas, y el contenido en paneles.
 */
export function Admin() {
  const [menu, setMenu] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setMenu(false), [pathname])
  const actual = SECCIONES.find((s) => rutaDe(s.ruta) === pathname.replace(/\/$/, '')) ?? SECCIONES[0]

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 lg:block">
        <MenuLateral />
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
              <MenuLateral alCerrar={() => setMenu(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="min-w-0 flex-1">
        <BarraSuperior titulo={actual.nombre} hoja={actual.hoja} alMenu={() => setMenu(true)} />
        <Routes>
          <Route index element={<Inicio />} />
          <Route path="reporte-diario" element={<ReporteDiario />} />
          <Route path="ventas" element={<Ventas />} />
          <Route path="preferencias" element={<Preferencias />} />
          <Route path="acumulado" element={<AcumuladoMes />} />
          <Route path="consolidado" element={<Consolidado />} />
          <Route path="carta" element={<CartaAdmin />} />
          <Route path="mesas" element={<Mesas />} />
          <Route path="pagos" element={<TiposPago />} />
          <Route path="equipo" element={<Equipo />} />
          <Route path="costos" element={<Costos />} />
          <Route path="local" element={<DatosLocal />} />
        </Routes>
      </div>
    </div>
  )
}

function MenuLateral({ alCerrar }: { alCerrar?: () => void }) {
  const { nombre } = useAjustes()
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
          <p className="text-[12.5px] text-white/70">Administración</p>
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
            {SECCIONES.filter((s) => s.grupo === g).map((s) => (
              <NavLink key={s.ruta} to={rutaDe(s.ruta)} end className={enlace}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="menu-activo" className="absolute inset-y-0 left-0 w-1 bg-white" />}
                    <Icono d={s.icono} className="size-5" />
                    <span className="truncate">{s.nombre}</span>
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
        </div>
      </nav>
    </div>
  )
}

function BarraSuperior({ titulo, hoja, alMenu }: { titulo: string; hoja?: string; alMenu: () => void }) {
  const sesion = useSesion()
  const navegar = useNavigate()
  const { datos: mesas } = useRecurso<MesaResumen[]>('/mesas', (c) => !!c.mesas)
  const pendientes = mesas?.filter((m) => m.estado === 'LISTO' || m.estado === 'POR_COBRAR') ?? []
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
      <span className="hidden sm:block">
        <EnLinea />
      </span>
      <Menu
        titulo={pendientes.length ? `${pendientes.length} mesas esperan` : 'Sin alertas'}
        acciones={
          pendientes.length
            ? pendientes.map((m) => ({
                etiqueta: `${nombreMesa(m)} · ${ESTADO_HOJA[m.estado].nombre === 'Atendido' ? 'por servir' : 'por cobrar'}`,
                icono: ESTADO_HOJA[m.estado].d,
                alElegir: () => navegar(`/mozo/${m.id}`),
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
      <span className="ml-1 flex items-center gap-2 border-l border-reja pl-3">
        <span className="grid size-9 place-items-center rounded-full bg-verde-2 text-[15px] font-bold text-white uppercase">{nombre.slice(0, 1)}</span>
        <span className="hidden text-[14px] font-medium text-tinta md:block">{nombre}</span>
      </span>
      <button onClick={() => void salir()} title="Cerrar sesión" aria-label="Cerrar sesión" className="grid size-10 place-items-center text-tinta-2 hover:bg-gris-100 hover:text-tinta">
        <Icono d={mdiLogout} className="size-5" />
      </button>
    </header>
  )
}
