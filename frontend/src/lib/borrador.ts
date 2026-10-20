import { useCallback, useSyncExternalStore } from 'react'
import type { Carta, FamiliaCarta, LineaNueva, ProductoCarta } from '@wasi/shared'
import { idAlAzar } from './azar'

/**
 * Lo que el mozo va anotando en la nota antes de pulsar «Guardar».
 *
 * Vive en el dispositivo (localStorage) y no en el servidor: anotar tiene que
 * ser instantáneo aunque el wifi del local tiemble, y una nota a medio tomar no
 * es todavía un pedido. Al guardarla, recién llega a cocina.
 */
export interface LineaBorrador extends LineaNueva {
  clave: string
}

const prefijo = 'wasi.borrador.'
const prefijoCliente = 'wasi.cliente.'
const cache = new Map<number, LineaBorrador[]>()
const oyentes = new Set<() => void>()
let version = 0

/** Lo guardado por una versión anterior puede traer campos viejos: se ordena al leer. */
function sanear(l: Partial<LineaBorrador>): LineaBorrador | null {
  if (!l || typeof l !== 'object' || (!l.productoId && !l.libre)) return null
  return {
    clave: typeof l.clave === 'string' ? l.clave : idAlAzar(),
    productoId: l.productoId ?? null,
    ...(l.libre && { libre: l.libre }),
    cantidad: Math.max(1, Math.min(99, Number(l.cantidad) || 1)),
    adicionales: Array.isArray(l.adicionales) ? l.adicionales : [],
    detalle: typeof l.detalle === 'string' ? l.detalle : null,
    paraLlevar: !!l.paraLlevar,
    observacion: typeof l.observacion === 'string' ? l.observacion : null,
  }
}

function leer(mesaId: number): LineaBorrador[] {
  if (!cache.has(mesaId)) {
    try {
      const crudo = JSON.parse(localStorage.getItem(prefijo + mesaId) ?? '[]') as unknown[]
      cache.set(mesaId, (Array.isArray(crudo) ? crudo : []).map((l) => sanear(l as LineaBorrador)).filter((l): l is LineaBorrador => !!l))
    } catch {
      cache.set(mesaId, [])
    }
  }
  return cache.get(mesaId)!
}

function escribir(mesaId: number, lineas: LineaBorrador[]) {
  cache.set(mesaId, lineas)
  try {
    if (lineas.length) localStorage.setItem(prefijo + mesaId, JSON.stringify(lineas))
    else localStorage.removeItem(prefijo + mesaId)
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
  version++
  oyentes.forEach((o) => o())
}

const suscribir = (o: () => void) => {
  oyentes.add(o)
  return () => oyentes.delete(o)
}

/** Mesas con algo anotado en este dispositivo y todavía sin guardar. */
export function useMesasConBorrador(): Set<number> {
  useSyncExternalStore(suscribir, () => version)
  const ids = new Set<number>()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const llave = localStorage.key(i)
      if (llave?.startsWith(prefijo)) ids.add(Number(llave.slice(prefijo.length)))
    }
  } catch {
    cache.forEach((l, id) => l.length && ids.add(id))
  }
  return ids
}

export function useBorrador(mesaId: number, paraLlevarPorDefecto: boolean) {
  const lineas = useSyncExternalStore(suscribir, () => leer(mesaId))

  /** Cada producto elegido es una fila nueva, como en la hoja del Excel. */
  const agregar = useCallback(
    (p: ProductoCarta, extra: Partial<LineaNueva> = {}) => {
      const nueva: LineaBorrador = {
        clave: idAlAzar(),
        productoId: p.id,
        cantidad: 1,
        adicionales: [],
        detalle: null,
        paraLlevar: paraLlevarPorDefecto,
        observacion: null,
        ...extra,
      }
      escribir(mesaId, [...leer(mesaId), nueva])
      return nueva.clave
    },
    [mesaId, paraLlevarPorDefecto],
  )

  const agregarLibre = useCallback(
    (libre: NonNullable<LineaNueva['libre']>, extra: Partial<LineaNueva> = {}) => {
      escribir(mesaId, [
        ...leer(mesaId),
        {
          clave: idAlAzar(),
          productoId: null,
          libre,
          cantidad: 1,
          adicionales: [],
          detalle: null,
          paraLlevar: paraLlevarPorDefecto,
          observacion: null,
          ...extra,
        },
      ])
    },
    [mesaId, paraLlevarPorDefecto],
  )

  const cambiar = useCallback(
    (clave: string, parcial: Partial<LineaBorrador>) => {
      escribir(
        mesaId,
        leer(mesaId).map((l) => (l.clave === clave ? { ...l, ...parcial } : l)),
      )
    },
    [mesaId],
  )

  const quitar = useCallback((clave: string) => escribir(mesaId, leer(mesaId).filter((l) => l.clave !== clave)), [mesaId])
  const vaciar = useCallback(() => escribir(mesaId, []), [mesaId])

  return { lineas, agregar, agregarLibre, cambiar, quitar, vaciar }
}

/** El nombre del cliente mientras la nota no se guarda (la celda «Cliente:»). */
export function leerClienteBorrador(mesaId: number) {
  try {
    return localStorage.getItem(prefijoCliente + mesaId) ?? ''
  } catch {
    return ''
  }
}

export function guardarClienteBorrador(mesaId: number, cliente: string) {
  try {
    if (cliente.trim()) localStorage.setItem(prefijoCliente + mesaId, cliente)
    else localStorage.removeItem(prefijoCliente + mesaId)
  } catch {
    /* sin almacenamiento */
  }
}

/** Índice rápido de la carta para pintar el borrador sin recorrerla cada vez. */
export function indiceCarta(carta: Carta | null) {
  const productos = new Map<number, ProductoCarta & { familia: FamiliaCarta }>()
  carta?.familias.forEach((f) => f.productos.forEach((p) => productos.set(p.id, { ...p, familia: f })))
  const adicionales = new Map(carta?.adicionales.map((a) => [a.id, a]) ?? [])
  return { productos, adicionales }
}

export type IndiceCarta = ReturnType<typeof indiceCarta>

/** Precio, PAdic y Subtotal de una fila: Subtotal = Cant × (Precio + PAdic), como en el Excel. */
export function precioLinea(l: LineaNueva, indice: IndiceCarta) {
  const base = l.productoId ? (indice.productos.get(l.productoId)?.precio ?? 0) : (l.libre?.precio ?? 0)
  const extra = l.adicionales.reduce((s, id) => s + (indice.adicionales.get(id)?.precio ?? 0), 0)
  return { base, extra, subtotal: l.cantidad * (base + extra) }
}

/** Los adicionales que tienen sentido para un producto (los de su cocina o su familia). */
export function adicionalesPara(carta: Carta | null, familia: FamiliaCarta | null | undefined) {
  if (!carta || !familia) return []
  return carta.adicionales.filter(
    (a) => (a.familia ? a.familia === familia.clave : a.estaciones.length === 0 || a.estaciones.includes(familia.estacion)),
  )
}
