import type { Carta, Estacion } from '@wasi/shared'
import { prisma } from '../db.js'
import { ErrorNegocio } from '../errores.js'
import { recordar } from '../memoria.js'
import { avisar } from '../tiempo-real.js'

/**
 * La carta: la hoja «Productos» del Excel (familia + variante + precio), la
 * hoja «Adicional» y la hoja «Detalle». La manda el panel de administración,
 * no el código: la semilla solo la carga la primera vez.
 */

/** La carta de los mozos se lee de la base solo cuando cambia (ver memoria.ts). */
export function cartaParaMozo(): Promise<Carta> {
  return recordar('carta', leerCarta)
}

async function leerCarta(): Promise<Carta> {
  const [familias, adicionales, detalles] = await Promise.all([
    prisma.familia.findMany({
      where: { activa: true },
      orderBy: { orden: 'asc' },
      include: { productos: { where: { activo: true }, orderBy: { orden: 'asc' } } },
    }),
    prisma.adicional.findMany({ where: { activo: true }, orderBy: { orden: 'asc' } }),
    prisma.detalle.findMany({ where: { activo: true }, orderBy: [{ orden: 'asc' }, { id: 'asc' }] }),
  ])
  return {
    familias: familias
      .filter((f) => f.productos.length > 0)
      .map((f) => ({
        id: f.id,
        clave: f.clave,
        nombre: f.nombre,
        estacion: f.estacion,
        icono: f.icono,
        admiteCorte: f.admiteCorte,
        productos: f.productos.map((p) => ({
          id: p.id,
          familiaId: p.familiaId,
          codigo: p.codigo,
          variante: p.variante,
          nombre: p.nombre,
          descripcion: p.descripcion,
          precio: p.precio,
          disponible: p.disponible,
        })),
      })),
    adicionales: adicionales.map((a) => ({
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      precio: a.precio,
      estaciones: a.estaciones,
      familia: a.familia,
    })),
    detalles: detalles.map((d) => d.nombre),
  }
}

export async function cartaAdmin() {
  const [familias, adicionales] = await Promise.all([
    prisma.familia.findMany({
      orderBy: { orden: 'asc' },
      include: {
        productos: { orderBy: { orden: 'asc' }, include: { _count: { select: { items: true, receta: true } } } },
      },
    }),
    prisma.adicional.findMany({ orderBy: { orden: 'asc' } }),
  ])
  return {
    familias: familias.map(({ productos, ...f }) => ({
      ...f,
      productos: productos.map(({ _count, ...p }) => ({ ...p, vendidos: _count.items, conReceta: _count.receta > 0 })),
    })),
    adicionales,
  }
}

/** Cada cambio de carta avisa a los mozos para que su pantalla se actualice sola. */
const avisarCarta = () => avisar({ carta: true })

const limpio = (s: string | null | undefined) => (s === undefined ? undefined : s?.trim() || null)

// ─── Productos ─────────────────────────────────────────────────────────────

type DatosProducto = {
  familiaId: number
  codigo: string | null
  variante: string
  nombre: string
  descripcion: string | null
  precio: number
  activo: boolean
  disponible: boolean
}

async function exigirVarianteLibre(familiaId: number, variante: string, salvo?: number) {
  const existe = await prisma.producto.findUnique({ where: { familiaId_variante: { familiaId, variante } } })
  if (existe && existe.id !== salvo) throw new ErrorNegocio(`Ya hay un ${existe.nombre} en esa familia.`)
}

export async function actualizarProducto(id: number, datos: Partial<DatosProducto>) {
  const actual = await prisma.producto.findUnique({ where: { id } })
  if (!actual) throw new ErrorNegocio('Ese producto no existe.', 404)
  const variante = datos.variante?.trim() || undefined
  if (variante || datos.familiaId) {
    await exigirVarianteLibre(datos.familiaId ?? actual.familiaId, variante ?? actual.variante, id)
  }
  const actualizado = await prisma.producto.update({
    where: { id },
    data: {
      ...datos,
      variante,
      nombre: datos.nombre?.trim() || undefined,
      codigo: limpio(datos.codigo),
      descripcion: limpio(datos.descripcion),
    },
  })
  avisarCarta()
  return actualizado
}

