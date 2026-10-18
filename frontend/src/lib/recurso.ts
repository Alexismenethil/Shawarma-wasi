import { useCallback, useEffect, useRef, useState } from 'react'
import type { Cambio } from '@wasi/shared'
import { api } from './api'
import { useCambios } from './tiempo-real'

/**
 * Datos del servidor que se mantienen solos al día: se piden al montar, al
 * volver a la pestaña y cada vez que el socket avisa un cambio que les toca.
 */
export function useRecurso<T>(ruta: string | null, leTocaElCambio: (c: Cambio) => boolean = () => true) {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const vigente = useRef(0)

  const recargar = useCallback(async () => {
    if (!ruta) return
    const turno = ++vigente.current
    try {
      const d = await api<T>(ruta)
      if (turno === vigente.current) {
        setDatos(d)
        setError(null)
      }
    } catch (e) {
      if (turno === vigente.current) setError((e as Error).message)
    } finally {
      if (turno === vigente.current) setCargando(false)
    }
  }, [ruta])

  useEffect(() => {
    setCargando(true)
    void recargar()
    const alVolver = () => document.visibilityState === 'visible' && void recargar()
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [recargar])

  useCambios((c) => {
    if (leTocaElCambio(c)) void recargar()
  })

  return { datos, setDatos, error, cargando, recargar }
}
