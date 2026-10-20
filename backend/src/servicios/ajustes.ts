import type { Prisma } from '@prisma/client'
import type { Ajustes, Estacion, MedioPago } from '@wasi/shared'
import { ESTACIONES, ESTACION_POR_DEFECTO } from '@wasi/shared'
import { prisma } from '../db.js'
import { ErrorNegocio } from '../errores.js'
import { recordar } from '../memoria.js'
import { avisar } from '../tiempo-real.js'
import { leerSucursales } from './sucursales.js'

/**
 * Los datos del negocio y las listas cortas que antes vivían fijas en el código:
 * los medios de pago («Tipo y Monto de Pago» de la nota) y los detalles (la
 * hoja «Detalle» del Excel). Todo se edita en Administración y cada cambio
 * avisa a las pantallas para que se pongan al día solas.
 */

const avisarAjustes = () => avisar({ ajustes: true })

async function fila() {
  return prisma.ajustes.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } })
}

function nombresEstaciones(json: Prisma.JsonValue): Record<Estacion, string> {
  const guardado = (json && typeof json === 'object' && !Array.isArray(json) ? json : {}) as Record<string, unknown>
  return Object.fromEntries(
    ESTACIONES.map((e) => {
      const v = guardado[e]
      return [e, typeof v === 'string' && v.trim() ? v.trim() : ESTACION_POR_DEFECTO[e]]
    }),
  ) as Record<Estacion, string>
}

const serializarMedio = (m: MedioPago): MedioPago => ({
  id: m.id,
  clave: m.clave,
  nombre: m.nombre,
  efectivo: m.efectivo,
  orden: m.orden,
  activo: m.activo,
})

/** Los datos del negocio se leen de la base solo cuando cambian (ver memoria.ts). */
export function leerAjustes(): Promise<Ajustes> {
  return recordar('ajustes', leerDeLaBase)
}

async function leerDeLaBase(): Promise<Ajustes> {
  const [a, medios, sucursales] = await Promise.all([
    fila(),
    prisma.medioPago.findMany({ where: { activo: true }, orderBy: [{ orden: 'asc' }, { id: 'asc' }] }),
    leerSucursales(),
  ])
  return {
    nombre: a.nombre,
    subtitulo: a.subtitulo,
    ruc: a.ruc,
    pieNota: a.pieNota,
    estaciones: nombresEstaciones(a.estaciones),
    observaciones: a.observaciones,
    minutosAlerta: a.minutosAlerta,
    medios: medios.map(serializarMedio),
    sucursales: sucursales.filter((s) => s.activa).map(({ activa: _activa, ...s }) => s),
  }
}

export async function actualizarAjustes(
  datos: Partial<{
    nombre: string
    subtitulo: string
    ruc: string
    pieNota: string
    estaciones: Partial<Record<Estacion, string>>
    observaciones: string[]
    minutosAlerta: number
  }>,
) {
  const actual = await fila()
  const { estaciones, observaciones, ...resto } = datos
  await prisma.ajustes.update({
    where: { id: 1 },
    data: {
      ...Object.fromEntries(Object.entries(resto).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])),
      ...(estaciones && { estaciones: { ...nombresEstaciones(actual.estaciones), ...estaciones } }),
      ...(observaciones && {
        // Sin repetidas ni vacías, en el orden en que se escribieron.
        observaciones: [...new Set(observaciones.map((o) => o.trim()).filter(Boolean))],
      }),
    },
  })
  avisarAjustes()
  return leerAjustes()
}

// ─── Medios de pago ────────────────────────────────────────────────────────

export async function listarMedios() {
  const [medios, usos] = await Promise.all([
    prisma.medioPago.findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }] }),
    prisma.pago.groupBy({ by: ['metodo'], _count: true }),
  ])
  return medios.map((m) => ({ ...serializarMedio(m), pagos: usos.find((u) => u.metodo === m.clave)?._count ?? 0 }))
}

/** «Banco de la Nación» → «BANCO_DE_LA_NACION»: lo que guarda cada pago. */
function claveDe(nombre: string) {
  return (
    nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'MEDIO'
  )
}

