import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { mdiChartBar, mdiChefHat, mdiLogin, mdiRoomService } from '@mdi/js'
import type { Rol } from '@wasi/shared'
import { useSesion } from '../lib/sesion'
import { useAhora } from '../lib/formato'
import { useAjustes } from '../lib/ajustes'
import { TecladoPin } from '../componentes/teclado-pin'
import { Logo, Titulo } from '../componentes/marca'
import { Icono } from '../componentes/icono'
import { Boton } from '../componentes/boton'
import { salir } from '../componentes/barra'

export const AREA: Record<Rol, { titulo: string; detalle: string; icono: string; ruta: string }> = {
  MOZO: { titulo: 'Mozo', detalle: 'Mesas y nota de pedido', icono: mdiRoomService, ruta: '/mozo' },
  COCINA: { titulo: 'Cocina', detalle: 'Atención al cliente', icono: mdiChefHat, ruta: '/cocina' },
  ADMIN: { titulo: 'Administración', detalle: 'Reportes y gestión', icono: mdiChartBar, ruta: '/admin' },
}
const ROLES: Rol[] = ['MOZO', 'COCINA', 'ADMIN']

/** La última área con que se entró en este dispositivo: la tablet de cocina abre en Cocina. */
function leerArea(): Rol {
  try {
    const r = localStorage.getItem('wasi.area')
    return ROLES.includes(r as Rol) ? (r as Rol) : 'MOZO'
  } catch {
    return 'MOZO'
  }
}

function recordarArea(r: Rol) {
  try {
    localStorage.setItem('wasi.area', r)
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * La entrada: una ventana de inicio de sesión como la de un sistema de
 * escritorio. A la izquierda el local; a la derecha el área y el PIN.
 * Si alguien llega directo a /cocina sin sesión, ve esta misma ventana con
 * Cocina ya elegida, pero puede cambiar de área: nunca queda atrapado.
 */
export function Inicio({ rolInicial }: { rolInicial?: Rol }) {
  const navegar = useNavigate()
  const sesion = useSesion()
  const ahora = useAhora(15_000)
  const { direccion } = useAjustes()
  const [area, setArea] = useState<Rol>(rolInicial ?? leerArea)

  useEffect(() => {
    if (rolInicial) setArea(rolInicial)
  }, [rolInicial])

  const elegir = (r: Rol) => {
    setArea(r)
    recordarArea(r)
  }

  const entrar = () => {
    recordarArea(area)
    navegar(AREA[area].ruta, { replace: true })
  }

  const puede = (rol: Rol) => !!sesion && (sesion.usuario.rol === rol || sesion.usuario.rol === 'ADMIN')
  const reloj = new Date(ahora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' })
  const fecha = new Date(ahora).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })

  return (
    <div className="flex min-h-dvh items-stretch justify-center bg-fondo sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        className="sombra-hoja flex w-full flex-col overflow-hidden border-reja bg-hoja sm:max-w-[920px] sm:border md:min-h-[600px] md:flex-row"
      >
        {/* El local */}
        <aside className="relative flex shrink-0 flex-col justify-between overflow-hidden bg-verde-3 px-5 py-5 text-white md:w-[42%] md:px-8 md:py-8">
          <img src="/fotos/shawarma.webp" alt="" className="absolute inset-0 hidden h-full w-full object-cover opacity-55 md:block" />
          <div className="absolute inset-0 hidden bg-[linear-gradient(180deg,rgb(39_78_19/0.96)_0%,rgb(39_78_19/0.82)_45%,rgb(19_79_92/0.55)_100%)] md:block" />
          <div className="relative flex items-center gap-3 md:flex-col md:items-start md:gap-5">
            <Logo className="size-12 ring-2 ring-white/60 md:size-20" />
            <div className="min-w-0 flex-1">
              <Titulo color="blanco" alinear="izquierda" />
            </div>
            <div className="text-right md:hidden">
              <p className="text-[22px] leading-none font-light tabular-nums">{reloj}</p>
            </div>
          </div>
          <div className="relative hidden md:block">
            <p className="text-[52px] leading-none font-light tabular-nums">{reloj}</p>
            <p className="mt-2 text-[15px] text-white/85 first-letter:uppercase">{fecha}</p>
            {direccion && <p className="mt-1 text-[13px] text-white/65">{direccion}</p>}
          </div>
        </aside>

        {/* El ingreso */}
        <main className="flex flex-1 flex-col px-5 pt-6 pb-8 md:px-10 md:py-9">
          <h1 className="text-[22px] font-medium text-tinta">Iniciar sesión</h1>
          <p className="mt-1 text-[14px] text-tinta-2">Elige tu área e ingresa tu PIN.</p>

          <p className="mt-6 mb-2 text-[13px] font-medium text-tinta-2">Área de trabajo</p>
          <div role="radiogroup" aria-label="Área de trabajo" className="grid grid-cols-3 border border-reja-2">
            {ROLES.map((r) => {
              const activa = area === r
              return (
                <button
                  key={r}
                  role="radio"
                  aria-checked={activa}
                  onClick={() => elegir(r)}
                  className={`flex min-h-[68px] flex-col items-center justify-center gap-1 border-r border-reja-2 px-1 py-2 text-[13px] transition-colors last:border-r-0 sm:text-[14px] ${
                    activa ? 'bg-verde-3 font-medium text-white' : 'bg-hoja text-tinta-2 hover:bg-gris-50 hover:text-tinta'
                  }`}
                >
                  <Icono d={AREA[r].icono} className={`size-6 ${activa ? 'text-white' : 'text-verde-2'}`} />
                  <span className="max-w-full truncate">{AREA[r].titulo}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[12.5px] text-tinta-3">{AREA[area].detalle}</p>

          <div className="mt-6 max-w-[360px]">
            {puede(area) ? (
              <div className="border border-reja bg-gris-50 p-4">
                <p className="text-[14px] text-tinta-2">
                  Sesión abierta: <b className="font-medium text-tinta">{sesion!.usuario.nombre}</b>
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Boton variante="guardar" icono={mdiLogin} onClick={entrar} className="min-w-36">
                    Entrar a {AREA[area].titulo.toLowerCase()}
                  </Boton>
                  <Boton variante="claro" onClick={() => void salir()}>
                    Cambiar de usuario
                  </Boton>
                </div>
              </div>
            ) : (
              <TecladoPin rol={area} alEntrar={entrar} />
            )}
          </div>
        </main>
      </motion.div>
    </div>
  )
}
