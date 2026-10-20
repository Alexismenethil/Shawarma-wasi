import { Prisma } from '@prisma/client'
import type { ArqueoCaja, CobroCaja, Conteo, EstadoCaja, MedioEnCaja, Usuario } from '@wasi/shared'
import { DENOMINACIONES, esJefe, formatoSoles, sumarConteo } from '@wasi/shared'
import { prisma } from '../db.js'
import { ErrorNegocio } from '../errores.js'
import { diaEnLima, hoyEnLima, rangoLima, validarRango } from '../fechas.js'
import { avisar } from '../tiempo-real.js'
import { numerosDelDia } from './pedidos.js'

/**
 * La caja.
 *
 * Cada sucursal trabaja por turnos de caja: se abre con un fondo de sencillo,
 * se cobra (solo con la caja abierta: así todo el dinero queda en un arqueo),
 * se anotan las entradas y salidas que no son ventas, y se cierra contando el
 * efectivo. El arqueo dice cuánto debía haber y cuánto faltó o sobró. Un
 * cierre hecho por error se reabre, y la bitácora guarda quién hizo qué.
 */

const incluirCaja = {
  abiertaPor: { select: { nombre: true } },
  cerradaPor: { select: { nombre: true } },
  movimientos: { include: { usuario: { select: { nombre: true } } }, orderBy: { id: 'asc' } },
  eventos: { include: { usuario: { select: { nombre: true } } }, orderBy: { id: 'asc' } },
} satisfies Prisma.CajaInclude

type CajaCompleta = Prisma.CajaGetPayload<{ include: typeof incluirCaja }>
type Tx = Prisma.TransactionClient

/** Lo cobrado por medio de pago y las entradas y salidas de uno o varios turnos. */
async function sumas(cajaIds: number[], tx: Tx = prisma) {
  if (!cajaIds.length) return { pagos: [], movimientos: [], notas: [] }
  const [pagos, movimientos, notas] = await Promise.all([
    tx.pago.groupBy({ by: ['cajaId', 'metodo'], where: { cajaId: { in: cajaIds } }, _sum: { monto: true, recibido: true }, _count: true }),
    tx.movimientoCaja.groupBy({ by: ['cajaId', 'tipo'], where: { cajaId: { in: cajaIds } }, _sum: { monto: true } }),
    tx.$queryRaw<{ cajaId: number; notas: number }[]>`
      SELECT "cajaId", COUNT(DISTINCT "pedidoId")::int AS notas FROM "Pago" WHERE "cajaId" IN (${Prisma.join(cajaIds)}) GROUP BY 1`,
  ])
  return { pagos, movimientos, notas }
}

type Sumas = Awaited<ReturnType<typeof sumas>>

/**
 * Las cifras de un turno, como la hoja «Arqueo»:
 *   esperado = fondo inicial + cobros en efectivo + ingresos − egresos
 * El efectivo cuenta lo aplicado a la cuenta, no lo recibido: el vuelto salió del cajón.
 */
function cifras(c: { id: number; montoInicial: number; esperado: number | null }, s: Sumas, medios: { clave: string; nombre: string; efectivo: boolean; activo: boolean }[]) {
  const pagos = s.pagos.filter((p) => p.cajaId === c.id)
  const fila = (clave: string) => pagos.find((p) => p.metodo === clave)
  const lista: MedioEnCaja[] = [
    ...medios
      .filter((m) => m.activo || fila(m.clave))
      .map((m) => {
        const f = fila(m.clave)
        const monto = f?._sum.monto ?? 0
        return { metodo: m.clave, nombre: m.nombre, efectivo: m.efectivo, cobros: f?._count ?? 0, monto, vuelto: m.efectivo && f ? (f._sum.recibido ?? monto) - monto : 0 }
      }),
    // Un medio que ya no existe pero cobró en este turno (no se puede borrar uno con cobros, pero por si acaso).
    ...pagos
      .filter((p) => !medios.some((m) => m.clave === p.metodo))
      .map((p) => ({ metodo: p.metodo, nombre: p.metodo, efectivo: false, cobros: p._count, monto: p._sum.monto ?? 0, vuelto: 0 })),
  ]
  const movimiento = (tipo: 'INGRESO' | 'EGRESO') => s.movimientos.find((m) => m.cajaId === c.id && m.tipo === tipo)?._sum.monto ?? 0
  const efectivo = lista.filter((m) => m.efectivo).reduce((t, m) => t + m.monto, 0)
  const ingresos = movimiento('INGRESO')
  const egresos = movimiento('EGRESO')
  return {
    medios: lista,
    notas: s.notas.find((n) => n.cajaId === c.id)?.notas ?? 0,
    ventas: lista.reduce((t, m) => t + m.monto, 0),
    efectivo,
    ingresos,
    egresos,
    // Una caja cerrada guarda lo que se esperaba al cerrarla.
    esperado: c.esperado ?? c.montoInicial + efectivo + ingresos - egresos,
  }
}

