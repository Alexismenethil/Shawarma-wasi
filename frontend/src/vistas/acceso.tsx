import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { Rol } from '@wasi/shared'
import { useSesion } from '../lib/sesion'
import { Inicio } from './inicio'

/**
 * Deja pasar a quien tiene sesión de esta área (o de administración); al
 * resto le pide PIN. Si la sesión se cierra estando adentro (con «Salir» o
 * porque venció), vuelve a la entrada general, donde se elige cualquier área.
 */
export function Area({ rol, children }: { rol: Rol; children: ReactNode }) {
  const sesion = useSesion()
  const navegar = useNavigate()
  const habiaSesion = useRef(!!sesion)

  useEffect(() => {
    if (sesion) habiaSesion.current = true
    else if (habiaSesion.current) {
      habiaSesion.current = false
      navegar('/', { replace: true })
    }
  }, [sesion, navegar])

  if (sesion && (sesion.usuario.rol === rol || sesion.usuario.rol === 'ADMIN')) return <>{children}</>
  return <Inicio rolInicial={rol} />
}
