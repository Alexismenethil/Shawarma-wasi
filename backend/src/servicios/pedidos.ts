import { Prisma } from '@prisma/client'
import type { AdicionalElegido, EstadoMesa, ItemPedido, LineaNueva, MesaResumen, Pedido, Usuario } from '@wasi/shared'
import { codigoMesa, esJefe, formatoSoles } from '@wasi/shared'
import { prisma } from '../db.js'
import { ErrorNegocio } from '../errores.js'
import { avisar } from '../tiempo-real.js'
import { deLaSucursal, enLaSucursal } from './carta.js'

/**
 * La nota de pedido.
 *
 * Es la hoja M1…M25 / L1…L10 del Excel hecha datos: una nota abierta por mesa,
 * con sus líneas (cantidad, producto, adicional, detalle, observación), el
 * total y los pagos. La nota se cierra cuando está pagada *y* todo lo pedido
 * llegó a la mesa: un pedido para llevar suele pagarse antes de salir de la
 * cocina, y no por eso la cocina debe olvidarlo.
 *
 * Todo pasa dentro de una sucursal: cada función recibe la sucursal de quien
 * pide y solo encuentra lo de ella. Una nota de otra sucursal, para esta, no
 * existe.
 */

const incluirPedido = {
  mesa: true,
  mozo: { select: { nombre: true } },
  cobradoPor: { select: { nombre: true } },
  items: { orderBy: [{ ronda: 'asc' }, { id: 'asc' }] },
  pagos: { orderBy: { id: 'asc' } },
} satisfies Prisma.PedidoInclude

type PedidoCompleto = Prisma.PedidoGetPayload<{ include: typeof incluirPedido }>
type ItemDb = PedidoCompleto['items'][number]

export function serializarItem(i: ItemDb): ItemPedido {
  return {
    id: i.id,
    ronda: i.ronda,
    productoId: i.productoId,
    nombre: i.nombre,
    familia: i.familia,
    estacion: i.estacion,
    cantidad: i.cantidad,
    precio: i.precio,
    adicionales: i.adicionales as unknown as AdicionalElegido[],
    precioAdicionales: i.precioAdicionales,
    subtotal: i.subtotal,
    detalle: i.detalle,
    paraLlevar: i.paraLlevar,
    observacion: i.observacion,
    estado: i.estado,
    creadoEn: i.creadoEn.toISOString(),
    listoEn: i.listoEn?.toISOString() ?? null,
    entregadoEn: i.entregadoEn?.toISOString() ?? null,
  }
}

/**
 * El número de cada nota en su día y en su sucursal, en hora de Lima: 1, 2,
 * 3… Es la columna «Nro:» de Atención al Cliente; se calcula, no se guarda,
 * así que nunca se desordena aunque se anule una nota.
 */
export async function numerosDelDia(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map()
  // Se numeran solo los pedidos de los días y sucursales en juego (por rango de creadoEn, con su índice).
  const filas = await prisma.$queryRaw<{ id: number; numero: number }[]>`
    WITH dias AS (
      SELECT DISTINCT p."sucursalId", (p."creadoEn" AT TIME ZONE 'America/Lima')::date AS dia
      FROM "Pedido" p WHERE p.id IN (${Prisma.join(ids)})
    ), numerados AS (
      SELECT q.id,
             ROW_NUMBER() OVER (PARTITION BY q."sucursalId", (q."creadoEn" AT TIME ZONE 'America/Lima')::date ORDER BY q.id)::int AS numero
      FROM "Pedido" q
      WHERE q."sucursalId" IN (SELECT "sucursalId" FROM dias)
        AND q."creadoEn" >= (SELECT MIN(dia)::timestamp AT TIME ZONE 'America/Lima' FROM dias)
        AND q."creadoEn" < (SELECT (MAX(dia) + 1)::timestamp AT TIME ZONE 'America/Lima' FROM dias)
    )
    SELECT id, numero FROM numerados WHERE id IN (${Prisma.join(ids)})`
  return new Map(filas.map((f) => [f.id, f.numero]))
}

