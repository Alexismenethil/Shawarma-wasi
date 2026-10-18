import type { TipoMesa } from '@wasi/shared'
import { nombreMesa } from '@wasi/shared'
import { prisma } from '../db.js'
import { ErrorNegocio } from '../errores.js'
import { avisar } from '../tiempo-real.js'

/**
 * Las mesas del salón y los turnos para llevar: las pestañas M1…M25 y L1…L10
 * del Excel. El local las agrega, renumera o retira desde Administración.
 */

const avisarMesas = () => avisar({ mesas: true })

export async function listarMesasAdmin() {
  const mesas = await prisma.mesa.findMany({
    orderBy: [{ tipo: 'asc' }, { numero: 'asc' }],
    include: {
      _count: { select: { pedidos: true } },
      pedidos: { where: { estado: 'ABIERTO' }, select: { id: true }, take: 1 },
    },
  })
  return mesas.map((m) => ({
    id: m.id,
    numero: m.numero,
    tipo: m.tipo,
    activa: m.activa,
    ocupada: m.pedidos.length > 0,
    pedidos: m._count.pedidos,
  }))
}

export async function crearMesa(tipo: TipoMesa, numero?: number) {
  const n = numero ?? ((await prisma.mesa.aggregate({ where: { tipo }, _max: { numero: true } }))._max.numero ?? 0) + 1
  const existe = await prisma.mesa.findUnique({ where: { tipo_numero: { tipo, numero: n } } })
  if (existe?.activa) throw new ErrorNegocio(`${nombreMesa({ tipo, numero: n })} ya existe.`)
  // Si estaba retirada, vuelve con su historial.
  const mesa = existe
    ? await prisma.mesa.update({ where: { id: existe.id }, data: { activa: true } })
    : await prisma.mesa.create({ data: { tipo, numero: n } })
  avisarMesas()
  return mesa
}

export async function actualizarMesa(id: number, datos: Partial<{ numero: number; activa: boolean }>) {
  const mesa = await prisma.mesa.findUnique({ where: { id } })
  if (!mesa) throw new ErrorNegocio('Esa mesa no existe.', 404)
  if (datos.numero !== undefined && datos.numero !== mesa.numero) {
    const otra = await prisma.mesa.findUnique({ where: { tipo_numero: { tipo: mesa.tipo, numero: datos.numero } } })
    if (otra) throw new ErrorNegocio(`${nombreMesa(otra)} ya existe${otra.activa ? '' : ' (retirada)'}.`)
  }
  if (datos.activa === false && (await prisma.pedido.count({ where: { mesaId: id, estado: 'ABIERTO' } }))) {
    throw new ErrorNegocio(`${nombreMesa(mesa)} tiene una nota abierta: ciérrala antes de retirarla.`)
  }
  const actualizada = await prisma.mesa.update({ where: { id }, data: datos })
  avisarMesas()
  return actualizada
}

/** Las siguientes `cantidad` mesas (después del número más alto), todas en una transacción. */
export async function crearMesas(tipo: TipoMesa, cantidad: number) {
  const creadas = await prisma.$transaction(async (tx) => {
    const tope = (await tx.mesa.aggregate({ where: { tipo }, _max: { numero: true } }))._max.numero ?? 0
    await tx.mesa.createMany({ data: Array.from({ length: cantidad }, (_, i) => ({ tipo, numero: tope + i + 1 })) })
    return tx.mesa.findMany({ where: { tipo, numero: { gt: tope } }, orderBy: { numero: 'asc' } })
  })
  avisarMesas()
  return creadas
}

/** Una mesa con historial no se borra (sus ventas la nombran): se retira. */
export async function borrarMesa(id: number) {
  const mesa = await prisma.mesa.findUnique({ where: { id }, include: { _count: { select: { pedidos: true } } } })
  if (!mesa) throw new ErrorNegocio('Esa mesa no existe.', 404)
  if (mesa._count.pedidos > 0) {
    throw new ErrorNegocio(`${nombreMesa(mesa)} ya tiene ventas: retírala en vez de borrarla.`)
  }
  await prisma.mesa.delete({ where: { id } })
  avisarMesas()
}
