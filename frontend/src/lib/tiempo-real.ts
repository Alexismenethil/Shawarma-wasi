import { useEffect, useRef, useSyncExternalStore } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { Cambio } from '@wasi/shared'
import { URL_API } from './api'
import { sesionActual, useSesion, guardarSesion } from './sesion'
import { sucursalPedida, useVista } from './sucursal'

/** Una conexión por pestaña. Vercel usa consultas cortas y avisos persistidos. */
const CONSULTA = import.meta.env.VITE_SINCRONIZACION === 'consulta'
const visible = () => document.visibilityState !== 'hidden'
const TODO: Cambio = { mesas: true, cocina: true, carta: true, ajustes: true, caja: true }
let socket: Socket | null = null
let claveActual: string | null = null
let conectado = false
let cancelar: (() => void) | null = null
const oyentesEstado = new Set<() => void>()
const oyentesCambio = new Set<(c: Cambio) => void>()
const emitir = (c: Cambio) => oyentesCambio.forEach((o) => o(c))

function estado(valor: boolean) {
  if (conectado === valor) return
  conectado = valor
  oyentesEstado.forEach((o) => o())
}

function asegurarConexion() {
  const token = sesionActual()?.token ?? null
  const sucursal = sucursalPedida()
  const clave = token && `${token}|${sucursal ?? 'todas'}`
  if (clave === claveActual) return
  cancelar?.()
  cancelar = null
  socket?.disconnect()
  socket = null
  claveActual = clave
  estado(false)
  if (!token) return
  if (CONSULTA) {
    cancelar = consultar(token, sucursal)
    return
  }
  socket = io(URL_API || undefined, { auth: { token, sucursal }, transports: ['websocket'] })
  socket.on('connect', () => { estado(true); emitir(TODO) })
  socket.on('disconnect', () => estado(false))
  socket.on('cambio', emitir)
}

interface Lote {
  cursor: string
  cambios: { id: string; cambio: Cambio }[]
  recargar: boolean
  mas?: boolean
}

function consultar(token: string, sucursal: number | null) {
  let cursor: string | undefined
  let detenido = false
  let reloj: ReturnType<typeof setTimeout> | undefined
  let peticion: AbortController | null = null
  let fallos = 0
  let ultimaRecarga = 0
  const sigue = () => !detenido && sesionActual()?.token === token && sucursalPedida() === sucursal

  const ciclo = async () => {
    if (!sigue() || !visible()) return
    peticion = new AbortController()
    const limite = setTimeout(() => peticion?.abort(), 10_000)
    let mas = false
    try {
      const r = await fetch(`${URL_API}/api/cambios${cursor === undefined ? '' : `?desde=${cursor}`}`, {
        headers: { authorization: `Bearer ${token}`, ...(sucursal && { 'x-sucursal': String(sucursal) }) },
        signal: peticion.signal,
        cache: 'no-store',
      })
      if (!sigue()) return
      if (r.status === 401) { guardarSesion(null); return }
      if (!r.ok) throw new Error('No se pudo sincronizar.')
      const lote = await r.json() as Lote
      if (!sigue()) return
      if (typeof lote.cursor !== 'string' || !/^\d+$/.test(lote.cursor) || !Array.isArray(lote.cambios)) throw new Error('Respuesta incompleta.')
      const recuperar = !conectado || lote.recargar || Date.now() - ultimaRecarga > 60_000
      // El cursor avanza solo después de procesar el lote, sin repetir sonidos.
      lote.cambios.forEach(({ cambio }) => emitir(cambio))
      cursor = lote.cursor
      if (recuperar) { emitir(TODO); ultimaRecarga = Date.now() }
      estado(true)
      fallos = 0
      mas = !!lote.mas
    } catch {
      if (!sigue()) return
      estado(false)
      fallos++
    } finally {
      clearTimeout(limite)
      peticion = null
      if (sigue() && visible()) {
        const demora = mas ? 50 : fallos ? Math.min(30_000, 1500 * 2 ** Math.min(fallos, 4)) : 3000
        reloj = setTimeout(() => void ciclo(), demora)
      }
    }
  }
  const despertar = () => {
    clearTimeout(reloj)
    if (!visible() || !navigator.onLine) {
      peticion?.abort()
      estado(false)
      return
    }
    if (!peticion) void ciclo()
  }
  document.addEventListener('visibilitychange', despertar)
  window.addEventListener('online', despertar)
  window.addEventListener('offline', despertar)
  void ciclo()
  return () => {
    detenido = true
    clearTimeout(reloj)
    peticion?.abort()
    document.removeEventListener('visibilitychange', despertar)
    window.removeEventListener('online', despertar)
    window.removeEventListener('offline', despertar)
  }
}

function usarConexion() {
  const sesion = useSesion()
  const vista = useVista()
  useEffect(() => { asegurarConexion() }, [sesion, vista])
}

export function useEnLinea() {
  usarConexion()
  return useSyncExternalStore((o) => { oyentesEstado.add(o); return () => oyentesEstado.delete(o) }, () => conectado)
}

export function useCambios(fn: (c: Cambio) => void) {
  const ref = useRef(fn)
  ref.current = fn
  usarConexion()
  useEffect(() => {
    const oyente = (c: Cambio) => ref.current(c)
    oyentesCambio.add(oyente)
    return () => { oyentesCambio.delete(oyente) }
  }, [])
}