function serializar(p: PedidoCompleto, numero: number): Pedido {
  return {
    id: p.id,
    sucursalId: p.sucursalId,
    numero,
    mesa: { id: p.mesa.id, numero: p.mesa.numero, tipo: p.mesa.tipo },
    mozo: p.mozo?.nombre ?? null,
    cliente: p.cliente,
    estado: p.estado,
    total: p.total,
    creadoEn: p.creadoEn.toISOString(),
    cuentaPedidaEn: p.cuentaPedidaEn?.toISOString() ?? null,
    cobradoEn: p.cobradoEn?.toISOString() ?? null,
    cobradoPor: p.cobradoPor?.nombre ?? null,
    items: p.items.map(serializarItem),
    pagos: p.pagos.map((g) => ({ id: g.id, metodo: g.metodo, monto: g.monto, recibido: g.recibido })),
  }
}

/** La nota que hoy ocupa la mesa: abierta, aunque ya esté pagada. */
const notaVigente = { estado: 'ABIERTO' } as const

export async function obtenerPedido(sucursalId: number, id: number): Promise<Pedido> {
  const p = await prisma.pedido.findFirst({ where: { id, sucursalId }, include: incluirPedido })
  if (!p) throw new ErrorNegocio('Ese pedido no existe.', 404)
  return serializar(p, (await numerosDelDia([p.id])).get(p.id) ?? 0)
}

export async function pedidoDeMesa(sucursalId: number, mesaId: number): Promise<Pedido | null> {
  const p = await prisma.pedido.findFirst({
    where: { mesaId, sucursalId, ...notaVigente },
    include: incluirPedido,
    orderBy: { id: 'desc' },
  })
  return p ? serializar(p, (await numerosDelDia([p.id])).get(p.id) ?? 0) : null
}

/** La nota, si es de esta sucursal. */
async function notaDe(sucursalId: number, pedidoId: number, tx: Prisma.TransactionClient = prisma) {
  const p = await tx.pedido.findFirst({ where: { id: pedidoId, sucursalId } })
  if (!p) throw new ErrorNegocio('Ese pedido no existe.', 404)
  return p
}

function estadoDeMesa(items: { estado: string }[], pagado: boolean): EstadoMesa {
  const vivos = items.filter((i) => i.estado !== 'ANULADO')
  if (vivos.some((i) => i.estado === 'LISTO')) return 'LISTO'
  if (vivos.some((i) => i.estado === 'PENDIENTE')) return 'EN_COCINA'
  return pagado ? 'LIBRE' : 'POR_COBRAR'
}

export async function listarMesas(sucursalId: number): Promise<MesaResumen[]> {
  const mesas = await prisma.mesa.findMany({
    where: { activa: true, sucursalId },
    orderBy: [{ tipo: 'asc' }, { numero: 'asc' }],
    include: {
      pedidos: {
        where: notaVigente,
        include: {
          mozo: { select: { nombre: true } },
          items: { select: { estado: true, cantidad: true, creadoEn: true } },
        },
        take: 1,
        orderBy: { id: 'desc' },
      },
    },
  })

  const numeros = await numerosDelDia(mesas.flatMap((m) => m.pedidos.map((p) => p.id)))

  return mesas.map((m) => {
    const p = m.pedidos[0]
    if (!p) return { id: m.id, numero: m.numero, tipo: m.tipo, estado: 'LIBRE', pedido: null }
    const vivos = p.items.filter((i) => i.estado !== 'ANULADO')
    const enCocina = vivos.filter((i) => i.estado === 'PENDIENTE')
    return {
      id: m.id,
      numero: m.numero,
      tipo: m.tipo,
      estado: estadoDeMesa(vivos, p.cobradoEn !== null),
      pedido: {
        id: p.id,
        numero: numeros.get(p.id) ?? 0,
        cliente: p.cliente,
        mozo: p.mozo?.nombre ?? null,
        total: p.total,
        pagado: p.cobradoEn !== null,
        items: vivos.reduce((s, i) => s + i.cantidad, 0),
        pendientes: enCocina.length,
        listos: vivos.filter((i) => i.estado === 'LISTO').length,
        desde: p.creadoEn.toISOString(),
        esperaDesde: enCocina.length
          ? new Date(Math.min(...enCocina.map((i) => i.creadoEn.getTime()))).toISOString()
          : null,
        cuentaPedidaEn: p.cuentaPedidaEn?.toISOString() ?? null,
      },
    }
  })
}

