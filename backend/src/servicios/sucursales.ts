import type { CocinaCompartida, Sucursal } from '@wasi/shared'
import { prisma } from '../db.js'
import { ErrorNegocio } from '../errores.js'
import { recordar } from '../memoria.js'
import { avisar } from '../tiempo-real.js'
import { olvidarSesion } from './auth.js'
import { comoCocina } from './cocina-compartida.js'

/**
 * Las sucursales del negocio. Comparten la carta, los medios de pago y los
 * datos de la marca; cada una tiene sus mesas, su personal, su caja y sus
 * notas. Se crean y se editan en Administración → Sucursales. Por ahora una
 * puede mandar parte de sus comandas a la cocina de otra (cocina-compartida.ts).
 */

export interface SucursalGuardada extends Sucursal {
  activa: boolean
}

const columnas = { id: true, nombre: true, direccion: true, telefono: true, activa: true, cocinaEnId: true, cocinasCompartidas: true } as const

/** Todas, también las desactivadas (sus ventas siguen en los reportes). Se leen de la base solo cuando cambian. */
export function leerSucursales(): Promise<SucursalGuardada[]> {
  return recordar('sucursales', async () =>
    (await prisma.sucursal.findMany({ orderBy: { id: 'asc' }, select: columnas })).map(({ cocinaEnId, cocinasCompartidas, ...s }) => ({
      ...s,
      cocinaCompartida: comoCocina({ cocinaEnId, cocinasCompartidas }),
    })),
  )
}

export async function listarSucursales() {
  const [sucursales, mesas, personal, notas, cajas] = await Promise.all([
    prisma.sucursal.findMany({ orderBy: { id: 'asc' } }),
    prisma.mesa.groupBy({ by: ['sucursalId', 'tipo'], where: { activa: true }, _count: true }),
    prisma.usuario.groupBy({ by: ['sucursalId'], where: { activo: true, sucursalId: { not: null } }, _count: true }),
    prisma.pedido.groupBy({ by: ['sucursalId'], where: { estado: 'ABIERTO' }, _count: true }),
    prisma.caja.findMany({ where: { estado: 'ABIERTA' }, include: { abiertaPor: { select: { nombre: true } } } }),
  ])
  const contar = (filas: { sucursalId: number | null; _count: number }[], id: number) => filas.find((f) => f.sucursalId === id)?._count ?? 0
  return sucursales.map((s) => {
    const caja = cajas.find((c) => c.sucursalId === s.id)
    return {
      id: s.id,
      nombre: s.nombre,
      direccion: s.direccion,
      telefono: s.telefono,
      activa: s.activa,
      creadaEn: s.creadaEn.toISOString(),
      mesas: mesas.find((m) => m.sucursalId === s.id && m.tipo === 'SALON')?._count ?? 0,
      llevar: mesas.find((m) => m.sucursalId === s.id && m.tipo === 'LLEVAR')?._count ?? 0,
      personal: contar(personal, s.id),
      notasAbiertas: contar(notas, s.id),
      caja: caja ? { abiertaPor: caja.abiertaPor.nombre, abiertaEn: caja.abiertaEn.toISOString() } : null,
      cocinaCompartida: comoCocina(s),
      /** Las sucursales activas a las que esta les cocina. */
      cocinaPara: sucursales.filter((o) => o.activa && o.id !== s.id && comoCocina(o)?.en === s.id).map((o) => o.id),
    }
  })
}

async function exigirNombreLibre(nombre: string, salvo?: number) {
  const otra = await prisma.sucursal.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(salvo && { id: { not: salvo } }) } })
  if (otra) throw new ErrorNegocio(`Ya existe la sucursal ${otra.nombre}.`, 409)
}

/** Una sucursal nueva nace con sus hojas: M1…Mn para el salón y L1…Ln para llevar. */
export async function crearSucursal(d: { nombre: string; direccion: string; telefono: string; mesas: number; llevar: number }) {
  const nombre = d.nombre.trim()
  await exigirNombreLibre(nombre)
  const creada = await prisma.$transaction(async (tx) => {
    const s = await tx.sucursal.create({ data: { nombre, direccion: d.direccion.trim(), telefono: d.telefono.trim() } })
    await tx.mesa.createMany({
      data: [
        ...Array.from({ length: d.mesas }, (_, i) => ({ sucursalId: s.id, tipo: 'SALON' as const, numero: i + 1 })),
        ...Array.from({ length: d.llevar }, (_, i) => ({ sucursalId: s.id, tipo: 'LLEVAR' as const, numero: i + 1 })),
      ],
    })
    return s
  })
  avisar({ ajustes: true })
  return creada
}

