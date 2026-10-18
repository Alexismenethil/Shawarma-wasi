import { Prisma } from '@prisma/client'
import type { Estacion } from '@wasi/shared'
import { ESTACIONES, codigoMesa } from '@wasi/shared'
import { prisma } from '../db.js'
import { ErrorNegocio } from '../errores.js'

/**
 * Reportes.
 *
 * Son las hojas de análisis del Excel —Arqueo y Resumen (el día), VentasFecha y
 * Tendencia (por fechas), Preferencias (lo más vendido), Acumulado (producto ×
 * día del mes) y Consolidado / Filtro_Pref (todas las líneas vendidas)— hechas
 * consultas. Todo se cuenta en hora de Lima y solo entra lo cobrado.
 *
 * Los rangos se filtran por el instante del cobro (`cobradoEn` entre dos
 * horas UTC), no convirtiendo cada fila a fecha de Lima: así Postgres usa el
 * índice y un reporte del mes no recorre la tabla entera. Las consultas de un
 * mismo reporte salen en paralelo.
 */

const ZONA = 'America/Lima'

export function hoyEnLima(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date())
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
function validarFecha(f: string) {
  if (!FECHA.test(f) || Number.isNaN(Date.parse(`${f}T12:00:00Z`))) throw new ErrorNegocio('Fecha inválida, se espera AAAA-MM-DD.')
  return f
}

function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Perú no cambia de hora (UTC−5 todo el año): el día de Lima empieza a las 05:00 UTC. */
const inicioDia = (fecha: string) => new Date(`${fecha}T00:00:00-05:00`)

/** Del primer instante de `desde` al primero del día siguiente a `hasta`. */
export const rangoLima = (desde: string, hasta: string) => ({ gte: inicioDia(desde), lt: inicioDia(sumarDias(hasta, 1)) })

/** Filtro común: pedidos cobrados entre dos fechas de Lima, ambas incluidas. */
function cobradosEntre(desde: string, hasta: string) {
  const r = rangoLima(desde, hasta)
  return Prisma.sql`p."cobradoEn" >= ${r.gte} AND p."cobradoEn" < ${r.lt} AND p.estado <> 'ANULADO'`
}

/** Resumen por tipo de pago: los medios activos y los retirados que cobraron algo en el rango. */
async function porMetodo(desde: string, hasta: string) {
  const [filas, medios] = await Promise.all([
    prisma.$queryRaw<{ metodo: string; monto: number; recibido: number; pagos: number }[]>`
      SELECT g.metodo, SUM(g.monto)::int AS monto, SUM(COALESCE(g.recibido, g.monto))::int AS recibido,
             COUNT(*)::int AS pagos
      FROM "Pago" g JOIN "Pedido" p ON p.id = g."pedidoId"
      WHERE ${cobradosEntre(desde, hasta)}
      GROUP BY g.metodo`,
    prisma.medioPago.findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }] }),
  ])
  const fila = (clave: string, nombre: string) => {
    const f = filas.find((x) => x.metodo === clave)
    return { metodo: clave, nombre, monto: f?.monto ?? 0, pagos: f?.pagos ?? 0, vuelto: f ? f.recibido - f.monto : 0 }
  }
  return [
    ...medios.filter((m) => m.activo || filas.some((f) => f.metodo === m.clave)).map((m) => fila(m.clave, m.nombre)),
    ...filas.filter((f) => !medios.some((m) => m.clave === f.metodo)).map((f) => fila(f.metodo, f.metodo)),
  ]
}