/** Recalcula el total y cierra la nota si ya está pagada y servida. */
async function cuadrar(tx: Prisma.TransactionClient, pedidoId: number) {
  const p = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true } })
  const vivos = p.items.filter((i) => i.estado !== 'ANULADO')
  const total = vivos.reduce((s, i) => s + i.subtotal, 0)
  const todoServido = vivos.every((i) => i.estado === 'ENTREGADO')

  let estado = p.estado
  let anuladoEn = p.anuladoEn
  if (vivos.length === 0 && !p.cobradoEn) {
    estado = 'ANULADO'
    anuladoEn = new Date()
  } else if (p.cobradoEn && todoServido) {
    estado = 'COBRADO'
  }
  await tx.pedido.update({ where: { id: pedidoId }, data: { total, estado, anuladoEn } })
  return { total, estado }
}

const transaccion = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(fn, { isolationLevel: 'ReadCommitted', timeout: 10_000 })

/**
 * Envía a cocina las líneas que el mozo armó. Si la mesa no tenía nota, la abre.
 * Cada envío es una ronda nueva: cocina ve una comanda por ronda y por cocina.
 * Los precios son los de la carta de esta sucursal.
 */
export async function enviarACocina(
  sucursalId: number,
  mesaId: number,
  usuario: Usuario,
  datos: { cliente?: string | null; lineas: LineaNueva[] },
): Promise<Pedido> {
  if (datos.lineas.length === 0) throw new ErrorNegocio('La nota está vacía.')

  const resultado = await transaccion(async (tx) => {
    // El candado sobre la fila de la mesa evita que dos mozos abran dos notas a la vez.
    const filas = await tx.$queryRaw<{ id: number; numero: number; tipo: 'SALON' | 'LLEVAR' }[]>`
      SELECT id, numero, tipo FROM "Mesa" WHERE id = ${mesaId} AND "sucursalId" = ${sucursalId} AND activa FOR UPDATE`
    const mesa = filas[0]
    if (!mesa) throw new ErrorNegocio('Esa mesa no existe.', 404)

    let pedido = await tx.pedido.findFirst({ where: { mesaId, ...notaVigente }, orderBy: { id: 'desc' } })
    if (pedido?.cobradoEn) {
      throw new ErrorNegocio('Esta nota ya está pagada. Espera a que se sirva para abrir otra.')
    }
    if (!pedido) {
      pedido = await tx.pedido.create({
        data: { sucursalId, mesaId, mozoId: usuario.id, cliente: datos.cliente?.trim() || null },
      })
    } else if (datos.cliente !== undefined) {
      await tx.pedido.update({ where: { id: pedido.id }, data: { cliente: datos.cliente?.trim() || null } })
    }

    const ultima = await tx.itemPedido.aggregate({ where: { pedidoId: pedido.id }, _max: { ronda: true } })
    const ronda = (ultima._max.ronda ?? 0) + 1

    const idsProducto = datos.lineas.flatMap((l) => (l.productoId ? [l.productoId] : []))
    const enCarta = deLaSucursal(sucursalId)
    const productos = await tx.producto.findMany({
      where: { id: { in: idsProducto }, ...enCarta.where },
      include: { familia: true, ...enCarta.include },
    })
    const adicionales = await tx.adicional.findMany({
      where: { id: { in: datos.lineas.flatMap((l) => l.adicionales) } },
    })
    const detalles = new Set((await tx.detalle.findMany({ select: { nombre: true } })).map((d) => d.nombre))

    const filasItems = datos.lineas.map((l) => {
      let nombre: string, familia: string, estacion, precio: number
      if (l.productoId) {
        const p = productos.find((x) => x.id === l.productoId)
        const aqui = p && enLaSucursal(p)
        if (!p || !aqui?.ofrecido) throw new ErrorNegocio('Uno de los productos ya no está en la carta.')
        if (!aqui.disponible) throw new ErrorNegocio(`${p.nombre} está agotado.`)
        nombre = p.nombre
        familia = p.familia.nombre
        estacion = p.familia.estacion
        precio = aqui.precio
      } else if (l.libre) {
        nombre = l.libre.nombre.trim() || 'Producto libre'
        familia = 'Otros'
        estacion = l.libre.estacion
        precio = l.libre.precio
      } else {
        throw new ErrorNegocio('Hay una línea sin producto.')
      }
      const elegidos: AdicionalElegido[] = l.adicionales.map((id) => {
        const a = adicionales.find((x) => x.id === id)
        if (!a) throw new ErrorNegocio('Uno de los adicionales ya no existe.')
        return { id: a.id, nombre: a.nombre, precio: a.precio }
      })
      const precioAdicionales = elegidos.reduce((s, a) => s + a.precio, 0)
      const detalle = l.detalle?.trim() || null
      if (detalle && !detalles.has(detalle)) throw new ErrorNegocio(`El detalle «${detalle}» ya no existe.`)
      return {
        pedidoId: pedido.id,
        productoId: l.productoId,
        ronda,
        nombre,
        familia,
        estacion,
        cantidad: l.cantidad,
        precio,
        adicionales: elegidos as unknown as Prisma.InputJsonValue,
        precioAdicionales,
        // Igual que la columna Subtotal del Excel: Cant × Precio + Cant × PAdic.
        subtotal: l.cantidad * (precio + precioAdicionales),
        detalle,
        paraLlevar: l.paraLlevar,
        observacion: l.observacion?.trim() || null,
      }
    })

    await tx.itemPedido.createMany({ data: filasItems })
    await cuadrar(tx, pedido.id)
    return {
      pedidoId: pedido.id,
      mesa: codigoMesa(mesa),
      estaciones: [...new Set(filasItems.map((f) => f.estacion))],
    }
  })

  avisar(
    {
      mesas: true,
      cocina: true,
      pedidoId: resultado.pedidoId,
      aviso: { tipo: 'nuevo', mesa: resultado.mesa, estaciones: resultado.estaciones },
    },
    sucursalId,
  )
  return obtenerPedido(sucursalId, resultado.pedidoId)
}

