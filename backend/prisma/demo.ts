import type { Estacion, Prisma } from '@prisma/client'
import { prisma } from '../src/db.js'

/**
 * Datos de muestra para ver los reportes con vida: cinco semanas de ventas en
 * cada sucursal, cada día con su caja (apertura, gastos, cierre con su
 * arqueo) y unas cuantas mesas ocupadas ahora mismo. Solo para desarrollo — se
 * niega a correr si la base ya tiene pedidos, salvo con --forzar.
 */

const forzar = process.argv.includes('--forzar')
if (!forzar && (await prisma.pedido.count()) > 0) {
  console.log('\n  La base ya tiene pedidos. Usa --forzar si de verdad quieres sumar datos de muestra.\n')
  process.exit(0)
}

let semilla = 20261016
const azar = () => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296
  return semilla / 4294967296
}
const entre = (a: number, b: number) => Math.floor(a + azar() * (b - a + 1))
const elegir = <T>(xs: [T, number][]): T => {
  const total = xs.reduce((s, [, p]) => s + p, 0)
  let r = azar() * total
  for (const [x, p] of xs) if ((r -= p) <= 0) return x
  return xs[0][0]
}

const productos = await prisma.producto.findMany({ where: { activo: true, sucursalId: null }, include: { familia: true } })
const adicionales = await prisma.adicional.findMany()
const sucursales = await prisma.sucursal.findMany({ where: { activa: true }, orderBy: { id: 'asc' } })

// Cuánto se pide cada familia: el shawarma manda, el emoliente lo acompaña.
const PESO: Record<string, number> = {
  Shawarma: 30, Emoliente: 16, 'Artesanal-Carne': 8, 'Artesanal-Pollo': 7, Burger: 6, Conito: 7, Caldo: 6,
  Refresco: 9, Gaseosa: 7, Chifa: 4, Parrilla: 3, Asado: 4, Pizza: 3, Jugo: 3, Calientito: 2, 'Café-Chocolate': 2,
  'Pescados-Mariscos': 2, PlatoFondo: 2, Pastas: 1, Batido: 1, Mazamorra: 2, Mate: 1, Cremolada: 1, Taco: 1, 'Pan al Ajo': 1,
}
const porFamilia = new Map<string, typeof productos>()
for (const p of productos) porFamilia.set(p.familia.clave, [...(porFamilia.get(p.familia.clave) ?? []), p])
const familiasPeso = [...porFamilia.keys()].map((k) => [k, PESO[k] ?? 1] as [string, number])

const OBS = ['Sin ají', 'Sin cebolla', 'Poca crema', 'Bien caliente', 'Sin ensalada', 'Extra ají']
const DETALLES = (await prisma.detalle.findMany({ where: { activo: true } })).map((d) => d.nombre)
const CLIENTES = ['Rosa', 'Jhon', 'Maribel', 'Kevin', 'Luz', 'Diego', 'Yesenia', 'Alexis', 'Carmen', 'Wilber']
const GASTOS: [string, number][] = [['Compra de gas', 4500], ['Pan pita del día', 1800], ['Limones y verduras', 2500], ['Bolsas y tápers', 1500], ['Movilidad', 800]]

function lineaAlAzar() {
  const familia = elegir(familiasPeso)
  const lista = porFamilia.get(familia)!
  const p = lista[Math.min(lista.length - 1, Math.floor(Math.pow(azar(), 1.8) * lista.length))]
  const adic = p.familia.estacion !== 'BEBIDAS' && azar() < 0.12 ? [adicionales[entre(0, 8)]] : []
  const precioAdicionales = adic.reduce((s, a) => s + a.precio, 0)
  const cantidad = azar() < 0.78 ? 1 : entre(2, 3)
  return {
    productoId: p.id,
    nombre: p.nombre,
    familia: p.familia.nombre,
    estacion: p.familia.estacion as Estacion,
    cantidad,
    precio: p.precio,
    adicionales: adic.map((a) => ({ id: a.id, nombre: a.nombre, precio: a.precio })) as Prisma.InputJsonValue,
    precioAdicionales,
    subtotal: cantidad * (p.precio + precioAdicionales),
    detalle: p.familia.admiteCorte && DETALLES.length && azar() < 0.2 ? DETALLES[entre(0, DETALLES.length - 1)] : null,
    paraLlevar: false,
    observacion: azar() < 0.1 ? OBS[entre(0, OBS.length - 1)] : null,
  }
}