export async function crearProducto(datos: { familiaId: number; variante: string; nombre?: string; precio: number; codigo?: string | null; descripcion?: string | null }) {
  const familia = await prisma.familia.findUnique({ where: { id: datos.familiaId } })
  if (!familia) throw new ErrorNegocio('Esa familia no existe.', 404)
  const variante = datos.variante.trim()
  await exigirVarianteLibre(familia.id, variante)
  const orden = ((await prisma.producto.aggregate({ where: { familiaId: familia.id }, _max: { orden: true } }))._max.orden ?? 0) + 1
  const creado = await prisma.producto.create({
    data: {
      familiaId: familia.id,
      codigo: limpio(datos.codigo) ?? null,
      variante,
      // Como la columna «Nombre» del Excel: familia + variante.
      nombre: datos.nombre?.trim() || `${familia.clave.replace(/-/g, ' ')} ${variante}`,
      descripcion: limpio(datos.descripcion) ?? null,
      precio: datos.precio,
      orden,
    },
  })
  avisarCarta()
  return creado
}

/** Lo que ya se vendió no se borra (los reportes lo nombran): se saca de la carta. */
export async function borrarProducto(id: number) {
  const p = await prisma.producto.findUnique({ where: { id }, include: { _count: { select: { items: true } } } })
  if (!p) throw new ErrorNegocio('Ese producto no existe.', 404)
  if (p._count.items > 0) throw new ErrorNegocio(`${p.nombre} ya tiene ventas: desactívalo en vez de borrarlo.`)
  await prisma.producto.delete({ where: { id } })
  avisarCarta()
}

// ─── Familias ──────────────────────────────────────────────────────────────

type DatosFamilia = { nombre: string; estacion: Estacion; icono: string; activa: boolean; admiteCorte: boolean }

export async function crearFamilia(datos: Omit<DatosFamilia, 'activa'>) {
  const nombre = datos.nombre.trim()
  let clave = nombre
  for (let n = 2; await prisma.familia.findUnique({ where: { clave } }); n++) clave = `${nombre} ${n}`
  const orden = ((await prisma.familia.aggregate({ _max: { orden: true } }))._max.orden ?? 0) + 1
  const f = await prisma.familia.create({ data: { ...datos, nombre, clave, orden } })
  avisarCarta()
  return f
}

export async function actualizarFamilia(id: number, datos: Partial<DatosFamilia>) {
  const f = await prisma.familia.update({ where: { id }, data: { ...datos, nombre: datos.nombre?.trim() } })
  avisarCarta()
  return f
}

export async function borrarFamilia(id: number) {
  const f = await prisma.familia.findUnique({ where: { id }, include: { _count: { select: { productos: true } } } })
  if (!f) throw new ErrorNegocio('Esa familia no existe.', 404)
  if (f._count.productos > 0) throw new ErrorNegocio(`${f.nombre} todavía tiene productos.`)
  await prisma.familia.delete({ where: { id } })
  avisarCarta()
}

// ─── Adicionales ───────────────────────────────────────────────────────────

type DatosAdicional = { codigo: string | null; nombre: string; precio: number; activo: boolean; estaciones: Estacion[]; familia: string | null }

export async function actualizarAdicional(id: number, datos: Partial<DatosAdicional>) {
  const nombre = datos.nombre?.trim()
  if (nombre && (await prisma.adicional.findFirst({ where: { nombre, id: { not: id } } }))) {
    throw new ErrorNegocio(`Ya existe el adicional ${nombre}.`)
  }
  const a = await prisma.adicional.update({
    where: { id },
    data: { ...datos, nombre, codigo: limpio(datos.codigo), familia: limpio(datos.familia) },
  })
  avisarCarta()
  return a
}

export async function crearAdicional(datos: { nombre: string; precio: number; codigo?: string | null; estaciones?: Estacion[] }) {
  const nombre = datos.nombre.trim()
  if (await prisma.adicional.findUnique({ where: { nombre } })) throw new ErrorNegocio(`Ya existe el adicional ${nombre}.`)
  const orden = ((await prisma.adicional.aggregate({ _max: { orden: true } }))._max.orden ?? 0) + 1
  const a = await prisma.adicional.create({
    data: { nombre, precio: datos.precio, codigo: limpio(datos.codigo) ?? null, estaciones: datos.estaciones ?? [], orden },
  })
  avisarCarta()
  return a
}

/** Las notas guardan copia de sus adicionales: borrar uno no toca ninguna venta. */
export async function borrarAdicional(id: number) {
  await prisma.adicional.delete({ where: { id } })
  avisarCarta()
}

// ─── Insumos y recetas ─────────────────────────────────────────────────────

/**
 * Costos: las hojas «Costos» e «Insumos». El costo de una línea de receta solo
 * se calcula si la receta mide el insumo en la misma unidad en que se compra
 * (la lechuga se compra por unidad pero la receta la pide en gramos: esa línea
 * queda sin costo, igual que en el Excel, y se marca para completarla).
 */
