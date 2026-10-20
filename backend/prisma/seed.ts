import { randomInt } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Estacion } from '@prisma/client'
import { prisma } from '../src/db.js'
import { cifrar, conPin } from '../src/servicios/auth.js'

/**
 * Semilla: la carta, los adicionales, los insumos y las recetas del Excel
 * «Nota de Pedidos», y en una base nueva las sucursales (con su cocina
 * compartida), sus mesas y sus cuentas.
 *
 * Es idempotente y conservadora: la carta solo se carga si la base no tiene
 * ninguna familia, porque después la manda el panel. Correrla sobre una base
 * en uso no pisa precios, productos, sucursales ni personal: solo completa lo
 * que falta (la contraseña del administrador y el usuario de caja, al actualizar).
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

/**
 * Las sucursales con que arranca el negocio. Plaza More y Plaza San Cristóbal
 * están en la misma ciudad y, por ahora, comparten la cocina de Plaza More
 * para la carta y los shawarmas; los emolientes los prepara cada local. La 3.ª
 * queda lista, con sus mesas y su personal, pero apagada hasta que abra. Todo
 * se cambia después en Administración → Sucursales.
 */
const SUCURSALES: { nombre: string; encargado: string; activa?: boolean; cocinaEn?: string; compartidas?: Estacion[] }[] = [
  { nombre: 'Plaza More', encargado: 'more' },
  { nombre: 'Plaza San Cristóbal', encargado: 'sancristobal', cocinaEn: 'Plaza More', compartidas: ['CARTA', 'SHAWARMAS'] },
  { nombre: 'Sucursal 3', encargado: 'sucursal3', activa: false },
]

async function sembrarMesas(sucursalId: number) {
  if ((await prisma.mesa.count({ where: { sucursalId } })) > 0) return false
  // Como en el Excel: hojas M1…M25 para el salón y L1…L10 para llevar.
  await prisma.mesa.createMany({
    data: [
      ...Array.from({ length: 25 }, (_, i) => ({ sucursalId, tipo: 'SALON' as const, numero: i + 1 })),
      ...Array.from({ length: 10 }, (_, i) => ({ sucursalId, tipo: 'LLEVAR' as const, numero: i + 1 })),
    ],
  })
  return true
}

function exigirVariable(nombre: string) {
  const v = process.env[nombre]
  if (!v) throw new Error(`Falta ${nombre} en el .env`)
  return v
}

/** Una contraseña fácil de teclear en una tablet y difícil de adivinar: «k7mq-4tpx-9wfa». */
const LETRAS = 'abcdefghjkmnpqrstuvwxyz23456789'
const claveAlAzar = () => Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => LETRAS[randomInt(LETRAS.length)]).join('')).join('-')

type Pines = { MOZO: string; COCINA: string; CAJA: string }

interface Cuentas {
  admin: { usuario: string; clave: string }
  sucursales: { nombre: string; activa: boolean; cocinaEn?: string; compartidas?: Estacion[]; encargado: { usuario: string; clave: string }; pins: Pines }[]
}

/** 1111, 1234, 9876: los que se prueban primero. */
const facil = (p: string) => /^(\d)\1{3}$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p)

/**
 * Ningún PIN se repite entre sucursales (con el de un local no se entra a
 * otro): la primera sucursal usa los PIN del .env y las demás reciben otros,
 * al azar, o los de SEED_PINES_OTRAS («7101,7102,7103,7201,…», de tres en
 * tres: mozo, cocina y caja de cada sucursal), que usan las pruebas.
 */