const enLima = (fecha: string, minutos: number) => new Date(Date.parse(`${fecha}T00:00:00-05:00`) + minutos * 60_000)
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
const ahoraMin = (() => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })
    .format(new Date())
    .split(':')
    .map(Number)
  return h * 60 + m
})()

type Personal = { mozo: { id: number }; cajero: { id: number } }
type Mesa = Awaited<ReturnType<typeof prisma.mesa.findMany>>[number]

/** Una venta cobrada en la caja del día; devuelve lo que entró en efectivo. */
async function venta(sucursalId: number, mesas: Mesa[], personal: Personal, cajaId: number, fecha: string, minuto: number) {
  const mesa = mesas[entre(0, mesas.length - 1)]
  const lineas = Array.from({ length: entre(1, 5) }, lineaAlAzar)
  const total = lineas.reduce((s, l) => s + l.subtotal, 0)
  const creado = enLima(fecha, minuto)
  const cobrado = enLima(fecha, minuto + entre(18, 55))
  const metodo = elegir<string>([['EFECTIVO', 45], ['YAPE', 38], ['PLIN', 8], ['BCP', 5], ['INTERBANK', 3], ['BN', 1]])
  const pagos =
    azar() < 0.08 && total > 1500
      ? [
          { metodo: 'YAPE', monto: Math.round(total / 200) * 100, recibido: null },
          { metodo: 'EFECTIVO', monto: total - Math.round(total / 200) * 100, recibido: total - Math.round(total / 200) * 100 },
        ]
      : [{ metodo, monto: total, recibido: metodo === 'EFECTIVO' ? Math.ceil(total / 1000) * 1000 : null }]
  await prisma.pedido.create({
    data: {
      sucursalId,
      mesaId: mesa.id,
      mozoId: personal.mozo.id,
      cobradoPorId: personal.cajero.id,
      cliente: mesa.tipo === 'LLEVAR' ? CLIENTES[entre(0, CLIENTES.length - 1)] : null,
      estado: 'COBRADO',
      total,
      creadoEn: creado,
      cobradoEn: cobrado,
      items: {
        create: lineas.map((l) => ({
          ...l,
          ronda: 1,
          estado: 'ENTREGADO',
          creadoEn: creado,
          listoEn: enLima(fecha, minuto + entre(6, 16)),
          entregadoEn: enLima(fecha, minuto + entre(16, 20)),
        })),
      },
      pagos: { create: pagos.map((g) => ({ ...g, cajaId, creadoEn: cobrado })) },
    },
  })
  return pagos.filter((g) => g.metodo === 'EFECTIVO').reduce((s, g) => s + g.monto, 0)
}

/** Un día de una sucursal: abre la caja, vende, anota algún gasto y (si el día ya pasó) cierra con su arqueo. */
async function dia(sucursalId: number, mesas: Mesa[], personal: Personal, fecha: string, cuantos: number, hoyEs: boolean) {
  const FONDO = 10000
  const abiertaEn = enLima(fecha, 630)
  if (hoyEs && ahoraMin < 640) return 0
  const caja = await prisma.caja.create({ data: { sucursalId, abiertaPorId: personal.cajero.id, abiertaEn, montoInicial: FONDO } })
  await prisma.eventoCaja.create({ data: { cajaId: caja.id, tipo: 'APERTURA', usuarioId: personal.cajero.id, creadoEn: abiertaEn, monto: FONDO } })

  let efectivo = 0
  let ventas = 0
  for (let i = 0; i < cuantos; i++) {
    // Dos picos: almuerzo y, sobre todo, la noche.
    const minuto = elegir([[entre(690, 900), 35], [entre(900, 1080), 15], [entre(1080, 1350), 50]])
    if (hoyEs && minuto > ahoraMin - 30) continue
    efectivo += await venta(sucursalId, mesas, personal, caja.id, fecha, minuto)
    ventas++
  }

  let egresos = 0
  if (azar() < 0.45) {
    const [concepto, monto] = GASTOS[entre(0, GASTOS.length - 1)]
    egresos += monto
    await prisma.movimientoCaja.create({ data: { cajaId: caja.id, tipo: 'EGRESO', monto, concepto, usuarioId: personal.cajero.id, creadoEn: enLima(fecha, entre(700, 1000)) } })
  }

  if (!hoyEs) {
    const esperado = FONDO + efectivo - egresos
    // Casi siempre cuadra; a veces falta o sobra un poco de sencillo.
    const diferencia = azar() < 0.72 ? 0 : elegir<number>([[-200, 3], [-50, 3], [100, 2], [-1000, 1], [50, 2]])
    const contado = esperado + diferencia
    const cerradaEn = enLima(fecha, 1390)
    await prisma.caja.update({
      where: { id: caja.id },
      data: { estado: 'CERRADA', cerradaPorId: personal.cajero.id, cerradaEn, esperado, contado, fondoSiguiente: FONDO, observacion: diferencia < -500 ? 'Faltó un billete de S/ 10: se revisa con el turno.' : null },
    })
    await prisma.eventoCaja.create({ data: { cajaId: caja.id, tipo: 'CIERRE', usuarioId: personal.cajero.id, creadoEn: cerradaEn, monto: contado, diferencia } })
  }
  return ventas
}

