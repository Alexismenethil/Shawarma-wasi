import { createRequire } from 'node:module'
import type { Estacion } from '@prisma/client'
import { prisma } from '../src/db.js'
import { cifrarPin } from '../src/servicios/auth.js'

/**
 * Semilla: la carta, los adicionales, las mesas, los insumos y las recetas del
 * Excel «Nota de Pedidos», más un usuario por área.
 *
 * Es idempotente y conservadora: la carta solo se carga si la base no tiene
 * ninguna familia, porque después la manda el panel. Correrla sobre una base
 * en uso no pisa precios ni productos.
 */

const require = createRequire(import.meta.url)
const datos = require('./datos/catalogo.json') as {
  productos: { codigo: string; familia: string; variante: string; nombre: string; precio: number; descripcion: string | null }[]
  adicionales: { codigo: string; nombre: string; precio: number }[]
  insumos: { nombre: string; costo: number; presentacion: string }[]
  recetas: { producto: string; lineas: { insumo: string; cantidad: number | null; unidad: string | null }[] }[]
}

/**
 * Cada familia del Excel con su cocina. Cocina 1 saca la carta, cocina 2 los
 * shawarmas y lo de plancha, cocina 3 los emolientes y las bebidas. Se puede
 * reasignar desde Administración → Carta.
 */
const FAMILIAS: { clave: string; nombre: string; estacion: Estacion; icono: string; corte?: boolean }[] = [
  { clave: 'Shawarma', nombre: 'Shawarmas', estacion: 'SHAWARMAS', icono: 'shawarma', corte: true },
  { clave: 'Artesanal-Carne', nombre: 'Artesanal de carne', estacion: 'SHAWARMAS', icono: 'sanguche', corte: true },
  { clave: 'Artesanal-Pollo', nombre: 'Artesanal de pollo', estacion: 'SHAWARMAS', icono: 'sanguche', corte: true },
  { clave: 'Burger', nombre: 'Hamburguesas', estacion: 'SHAWARMAS', icono: 'hamburguesa', corte: true },
  { clave: 'Conito', nombre: 'Conitos', estacion: 'SHAWARMAS', icono: 'conito' },
  { clave: 'Taco', nombre: 'Tacos', estacion: 'SHAWARMAS', icono: 'taco', corte: true },
  { clave: 'Caldo', nombre: 'Caldos', estacion: 'CARTA', icono: 'caldo' },
  { clave: 'Asado', nombre: 'Asados', estacion: 'CARTA', icono: 'brocheta' },
  { clave: 'Parrilla', nombre: 'Parrillas', estacion: 'CARTA', icono: 'parrilla' },
  { clave: 'Chifa', nombre: 'Chifa', estacion: 'CARTA', icono: 'chifa' },
  { clave: 'PlatoFondo', nombre: 'Platos de fondo', estacion: 'CARTA', icono: 'plato' },
  { clave: 'Pescados-Mariscos', nombre: 'Pescados y mariscos', estacion: 'CARTA', icono: 'pescado' },
  { clave: 'Pizza', nombre: 'Pizzas', estacion: 'CARTA', icono: 'pizza' },
  { clave: 'Pan al Ajo', nombre: 'Pan al ajo', estacion: 'CARTA', icono: 'pan' },
  { clave: 'Pastas', nombre: 'Pastas', estacion: 'CARTA', icono: 'pasta' },
  { clave: 'Emoliente', nombre: 'Emolientes', estacion: 'BEBIDAS', icono: 'emoliente' },
  { clave: 'Calientito', nombre: 'Calientitos', estacion: 'BEBIDAS', icono: 'jarra' },
  { clave: 'Café-Chocolate', nombre: 'Café y chocolate', estacion: 'BEBIDAS', icono: 'taza' },
  { clave: 'Mate', nombre: 'Mates', estacion: 'BEBIDAS', icono: 'mate' },
  { clave: 'Refresco', nombre: 'Refrescos', estacion: 'BEBIDAS', icono: 'vaso' },
  { clave: 'Cremolada', nombre: 'Cremoladas', estacion: 'BEBIDAS', icono: 'cremolada' },
  { clave: 'Jugo', nombre: 'Jugos', estacion: 'BEBIDAS', icono: 'jugo' },
  { clave: 'Batido', nombre: 'Batidos', estacion: 'BEBIDAS', icono: 'jugo' },
  { clave: 'Gaseosa', nombre: 'Gaseosas y más', estacion: 'BEBIDAS', icono: 'botella' },
  { clave: 'Mazamorra', nombre: 'Mazamorras', estacion: 'BEBIDAS', icono: 'postre' },
]

const ADICIONAL_EN: Record<string, { estaciones: Estacion[]; familia?: string }> = {
  'Pastas Lomo': { estaciones: [], familia: 'Pastas' },
  'Pastas Chuleta': { estaciones: [], familia: 'Pastas' },
  'Pastas Pollo': { estaciones: [], familia: 'Pastas' },
  Vaso: { estaciones: ['BEBIDAS'] },
  Táper: { estaciones: [] },
}

/** Presentación de compra → cuántas unidades base trae y en qué unidad mide la receta. */
const COMPRA: Record<string, [number, string]> = {
  'Pan Pita': [500, 'un'],
  'Pan Hamburguesa': [10, 'un'],
  Pollo: [15000, 'g'],
  Carne: [2000, 'g'],
  'Papas al hilo': [5000, 'g'],
  Lechuga: [1, 'un'],
  Tomate: [1000, 'g'],
  Zanahoria: [1000, 'g'],
  Betarraga: [1, 'atado'],
  'Queso Mozzarella': [5000, 'g'],
  Piña: [1, 'un'],
  Jamonada: [18, 'rd'],
  Hamburguesa: [14, 'un'],
  'Hot Dog': [20, 'un'],
  'Yerba Aromática': [1, 'un'],
  Linaza: [1000, 'g'],
  Cebada: [1000, 'g'],
  Especias: [1, 'pq'],
  Azúcar: [50000, 'g'],
  Limón: [100, 'un'],
  Sanqui: [1000, 'g'],
  Polen: [1, 'pt'],
  'Granos Andinos': [1, 'bl'],
}

