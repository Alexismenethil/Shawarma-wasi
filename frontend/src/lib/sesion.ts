import { useSyncExternalStore } from 'react'
import type { Usuario } from '@wasi/shared'

/**
 * La sesión del dispositivo. Una tablet de cocina o el celular de un mozo
 * quedan ingresados todo el turno: el token vive en localStorage y vence solo.
 */
export interface Sesion {
  token: string
  usuario: Usuario
}

const LLAVE = 'wasi.sesion'
let actual: Sesion | null = leer()
const oyentes = new Set<() => void>()

function leer(): Sesion | null {
  try {
    const crudo = localStorage.getItem(LLAVE)
    return crudo ? (JSON.parse(crudo) as Sesion) : null
  } catch {
    return null
  }
}

export function guardarSesion(s: Sesion | null) {
  actual = s
  try {
    if (s) localStorage.setItem(LLAVE, JSON.stringify(s))
    else localStorage.removeItem(LLAVE)
  } catch {
    // Sin almacenamiento (ventana privada): la sesión dura lo que la pestaña.
  }
  oyentes.forEach((o) => o())
}

export const sesionActual = () => actual

export function useSesion() {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => oyentes.delete(o)
    },
    () => actual,
  )
}
