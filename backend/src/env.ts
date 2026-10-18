import path from 'node:path'
import { config as cargarEnv } from 'dotenv'
import { z } from 'zod'

cargarEnv({ path: path.resolve(import.meta.dirname, '..', '..', '.env'), quiet: true })

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4310),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  ORIGEN_WEB: z.string().default('http://localhost:5190'),
})

const leido = esquema.safeParse(process.env)
if (!leido.success) {
  console.error('Variables de entorno inválidas:', z.prettifyError(leido.error))
  process.exit(1)
}

export const env = {
  ...leido.data,
  esProduccion: leido.data.NODE_ENV === 'production',
  /** Varios orígenes separados por coma: la tablet de cocina y el celular del mozo pueden entrar por IP. */
  origenes: leido.data.ORIGEN_WEB.split(',').map((o) => o.trim()),
}
