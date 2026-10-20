import { useEffect, useSyncExternalStore } from 'react'
import type { Sucursal } from '@wasi/shared'
import { sesionActual, useSesion } from './sesion'
import { useAjustes } from './ajustes'

/**
 * En qué sucursal se trabaja. El personal y la encargada tienen la suya; el
 * administrador elige cuál mirar (o todas) desde la barra del panel, y la
 * elección queda guardada en el equipo.
 */

const LLAVE = 'wasi.vista'
let vista: number | null = leer()
const oyentes = new Set<() => void>()

function leer(): number | null {
  try {
    const v = Number(localStorage.getItem(LLAVE))
    return Number.isInteger(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

/** El administrador cambia la sucursal que mira (null = todas). */
export function elegirVista(id: number | null) {
  if (id === vista) return
  vista = id
  try {
    if (id) localStorage.setItem(LLAVE, String(id))
    else localStorage.removeItem(LLAVE)
  } catch {
    /* sin almacenamiento: dura lo que la pestaña */
  }
  oyentes.forEach((o) => o())
}

const suscribir = (o: () => void) => {
  oyentes.add(o)
  return () => oyentes.delete(o)
}

/** Lo que el administrador eligió mirar; al resto no le aplica. */
export const useVista = () => useSyncExternalStore(suscribir, () => vista)

/** La sucursal con que se piden los datos: la del usuario o, si es el administrador, la que eligió. */
export function sucursalPedida(): number | null {
  const s = sesionActual()
  if (!s) return null
  return s.usuario.sucursalId ?? vista
}

/** La sucursal en que se trabaja ahora (null = todas, solo el administrador), con sus datos. */
export function useSucursal(): { id: number | null; sucursal: Sucursal | null; sucursales: Sucursal[]; propia: boolean } {
  const sesion = useSesion()
  const v = useVista()
  const { sucursales, cargado } = useAjustes()
  const propia = sesion?.usuario.sucursalId ?? null
  // Una sucursal elegida que ya no existe (o se desactivó) vuelve a «todas».
  useEffect(() => {
    if (cargado && !propia && v && !sucursales.some((s) => s.id === v)) elegirVista(null)
  }, [cargado, propia, v, sucursales])
  const id = propia ?? v
  return { id, sucursal: sucursales.find((s) => s.id === id) ?? null, sucursales, propia: propia !== null }
}

/** La sucursal de este equipo para entrar con PIN: la tablet de cocina de la sucursal 2 abre en la sucursal 2. */
const LLAVE_EQUIPO = 'wasi.sucursal'

export function sucursalDelEquipo(): number | null {
  try {
    const v = Number(localStorage.getItem(LLAVE_EQUIPO))
    return Number.isInteger(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function recordarSucursalDelEquipo(id: number) {
  try {
    localStorage.setItem(LLAVE_EQUIPO, String(id))
  } catch {
    /* sin almacenamiento */
  }
}