const mediosDePago = (tx: Tx = prisma) => tx.medioPago.findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }] })

async function armarArqueo(c: CajaCompleta): Promise<ArqueoCaja> {
  const [s, medios] = await Promise.all([sumas([c.id]), mediosDePago()])
  const n = cifras(c, s, medios)
  return {
    id: c.id,
    sucursalId: c.sucursalId,
    estado: c.estado,
    abiertaPor: c.abiertaPor.nombre,
    abiertaEn: c.abiertaEn.toISOString(),
    cerradaPor: c.cerradaPor?.nombre ?? null,
    cerradaEn: c.cerradaEn?.toISOString() ?? null,
    montoInicial: c.montoInicial,
    ...n,
    contado: c.contado,
    diferencia: c.contado === null ? null : c.contado - n.esperado,
    conteo: (c.conteo as Conteo | null) ?? null,
    fondoSiguiente: c.fondoSiguiente,
    observacion: c.observacion,
    movimientos: c.movimientos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      monto: m.monto,
      concepto: m.concepto,
      usuario: m.usuario.nombre,
      usuarioId: m.usuarioId,
      creadoEn: m.creadoEn.toISOString(),
    })),
    eventos: c.eventos.map((e) => ({ tipo: e.tipo, usuario: e.usuario.nombre, creadoEn: e.creadoEn.toISOString(), monto: e.monto, diferencia: e.diferencia })),
  }
}

/**
 * Quién reabre un cierre: la encargada o el administrador, el último cierre
 * de la sucursal; el cajero, solo el que él mismo hizo hoy (se equivocó y
 * cerró antes de tiempo).
 */
function puedeReabrir(c: { cerradaPorId: number | null; cerradaEn: Date | null }, usuario: Usuario) {
  if (esJefe(usuario.rol)) return true
  return c.cerradaPorId === usuario.id && !!c.cerradaEn && diaEnLima(c.cerradaEn) === hoyEnLima()
}

export async function estadoCaja(sucursalId: number, usuario: Usuario): Promise<EstadoCaja> {
  const [abierta, ultima, porCobrar] = await Promise.all([
    prisma.caja.findFirst({ where: { sucursalId, estado: 'ABIERTA' }, include: incluirCaja, orderBy: { id: 'desc' } }),
    prisma.caja.findFirst({ where: { sucursalId, estado: 'CERRADA' }, include: incluirCaja, orderBy: { id: 'desc' } }),
    prisma.pedido.aggregate({ where: { sucursalId, estado: 'ABIERTO', cobradoEn: null, total: { gt: 0 } }, _sum: { total: true }, _count: true }),
  ])
  return {
    abierta: abierta && (await armarArqueo(abierta)),
    ultima: ultima && (await armarArqueo(ultima)),
    // Sin caja abierta, el último cierre es también la última caja de la sucursal.
    puedeReabrir: !abierta && !!ultima && puedeReabrir(ultima, usuario),
    fondoSugerido: ultima?.fondoSiguiente ?? null,
    porCobrar: { notas: porCobrar._count, total: porCobrar._sum.total ?? 0 },
  }
}