async function totales(desde: string, hasta: string) {
  const [[t], [u]] = await Promise.all([
    prisma.$queryRaw<{ ventas: number; pedidos: number }[]>`
      SELECT COALESCE(SUM(p.total), 0)::int AS ventas, COUNT(*)::int AS pedidos
      FROM "Pedido" p WHERE ${cobradosEntre(desde, hasta)}`,
    prisma.$queryRaw<{ unidades: number }[]>`
      SELECT COALESCE(SUM(i.cantidad), 0)::int AS unidades
      FROM "ItemPedido" i JOIN "Pedido" p ON p.id = i."pedidoId"
      WHERE ${cobradosEntre(desde, hasta)} AND i.estado <> 'ANULADO'`,
  ])
  return {
    ventas: t.ventas,
    pedidos: t.pedidos,
    unidades: u.unidades,
    ticketPromedio: t.pedidos ? Math.round(t.ventas / t.pedidos) : 0,
  }
}

async function masVendidos(desde: string, hasta: string, limite = 15) {
  return prisma.$queryRaw<{ nombre: string; familia: string; estacion: Estacion; unidades: number; monto: number }[]>`
    SELECT i.nombre, MIN(i.familia) AS familia, MIN(i.estacion::text)::"Estacion" AS estacion,
           SUM(i.cantidad)::int AS unidades, SUM(i.subtotal)::int AS monto
    FROM "ItemPedido" i JOIN "Pedido" p ON p.id = i."pedidoId"
    WHERE ${cobradosEntre(desde, hasta)} AND i.estado <> 'ANULADO'
    GROUP BY i.nombre ORDER BY unidades DESC, monto DESC LIMIT ${limite}`
}

async function porEstacion(desde: string, hasta: string) {
  const filas = await prisma.$queryRaw<{ estacion: Estacion; unidades: number; monto: number }[]>`
    SELECT i.estacion, SUM(i.cantidad)::int AS unidades, SUM(i.subtotal)::int AS monto
    FROM "ItemPedido" i JOIN "Pedido" p ON p.id = i."pedidoId"
    WHERE ${cobradosEntre(desde, hasta)} AND i.estado <> 'ANULADO'
    GROUP BY i.estacion`
  return ESTACIONES.map((e) => ({
    estacion: e,
    unidades: filas.find((f) => f.estacion === e)?.unidades ?? 0,
    monto: filas.find((f) => f.estacion === e)?.monto ?? 0,
  }))
}

/** Arqueo + Resumen: el día de caja. */
export async function reporteDia(fechaPedida?: string) {
  const fecha = validarFecha(fechaPedida ?? hoyEnLima())
  const rango = rangoLima(fecha, fecha)

  const [porHora, pedidos, enCurso, tot, metodos, estaciones, vendidos] = await Promise.all([
    prisma.$queryRaw<{ hora: number; ventas: number; pedidos: number }[]>`
      SELECT EXTRACT(HOUR FROM p."cobradoEn" AT TIME ZONE ${ZONA})::int AS hora,
             SUM(p.total)::int AS ventas, COUNT(*)::int AS pedidos
      FROM "Pedido" p WHERE ${cobradosEntre(fecha, fecha)}
      GROUP BY 1 ORDER BY 1`,
    prisma.pedido.findMany({
      where: { cobradoEn: rango, estado: { not: 'ANULADO' } },
      include: {
        mesa: true,
        mozo: { select: { nombre: true } },
        pagos: { orderBy: { id: 'asc' } },
        items: { where: { estado: { not: 'ANULADO' } }, orderBy: { id: 'asc' } },
      },
      orderBy: { cobradoEn: 'desc' },
    }),
    prisma.pedido.aggregate({ where: { estado: 'ABIERTO', cobradoEn: null }, _sum: { total: true }, _count: true }),
    totales(fecha, fecha),
    porMetodo(fecha, fecha),
    porEstacion(fecha, fecha),
    masVendidos(fecha, fecha, 10),
  ])

  return {
    fecha,
    totales: tot,
    metodos,
    porHora,
    estaciones,
    masVendidos: vendidos,
    enCurso: { pedidos: enCurso._count, total: enCurso._sum.total ?? 0 },
    pedidos: pedidos.map((p) => ({
      id: p.id,
      mesa: { numero: p.mesa.numero, tipo: p.mesa.tipo },
      cliente: p.cliente,
      mozo: p.mozo?.nombre ?? null,
      total: p.total,
      cobradoEn: p.cobradoEn!.toISOString(),
      creadoEn: p.creadoEn.toISOString(),
      pagos: p.pagos.map((g) => ({ metodo: g.metodo, monto: g.monto, recibido: g.recibido })),
      items: p.items.map((i) => ({
        cantidad: i.cantidad,
        nombre: i.nombre,
        familia: i.familia,
        adicionales: (i.adicionales as { nombre: string }[]).map((a) => a.nombre),
        detalle: i.detalle,
        paraLlevar: i.paraLlevar,
        observacion: i.observacion,
        precio: i.precio,
        precioAdicionales: i.precioAdicionales,
        subtotal: i.subtotal,
      })),
    })),
  }
}

