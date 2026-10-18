import type { Rol, Usuario } from '@wasi/shared'
import { prisma } from '../db.js'
import { ErrorNegocio } from '../errores.js'
import { cifrarPin, olvidarSesion, pinCorrecto } from './auth.js'

/**
 * El equipo del local: quién entra a cada área y con qué PIN.
 *
 * Como se entra solo con el PIN (sin nombre de usuario), dos personas activas
 * no pueden compartirlo: el sistema no sabría quién es quién. El PIN se guarda
 * cifrado y nunca se vuelve a mostrar; si alguien lo olvida, se le asigna otro.
 */

export interface MiembroEquipo {
  id: number
  nombre: string
  rol: Rol
  activo: boolean
  creadoEn: string
  /** Notas de pedido que abrió (solo cuenta para quien atiende mesas). */
  pedidos: number
}

export async function listarEquipo(): Promise<MiembroEquipo[]> {
  const usuarios = await prisma.usuario.findMany({
    orderBy: [{ activo: 'desc' }, { creadoEn: 'asc' }],
    include: { _count: { select: { pedidos: true } } },
  })
  return usuarios.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    creadoEn: u.creadoEn.toISOString(),
    pedidos: u._count.pedidos,
  }))
}

async function exigirPinLibre(pin: string, excepto?: number) {
  const activos = await prisma.usuario.findMany({
    where: { activo: true, ...(excepto ? { id: { not: excepto } } : {}) },
    select: { pinHash: true },
  })
  if (activos.some((u) => pinCorrecto(pin, u.pinHash))) {
    throw new ErrorNegocio('Ese PIN ya lo usa otra persona del equipo. Elige otro.', 409)
  }
}

export async function crearMiembro(d: { nombre: string; rol: Rol; pin: string }): Promise<MiembroEquipo> {
  await exigirPinLibre(d.pin)
  const u = await prisma.usuario.create({ data: { nombre: d.nombre, rol: d.rol, pinHash: cifrarPin(d.pin) } })
  return { id: u.id, nombre: u.nombre, rol: u.rol, activo: u.activo, creadoEn: u.creadoEn.toISOString(), pedidos: 0 }
}

export async function actualizarMiembro(
  id: number,
  d: { nombre?: string; rol?: Rol; pin?: string; activo?: boolean },
  quien: Usuario,
): Promise<MiembroEquipo> {
  const actual = await prisma.usuario.findUnique({ where: { id } })
  if (!actual) throw new ErrorNegocio('Esa persona no está en el equipo.', 404)

  if (id === quien.id && d.activo === false) throw new ErrorNegocio('No puedes desactivar tu propia cuenta.', 409)

  // Siempre tiene que quedar alguien que pueda entrar a Administración.
  const dejaDeSerAdmin = actual.rol === 'ADMIN' && actual.activo && ((d.rol && d.rol !== 'ADMIN') || d.activo === false)
  if (dejaDeSerAdmin) {
    const otros = await prisma.usuario.count({ where: { rol: 'ADMIN', activo: true, id: { not: id } } })
    if (otros === 0) throw new ErrorNegocio('Debe quedar al menos una persona con acceso a Administración.', 409)
  }

  // Mientras estuvo inactiva, su PIN pudo pasar a otra persona: al volver, lleva uno nuevo.
  if (d.activo === true && !actual.activo && !d.pin) {
    throw new ErrorNegocio('Para reactivar a alguien, asígnale un PIN nuevo.', 400)
  }
  if (d.pin) await exigirPinLibre(d.pin, id)

  const u = await prisma.usuario.update({
    where: { id },
    data: {
      ...(d.nombre !== undefined && { nombre: d.nombre }),
      ...(d.rol !== undefined && { rol: d.rol }),
      ...(d.activo !== undefined && { activo: d.activo }),
      ...(d.pin !== undefined && { pinHash: cifrarPin(d.pin) }),
    },
    include: { _count: { select: { pedidos: true } } },
  })
  olvidarSesion(id)
  return { id: u.id, nombre: u.nombre, rol: u.rol, activo: u.activo, creadoEn: u.creadoEn.toISOString(), pedidos: u._count.pedidos }
}