export async function cambiarCliente(sucursalId: number, pedidoId: number, cliente: string | null) {
  await notaDe(sucursalId, pedidoId)
  await prisma.pedido.update({ where: { id: pedidoId }, data: { cliente: cliente?.trim() || null } })
  avisar({ mesas: true, cocina: true, pedidoId }, sucursalId)
  return obtenerPedido(sucursalId, pedidoId)
}

/** Quitar una línea ya enviada. Lo que cocina ya terminó solo lo quita la encargada o el administrador. */
export async function anularItem(sucursalId: number, itemId: number, usuario: Usuario) {
  const item = await prisma.itemPedido.findFirst({ where: { id: itemId, pedido: { sucursalId } }, include: { pedido: true } })
  if (!item || item.estado === 'ANULADO') throw new ErrorNegocio('Esa línea ya no está en la nota.', 404)
  await transaccion(async (tx) => {
    const pedido = await notaTrabada(tx, sucursalId, item.pedidoId)
    if (pedido.cobradoEn) throw new ErrorNegocio('La nota ya está pagada.')
    const actual = await tx.itemPedido.findUnique({ where: { id: itemId } })
    if (!actual || actual.estado === 'ANULADO') throw new ErrorNegocio('Esa línea ya no está en la nota.', 404)
    if (actual.estado !== 'PENDIENTE' && !esJefe(usuario.rol)) throw new ErrorNegocio('Cocina ya lo preparó. Pide a la encargada que lo anule.', 403)
    const modificadas = await tx.itemPedido.updateMany({
      where: { id: itemId, ...(!esJefe(usuario.rol) && { estado: 'PENDIENTE' }) },
      data: { estado: 'ANULADO', anuladoEn: new Date() },
    })
    if (!modificadas.count) throw new ErrorNegocio('Cocina ya lo preparó. Pide a la encargada que lo anule.', 403)
    await cuadrar(tx, item.pedidoId)
  })
  avisar({ mesas: true, cocina: true, pedidoId: item.pedidoId }, sucursalId)
  return obtenerPedido(sucursalId, item.pedidoId)
}

/** El mozo lleva a la mesa lo que cocina dejó listo (o lo que se indique). */
export async function servir(sucursalId: number, pedidoId: number, itemIds?: number[]) {
  await notaDe(sucursalId, pedidoId)
  await transaccion(async (tx) => {
    await tx.itemPedido.updateMany({
      where: itemIds?.length
        ? { pedidoId, id: { in: itemIds }, estado: { in: ['PENDIENTE', 'LISTO'] } }
        : { pedidoId, estado: 'LISTO' },
      data: { estado: 'ENTREGADO', entregadoEn: new Date() },
    })
    await cuadrar(tx, pedidoId)
  })
  avisar({ mesas: true, cocina: true, pedidoId }, sucursalId)
  return obtenerPedido(sucursalId, pedidoId)
}

