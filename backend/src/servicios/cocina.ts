import type { ComandaCocina, Estacion } from '@wasi/shared'
import { codigoMesa } from '@wasi/shared'
import { prisma } from '../db.js'
import { ErrorNegocio } from '../errores.js'
import { avisar } from '../tiempo-real.js'
import { dondeSePrepara, filtroDeCocina, juntas } from './cocina-compartida.js'
import { numerosDelDia, serializarItem } from './pedidos.js'

/**
 * La hoja «Atención al Cliente» de cada cocina.
 *
 * Una comanda es lo que una cocina tiene que sacar de un envío del mozo: las
 * líneas de una misma ronda de un pedido que le tocan a esa estación. Como en
 * el Excel, la hoja muestra lo pendiente y también lo ya atendido o anulado,
 * hasta que la cocina pulsa «Limpiar»: lo que se resolvió antes de esa hora
 * deja de mostrarse. Lo pendiente nunca se limpia.
 *
 * Cada cocina ve solo las comandas de su sucursal, salvo las estaciones que
 * por ahora comparte con otra (ver cocina-compartida.ts): ahí se ven las de
 * las dos, cada una con su local.
 */

type Fila = Awaited<ReturnType<typeof cargar>>[number]

function cargar(where: object) {
  return prisma.itemPedido.findMany({
    where,
    include: { pedido: { include: { mesa: true, mozo: { select: { nombre: true } } } } },
    orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
  })
}

function agrupar(filas: Fila[], numeros: Map<number, number>): ComandaCocina[] {
  const grupos = new Map<string, ComandaCocina>()
  for (const f of filas) {
    const clave = `${f.pedidoId}-${f.ronda}-${f.estacion}`
    let g = grupos.get(clave)
    if (!g) {
      g = {
        clave,
        pedidoId: f.pedidoId,
        sucursalId: f.pedido.sucursalId,
        numero: numeros.get(f.pedidoId) ?? 0,
        ronda: f.ronda,
        mesa: { numero: f.pedido.mesa.numero, tipo: f.pedido.mesa.tipo },
        cliente: f.pedido.cliente,
        mozo: f.pedido.mozo?.nombre ?? null,
        enviadoEn: f.creadoEn.toISOString(),
        items: [],
      }
      grupos.set(clave, g)
    }
    g.items.push(serializarItem(f))
  }
  return [...grupos.values()]
}

/** Lo resuelto se muestra a lo más 12 horas, aunque nadie pulse «Limpiar». */
const MEMORIA = 12 * 3600_000

export async function hojaCocina(sucursalId: number, estacion?: Estacion, limpiadoEn?: string): Promise<ComandaCocina[]> {
  const limite = Date.now() - MEMORIA
  const desde = new Date(Math.max(limite, limpiadoEn ? Date.parse(limpiadoEn) || 0 : 0))

  const claves = await prisma.itemPedido.findMany({
    where: {
      AND: [
        // Cada estación con las sucursales que se ven en ella (la propia, o las que comparten esa cocina).
        { OR: await filtroDeCocina(sucursalId, estacion) },
        { OR: [{ estado: 'PENDIENTE', pedido: { estado: 'ABIERTO' } }, { listoEn: { gte: desde } }, { anuladoEn: { gte: desde } }] },
      ],
    },
    select: { pedidoId: true, ronda: true, estacion: true },
    distinct: ['pedidoId', 'ronda', 'estacion'],
  })
  if (claves.length === 0) return []

  // Las comandas se traen enteras: lo atendido y lo anulado se ve junto a lo que falta.
  const filas = await cargar({ OR: claves.map((c) => ({ pedidoId: c.pedidoId, ronda: c.ronda, estacion: c.estacion })) })
  const numeros = await numerosDelDia([...new Set(filas.map((f) => f.pedidoId))])
  return agrupar(filas, numeros).sort((a, b) => Date.parse(a.enviadoEn) - Date.parse(b.enviadoEn))
}

/**
 * Lo marca la cocina que lo prepara: la de su sucursal o, si la comparten, la
 * de la otra. El aviso va a los mozos de la sucursal del pedido, con el local
 * donde recogerlo si no es el suyo.
 */
export async function marcarItem(sucursalId: number, itemId: number, listo: boolean) {
  const item = await prisma.itemPedido.findUnique({ where: { id: itemId }, include: { pedido: { include: { mesa: true } } } })
  if (!item || item.estado === 'ANULADO' || !(await juntas(sucursalId, item.estacion)).includes(item.pedido.sucursalId)) {
    throw new ErrorNegocio('Esa línea fue anulada.', 404)
  }
  if (item.estado === 'ENTREGADO') throw new ErrorNegocio('Eso ya se sirvió en la mesa.')
  await prisma.itemPedido.update({
    where: { id: itemId },
    data: listo ? { estado: 'LISTO', listoEn: new Date() } : { estado: 'PENDIENTE', listoEn: null },
  })
  const quedan = await prisma.itemPedido.count({
    where: { pedidoId: item.pedidoId, ronda: item.ronda, estacion: item.estacion, estado: 'PENDIENTE' },
  })
  const en = listo && quedan === 0 ? await dondeSePrepara(item.pedido.sucursalId, item.estacion) : undefined
  avisar(
    {
      mesas: true,
      cocina: true,
      pedidoId: item.pedidoId,
      ...(listo && quedan === 0 && { aviso: { tipo: 'listo', mesa: codigoMesa(item.pedido.mesa), estacion: item.estacion, ...(en && { en }) } }),
    },
    item.pedido.sucursalId,
  )
}

export async function marcarComanda(sucursalId: number, pedidoId: number, ronda: number, estacion: Estacion, listo: boolean) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { mesa: true } })
  if (!pedido || !(await juntas(sucursalId, estacion)).includes(pedido.sucursalId)) throw new ErrorNegocio('Ese pedido no existe.', 404)
  await prisma.itemPedido.updateMany({
    where: { pedidoId, ronda, estacion, estado: listo ? 'PENDIENTE' : 'LISTO' },
    data: listo ? { estado: 'LISTO', listoEn: new Date() } : { estado: 'PENDIENTE', listoEn: null },
  })
  const en = listo ? await dondeSePrepara(pedido.sucursalId, estacion) : undefined
  avisar(
    {
      mesas: true,
      cocina: true,
      pedidoId,
      ...(listo && { aviso: { tipo: 'listo', mesa: codigoMesa(pedido.mesa), estacion, ...(en && { en }) } }),
    },
    pedido.sucursalId,
  )
}