export async function costos() {
  const [insumos, productos] = await Promise.all([
    prisma.insumo.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { recetas: true } } } }),
    prisma.producto.findMany({
      include: { familia: true, receta: { include: { insumo: true }, orderBy: { id: 'asc' } } },
      orderBy: [{ familia: { orden: 'asc' } }, { orden: 'asc' }],
    }),
  ])

  return {
    insumos: insumos.map(({ _count, ...i }) => ({ ...i, costoUnidad: i.costoCompra / 100 / i.cantidadCompra, usos: _count.recetas })),
    productos: productos.map((p) => ({ id: p.id, nombre: p.nombre, familia: p.familia.nombre, precio: p.precio })),
    recetas: productos
      .filter((p) => p.receta.length > 0)
      .map((p) => {
        const lineas = p.receta.map((r) => {
          const costoUnidad = r.insumo.costoCompra / 100 / r.insumo.cantidadCompra
          const calculable = r.cantidad !== null && (r.unidad ?? r.insumo.unidad) === r.insumo.unidad
          return {
            insumoId: r.insumoId,
            insumo: r.insumo.nombre,
            cantidad: r.cantidad,
            unidad: r.unidad ?? r.insumo.unidad,
            costo: calculable ? Math.round(r.cantidad! * costoUnidad * 100) : null,
          }
        })
        const costo = lineas.reduce((s, l) => s + (l.costo ?? 0), 0)
        return {
          productoId: p.id,
          nombre: p.nombre,
          familia: p.familia.nombre,
          precio: p.precio,
          costo,
          margen: p.precio - costo,
          completa: lineas.every((l) => l.costo !== null),
          lineas,
        }
      }),
  }
}

type DatosInsumo = { nombre: string; costoCompra: number; presentacion: string; cantidadCompra: number; unidad: string }

export async function crearInsumo(datos: DatosInsumo) {
  const nombre = datos.nombre.trim()
  if (await prisma.insumo.findUnique({ where: { nombre } })) throw new ErrorNegocio(`Ya existe el insumo ${nombre}.`)
  return prisma.insumo.create({ data: { ...datos, nombre, presentacion: datos.presentacion.trim(), unidad: datos.unidad.trim() } })
}

export async function actualizarInsumo(id: number, datos: Partial<DatosInsumo>) {
  const nombre = datos.nombre?.trim()
  if (nombre && (await prisma.insumo.findFirst({ where: { nombre, id: { not: id } } }))) {
    throw new ErrorNegocio(`Ya existe el insumo ${nombre}.`)
  }
  return prisma.insumo.update({ where: { id }, data: { ...datos, nombre, unidad: datos.unidad?.trim() } })
}

export async function borrarInsumo(id: number) {
  const i = await prisma.insumo.findUnique({ where: { id }, include: { _count: { select: { recetas: true } } } })
  if (!i) throw new ErrorNegocio('Ese insumo no existe.', 404)
  if (i._count.recetas > 0) throw new ErrorNegocio(`${i.nombre} está en ${i._count.recetas} receta(s): quítalo de ellas primero.`)
  await prisma.insumo.delete({ where: { id } })
}

/**
 * Reemplaza la receta entera de un producto (la hoja «Insumos» de ese
 * producto). Cada línea conserva su unidad: si la receta mide en gramos algo
 * que se compra por unidad, esa línea queda sin costo hasta corregir el insumo.
 */
export async function guardarReceta(productoId: number, lineas: { insumoId: number; cantidad: number | null; unidad?: string | null }[]) {
  const producto = await prisma.producto.findUnique({ where: { id: productoId } })
  if (!producto) throw new ErrorNegocio('Ese producto no existe.', 404)
  const ids = [...new Set(lineas.map((l) => l.insumoId))]
  if (ids.length !== lineas.length) throw new ErrorNegocio('Un insumo está repetido en la receta.')
  const insumos = await prisma.insumo.findMany({ where: { id: { in: ids } } })
  if (insumos.length !== ids.length) throw new ErrorNegocio('Uno de los insumos ya no existe.')
  await prisma.$transaction([
    prisma.recetaItem.deleteMany({ where: { productoId } }),
    prisma.recetaItem.createMany({
      data: lineas.map((l) => {
        const unidad = l.unidad?.trim() || null
        // Solo se guarda la unidad cuando no es la del insumo.
        const propia = unidad && unidad !== insumos.find((i) => i.id === l.insumoId)!.unidad ? unidad : null
        return { productoId, insumoId: l.insumoId, cantidad: l.cantidad, unidad: propia }
      }),
    }),
  ])
}
