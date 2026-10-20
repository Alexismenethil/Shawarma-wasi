import { useEffect, useSyncExternalStore } from 'react'
import type { Ajustes, Estacion } from '@wasi/shared'
import { ESTACION_POR_DEFECTO, NUMERO_ESTACION } from '@wasi/shared'
import { api } from './api'
import { useCambios } from './tiempo-real'

/**
 * Los datos del negocio (nombre, sucursales, cocinas, medios de pago,
 * observaciones), uno solo para toda la pestaña. Se piden una vez y se renuevan cuando el panel
 * de Administración avisa un cambio.
 */

const RESPALDO: Ajustes = {
  nombre: 'Shawarma Wasi',
  subtitulo: 'Peruvian Cuisine',
  ruc: '',
  pieNota: '',
  estaciones: ESTACION_POR_DEFECTO,
  observaciones: [],
  minutosAlerta: 15,
  medios: [],
  sucursales: [],
}

let actual: Ajustes | null = null
let pidiendo: Promise<void> | null = null
const oyentes = new Set<() => void>()

function pedir() {
  pidiendo ??= api<Ajustes>('/ajustes')
    .then((a) => {
      actual = a
      oyentes.forEach((o) => o())
    })
    .catch(() => {})
    .finally(() => {
      pidiendo = null
    })
  return pidiendo
}

export function useAjustes(): Ajustes & { cargado: boolean } {
  const a = useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => oyentes.delete(o)
    },
    () => actual,
  )
  useEffect(() => {
    if (!actual) void pedir()
  }, [])
  useCambios((c) => {
    if (c.ajustes) void pedir()
  })
  return { ...(a ?? RESPALDO), cargado: !!a }
}

/** «Cocina 2 · Shawarmas». */
export const nombreCocina = (a: Pick<Ajustes, 'estaciones'>, e: Estacion) => `Cocina ${NUMERO_ESTACION[e]} · ${a.estaciones[e]}`