/** VentasFecha + Tendencia + Preferencias, para un rango. */
export async function reporteRango(desdeP: string, hastaP: string) {
  const desde = validarFecha(desdeP)
  const hasta = validarFecha(hastaP)
  if (hasta < desde) throw new ErrorNegocio('La fecha final es anterior a la inicial.')
  if (sumarDias(desde, 400) < hasta) throw new ErrorNegocio('El rango no puede pasar de 400 días.')

  // El periodo anterior, del mismo largo, para comparar.
  let largo = 0
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) largo++
  const antesHasta = sumarDias(desde, -1)
  const antesDesde = sumarDias(desde, -largo)

  const [dias, familias, tot, anterior, metodos, estaciones, vendidos] = await Promise.all([
    prisma.$queryRaw<{ fecha: string; ventas: number; pedidos: number }[]>`
      SELECT to_char((p."cobradoEn" AT TIME ZONE ${ZONA})::date, 'YYYY-MM-DD') AS fecha,
             SUM(p.total)::int AS ventas, COUNT(*)::int AS pedidos
      FROM "Pedido" p WHERE ${cobradosEntre(desde, hasta)}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ familia: string; unidades: number; monto: number }[]>`
      SELECT i.familia, SUM(i.cantidad)::int AS unidades, SUM(i.subtotal)::int AS monto
      FROM "ItemPedido" i JOIN "Pedido" p ON p.id = i."pedidoId"
      WHERE ${cobradosEntre(desde, hasta)} AND i.estado <> 'ANULADO'
      GROUP BY i.familia ORDER BY monto DESC`,
    totales(desde, hasta),
    totales(antesDesde, antesHasta),
    porMetodo(desde, hasta),
    porEstacion(desde, hasta),
    masVendidos(desde, hasta, 40),
  ])

  // Días sin ventas también cuentan: una barra vacía dice algo (el local cerró).
  const porFecha = new Map(dias.map((d) => [d.fecha, d]))
  const serie: { fecha: string; ventas: number; pedidos: number }[] = []
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) serie.push(porFecha.get(f) ?? { fecha: f, ventas: 0, pedidos: 0 })

  return {
    desde,
    hasta,
    totales: tot,
    anterior: { desde: antesDesde, hasta: antesHasta, ...anterior },
    serie,
    metodos,
    estaciones,
    familias,
    masVendidos: vendidos,
  }
}

/** Acumulado: unidades de cada producto por día del mes, con total, mínimo, máximo y promedio. */
export async function reporteAcumulado(mes: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErrorNegocio('Mes inválido, se espera AAAA-MM.')
  const desde = `${mes}-01`
  const [anio, m] = mes.split('-').map(Number)
  const diasMes = new Date(Date.UTC(anio, m, 0)).getUTCDate()
  const hasta = `${mes}-${String(diasMes).padStart(2, '0')}`

  const [filas, orden] = await Promise.all([
    prisma.$queryRaw<{ nombre: string; familia: string; dia: number; unidades: number }[]>`
      SELECT i.nombre, MIN(i.familia) AS familia,
             EXTRACT(DAY FROM p."cobradoEn" AT TIME ZONE ${ZONA})::int AS dia,
             SUM(i.cantidad)::int AS unidades
      FROM "ItemPedido" i JOIN "Pedido" p ON p.id = i."pedidoId"
      WHERE ${cobradosEntre(desde, hasta)} AND i.estado <> 'ANULADO'
      GROUP BY i.nombre, 3`,
    prisma.producto.findMany({ select: { nombre: true, familia: { select: { orden: true } }, orden: true } }),
  ])

  // Como en el Excel, el mínimo y el promedio se miden sobre los días que el local vendió.
  const diasConVenta = [...new Set(filas.map((f) => f.dia))].sort((a, b) => a - b)
  const posicion = new Map(orden.map((p) => [p.nombre, p.familia.orden * 1000 + p.orden]))

  const productos = new Map<string, { nombre: string; familia: string; dias: Record<number, number> }>()
  for (const f of filas) {
    const p = productos.get(f.nombre) ?? { nombre: f.nombre, familia: f.familia, dias: {} }
    p.dias[f.dia] = f.unidades
    productos.set(f.nombre, p)
  }

  const resultado = [...productos.values()]
    .map((p) => {
      const valores = diasConVenta.map((d) => p.dias[d] ?? 0)
      const total = valores.reduce((s, v) => s + v, 0)
      return {
        ...p,
        total,
        minimo: Math.min(...valores),
        maximo: Math.max(...valores),
        promedio: valores.length ? total / valores.length : 0,
      }
    })
    .sort((a, b) => (posicion.get(a.nombre) ?? 1e9) - (posicion.get(b.nombre) ?? 1e9))

  return { mes, diasMes, diasConVenta, productos: resultado }
}

/* ── Consolidado ─────────────────────────────────────────────────────────── */

export interface FiltroConsolidado {
  desde: string
  hasta: string
  q?: string
  metodo?: string
}

function condicionConsolidado(filtro: FiltroConsolidado) {
  const desde = validarFecha(filtro.desde)
  const hasta = validarFecha(filtro.hasta)
  if (hasta < desde) throw new ErrorNegocio('La fecha final es anterior a la inicial.')
  const q = filtro.q?.trim() ? `%${filtro.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null
  return Prisma.sql`${cobradosEntre(desde, hasta)} AND i.estado <> 'ANULADO'
    ${q ? Prisma.sql`AND (i.nombre ILIKE ${q} OR i.familia ILIKE ${q} OR p.cliente ILIKE ${q} OR i.observacion ILIKE ${q})` : Prisma.empty}
    ${filtro.metodo ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Pago" g WHERE g."pedidoId" = p.id AND g.metodo = ${filtro.metodo})` : Prisma.empty}`
}

interface FilaConsolidado {
  id: number
  pedidoId: number
  cantidad: number
  nombre: string
  familia: string
  estacion: Estacion
  adicionales: { nombre: string; precio: number }[]
  detalle: string | null
  paraLlevar: boolean
  observacion: string | null
  precio: number
  precioAdicionales: number
  subtotal: number
  total: number
  mesaTipo: 'SALON' | 'LLEVAR'
  mesaNumero: number
  cliente: string | null
  mozo: string | null
  cobradoEn: Date
  metodos: string | null
}

function filasConsolidado(condicion: Prisma.Sql, limite: number, desde: number) {
  return prisma.$queryRaw<FilaConsolidado[]>`
    SELECT i.id, i."pedidoId", i.cantidad, i.nombre, i.familia, i.estacion, i.adicionales, i.detalle,
           i."paraLlevar", i.observacion, i.precio, i."precioAdicionales", i.subtotal, p.total,
           m.tipo::text AS "mesaTipo", m.numero AS "mesaNumero", p.cliente, u.nombre AS mozo, p."cobradoEn",
           (SELECT string_agg(DISTINCT g.metodo, '+') FROM "Pago" g WHERE g."pedidoId" = p.id) AS metodos
    FROM "ItemPedido" i
    JOIN "Pedido" p ON p.id = i."pedidoId"
    JOIN "Mesa" m ON m.id = p."mesaId"
    LEFT JOIN "Usuario" u ON u.id = p."mozoId"
    WHERE ${condicion}
    ORDER BY p."cobradoEn" DESC, i.id ASC
    LIMIT ${limite} OFFSET ${desde}`
}

/**
 * Consolidado / Filtro_Pref: cada línea vendida, con su nota, mesa, fecha y
 * pago. Se entrega por páginas: el resumen (notas, platos, monto) cuenta todo
 * lo filtrado, pero solo viaja la página que se está viendo.
 */
export async function consolidado(filtro: FiltroConsolidado & { pagina: number; porPagina: number }) {
  const condicion = condicionConsolidado(filtro)
  const [filas, [resumen]] = await Promise.all([
    filasConsolidado(condicion, filtro.porPagina, (filtro.pagina - 1) * filtro.porPagina),
    prisma.$queryRaw<{ lineas: number; notas: number; unidades: number; monto: number }[]>`
      SELECT COUNT(*)::int AS lineas, COUNT(DISTINCT p.id)::int AS notas,
             COALESCE(SUM(i.cantidad), 0)::int AS unidades, COALESCE(SUM(i.subtotal), 0)::int AS monto
      FROM "ItemPedido" i JOIN "Pedido" p ON p.id = i."pedidoId"
      WHERE ${condicion}`,
  ])
  return {
    pagina: filtro.pagina,
    porPagina: filtro.porPagina,
    paginas: Math.max(1, Math.ceil(resumen.lineas / filtro.porPagina)),
    ...resumen,
    filas: filas.map((f) => ({ ...f, cobradoEn: f.cobradoEn.toISOString(), metodos: (f.metodos ?? '').split('+').filter(Boolean) })),
  }
}

const enSoles = (c: number) => (c / 100).toFixed(2)
const celda = (v: string | number | null | undefined) => {
  const t = v === null || v === undefined ? '' : String(v)
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/** El consolidado entero como CSV para Excel (punto y coma, con BOM), sin pasar por la pantalla. */
export async function consolidadoCsv(filtro: FiltroConsolidado) {
  const [filas, medios] = await Promise.all([filasConsolidado(condicionConsolidado(filtro), 100_000, 0), prisma.medioPago.findMany()])
  const nombre = (clave: string) => medios.find((m) => m.clave === clave)?.nombre ?? clave
  const fecha = (d: Date) => d.toLocaleDateString('es-PE', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = (d: Date) => d.toLocaleTimeString('es-PE', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false })
  const cabecera = ['Nota', 'Cant', 'Producto', 'Familia', 'Adicional', 'Detalle', 'Obs', 'Precio', 'PAdic', 'Subtotal', 'Total', 'Tipo Pago', 'Mesa', 'Fecha', 'Hora', 'Cliente', 'Mozo']
  const lineas = filas.map((f) =>
    [
      f.pedidoId,
      f.cantidad,
      f.nombre,
      f.familia,
      f.adicionales.map((a) => a.nombre).join(' + '),
      f.paraLlevar ? `L: ${f.detalle ?? 'Para llevar'}` : f.detalle ? `M: ${f.detalle}` : '',
      f.observacion,
      enSoles(f.precio),
      enSoles(f.precioAdicionales),
      enSoles(f.subtotal),
      enSoles(f.total),
      (f.metodos ?? '').split('+').filter(Boolean).map(nombre).join(' + '),
      codigoMesa({ tipo: f.mesaTipo, numero: f.mesaNumero }),
      fecha(f.cobradoEn),
      hora(f.cobradoEn),
      f.cliente,
      f.mozo,
    ]
      .map(celda)
      .join(';'),
  )
  return '﻿' + [cabecera.join(';'), ...lineas].join('\r\n')
}
