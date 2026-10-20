import type { Prisma } from '@prisma/client'
import type { Rol, Usuario } from '@wasi/shared'
import { ROLES_PIN, entraConPin } from '@wasi/shared'
import { prisma, enTransaccion } from '../db.js'
import { contexto } from '../contexto.js'
import { ErrorNegocio } from '../errores.js'
import { cifrar, conPin, olvidarSesion } from './auth.js'

/**
 * El personal: quién entra a cada área, en qué sucursal y con qué acceso.
 *
 * Mozo, cocina y caja entran solo con su PIN en la tablet de su sucursal (lo
 * usual: los últimos 4 dígitos de su DNI). Un PIN es de una sola persona activa
 * en todo el negocio, no solo en su sucursal: si el mismo PIN existiera en dos
 * locales, quien eligió mal la sucursal en la tablet entraría como otra persona
 * y sus pedidos irían a otras mesas. La encargada y el administrador entran con
 * usuario y contraseña. PIN y contraseña se guardan cifrados y nunca se
 * vuelven a mostrar; si alguien los olvida, se le asigna otro.
 *
 * La encargada maneja el personal de su sucursal (mozos, cocina y caja); el
 * administrador, el de todas, las encargadas y a otros administradores.
 */

export interface MiembroEquipo {
  id: number
  nombre: string
  rol: Rol
  sucursalId: number | null
  /** Con qué usuario entra (encargada y administración); el resto entra con PIN. */
  usuario: string | null
  activo: boolean
  creadoEn: string
  /** Notas de pedido que abrió (solo cuenta para quien atiende mesas). */
  pedidos: number
}

const conNotas = { _count: { select: { pedidos: true } } } satisfies Prisma.UsuarioInclude

function serializar(u: Prisma.UsuarioGetPayload<{ include: typeof conNotas }>): MiembroEquipo {
  return {
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    sucursalId: u.sucursalId,
    usuario: u.usuario,
    activo: u.activo,
    creadoEn: u.creadoEn.toISOString(),
    pedidos: u._count.pedidos,
  }
}

/** A quiénes ve cada uno: la encargada, a mozos, cocina y caja de su sucursal; el administrador, a todos (o a una sucursal). */
function alcance(quien: Usuario, sucursalId: number | null): Prisma.UsuarioWhereInput {
  if (quien.rol === 'ENCARGADO') return { sucursalId: quien.sucursalId, rol: { in: [...ROLES_PIN] } }
  return sucursalId ? { sucursalId } : {}
}

export async function listarEquipo(quien: Usuario, sucursalId: number | null): Promise<MiembroEquipo[]> {
  const usuarios = await prisma.usuario.findMany({
    where: alcance(quien, sucursalId),
    orderBy: [{ activo: 'desc' }, { creadoEn: 'asc' }],
    include: conNotas,
  })
  return usuarios.map(serializar)
}

/** Que nadie activo, en ninguna sucursal, tenga ya ese PIN. */
async function exigirPinLibre(pin: string, excepto?: number) {
  const activos = await prisma.usuario.findMany({
    where: { activo: true, pinHash: { not: null }, ...(excepto ? { id: { not: excepto } } : {}) },
    select: { pinHash: true },
  })
  if (await conPin(pin, activos)) {
    throw new ErrorNegocio('Ese PIN ya lo usa otra persona: ningún PIN se repite, ni entre sucursales. Usa otros 4 dígitos (de su DNI u otros).', 409)
  }
}

async function exigirUsuarioLibre(usuario: string, excepto?: number) {
  const otro = await prisma.usuario.findUnique({ where: { usuario } })
  if (otro && otro.id !== excepto) throw new ErrorNegocio(`El usuario «${usuario}» ya existe. Elige otro.`, 409)
}

async function exigirSucursalActiva(id: number) {
  const s = await prisma.sucursal.findUnique({ where: { id } })
  if (!s?.activa) throw new ErrorNegocio('Esa sucursal no existe o está desactivada.')
}

export interface DatosMiembro {
  nombre: string
  rol: Rol
  sucursalId?: number | null
  pin?: string
  usuario?: string
  clave?: string
  activo?: boolean
}

