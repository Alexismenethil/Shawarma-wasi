import { useEffect, useRef, useSyncExternalStore } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { Cambio } from '@wasi/shared'
import { URL_API } from './api'
import { sesionActual, useSesion } from './sesion'

/**
 * Un solo socket por pestaña. El servidor solo avisa qué cambió; cada pantalla
 * vuelve a pedir lo suyo. Si el socket se cae y vuelve, se avisa a todos que
 * recarguen: lo que pasó mientras tanto no se pierde.
 */
let socket: Socket | null = null
let tokenSocket: string | null = null
let conectado = false
const oyentesEstado = new Set<() => void>()
const oyentesCambio = new Set<(c: Cambio) => void>()

function asegurarSocket() {
  const token = sesionActual()?.token ?? null
  if (token === tokenSocket) return
  socket?.disconnect()
  socket = null
  tokenSocket = token
  if (!token) return
  // Sin URL (producción, mismo servidor), el socket va al mismo origen de la página.
  socket = io(URL_API || undefined, { auth: { token }, transports: ['websocket'] })
  socket.on('connect', () => {
    conectado = true
    oyentesEstado.forEach((o) => o())
    oyentesCambio.forEach((o) => o({ mesas: true, cocina: true, carta: true, ajustes: true }))
  })
  socket.on('disconnect', () => {
    conectado = false
    oyentesEstado.forEach((o) => o())
  })
  socket.on('cambio', (c: Cambio) => oyentesCambio.forEach((o) => o(c)))
}

export function useEnLinea() {
  const sesion = useSesion()
  useEffect(() => {
    asegurarSocket()
  }, [sesion?.token])
  return useSyncExternalStore(
    (o) => {
      oyentesEstado.add(o)
      return () => oyentesEstado.delete(o)
    },
    () => conectado,
  )
}

export function useCambios(fn: (c: Cambio) => void) {
  const ref = useRef(fn)
  ref.current = fn
  const sesion = useSesion()
  useEffect(() => {
    asegurarSocket()
    const oyente = (c: Cambio) => ref.current(c)
    oyentesCambio.add(oyente)
    return () => {
      oyentesCambio.delete(oyente)
    }
  }, [sesion?.token])
}
