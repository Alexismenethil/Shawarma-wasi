import { createHmac } from 'node:crypto'
import { prisma } from '../db.js'
import { env } from '../env.js'
import { ErrorNegocio } from '../errores.js'

const claveDe = (llave: string) => createHmac('sha256', env.JWT_SECRET).update(llave).digest('hex')

/** Postgres comparte el bloqueo entre instancias. No se persisten IP ni usuarios. */
export async function comprobarAcceso(llave: string) {
  const r = await prisma.intentoAcceso.findUnique({ where: { clave: claveDe(llave) } })
  if (r?.hasta && r.hasta.getTime() > Date.now()) {
    throw new ErrorNegocio(`Demasiados intentos. Espera ${Math.ceil((r.hasta.getTime() - Date.now()) / 1000)} s.`, 429)
  }
}

export async function registrarFallo(llave: string) {
  const clave = claveDe(llave)
  // Un solo UPSERT: dos instancias concurrentes no pierden incrementos.
  await prisma.$executeRaw`
    INSERT INTO "IntentoAcceso" (clave, fallos, ultimo) VALUES (${clave}, 1, NOW())
    ON CONFLICT (clave) DO UPDATE SET
      fallos = CASE WHEN "IntentoAcceso".ultimo < NOW() - INTERVAL '15 minutes' THEN 1 ELSE "IntentoAcceso".fallos + 1 END,
      hasta = CASE WHEN "IntentoAcceso".ultimo >= NOW() - INTERVAL '15 minutes' AND "IntentoAcceso".fallos >= 4 THEN NOW() + INTERVAL '1 minute' ELSE NULL END,
      ultimo = NOW()`
}

export async function borrarFallos(llave: string) {
  await prisma.intentoAcceso.deleteMany({ where: { clave: claveDe(llave) } })
}
