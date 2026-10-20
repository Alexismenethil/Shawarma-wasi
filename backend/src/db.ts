import { PrismaClient, type Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { env } from './env.js'
import { contexto } from './contexto.js'

// UTC y JIT se fijan en la base (migración): también funciona -pooler de Neon.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_CONEXIONES,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10_000,
  application_name: 'wasi-api',
})
pool.on('error', (error) => console.error('Conexión inactiva de Postgres:', error.message))

const cliente = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }), log: ['warn', 'error'] })

/** Operación, avisos y respuesta de reintento se confirman o revierten juntos. */
export const prisma = new Proxy(cliente, {
  get(base, propiedad) {
    const tx = contexto.getStore()?.tx
    if (tx && propiedad === '$transaction') {
      return async (trabajo: ((tx: Prisma.TransactionClient) => Promise<unknown>) | Promise<unknown>[]) => {
        if (typeof trabajo === 'function') return trabajo(tx)
        const resultados = []
        for (const paso of trabajo) resultados.push(await paso)
        return resultados
      }
    }
    const origen = tx && propiedad in tx ? tx : base
    const valor = Reflect.get(origen, propiedad)
    return typeof valor === 'function' ? valor.bind(origen) : valor
  },
})

export function enTransaccion<T>(trabajo: () => Promise<T>) {
  return cliente.$transaction(async (tx) => {
    // SET LOCAL es compatible con PgBouncer y no pasa a la siguiente petición.
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'")
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
    await tx.$executeRawUnsafe("SET LOCAL idle_in_transaction_session_timeout = '25s'")
    return contexto.run({ tx, avisos: [] }, trabajo)
  }, {
    maxWait: 10_000,
    timeout: 20_000,
    isolationLevel: 'ReadCommitted',
  })
}