/** El mozo avisa a caja que la mesa pide la cuenta: caja la ve marcada y suena. */
export async function pedirCuenta(sucursalId: number, pedidoId: number) {
  const pedido = await prisma.pedido.findFirst({ where: { id: pedidoId, sucursalId }, include: { mesa: true } })
  if (!pedido || pedido.estado !== 'ABIERTO') throw new ErrorNegocio('Esa nota ya no está abierta.')
  if (pedido.cobradoEn) throw new ErrorNegocio('Esa nota ya está pagada.')
  if (pedido.total <= 0) throw new ErrorNegocio('La nota no tiene nada que cobrar.')
  if (!pedido.cuentaPedidaEn) await prisma.pedido.update({ where: { id: pedidoId }, data: { cuentaPedidaEn: new Date() } })
  avisar({ mesas: true, caja: true, pedidoId, aviso: { tipo: 'cuenta', mesa: codigoMesa(pedido.mesa) } }, sucursalId)
  return obtenerPedido(sucursalId, pedidoId)
}

type PagoPedido = { metodo: string; monto: number }

/**
 * Reparte lo pagado como la nota del Excel («Vuelto» / «Debe»): los pagos
 * electrónicos van por su monto exacto; el efectivo cubre lo que falte y lo
 * que sobra es vuelto. Se puede repartir la cuenta entre varios medios (parte
 * Yape, parte efectivo). Los medios salen de Administración.
 */
async function repartirPagos(total: number, pagos: PagoPedido[], tx: Prisma.TransactionClient) {
  const medios = await tx.medioPago.findMany({ where: { clave: { in: pagos.map((p) => p.metodo) }, activo: true } })
  const medio = (clave: string) => {
    const m = medios.find((x) => x.clave === clave)
    if (!m) throw new ErrorNegocio('Ese medio de pago ya no está disponible.')
    return m
  }

  let falta = total
  const filas: { metodo: string; monto: number; recibido: number | null }[] = []
  for (const p of pagos.filter((x) => !medio(x.metodo).efectivo && x.monto > 0)) {
    if (p.monto > falta) {
      throw new ErrorNegocio(`El pago con ${medio(p.metodo).nombre} supera lo que falta (${formatoSoles(falta)}).`)
    }
    filas.push({ metodo: p.metodo, monto: p.monto, recibido: null })
    falta -= p.monto
  }
  // El efectivo de varias filas se junta por medio: lo que se recibe y lo que se aplica.
  for (const m of medios.filter((x) => x.efectivo)) {
    const recibido = pagos.filter((x) => x.metodo === m.clave).reduce((s, x) => s + x.monto, 0)
    if (recibido <= 0) continue
    if (falta === 0) throw new ErrorNegocio(`La cuenta ya está cubierta sin ${m.nombre.toLowerCase()}.`)
    const aplicado = Math.min(recibido, falta)
    filas.push({ metodo: m.clave, monto: aplicado, recibido })
    falta -= aplicado
  }
  if (falta > 0) throw new ErrorNegocio(`Debe ${formatoSoles(falta)}.`)
  return filas
}

/**
 * La caja abierta de la sucursal, con su fila trabada para leer: un cobro y un
 * cierre de caja no se cruzan (el cierre traba la fila para escribir).
 */
async function cajaParaCobrar(tx: Prisma.TransactionClient, sucursalId: number) {
  const [caja] = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM "Caja" WHERE "sucursalId" = ${sucursalId} AND estado = 'ABIERTA' ORDER BY id DESC LIMIT 1 FOR SHARE`
  if (!caja) throw new ErrorNegocio('La caja está cerrada: ábrela para cobrar.', 409)
  return caja.id
}

/** Trae la nota trabada: dos cajeros que cobran la misma nota a la vez no la cobran dos veces. */
async function notaTrabada(tx: Prisma.TransactionClient, sucursalId: number, pedidoId: number) {
  const [fila] = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM "Pedido" WHERE id = ${pedidoId} AND "sucursalId" = ${sucursalId} FOR UPDATE`
  if (!fila) throw new ErrorNegocio('Ese pedido no existe.', 404)
  return tx.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { pagos: true } })
}

