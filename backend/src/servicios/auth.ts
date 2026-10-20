import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Request, RequestHandler } from 'express'
import type { Rol, Usuario } from '@wasi/shared'
import { ENTRAN, entraConPin, puedeEntrar } from '@wasi/shared'
import { prisma } from '../db.js'
import { env } from '../env.js'
import { ErrorNegocio } from '../errores.js'
import { contexto } from '../contexto.js'
import { comprobarAcceso, registrarFallo, borrarFallos } from './limite-acceso.js'
import { leerSucursales } from './sucursales.js'

/**
 * Acceso.
 *
 * En el local nadie escribe usuario y contraseña con las manos sucias: mozo,
 * cocina y caja entran con un PIN de cuatro cifras en la tablet de su
 * sucursal, y la tablet recuerda la sesión durante el turno. La encargada y el
 * administrador manejan dinero y personal: entran con usuario y contraseña.
 * PIN y contraseña se guardan con scrypt (viene con Node, sin binarios que
 * compilar en el servidor).
 */

export function cifrar(secreto: string): string {
  const sal = randomBytes(16)
  const hash = scryptSync(secreto, sal, 32)
  return `${sal.toString('hex')}:${hash.toString('hex')}`
}

/**
 * Compara en el grupo de hilos de Node, no en el hilo de la API: revisar que
 * un PIN no se repita en todo el negocio son decenas de scrypt, y mientras
 * tanto las tablets siguen atendidas. Varias comparaciones van a la vez.
 */
export async function coincide(secreto: string, guardado: string | null | undefined): Promise<boolean> {
  const [salHex, hashHex] = (guardado ?? '').split(':')
  if (!salHex || !hashHex) return false
  const esperado = Buffer.from(hashHex, 'hex')
  const calculado = await new Promise<Buffer>((listo, fallo) =>
    scrypt(secreto, Buffer.from(salHex, 'hex'), esperado.length, (e, clave) => (e ? fallo(e) : listo(clave))),
  )
  return timingSafeEqual(esperado, calculado)
}

/** De una lista, quien tiene ese PIN (comparando a la vez). */
export async function conPin<T extends { pinHash: string | null }>(pin: string, usuarios: T[]): Promise<T | undefined> {
  const aciertos = await Promise.all(usuarios.map((u) => coincide(pin, u.pinHash)))
  return usuarios[aciertos.indexOf(true)]
}

const datosDe = (u: { id: number; nombre: string; rol: Rol; sucursalId: number | null }): Usuario => ({
  id: u.id,
  nombre: u.nombre,
  rol: u.rol,
  sucursalId: u.sucursalId,
})

function firmar(usuario: Usuario) {
  return { token: jwt.sign(usuario, env.JWT_SECRET, { expiresIn: '14h' }), usuario }
}

export type AreaConPin = 'MOZO' | 'COCINA' | 'CAJA'

/**
 * Entrar con PIN a un área de una sucursal. Solo se compara contra quienes
 * pueden entrar a esa área en esa sucursal: el PIN de un mozo no abre la caja,
 * y como ningún PIN se repite entre sucursales (equipo.ts), con el de un local
 * no se entra a otro aunque la tablet tenga elegido el que no es.
 */
export async function ingresarConPin(area: AreaConPin, sucursalId: number, pin: string, ip: string) {
  const llave = `${ip}:${sucursalId}:${area}`
  await comprobarAcceso(llave)
  const candidatos = await prisma.usuario.findMany({
    where: { activo: true, sucursalId, sucursal: { activa: true }, rol: { in: ENTRAN[area].filter(entraConPin) }, pinHash: { not: null } },
  })
  const usuario = await conPin(pin, candidatos)
  if (!usuario) {
    await registrarFallo(llave)
    // El mismo mensaje para todo PIN que no entra: no delata si existe en otra sucursal.
    const varias = (await leerSucursales()).filter((s) => s.activa).length > 1
    throw new ErrorNegocio(varias ? 'PIN incorrecto. Revisa que la sucursal elegida sea la tuya.' : 'PIN incorrecto.', 401)
  }
  await borrarFallos(llave)
  return firmar(datosDe(usuario))
}

/** Sin usuario igual se calcula un scrypt: la respuesta no delata si el usuario existe. */
const SEÑUELO = cifrar(randomBytes(12).toString('hex'))

