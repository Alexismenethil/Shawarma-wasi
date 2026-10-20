import type { Prisma } from '@prisma/client'
import type { Cambio } from '@wasi/shared'
import { prisma } from '../db.js'
import { contexto, type AvisoPendiente } from '../contexto.js'
import { companeras, nombreDe } from './cocina-compartida.js'

/** Dentro de la misma transacción que la operación y su respuesta de reintento. */
export async function guardarAvisos(): Promise<AvisoPendiente[]> {
  const pendientes = contexto.getStore()?.avisos ?? []
  const avisos = [...pendientes]
  for (const { cambio, sucursalId } of pendientes) {
    if (!cambio.cocina || !sucursalId) continue
    const [otras, local] = await Promise.all([companeras(sucursalId), nombreDe(sucursalId)])
    for (const otra of otras) {
      const nuevo = cambio.aviso?.tipo === 'nuevo' ? cambio.aviso : null
      const estaciones = nuevo?.estaciones.filter((e) => otra.estaciones.includes(e)) ?? []
      const aviso: Cambio['aviso'] = nuevo && estaciones.length ? { tipo: 'nuevo', mesa: `${nuevo.mesa} · ${local}`, estaciones } : undefined
      avisos.push({ sucursalId: otra.id, soloSucursal: true, cambio: { cocina: true, ...(aviso && { aviso }) } })
    }
  }
  if (!avisos.length) return avisos
  // Orden de confirmación = orden de ids. Una transacción lenta no puede
  // publicar después un id menor al cursor que otra tablet ya leyó.
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(77209101)`
  await prisma.aviso.createMany({ data: avisos.map(({ cambio, ...destino }) => ({
    ...destino,
    cambio: JSON.parse(JSON.stringify(cambio)) as Prisma.InputJsonValue,
  })) })
  return avisos
}

const RETENCION_MS = 24 * 3600_000
const LIMITE = 200

export async function leerCambios(desde: string | undefined, sucursalId: number | null) {
  const ultimo = (await prisma.aviso.findFirst({ orderBy: { id: 'desc' }, select: { id: true } }))?.id ?? 0n
  // Al entrar se carga el estado actual, sin hacer sonar pedidos históricos.
  if (desde === undefined) return { cursor: String(ultimo), cambios: [], recargar: true }
  const cursor = BigInt(desde)
  if (cursor > ultimo) return { cursor: String(ultimo), cambios: [], recargar: true }
  const anteriores = await prisma.aviso.findUnique({ where: { id: cursor }, select: { creadoEn: true } })
  if (cursor !== 0n && (!anteriores || anteriores.creadoEn.getTime() < Date.now() - RETENCION_MS)) {
    return { cursor: String(ultimo), cambios: [], recargar: true }
  }
  const filas = await prisma.aviso.findMany({
    where: {
      id: { gt: cursor, lte: ultimo },
      creadoEn: { gte: new Date(Date.now() - RETENCION_MS) },
      ...(sucursalId ? { OR: [{ sucursalId }, { sucursalId: null }] } : { soloSucursal: false }),
    },
    orderBy: { id: 'asc' },
    take: LIMITE,
  })
  return {
    cursor: String(filas.length === LIMITE ? filas.at(-1)!.id : ultimo),
    cambios: filas.map((f) => ({ id: String(f.id), cambio: f.cambio as Cambio })),
    mas: filas.length === LIMITE,
    recargar: false,
  }
}

/** Se invoca desde un cron diario de Hobby; no hay temporizadores en la función. */
export async function limpiarTemporales() {
  const [avisos, intentos, reintentos] = await Promise.all([
    prisma.aviso.deleteMany({ where: { creadoEn: { lt: new Date(Date.now() - RETENCION_MS) } } }),
    prisma.intentoAcceso.deleteMany({ where: { ultimo: { lt: new Date(Date.now() - RETENCION_MS) } } }),
    prisma.idempotencia.deleteMany({ where: { creadoEn: { lt: new Date(Date.now() - 2 * RETENCION_MS) } } }),
  ])
  return { avisos: avisos.count, intentos: intentos.count, reintentos: reintentos.count }
}