// Ahora mismo: mesas en distintos momentos de la noche.
async function mesaAbierta(sucursalId: number, mesas: Mesa[], personal: Personal, numero: number, tipo: 'SALON' | 'LLEVAR', hace: number, estado: 'PENDIENTE' | 'LISTO' | 'ENTREGADO', cliente?: string) {
  const mesa = mesas.find((m) => m.numero === numero && m.tipo === tipo)
  if (!mesa) return
  const lineas = Array.from({ length: entre(2, 4) }, lineaAlAzar)
  const creado = new Date(Date.now() - hace * 60_000)
  await prisma.pedido.create({
    data: {
      sucursalId,
      mesaId: mesa.id,
      mozoId: personal.mozo.id,
      cliente: cliente ?? null,
      total: lineas.reduce((s, l) => s + l.subtotal, 0),
      creadoEn: creado,
      cuentaPedidaEn: estado === 'ENTREGADO' && hace > 40 ? new Date(Date.now() - 4 * 60_000) : null,
      items: {
        create: lineas.map((l, i) => ({
          ...l,
          paraLlevar: tipo === 'LLEVAR',
          ronda: 1,
          estado: estado === 'LISTO' && i > 0 ? 'PENDIENTE' : estado,
          creadoEn: creado,
          listoEn: estado !== 'PENDIENTE' ? new Date() : null,
          entregadoEn: estado === 'ENTREGADO' ? new Date() : null,
        })),
      },
    },
  })
}

console.log('\n  Shawarma Wasi · datos de muestra')
for (const [k, s] of sucursales.entries()) {
  const mesas = await prisma.mesa.findMany({ where: { sucursalId: s.id, activa: true } })
  const mozo = await prisma.usuario.findFirst({ where: { sucursalId: s.id, rol: 'MOZO', activo: true } })
  const cajero = (await prisma.usuario.findFirst({ where: { sucursalId: s.id, rol: 'CAJA', activo: true } })) ?? mozo
  if (!mesas.length || !mozo || !cajero) {
    console.log(`  ${s.nombre}: sin mesas o sin mozo, se salta`)
    continue
  }
  const personal = { mozo, cajero }
  // La primera sucursal es la de más movimiento; las demás venden algo menos.
  const escala = k === 0 ? 1 : 0.6
  let ventas = 0
  for (let d = 34; d >= 0; d--) {
    const fecha = new Date(Date.parse(`${hoy}T12:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10)
    const semana = new Date(`${fecha}T12:00:00Z`).getUTCDay()
    if (semana === 1 && azar() < 0.6) continue // algunos lunes no se abre
    const base = (semana === 5 || semana === 6 ? 52 : semana === 0 ? 44 : 30) * escala
    const cuantos = d === 0 ? Math.max(0, Math.round(base * Math.min(1, (ahoraMin - 660) / 690))) : entre(Math.round(base - 8 * escala), Math.round(base + 10 * escala))
    ventas += await dia(s.id, mesas, personal, fecha, cuantos, d === 0)
  }
  await mesaAbierta(s.id, mesas, personal, 3, 'SALON', 6, 'PENDIENTE')
  await mesaAbierta(s.id, mesas, personal, 7, 'SALON', 14, 'PENDIENTE')
  await mesaAbierta(s.id, mesas, personal, 8, 'SALON', 21, 'LISTO')
  await mesaAbierta(s.id, mesas, personal, 12, 'SALON', 48, 'ENTREGADO')
  await mesaAbierta(s.id, mesas, personal, 2, 'LLEVAR', 9, 'PENDIENTE', 'Maribel')
  await mesaAbierta(s.id, mesas, personal, 4, 'LLEVAR', 17, 'LISTO', 'Kevin')
  console.log(`  ${s.nombre}: ${ventas} ventas en cinco semanas, cada día con su caja, y 6 notas abiertas`)
}

await prisma.$disconnect()
console.log('')