/**
 * La cocina que le prepara a una sucursal tiene que ser otra, activa y con
 * cocina propia: no hay cadenas (A manda a B que manda a C), así cada
 * pantalla de cocina sabe exactamente qué comandas le tocan.
 */
async function exigirCocinaValida(id: number, nombre: string, c: CocinaCompartida) {
  if (c.en === id) throw new ErrorNegocio('Una sucursal no comparte la cocina consigo misma.')
  if (!c.estaciones.length) throw new ErrorNegocio('Marca al menos una cocina para compartir.')
  const anfitriona = await prisma.sucursal.findUnique({ where: { id: c.en } })
  if (!anfitriona?.activa) throw new ErrorNegocio('La cocina tiene que ser de una sucursal activa.', 409)
  if (comoCocina(anfitriona)) throw new ErrorNegocio(`${anfitriona.nombre} manda sus pedidos a otra cocina: elige la sucursal que cocina.`, 409)
  const atendidas = await prisma.sucursal.findMany({ where: { cocinaEnId: id, activa: true }, select: { nombre: true } })
  if (atendidas.length) throw new ErrorNegocio(`${nombre} les cocina a ${atendidas.map((s) => s.nombre).join(' y ')}: no puede mandar sus pedidos a otra cocina.`, 409)
}

export async function actualizarSucursal(
  id: number,
  d: Partial<{ nombre: string; direccion: string; telefono: string; activa: boolean; cocinaCompartida: CocinaCompartida | null }>,
) {
  const s = await prisma.sucursal.findUnique({ where: { id } })
  if (!s) throw new ErrorNegocio('Esa sucursal no existe.', 404)
  const nombre = d.nombre?.trim()
  if (nombre && nombre !== s.nombre) await exigirNombreLibre(nombre, id)

  if (d.activa === false && s.activa) {
    if ((await prisma.sucursal.count({ where: { activa: true, id: { not: id } } })) === 0) {
      throw new ErrorNegocio('Tiene que quedar al menos una sucursal activa.', 409)
    }
    // Lo primero que hay que resolver: otra sucursal todavía cocina aquí.
    const atendidas = await prisma.sucursal.findMany({ where: { cocinaEnId: id, activa: true }, select: { nombre: true } })
    if (atendidas.length) {
      const quienes = atendidas.map((a) => a.nombre).join(' y ')
      throw new ErrorNegocio(`${quienes} ${atendidas.length === 1 ? 'usa' : 'usan'} la cocina de ${s.nombre}: dale «Cocina propia» antes de desactivarla.`, 409)
    }
    if (await prisma.caja.count({ where: { sucursalId: id, estado: 'ABIERTA' } })) {
      throw new ErrorNegocio(`${s.nombre} tiene la caja abierta: ciérrala antes de desactivarla.`, 409)
    }
    if (await prisma.pedido.count({ where: { sucursalId: id, estado: 'ABIERTO' } })) {
      throw new ErrorNegocio(`${s.nombre} tiene notas abiertas: ciérralas antes de desactivarla.`, 409)
    }
  }
  if (d.cocinaCompartida) await exigirCocinaValida(id, s.nombre, d.cocinaCompartida)

  const actualizada = await prisma.$transaction(async (tx) => {
    // Las desactivadas que usaban su cocina vuelven a la propia: así nunca queda una cocina sin nadie que entre.
    if (d.activa === false && s.activa) await tx.sucursal.updateMany({ where: { cocinaEnId: id }, data: { cocinaEnId: null, cocinasCompartidas: [] } })
    return tx.sucursal.update({
      where: { id },
      data: {
        nombre,
        direccion: d.direccion?.trim(),
        telefono: d.telefono?.trim(),
        activa: d.activa,
        ...(d.cocinaCompartida !== undefined && {
          cocinaEnId: d.cocinaCompartida?.en ?? null,
          cocinasCompartidas: d.cocinaCompartida?.estaciones ?? [],
        }),
      },
    })
  })
  // Desactivar una sucursal cierra al instante las sesiones de su personal.
  if (d.activa !== undefined) olvidarSesion()
  // Con otra cocina, las pantallas de cocina cambian lo que muestran: que se pongan al día ya.
  avisar({ ajustes: true, ...(d.cocinaCompartida !== undefined && { cocina: true, mesas: true }) })
  return actualizada
}