function repartirPines(primera: Pines) {
  const usados = new Set(Object.values(primera))
  const dados = (process.env.SEED_PINES_OTRAS ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  const otro = () => {
    const dado = dados.shift()
    if (dado && (!/^\d{4}$/.test(dado) || usados.has(dado))) throw new Error(`SEED_PINES_OTRAS: ${dado} no es un PIN de 4 cifras libre`)
    let pin = dado ?? ''
    while (!pin) {
      const azar = String(randomInt(1000, 10000))
      if (!usados.has(azar) && !facil(azar)) pin = azar
    }
    usados.add(pin)
    return pin
  }
  return (i: number): Pines => (i === 0 ? primera : { MOZO: otro(), COCINA: otro(), CAJA: otro() })
}

/**
 * Base nueva (el primer deploy): las sucursales con su cocina, sus mesas y su
 * personal. El dueño entra con el usuario y la contraseña del .env; en cada
 * sucursal, un encargado con contraseña al azar y mozo, cocina y caja con su
 * PIN (ninguno se repite entre sucursales, ver `repartirPines`).
 */
async function sembrarNegocio(): Promise<Cuentas> {
  const pins = { MOZO: exigirVariable('SEED_PIN_MOZO'), COCINA: exigirVariable('SEED_PIN_COCINA'), CAJA: exigirVariable('SEED_PIN_CAJA') }
  if (Object.values(pins).some((p) => !/^\d{4}$/.test(p))) throw new Error('Los SEED_PIN_* son de 4 cifras')
  if (new Set(Object.values(pins)).size < 3) throw new Error('SEED_PIN_MOZO, SEED_PIN_COCINA y SEED_PIN_CAJA tienen que ser distintos')
  const pinesDe = repartirPines(pins)
  const admin = { usuario: (process.env.SEED_ADMIN_USUARIO ?? 'admin').trim().toLowerCase(), clave: exigirVariable('SEED_ADMIN_CLAVE') }
  if (admin.clave.length < 8) throw new Error('SEED_ADMIN_CLAVE debe tener al menos 8 caracteres')

  // La migración deja creada la primera sucursal («Principal»): se le pone su nombre.
  const existentes = await prisma.sucursal.findMany({ orderBy: { id: 'asc' } })
  const ids = new Map<string, number>()
  for (const [i, s] of SUCURSALES.entries()) {
    const datos = { nombre: s.nombre, activa: s.activa ?? true }
    const fila = existentes[i] ? await prisma.sucursal.update({ where: { id: existentes[i].id }, data: datos }) : await prisma.sucursal.create({ data: datos })
    ids.set(s.nombre, fila.id)
  }
  for (const s of SUCURSALES) {
    if (s.cocinaEn) await prisma.sucursal.update({ where: { id: ids.get(s.nombre)! }, data: { cocinaEnId: ids.get(s.cocinaEn)!, cocinasCompartidas: s.compartidas ?? [] } })
  }

  await prisma.usuario.create({ data: { nombre: 'Administración', rol: 'ADMIN', usuario: admin.usuario, claveHash: cifrar(admin.clave) } })
  const cuentas: Cuentas = { admin, sucursales: [] }
  for (const [i, s] of SUCURSALES.entries()) {
    const sucursalId = ids.get(s.nombre)!
    await sembrarMesas(sucursalId)
    const encargado = { usuario: s.encargado, clave: claveAlAzar() }
    const suyos = pinesDe(i)
    await prisma.usuario.createMany({
      data: [
        { nombre: 'Mozo', rol: 'MOZO', sucursalId, pinHash: cifrar(suyos.MOZO) },
        { nombre: 'Cocina', rol: 'COCINA', sucursalId, pinHash: cifrar(suyos.COCINA) },
        { nombre: 'Caja', rol: 'CAJA', sucursalId, pinHash: cifrar(suyos.CAJA) },
        { nombre: `Encargado ${s.nombre}`, rol: 'ENCARGADO', sucursalId, usuario: encargado.usuario, claveHash: cifrar(encargado.clave) },
      ],
    })
    cuentas.sucursales.push({ nombre: s.nombre, activa: s.activa ?? true, cocinaEn: s.cocinaEn, compartidas: s.compartidas, encargado, pins: suyos })
    const cocina = s.cocinaEn ? ` · ${(s.compartidas ?? []).join(' y ').toLowerCase()} en la cocina de ${s.cocinaEn}` : ''
    const pines = i === 0 ? 'PIN del .env' : 'PIN propios'
    console.log(`  ${s.nombre}${s.activa === false ? ' (apagada hasta que abra)' : ''}: 25 mesas y 10 para llevar, mozo, cocina y caja (${pines}) y encargado «${s.encargado}»${cocina}`)
  }
  console.log(`  administración: usuario «${admin.usuario}» (contraseña del .env)`)
  return cuentas
}

/**
 * Las cuentas recién creadas, en un archivo privado junto al proyecto (no se
 * sube a git: *.local.md). Uno por base, para no pisar las de desarrollo con
 * las de producción. Con SEED_CUENTAS=no (las pruebas) no se escribe.
 */
function escribirCuentas(c: Cuentas) {
  if (process.env.SEED_CUENTAS === 'no') return
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/base')
  const base = url.pathname.slice(1) || 'base'
  const archivo = path.resolve(import.meta.dirname, '..', '..', `cuentas-${base}.local.md`)
  const fecha = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  const nombreCocina = { CARTA: 'carta', SHAWARMAS: 'shawarmas', BEBIDAS: 'emolientes y bebidas' } as const
  const lineas = [
    '# Cuentas iniciales · Shawarma Wasi',
    '',
    `Base \`${base}\` en \`${url.host}\` · creadas el ${fecha}.`,
    '',
    '> Privado: este archivo no se sube a git. Entrégale a cada quien solo lo suyo. Cada',
    '> encargado cambia su contraseña en el panel (menú con su nombre → «Cambiar mi',
    '> contraseña»).',
    '',
    '## Administración (dueño): todas las sucursales',
    '',
    'Entra en **Administración** con usuario y contraseña. Arriba elige «Todas las sucursales» o una.',
    '',
    '| Usuario | Contraseña |',
    '| --- | --- |',
    `| \`${c.admin.usuario}\` | \`${c.admin.clave}\` |`,
    '',
    '## Cada sucursal',
    '',
    'Mozo, Cocina y Caja eligen su sucursal en la entrada y teclean su PIN. El encargado entra en',
    '**Administración** con usuario y contraseña y ve solo su sucursal.',
    '',
    '| Sucursal | Encargado: usuario | Encargado: contraseña | Mozo: PIN | Cocina: PIN | Caja: PIN |',
    '| --- | --- | --- | --- | --- | --- |',
    ...c.sucursales.map(
      (s) =>
        `| ${s.nombre}${s.activa ? '' : ' (apagada)'} | \`${s.encargado.usuario}\` | \`${s.encargado.clave}\` | ${s.pins.MOZO} | ${s.pins.COCINA} | ${s.pins.CAJA} |`,
    ),
    '',
    '## Los PIN',
    '',
    '- **Ningún PIN se repite, ni entre sucursales**: con el PIN de un local no se entra a otro, aunque',
    '  la tablet tenga elegida la sucursal equivocada (avisa «PIN incorrecto» y que revise la sucursal).',
    '- Mozo, Cocina y Caja de arriba son cuentas para empezar y probar. Al personal real se le registra',
    '  en Administración → Equipo con su propio PIN (lo usual: los últimos 4 dígitos de su DNI). Si un',
    '  DNI termina igual que uno de estos PIN, primero desactiva la cuenta de prueba: así queda libre.',
    '',
    '## Cocina compartida (temporal)',
    '',
    ...c.sucursales
      .filter((s) => s.cocinaEn)
      .map(
        (s) =>
          `- **${s.nombre}** manda ${(s.compartidas ?? []).map((e) => nombreCocina[e]).join(' y ')} a la cocina de **${s.cocinaEn}**: allí salen en la misma pantalla que los de ${s.cocinaEn}, cada comanda con el nombre de su local. Sus emolientes y bebidas los prepara su propia cocina (pestaña «Cocina 3»).`,
      ),
    '- Se deshace en Administración → Sucursales → columna «Cocina» → «Cocina propia».',
    ...(c.sucursales.some((s) => !s.activa)
      ? ['', 'Las sucursales apagadas no aparecen en las tablets ni en los reportes: se activan en Administración → Sucursales el día que abren.']
      : []),
    '',
  ]
  writeFileSync(archivo, lineas.join('\n'))
  console.log(`  cuentas: ${path.relative(process.cwd(), archivo)} (privado, no se sube a git)`)
}

/**
 * Una base en uso: no se tocan sucursales ni personal. Solo se completa lo que
 * falta después de actualizar el sistema: la contraseña del administrador
 * (antes entraba con PIN), alguien de caja y las mesas de la primera sucursal.
 */
async function completarBaseEnUso() {
  const primera = await prisma.sucursal.findFirst({ orderBy: { id: 'asc' } })
  if (!primera) throw new Error('La base tiene personal pero ninguna sucursal: revisa las migraciones')
  if (await sembrarMesas(primera.id)) console.log(`  mesas: 25 de salón y 10 para llevar en ${primera.nombre}`)
  const usuarioAdmin = (process.env.SEED_ADMIN_USUARIO ?? 'admin').trim().toLowerCase()

  const sinClave = await prisma.usuario.findMany({ where: { rol: 'ADMIN', activo: true, claveHash: null }, orderBy: { id: 'asc' } })
  if (sinClave.length && (await prisma.usuario.count({ where: { rol: 'ADMIN', activo: true, claveHash: { not: null } } })) === 0) {
    const clave = process.env.SEED_ADMIN_CLAVE
    if (clave && clave.length >= 8) {
      const libre = !(await prisma.usuario.findFirst({ where: { usuario: usuarioAdmin, id: { not: sinClave[0].id } } }))
      await prisma.usuario.update({
        where: { id: sinClave[0].id },
        data: { claveHash: cifrar(clave), ...(libre && { usuario: usuarioAdmin }) },
      })
      console.log(`  administración: ahora entra con usuario «${libre ? usuarioAdmin : sinClave[0].usuario}» y la contraseña del .env`)
    } else {
      console.log('  ¡ojo! el administrador todavía no tiene contraseña: pon SEED_ADMIN_CLAVE en el .env o corre `npm run clave -w backend`')
    }
  }

  const pinCaja = process.env.SEED_PIN_CAJA
  if (pinCaja && (await prisma.usuario.count({ where: { rol: 'CAJA' } })) === 0) {
    // Ningún PIN se repite, ni entre sucursales.
    const ocupado = await conPin(pinCaja, await prisma.usuario.findMany({ where: { activo: true, pinHash: { not: null } } }))
    if (ocupado) {
      console.log('  ¡ojo! SEED_PIN_CAJA ya lo usa otra persona: agrega a caja desde Administración → Equipo')
    } else {
      await prisma.usuario.create({ data: { nombre: 'Caja', rol: 'CAJA', sucursalId: primera.id, pinHash: cifrar(pinCaja) } })
      console.log('  caja: agregado el usuario Caja (PIN del .env)')
    }
  } else {
    console.log('  sucursales y personal: ya existen, no se tocan')
  }
}

console.log('\n  Shawarma Wasi · semilla')
await sembrarCarta()
if ((await prisma.usuario.count()) === 0) escribirCuentas(await sembrarNegocio())
else await completarBaseEnUso()
await prisma.$disconnect()
console.log('  listo\n')