/** La sucursal trabada: abrir y reabrir la caja no se cruzan entre dos tablets. */
const trabarSucursal = (tx: Tx, sucursalId: number) => tx.$queryRaw`SELECT id FROM "Sucursal" WHERE id = ${sucursalId} FOR UPDATE`

export async function abrirCaja(sucursalId: number, usuario: Usuario, montoInicial: number) {
  await prisma.$transaction(async (tx) => {
    await trabarSucursal(tx, sucursalId)
    const abierta = await tx.caja.findFirst({ where: { sucursalId, estado: 'ABIERTA' }, include: { abiertaPor: { select: { nombre: true } } } })
    if (abierta) throw new ErrorNegocio(`La caja ya está abierta (la abrió ${abierta.abiertaPor.nombre}).`, 409)
    const caja = await tx.caja.create({ data: { sucursalId, abiertaPorId: usuario.id, montoInicial } })
    await tx.eventoCaja.create({ data: { cajaId: caja.id, tipo: 'APERTURA', usuarioId: usuario.id, monto: montoInicial } })
  })
  avisar({ caja: true }, sucursalId)
  return estadoCaja(sucursalId, usuario)
}

/** La caja abierta de la sucursal, trabada para escribir (cierre) o para leer (movimientos). */
async function cajaAbierta(tx: Tx, sucursalId: number, modo: 'UPDATE' | 'SHARE') {
  const [fila] =
    modo === 'UPDATE'
      ? await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Caja" WHERE "sucursalId" = ${sucursalId} AND estado = 'ABIERTA' ORDER BY id DESC LIMIT 1 FOR UPDATE`
      : await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Caja" WHERE "sucursalId" = ${sucursalId} AND estado = 'ABIERTA' ORDER BY id DESC LIMIT 1 FOR SHARE`
  if (!fila) throw new ErrorNegocio('La caja está cerrada.', 409)
  return tx.caja.findUniqueOrThrow({ where: { id: fila.id } })
}

async function esperadoAhora(tx: Tx, caja: { id: number; montoInicial: number }) {
  const [s, medios] = await Promise.all([sumas([caja.id], tx), mediosDePago(tx)])
  return cifras({ ...caja, esperado: null }, s, medios).esperado
}

export async function registrarMovimiento(sucursalId: number, usuario: Usuario, d: { tipo: 'INGRESO' | 'EGRESO'; monto: number; concepto: string }) {
  await prisma.$transaction(async (tx) => {
    // El saldo se comprueba después de esperar al otro movimiento: dos
    // egresos simultáneos no pueden gastar el mismo efectivo.
    const caja = await cajaAbierta(tx, sucursalId, 'UPDATE')
    if (d.tipo === 'EGRESO') {
      // No puede salir más efectivo del que hay en el cajón.
      const hay = await esperadoAhora(tx, caja)
      if (d.monto > hay) throw new ErrorNegocio(`En caja debería haber ${formatoSoles(hay)}: no alcanza para esa salida.`)
    }
    await tx.movimientoCaja.create({ data: { cajaId: caja.id, tipo: d.tipo, monto: d.monto, concepto: d.concepto.trim(), usuarioId: usuario.id } })
  })
  avisar({ caja: true }, sucursalId)
}

export async function quitarMovimiento(sucursalId: number, usuario: Usuario, id: number) {
  await prisma.$transaction(async (tx) => {
    const caja = await cajaAbierta(tx, sucursalId, 'UPDATE')
    const m = await tx.movimientoCaja.findFirst({ where: { id, caja: { sucursalId } } })
    if (!m) throw new ErrorNegocio('Ese movimiento no existe.', 404)
    if (m.cajaId !== caja.id) throw new ErrorNegocio('Esa caja ya se cerró: el movimiento quedó en su arqueo.', 409)
    if (m.usuarioId !== usuario.id && !esJefe(usuario.rol)) throw new ErrorNegocio('Solo quien lo anotó, o la encargada, puede quitarlo.', 403)
    if (m.tipo === 'INGRESO' && await esperadoAhora(tx, caja) < m.monto) throw new ErrorNegocio('Ese ingreso ya se usó: quitarlo dejaría la caja sin efectivo.')
    await tx.movimientoCaja.delete({ where: { id } })
  })
  avisar({ caja: true }, sucursalId)
}