export async function ingresarConClave(nombre: string, clave: string, ip: string) {
  const usuario = nombre.trim().toLowerCase()
  const llave = `${ip}:clave:${usuario}`
  await comprobarAcceso(llave)
  const u = await prisma.usuario.findUnique({ where: { usuario }, include: { sucursal: { select: { activa: true } } } })
  const correcta = (await coincide(clave, u?.claveHash ?? SEÑUELO)) && !!u?.claveHash
  if (!u || !correcta || !u.activo || !puedeEntrar(u.rol, 'PANEL') || u.sucursal?.activa === false) {
    await registrarFallo(llave)
    throw new ErrorNegocio('Usuario o contraseña incorrectos.', 401)
  }
  await borrarFallos(llave)
  return firmar(datosDe(u))
}

export async function cambiarClave(id: number, actual: string, nueva: string) {
  const u = await prisma.usuario.findUnique({ where: { id } })
  if (!u?.claveHash || !(await coincide(actual, u.claveHash))) throw new ErrorNegocio('La contraseña actual no es correcta.')
  await prisma.usuario.update({ where: { id }, data: { claveHash: cifrar(nueva) } })
}

export function leerToken(token: string | undefined): Usuario | null {
  if (!token) return null
  try {
    return datosDe(jwt.verify(token, env.JWT_SECRET) as Usuario)
  } catch {
    return null
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: Usuario
      /** La sucursal en que se trabaja: la del usuario o la que eligió el administrador (null = todas). */
      sucursalId?: number | null
    }
  }
}

/**
 * Quién es hoy el dueño de un token. El token dura el turno, pero si la
 * administración desactiva a alguien, le cambia el área o la sucursal, o
 * desactiva su sucursal, eso vale al toque: se consulta la base y se recuerda
 * unos segundos para no preguntar en cada pedido.
 */
const vigentes = new Map<number, { usuario: Usuario | null; hasta: number }>()

export async function usuarioVigente(id: number): Promise<Usuario | null> {
  const guardado = vigentes.get(id)
  if (!env.sinServidor && !contexto.getStore() && guardado && guardado.hasta > Date.now()) return guardado.usuario
  const u = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, nombre: true, rol: true, activo: true, sucursalId: true, sucursal: { select: { activa: true } } },
  })
  const usuario = u?.activo && u.sucursal?.activa !== false ? datosDe(u) : null
  if (!env.sinServidor && !contexto.getStore()) vigentes.set(id, { usuario, hasta: Date.now() + 15_000 })
  return usuario
}

/** Después de editar a alguien (o a su sucursal), su próxima petición ya ve los datos nuevos. */
export function olvidarSesion(id?: number) {
  if (id === undefined) vigentes.clear()
  else vigentes.delete(id)
}

/** El administrador elige qué sucursal mira con la cabecera x-sucursal; sin elegir, ve todas. */
async function sucursalElegida(req: Request): Promise<number | null> {
  const id = Number(req.headers['x-sucursal'])
  if (!Number.isInteger(id) || id <= 0) return null
  return (await leerSucursales()).some((s) => s.id === id) ? id : null
}

/** Exige sesión de alguno de los roles dados (el administrador pasa siempre). */
export function exigir(...roles: Rol[]): RequestHandler {
  return async (req, res, next) => {
    const cabecera = req.headers.authorization
    const delToken = leerToken(cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : undefined)
    const usuario = delToken && (await usuarioVigente(delToken.id))
    if (!usuario) {
      res.status(401).json({ error: 'Tu sesión terminó. Vuelve a ingresar.' })
      return
    }
    if (usuario.rol !== 'ADMIN' && roles.length > 0 && !roles.includes(usuario.rol)) {
      res.status(403).json({ error: 'Esta pantalla no es de tu área.' })
      return
    }
    req.usuario = usuario
    req.sucursalId = usuario.sucursalId ?? (await sucursalElegida(req))
    next()
  }
}

/** Mesas, cocina y caja son siempre de una sucursal: el administrador tiene que elegir cuál. */
export function sucursalDe(req: Request): number {
  if (!req.sucursalId) throw new ErrorNegocio('Elige una sucursal para trabajar en ella.')
  return req.sucursalId
}
