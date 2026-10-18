import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from './env.js'

/**
 * La sesión va siempre en UTC. El adaptador escribe las fechas sin zona y
 * Postgres las interpreta en la zona de la sesión: con un servidor en hora de
 * Lima, cada venta quedaba corrida cinco horas. Los reportes convierten a Lima
 * explícitamente con `AT TIME ZONE`, así que no dependen de esto.
 *
 * Diez conexiones le sobran a un local con un par de tablets y los celulares
 * de los mozos. El `statement_timeout` convierte una consulta trabada en un
 * error en vez de dejar al salón entero esperando.
 */
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
  statement_timeout: 10_000,
  application_name: 'wasi-api',
  options: '-c TimeZone=UTC',
})

export const prisma = new PrismaClient({ adapter, log: ['warn', 'error'] })