/** Cobrar: solo en caja, y siempre dentro del turno de caja abierto de la sucursal. */
export async function cobrar(sucursalId: number, pedidoId: number, usuario: Usuario, pagos: PagoPedido[]) {
  await transaccion(async (tx) => {
    const pedido = await notaTrabada(tx, sucursalId, pedidoId)
    if (pedido.estado !== 'ABIERTO') throw new ErrorNegocio('Esa nota ya no está abierta.')
    if (pedido.cobradoEn) throw new ErrorNegocio('Esa nota ya fue cobrada.')
    if (pedido.total <= 0) throw new ErrorNegocio('La nota no tiene nada que cobrar.')
    const cajaId = await cajaParaCobrar(tx, sucursalId)
    const filas = await repartirPagos(pedido.total, pagos, tx)
    await tx.pago.createMany({ data: filas.map((f) => ({ ...f, pedidoId, cajaId })) })
    await tx.pedido.update({ where: { id: pedidoId }, data: { cobradoEn: new Date(), cobradoPorId: usuario.id } })
    await cuadrar(tx, pedidoId)
  })
  avisar({ mesas: true, cocina: true, caja: true, pedidoId }, sucursalId)
  return obtenerPedido(sucursalId, pedidoId)
}

/**
 * Corregir el tipo de pago de una nota ya cobrada (se marcó Yape y era
 * efectivo). Solo mientras la caja que la cobró siga abierta: una caja
 * cerrada ya se contó.
 */
export async function corregirPago(sucursalId: number, pedidoId: number, pagos: PagoPedido[]) {
  await transaccion(async (tx) => {
    const pedido = await notaTrabada(tx, sucursalId, pedidoId)
    if (!pedido.cobradoEn || pedido.estado === 'ANULADO') throw new ErrorNegocio('Esa nota no está cobrada.')
    const cajaId = pedido.pagos[0]?.cajaId
    const abiertas = cajaId ? await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Caja" WHERE id = ${cajaId} AND estado = 'ABIERTA' FOR UPDATE` : []
    const abierta = abiertas[0]
    if (!abierta) throw new ErrorNegocio('La caja que la cobró ya se cerró: el cobro no se puede cambiar.', 409)
    const filas = await repartirPagos(pedido.total, pagos, tx)
    await tx.pago.deleteMany({ where: { pedidoId } })
    await tx.pago.createMany({ data: filas.map((f) => ({ ...f, pedidoId, cajaId })) })
  })
  avisar({ mesas: true, caja: true, pedidoId }, sucursalId)
  return obtenerPedido(sucursalId, pedidoId)
}

export async function anularPedido(sucursalId: number, pedidoId: number) {
  await transaccion(async (tx) => {
    // El cobro toma el mismo candado. No se decide con una lectura anterior.
    const pedido = await notaTrabada(tx, sucursalId, pedidoId)
    if (pedido.estado !== 'ABIERTO') throw new ErrorNegocio('Esa nota ya no está abierta.')
    if (pedido.cobradoEn) throw new ErrorNegocio('Una nota pagada no se anula desde aquí.')
    await tx.itemPedido.updateMany({
      where: { pedidoId, estado: { not: 'ANULADO' } },
      data: { estado: 'ANULADO', anuladoEn: new Date() },
    })
    await tx.pedido.update({ where: { id: pedidoId }, data: { estado: 'ANULADO', anuladoEn: new Date() } })
  })
  avisar({ mesas: true, cocina: true, caja: true, pedidoId }, sucursalId)
}

/** Pasar la nota a otra mesa libre de la misma sucursal (los clientes se cambiaron de sitio). */
export async function moverPedido(sucursalId: number, pedidoId: number, mesaId: number) {
  await transaccion(async (tx) => {
    await notaDe(sucursalId, pedidoId, tx)
    const destino = await tx.mesa.findFirst({ where: { id: mesaId, sucursalId, activa: true } })
    if (!destino) throw new ErrorNegocio('Esa mesa no existe.', 404)
    const ocupada = await tx.pedido.findFirst({ where: { mesaId, ...notaVigente } })
    if (ocupada) throw new ErrorNegocio('Esa mesa no está libre.')
    await tx.pedido.update({ where: { id: pedidoId }, data: { mesaId } })
  })
  avisar({ mesas: true, cocina: true, pedidoId }, sucursalId)
  return obtenerPedido(sucursalId, pedidoId)
}