/** Las recetas del Excel nombran los productos e insumos a su manera. */
const RECETA_PRODUCTO: Record<string, string> = {
  'Shawarma Tradicional': 'Shawarma Clásica',
  'Shawarma Huamanguino': 'Shawarma Huamanguina',
  'Shawarma Pizzero': 'Shawarma Hawaiana',
  'Artesanal Clásica': 'Artesanal Clásica de carne',
  'Hot dog': 'Hot Dog',
  'Emoliente Clásico': 'Emoliente Clásico',
  'Emoliente Especial': 'Emoliente Especial',
}
const RECETA_INSUMO: Record<string, string> = {
  'Lechuga o Col corazón': 'Lechuga',
  'Queso mozarela': 'Queso Mozzarella',
  Queso: 'Queso Mozzarella',
  'Pan hamburguesa': 'Pan Hamburguesa',
  'Sanqui o Flor de Jamaica': 'Sanqui',
}
const UNIDAD: Record<string, string> = { gr: 'g', un: 'un', rd: 'rd' }

async function sembrarCarta() {
  if ((await prisma.familia.count()) > 0) {
    console.log('  carta: ya existe, no se toca')
    return
  }
  for (const [orden, f] of FAMILIAS.entries()) {
    const familia = await prisma.familia.create({
      data: { clave: f.clave, nombre: f.nombre, estacion: f.estacion, icono: f.icono, orden: orden + 1, admiteCorte: !!f.corte },
    })
    const productos = datos.productos.filter((p) => p.familia === f.clave)
    await prisma.producto.createMany({
      data: productos.map((p, i) => ({
        familiaId: familia.id,
        codigo: p.codigo,
        variante: p.variante,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precio: p.precio,
        orden: i + 1,
      })),
    })
  }

  await prisma.adicional.createMany({
    data: datos.adicionales.map((a, i) => ({
      codigo: a.codigo,
      nombre: a.nombre,
      precio: a.precio,
      orden: i + 1,
      estaciones: ADICIONAL_EN[a.nombre]?.estaciones ?? ['CARTA', 'SHAWARMAS'],
      familia: ADICIONAL_EN[a.nombre]?.familia ?? null,
    })),
  })

  for (const i of datos.insumos) {
    const [cantidadCompra, unidad] = COMPRA[i.nombre] ?? [1, 'un']
    await prisma.insumo.create({
      data: { nombre: i.nombre, costoCompra: Math.round(i.costo * 100), presentacion: i.presentacion, cantidadCompra, unidad },
    })
  }

  for (const r of datos.recetas) {
    const producto = await prisma.producto.findFirst({ where: { nombre: RECETA_PRODUCTO[r.producto] ?? r.producto } })
    if (!producto) continue
    for (const l of r.lineas) {
      const insumo = await prisma.insumo.findUnique({ where: { nombre: RECETA_INSUMO[l.insumo] ?? l.insumo } })
      if (!insumo) continue
      await prisma.recetaItem.upsert({
        where: { productoId_insumoId: { productoId: producto.id, insumoId: insumo.id } },
        update: {},
        create: {
          productoId: producto.id,
          insumoId: insumo.id,
          cantidad: l.cantidad,
          unidad: l.unidad ? (UNIDAD[l.unidad] ?? l.unidad) : null,
        },
      })
    }
  }
  console.log(`  carta: ${FAMILIAS.length} familias, ${datos.productos.length} productos, ${datos.adicionales.length} adicionales`)
}

async function sembrarMesas() {
  // Como en el Excel: hojas M1…M25 para el salón y L1…L10 para llevar.
  for (let n = 1; n <= 25; n++) {
    await prisma.mesa.upsert({ where: { tipo_numero: { tipo: 'SALON', numero: n } }, update: {}, create: { tipo: 'SALON', numero: n } })
  }
  for (let n = 1; n <= 10; n++) {
    await prisma.mesa.upsert({ where: { tipo_numero: { tipo: 'LLEVAR', numero: n } }, update: {}, create: { tipo: 'LLEVAR', numero: n } })
  }
  console.log('  mesas: 25 de salón y 10 para llevar')
}

async function sembrarUsuarios() {
  if ((await prisma.usuario.count()) > 0) {
    console.log('  personal: ya existe, no se toca')
    return
  }
  const pines = { MOZO: process.env.SEED_PIN_MOZO, COCINA: process.env.SEED_PIN_COCINA, ADMIN: process.env.SEED_PIN_ADMIN }
  for (const [rol, pin] of Object.entries(pines)) {
    if (!pin) throw new Error(`Falta SEED_PIN_${rol} en el .env`)
  }
  await prisma.usuario.createMany({
    data: [
      { nombre: 'Mozo', rol: 'MOZO', pinHash: cifrarPin(pines.MOZO!) },
      { nombre: 'Cocina', rol: 'COCINA', pinHash: cifrarPin(pines.COCINA!) },
      { nombre: 'Administración', rol: 'ADMIN', pinHash: cifrarPin(pines.ADMIN!) },
    ],
  })
  console.log('  personal: mozo, cocina y administración (PIN del .env)')
}

console.log('\n  Shawarma Wasi · semilla')
await sembrarCarta()
await sembrarMesas()
await sembrarUsuarios()
await prisma.$disconnect()
console.log('  listo\n')
