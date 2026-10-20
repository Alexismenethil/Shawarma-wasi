import type { CocinaCompartida, Estacion } from '@wasi/shared'
import { ESTACIONES, juntasEnCocina } from '@wasi/shared'
import { prisma } from '../db.js'
import { recordar } from '../memoria.js'

/**
 * Cocina compartida (temporal).
 *
 * Plaza More y Plaza San Cristóbal están en la misma ciudad y, por ahora, la
 * carta y los shawarmas de las dos salen de la cocina de Plaza More; los
 * emolientes, cada local en la suya. Cada sucursal guarda a qué cocina manda
 * qué estaciones (Administración → Sucursales → «Cocina»); poner «Propia» lo
 * deshace sin tocar el código.
 *
 * Todo lo que depende de eso pasa por aquí: qué comandas ve cada pantalla de
 * cocina, quién puede marcarlas y a qué otras sucursales llegan los avisos.
 * Sin ninguna cocina compartida, cada sucursal es la única de su cocina y todo
 * se comporta como antes.
 */

export interface CocinaDeSucursal {
  id: number
  nombre: string
  activa: boolean
  cocinaCompartida: CocinaCompartida | null
}

/** Las dos columnas de la base, como las entiende el resto del sistema. */
export const comoCocina = (s: { cocinaEnId: number | null; cocinasCompartidas: Estacion[] }): CocinaCompartida | null =>
  s.cocinaEnId && s.cocinasCompartidas.length ? { en: s.cocinaEnId, estaciones: s.cocinasCompartidas } : null

/** Cómo cocina cada sucursal (también las desactivadas). Se lee de la base solo cuando cambia: `olvidar('sucursales')` lo renueva. */
export function leerCocinas(): Promise<CocinaDeSucursal[]> {
  return recordar('sucursales:cocinas', async () =>
    (
      await prisma.sucursal.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, nombre: true, activa: true, cocinaEnId: true, cocinasCompartidas: true },
      })
    ).map((s) => ({ id: s.id, nombre: s.nombre, activa: s.activa, cocinaCompartida: comoCocina(s) })),
  )
}

/** Las sucursales cuyas comandas de esa estación ve la pantalla de cocina de esta (ella incluida). */
export async function juntas(sucursalId: number, estacion: Estacion) {
  return juntasEnCocina(await leerCocinas(), sucursalId, estacion)
}

/** Lo que filtra la hoja de cocina: por cada estación, las sucursales que se ven en ella. */
export async function filtroDeCocina(sucursalId: number, estacion?: Estacion) {
  const cocinas = await leerCocinas()
  return (estacion ? [estacion] : ESTACIONES).map((e) => ({ estacion: e, pedido: { sucursalId: { in: juntasEnCocina(cocinas, sucursalId, e) } } }))
}

/**
 * Las otras sucursales que ven comandas de esta en alguna de sus pantallas de
 * cocina, con qué estaciones de esta les llegan. Vacío si no comparte nada.
 */
export async function companeras(sucursalId: number): Promise<{ id: number; estaciones: Estacion[] }[]> {
  const cocinas = await leerCocinas()
  const otras = new Map<number, Estacion[]>()
  for (const e of ESTACIONES) {
    for (const id of juntasEnCocina(cocinas, sucursalId, e)) {
      if (id !== sucursalId) otras.set(id, [...(otras.get(id) ?? []), e])
    }
  }
  return [...otras].map(([id, estaciones]) => ({ id, estaciones }))
}

/** El nombre del local cuya cocina prepara esa estación de la sucursal, si no es la propia (dónde recoger el pedido). */
export async function dondeSePrepara(sucursalId: number, estacion: Estacion): Promise<string | undefined> {
  const cocinas = await leerCocinas()
  const c = cocinas.find((s) => s.id === sucursalId)?.cocinaCompartida
  if (!c || !c.estaciones.includes(estacion)) return undefined
  return cocinas.find((s) => s.id === c.en)?.nombre
}

export async function nombreDe(sucursalId: number) {
  return (await leerCocinas()).find((s) => s.id === sucursalId)?.nombre ?? `Sucursal ${sucursalId}`
}

/** Las otras sucursales activas que cocinan esa estación en la misma cocina que esta: lo que se agota allí, se agota para todas. */
export async function agotanJuntas(sucursalId: number, estacion: Estacion) {
  const cocinas = await leerCocinas()
  return juntasEnCocina(cocinas, sucursalId, estacion)
    .filter((id) => id !== sucursalId)
    .map((id) => cocinas.find((s) => s.id === id))
    .filter((s): s is CocinaDeSucursal => !!s?.activa)
}
