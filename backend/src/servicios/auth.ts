import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { RequestHandler } from 'express'
import type { Rol, Usuario } from '@wasi/shared'
import { prisma } from '../db.js'
import { env } from '../env.js'
import { ErrorNegocio } from '../errores.js'

/**
 * Acceso por PIN.
 *
 * En el local nadie escribe usuario y contraseña con las manos sucias: cada
 * área tiene su PIN y la tablet recuerda la sesión durante el turno. El PIN se
 * guarda con scrypt (viene con Node, sin binarios que compilar en el servidor).
 */

export function cifrarPin(pin: string): string {
  const sal = randomBytes(16)
  const hash = scryptSync(pin, sal, 32)
  return `${sal.toString('hex')}:${hash.toString('hex')}`
}

export function pinCorrecto(pin: string, guardado: string): boolean {
  const [salHex, hashHex] = guardado.split(':')
  if (!salHex || !hashHex) return false
  const esperado = Buffer.from(hashHex, 'hex')
  const calculado = scryptSync(pin, Buffer.from(salHex, 'hex'), esperado.length)
  return timingSafeEqual(esperado, calculado)
}

/**
 * Un PIN de cuatro cifras se adivina en diez mil intentos; con este freno son
 * días. Se lleva en memoria porque hay un solo proceso de API.
 */
const intentos = new Map<string, { fallos: number; hasta: number }>()
const MAX_FALLOS = 5
const BLOQUEO_MS = 60_000

export async function ingresar(rol: Rol, pin: string, ip: string) {
  const llave = `${ip}:${rol}`
  const registro = intentos.get(llave)
  if (registro && registro.hasta > Date.now()) {
    const segundos = Math.ceil((registro.hasta - Date.now()) / 1000)
    throw new ErrorNegocio(`Demasiados intentos. Espera ${segundos} s.`, 429)
  }

  // El administrador puede entrar a cualquier área con su propio PIN.
  const candidatos = await prisma.usuario.findMany({
    where: { activo: true, rol: { in: rol === 'ADMIN' ? ['ADMIN'] : [rol, 'ADMIN'] } },
  })
  const usuario = candidatos.find((u) => pinCorrecto(pin, u.pinHash))

  if (!usuario) {
    const fallos = (registro?.fallos ?? 0) + 1
    intentos.set(llave, { fallos, hasta: fallos >= MAX_FALLOS ? Date.now() + BLOQUEO_MS : 0 })
    throw new ErrorNegocio('PIN incorrecto.', 401)
  }

  intentos.delete(llave)
  const datos: Usuario = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol }
  const token = jwt.sign(datos, env.JWT_SECRET, { expiresIn: '14h' })
  return { token, usuario: datos }
}

export function leerToken(token: string | undefined): Usuario | null {
  if (!token) return null
  try {
    const datos = jwt.verify(token, env.JWT_SECRET) as Usuario
    return { id: datos.id, nombre: datos.nombre, rol: datos.rol }
  } catch {
    return null
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: Usuario
    }
  }
}

/**
 * Quién es hoy el dueño de un token. El token dura el turno, pero si la
 * administración desactiva a alguien o le cambia el área, eso vale al toque:
 * se consulta la base y se recuerda unos segundos para no preguntar en cada
 * pedido.
 */
const vigentes = new Map<number, { usuario: Usuario | null; hasta: number }>()

async function usuarioVigente(id: number): Promise<Usuario | null> {
  const guardado = vigentes.get(id)
  if (guardado && guardado.hasta > Date.now()) return guardado.usuario
  const u = await prisma.usuario.findUnique({ where: { id }, select: { id: true, nombre: true, rol: true, activo: true } })
  const usuario = u?.activo ? { id: u.id, nombre: u.nombre, rol: u.rol } : null
  vigentes.set(id, { usuario, hasta: Date.now() + 15_000 })
  return usuario
}

/** Después de editar a alguien, su próxima petición ya ve los datos nuevos. */
export function olvidarSesion(id: number) {
  vigentes.delete(id)
}

/** Exige sesión de alguno de los roles dados (el administrador pasa siempre). */
export function exigir(...roles: Rol[]): RequestHandler {
  return async (req, res, next) => {
    const cabecera = req.headers.authorization
    const delToken = leerToken(cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : undefined)
    const usuario = delToken && (await usuarioVigente(delToken.id))
    if (!usuario) {
      res.status(401).json({ error: 'Tu sesión terminó. Ingresa tu PIN otra vez.' })
      return
    }
    if (usuario.rol !== 'ADMIN' && roles.length > 0 && !roles.includes(usuario.rol)) {
      res.status(403).json({ error: 'Esta pantalla no es de tu área.' })
      return
    }
    req.usuario = usuario
    next()
  }
}