/**
 * Cerrar la caja: se cuenta el efectivo (por billetes y monedas, o el total),
 * se guarda lo que se esperaba en ese momento y la diferencia queda en la
 * bitácora. Lo que no se cobró sigue abierto y lo cobra la siguiente caja.
 */
export async function cerrarCaja(
  sucursalId: number,
  usuario: Usuario,
  d: { contado: number; conteo?: Conteo | null; fondoSiguiente?: number | null; observacion?: string | null },
) {
  const conteo = d.conteo ? Object.fromEntries(DENOMINACIONES.map((x) => [String(x.valor), d.conteo![x.valor] ?? 0]).filter(([, n]) => Number(n) > 0)) : null
  if (conteo && sumarConteo(conteo) !== d.contado) throw new ErrorNegocio('El total contado no coincide con los billetes y monedas.')
  if ((d.fondoSiguiente ?? 0) > d.contado) throw new ErrorNegocio('Lo que queda en caja no puede ser más de lo contado.')

  const cajaId = await prisma.$transaction(async (tx) => {
    const caja = await cajaAbierta(tx, sucursalId, 'UPDATE')
    const esperado = await esperadoAhora(tx, caja)
    await tx.caja.update({
      where: { id: caja.id },
      data: {
        estado: 'CERRADA',
        cerradaPorId: usuario.id,
        cerradaEn: new Date(),
        esperado,
        contado: d.contado,
        conteo: conteo ?? Prisma.DbNull,
        fondoSiguiente: d.fondoSiguiente ?? null,
        observacion: d.observacion?.trim() || null,
      },
    })
    await tx.eventoCaja.create({ data: { cajaId: caja.id, tipo: 'CIERRE', usuarioId: usuario.id, monto: d.contado, diferencia: d.contado - esperado } })
    return caja.id
  })
  avisar({ caja: true }, sucursalId)
  return armarArqueo(await prisma.caja.findUniqueOrThrow({ where: { id: cajaId }, include: incluirCaja }))
}

/** Volver a abrir un cierre hecho por error. Lo contado queda en la bitácora. */
export async function reabrirCaja(sucursalId: number, usuario: Usuario, cajaId: number) {
  await prisma.$transaction(async (tx) => {
    await trabarSucursal(tx, sucursalId)
    const caja = await tx.caja.findFirst({ where: { id: cajaId, sucursalId } })
    if (!caja) throw new ErrorNegocio('Esa caja no existe.', 404)
    if (caja.estado === 'ABIERTA') throw new ErrorNegocio('Esa caja ya está abierta.', 409)
    if (await tx.caja.count({ where: { sucursalId, estado: 'ABIERTA' } })) throw new ErrorNegocio('Ya hay otra caja abierta: ciérrala primero.', 409)
    const ultima = await tx.caja.findFirst({ where: { sucursalId }, orderBy: { id: 'desc' }, select: { id: true } })
    if (ultima?.id !== caja.id) throw new ErrorNegocio('Solo se puede reabrir el último cierre.', 409)
    if (!puedeReabrir(caja, usuario)) throw new ErrorNegocio('Solo puedes reabrir tu propio cierre de hoy. Pide a la encargada que la reabra.', 403)
    await tx.caja.update({
      where: { id: caja.id },
      data: { estado: 'ABIERTA', cerradaPorId: null, cerradaEn: null, esperado: null, contado: null, conteo: Prisma.DbNull, fondoSiguiente: null, observacion: null },
    })
    await tx.eventoCaja.create({
      data: { cajaId: caja.id, tipo: 'REAPERTURA', usuarioId: usuario.id, monto: caja.contado, diferencia: caja.contado !== null && caja.esperado !== null ? caja.contado - caja.esperado : null },
    })
  })
  avisar({ caja: true }, sucursalId)
  return estadoCaja(sucursalId, usuario)
}