export async function crearMedio(datos: { nombre: string; efectivo: boolean }) {
  const nombre = datos.nombre.trim()
  if (await prisma.medioPago.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } })) {
    throw new ErrorNegocio(`Ya existe el medio de pago ${nombre}.`)
  }
  let clave = claveDe(nombre)
  for (let n = 2; await prisma.medioPago.findUnique({ where: { clave } }); n++) clave = `${claveDe(nombre)}_${n}`
  const orden = ((await prisma.medioPago.aggregate({ _max: { orden: true } }))._max.orden ?? 0) + 1
  const m = await prisma.medioPago.create({ data: { clave, nombre, efectivo: datos.efectivo, orden } })
  avisarAjustes()
  return m
}

export async function actualizarMedio(id: number, datos: Partial<{ nombre: string; efectivo: boolean; activo: boolean }>) {
  if (datos.activo === false) {
    const quedan = await prisma.medioPago.count({ where: { activo: true, id: { not: id } } })
    if (quedan === 0) throw new ErrorNegocio('Tiene que quedar al menos un medio de pago activo.')
  }
  const m = await prisma.medioPago.update({ where: { id }, data: { ...datos, nombre: datos.nombre?.trim() } })
  avisarAjustes()
  return m
}

export async function borrarMedio(id: number) {
  const m = await prisma.medioPago.findUnique({ where: { id } })
  if (!m) throw new ErrorNegocio('Ese medio de pago no existe.', 404)
  if (await prisma.pago.count({ where: { metodo: m.clave } })) {
    throw new ErrorNegocio(`${m.nombre} ya tiene cobros registrados: desactívalo en vez de borrarlo.`)
  }
  await prisma.medioPago.delete({ where: { id } })
  avisarAjustes()
}

// ─── Detalles ──────────────────────────────────────────────────────────────

export async function listarDetalles() {
  return prisma.detalle.findMany({ orderBy: [{ orden: 'asc' }, { id: 'asc' }] })
}

export async function crearDetalle(nombre: string) {
  const limpio = nombre.trim()
  if (await prisma.detalle.findUnique({ where: { nombre: limpio } })) throw new ErrorNegocio(`Ya existe «${limpio}».`)
  const orden = ((await prisma.detalle.aggregate({ _max: { orden: true } }))._max.orden ?? 0) + 1
  const d = await prisma.detalle.create({ data: { nombre: limpio, orden } })
  avisar({ carta: true })
  return d
}

export async function actualizarDetalle(id: number, datos: Partial<{ nombre: string; activo: boolean }>) {
  const nombre = datos.nombre?.trim()
  if (nombre && (await prisma.detalle.findFirst({ where: { nombre, id: { not: id } } }))) {
    throw new ErrorNegocio(`Ya existe «${nombre}».`)
  }
  const d = await prisma.detalle.update({ where: { id }, data: { ...datos, nombre } })
  avisar({ carta: true })
  return d
}

/** Las notas guardan el detalle como texto, así que borrarlo no toca ninguna venta. */
export async function borrarDetalle(id: number) {
  await prisma.detalle.delete({ where: { id } })
  avisar({ carta: true })
}

// ─── Orden ─────────────────────────────────────────────────────────────────

const ORDENABLES = ['familia', 'producto', 'adicional', 'medioPago', 'detalle'] as const
export type Ordenable = (typeof ORDENABLES)[number]

/** Guarda el orden en que se arrastraron las filas: la primera queda con orden 1. */
export async function ordenar(que: Ordenable, ids: number[]) {
  await prisma.$transaction(
    ids.map((id, i) => {
      const data = { orden: i + 1 }
      switch (que) {
        case 'familia':
          return prisma.familia.update({ where: { id }, data })
        case 'producto':
          return prisma.producto.update({ where: { id }, data })
        case 'adicional':
          return prisma.adicional.update({ where: { id }, data })
        case 'medioPago':
          return prisma.medioPago.update({ where: { id }, data })
        case 'detalle':
          return prisma.detalle.update({ where: { id }, data })
      }
    }),
  )
  avisar(que === 'medioPago' ? { ajustes: true } : { carta: true })
}