export async function crearMiembro(quien: Usuario, d: DatosMiembro): Promise<MiembroEquipo> {
  if (!contexto.getStore()) return enTransaccion(() => crearMiembro(quien, d))
  // Los hashes llevan sal: una restricción UNIQUE no detectaría dos PIN
  // iguales creados a la vez en distintas instancias o sucursales.
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(77209103)`
  if (quien.rol === 'ENCARGADO' && !entraConPin(d.rol)) throw new ErrorNegocio('Solo puedes agregar mozos, cocina y caja.', 403)
  const sucursalId = quien.rol === 'ENCARGADO' ? quien.sucursalId : d.rol === 'ADMIN' ? null : (d.sucursalId ?? null)
  if (d.rol !== 'ADMIN' && !sucursalId) throw new ErrorNegocio('Elige la sucursal donde trabaja.')
  if (sucursalId) await exigirSucursalActiva(sucursalId)

  let acceso: { pinHash: string } | { usuario: string; claveHash: string }
  if (entraConPin(d.rol)) {
    if (!d.pin) throw new ErrorNegocio('Asígnale un PIN de 4 cifras.')
    await exigirPinLibre(d.pin)
    acceso = { pinHash: cifrar(d.pin) }
  } else {
    const usuario = d.usuario?.trim().toLowerCase()
    if (!usuario || !d.clave) throw new ErrorNegocio('Asígnale un usuario y una contraseña.')
    await exigirUsuarioLibre(usuario)
    acceso = { usuario, claveHash: cifrar(d.clave) }
  }

  const u = await prisma.usuario.create({ data: { nombre: d.nombre.trim(), rol: d.rol, sucursalId, ...acceso }, include: conNotas })
  return serializar(u)
}

export async function actualizarMiembro(quien: Usuario, id: number, d: Partial<DatosMiembro>): Promise<MiembroEquipo> {
  if (!contexto.getStore()) return enTransaccion(() => actualizarMiembro(quien, id, d))
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(77209103)`
  const actual = await prisma.usuario.findUnique({ where: { id } })
  if (!actual) throw new ErrorNegocio('Esa persona no está en el equipo.', 404)

  if (quien.rol === 'ENCARGADO') {
    if (actual.sucursalId !== quien.sucursalId || !entraConPin(actual.rol)) throw new ErrorNegocio('Esa persona no está en el equipo.', 404)
    if (d.rol && !entraConPin(d.rol)) throw new ErrorNegocio('Solo puedes asignar mozo, cocina o caja.', 403)
    if (d.sucursalId !== undefined && d.sucursalId !== quien.sucursalId) throw new ErrorNegocio('No puedes pasarla a otra sucursal.', 403)
  }
  if (id === quien.id && d.activo === false) throw new ErrorNegocio('No puedes desactivar tu propia cuenta.', 409)
  if (id === quien.id && d.rol && d.rol !== actual.rol) throw new ErrorNegocio('No puedes cambiar tu propia área.', 409)

  const rol = d.rol ?? actual.rol
  const sucursalId = rol === 'ADMIN' ? null : d.sucursalId !== undefined ? d.sucursalId : actual.sucursalId
  if (rol !== 'ADMIN' && !sucursalId) throw new ErrorNegocio('Elige la sucursal donde trabaja.')
  if (sucursalId && sucursalId !== actual.sucursalId) await exigirSucursalActiva(sucursalId)

  // Siempre tiene que quedar alguien que pueda entrar a Administración.
  const dejaDeSerAdmin = actual.rol === 'ADMIN' && actual.activo && (rol !== 'ADMIN' || d.activo === false)
  if (dejaDeSerAdmin && (await prisma.usuario.count({ where: { rol: 'ADMIN', activo: true, id: { not: id } } })) === 0) {
    throw new ErrorNegocio('Debe quedar al menos un administrador.', 409)
  }

  const datos: Prisma.UsuarioUncheckedUpdateInput = { rol, sucursalId }
  if (d.nombre !== undefined) datos.nombre = d.nombre.trim()
  if (d.activo !== undefined) datos.activo = d.activo

  if (entraConPin(rol)) {
    // Su PIN ya es único en todo el negocio: cambiar de sucursal no lo cambia. Mientras
    // estuvo inactiva, en cambio, otra persona pudo tomarlo: al volver se escribe de nuevo
    // (puede ser el mismo) para comprobarlo, porque guardado cifrado no se puede comparar.
    const motivo = !actual.pinHash
      ? 'Asígnale un PIN de 4 cifras.'
      : d.activo === true && !actual.activo
        ? 'Para reactivar a alguien, escribe su PIN (puede ser el mismo de antes).'
        : null
    if (motivo && !d.pin) throw new ErrorNegocio(motivo)
    if (d.pin) {
      await exigirPinLibre(d.pin, id)
      datos.pinHash = cifrar(d.pin)
    }
    // Quien pasa a entrar con PIN deja su usuario y contraseña.
    datos.usuario = null
    datos.claveHash = null
  } else {
    const usuario = d.usuario?.trim().toLowerCase()
    if (usuario && usuario !== actual.usuario) {
      await exigirUsuarioLibre(usuario, id)
      datos.usuario = usuario
    }
    if (!usuario && !actual.usuario) throw new ErrorNegocio('Asígnale un usuario y una contraseña.')
    if (d.clave) datos.claveHash = cifrar(d.clave)
    else if (!actual.claveHash) throw new ErrorNegocio('Asígnale una contraseña.')
    datos.pinHash = null
  }

  const u = await prisma.usuario.update({ where: { id }, data: datos, include: conNotas })
  olvidarSesion(id)
  return serializar(u)
}
