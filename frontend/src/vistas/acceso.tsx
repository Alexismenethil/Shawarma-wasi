import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { mdiArrowLeft, mdiChevronRight, mdiStorefront } from '@mdi/js'
import type { Area } from '@wasi/shared'
import { puedeEntrar } from '@wasi/shared'
import { useSesion } from '../lib/sesion'
import { elegirVista, useSucursal } from '../lib/sucursal'
import { Icono } from '../componentes/icono'
import { Logo } from '../componentes/marca'
import { AREA, Inicio } from './inicio'

/**
 * Deja pasar a quien puede entrar a esta área; al resto le pide PIN (o
 * contraseña). Si la sesión se cierra estando adentro (con «Salir» o porque
 * venció), vuelve a la entrada general, donde se elige cualquier área.
 *
 * Mozo, cocina y caja trabajan siempre en una sucursal: el administrador, que
 * no tiene una propia, primero elige en cuál.
 */
export function Area({ area, children }: { area: Area; children: ReactNode }) {
  const sesion = useSesion()
  const navegar = useNavigate()
  const { id } = useSucursal()
  const habiaSesion = useRef(!!sesion)

  useEffect(() => {
    if (sesion) habiaSesion.current = true
    else if (habiaSesion.current) {
      habiaSesion.current = false
      navegar('/', { replace: true })
    }
  }, [sesion, navegar])

  if (!sesion || !puedeEntrar(sesion.usuario.rol, area)) return <Inicio areaInicial={area} />
  if (area !== 'PANEL' && !id) return <ElegirSucursal area={area} />
  return <>{children}</>
}

/** Para el administrador: en qué sucursal va a trabajar como mozo, cocina o caja. */
function ElegirSucursal({ area }: { area: Area }) {
  const { sucursales } = useSucursal()
  return (
    <div className="flex min-h-dvh items-start justify-center bg-fondo px-4 py-10 sm:items-center">
      <div className="sombra-hoja hoja w-full max-w-[460px]">
        <div className="flex items-center gap-3 border-b border-reja px-4 py-4">
          <Logo className="size-10" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-medium text-tinta">¿En qué sucursal?</h1>
            <p className="text-[13px] text-tinta-2">Vas a entrar a {AREA[area].titulo.toLowerCase()}: cada sucursal tiene sus mesas, su cocina y su caja.</p>
          </div>
        </div>
        <ul>
          {sucursales.map((s) => (
            <li key={s.id}>
              <button onClick={() => elegirVista(s.id)} className="flex w-full items-center gap-3 border-b border-reja px-4 py-3.5 text-left hover:bg-azul-suave">
                <Icono d={mdiStorefront} className="size-6 text-verde-2" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-tinta">{s.nombre}</span>
                  {s.direccion && <span className="block truncate text-[12.5px] text-tinta-3">{s.direccion}</span>}
                </span>
                <Icono d={mdiChevronRight} className="size-5 text-tinta-3" />
              </button>
            </li>
          ))}
        </ul>
        <Link to="/admin" className="flex h-11 items-center gap-2 px-4 text-[13.5px] text-azul hover:bg-gris-50">
          <Icono d={mdiArrowLeft} className="size-4" /> Volver al panel
        </Link>
      </div>
    </div>
  )
}
