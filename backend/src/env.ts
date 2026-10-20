import path from 'node:path'
import { config as cargarEnv } from 'dotenv'
import { z } from 'zod'

cargarEnv({ path: path.resolve(import.meta.dirname, '..', '..', '.env'), quiet: true })

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4310),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  SINCRONIZACION: z.enum(['socket', 'consulta']).default(process.env.VERCEL === '1' ? 'consulta' : 'socket'),
  DB_CONEXIONES: z.coerce.number().int().min(1).max(10).default(process.env.VERCEL === '1' ? 2 : 10),
  CRON_SECRET: z.string().min(32).optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  ORIGEN_WEB: z.string().default('http://localhost:5190'),
  /**
   * Cuántos proxies hay delante del servidor (Render, Railway, Fly: 1). Con eso
   * se sabe la IP real de quien se equivoca de PIN. En una PC del local sin
   * proxy va 0: si no, cualquiera podría inventar su IP y saltarse el freno.
   */
  PROXIES: z.coerce.number().int().min(0).max(5).default(1),
})

const leido = esquema.safeParse(process.env)
if (!leido.success) {
  console.error('Variables de entorno inválidas:', z.prettifyError(leido.error))
  process.exit(1)
}
if (process.env.VERCEL === '1' && leido.data.SINCRONIZACION !== 'consulta') {
  console.error('En Vercel se requiere SINCRONIZACION=consulta para sincronizar entre instancias.')
  process.exit(1)
}
// Con la firma de ejemplo (o una corta), cualquiera podría fabricar una sesión de administrador.
if (leido.data.NODE_ENV === 'production' && (leido.data.JWT_SECRET.length < 32 || leido.data.JWT_SECRET.startsWith('cambia-esto'))) {
  console.error('En producción, JWT_SECRET tiene que ser una cadena al azar de al menos 32 caracteres (ver .env.example).')
  process.exit(1)
}

export const env = {
  ...leido.data,
  esProduccion: leido.data.NODE_ENV === 'production',
  sinServidor: leido.data.SINCRONIZACION === 'consulta',
  /** Varios orígenes separados por coma: la tablet de cocina y el celular del mozo pueden entrar por IP. */
  origenes: leido.data.ORIGEN_WEB.split(',').map((o) => o.trim()),
}