/** Las notas que cobró un turno de caja, la última primero. */
export async function cobrosDeCaja(sucursalId: number | null, cajaId: number): Promise<CobroCaja[]> {
  const caja = await prisma.caja.findFirst({ where: { id: cajaId, ...(sucursalId && { sucursalId }) } })
  if (!caja) throw new ErrorNegocio('Esa caja no existe.', 404)
  const pedidos = await prisma.pedido.findMany({
    where: { pagos: { some: { cajaId } } },
    include: {
      mesa: true,
      mozo: { select: { nombre: true } },
      cobradoPor: { select: { nombre: true } },
      pagos: { where: { cajaId }, orderBy: { id: 'asc' } },
    },
    orderBy: { cobradoEn: 'desc' },
  })
  const numeros = await numerosDelDia(pedidos.map((p) => p.id))
  return pedidos.map((p) => ({
    pedidoId: p.id,
    numero: numeros.get(p.id) ?? 0,
    mesa: { numero: p.mesa.numero, tipo: p.mesa.tipo },
    cliente: p.cliente,
    mozo: p.mozo?.nombre ?? null,
    cobradoPor: p.cobradoPor?.nombre ?? null,
    total: p.total,
    cobradoEn: (p.cobradoEn ?? p.creadoEn).toISOString(),
    pagos: p.pagos.map((g) => ({ id: g.id, metodo: g.metodo, monto: g.monto, recibido: g.recibido })),
  }))
}

/* ── Para el panel: el historial de cajas ───────────────────────────────── */

/** Los turnos de caja abiertos entre dos fechas, de una sucursal o de todas. */
export async function listarCajas(desdeP: string, hastaP: string, sucursalId: number | null) {
  const { desde, hasta } = validarRango(desdeP, hastaP)
  const cajas = await prisma.caja.findMany({
    where: { abiertaEn: rangoLima(desde, hasta), ...(sucursalId && { sucursalId }) },
    include: {
      sucursal: { select: { nombre: true } },
      abiertaPor: { select: { nombre: true } },
      cerradaPor: { select: { nombre: true } },
      _count: { select: { eventos: { where: { tipo: 'REAPERTURA' } } } },
    },
    orderBy: { abiertaEn: 'desc' },
  })
  const [s, medios] = await Promise.all([sumas(cajas.map((c) => c.id)), mediosDePago()])
  return cajas.map((c) => {
    const n = cifras(c, s, medios)
    return {
      id: c.id,
      sucursalId: c.sucursalId,
      sucursal: c.sucursal.nombre,
      estado: c.estado,
      abiertaPor: c.abiertaPor.nombre,
      abiertaEn: c.abiertaEn.toISOString(),
      cerradaPor: c.cerradaPor?.nombre ?? null,
      cerradaEn: c.cerradaEn?.toISOString() ?? null,
      montoInicial: c.montoInicial,
      notas: n.notas,
      ventas: n.ventas,
      efectivo: n.efectivo,
      esperado: n.esperado,
      contado: c.contado,
      diferencia: c.contado === null ? null : c.contado - n.esperado,
      reaperturas: c._count.eventos,
    }
  })
}

/** El arqueo completo de un turno, con sus cobros: lo que ve el panel al abrir una caja del historial. */
export async function detalleCaja(sucursalId: number | null, cajaId: number) {
  const caja = await prisma.caja.findFirst({ where: { id: cajaId, ...(sucursalId && { sucursalId }) }, include: { ...incluirCaja, sucursal: { select: { nombre: true } } } })
  if (!caja) throw new ErrorNegocio('Esa caja no existe.', 404)
  const [arqueo, cobros] = await Promise.all([armarArqueo(caja), cobrosDeCaja(sucursalId, cajaId)])
  return { ...arqueo, sucursal: caja.sucursal.nombre, cobros }
}
