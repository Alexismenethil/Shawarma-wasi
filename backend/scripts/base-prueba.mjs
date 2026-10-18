// Prepara una base de datos SOLO para pruebas: la borra, la crea de nuevo,
// aplica las migraciones y siembra la carta con PIN conocidos. Nunca toca
// una base cuyo nombre no termine en _test.
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { config as cargarEnv } from 'dotenv'
import pg from 'pg'

const BACKEND = path.resolve(import.meta.dirname, '..')
cargarEnv({ path: path.resolve(BACKEND, '..', '.env'), quiet: true })

/** PIN de prueba: no son los del local. */
export const PIN_PRUEBA = { MOZO: '4826', COCINA: '5937', ADMIN: '7048' }

function correr(comando, args, env) {
  const r = spawnSync(comando, args, { cwd: BACKEND, env, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`Falló: ${comando} ${args.join(' ')}`)
}

export async function prepararBasePrueba() {
  const origen = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!origen) throw new Error('Falta DATABASE_URL (o TEST_DATABASE_URL) para saber dónde está Postgres.')
  const prueba = new URL(origen)
  const nombre = `${prueba.pathname.slice(1).replace(/_test$/, '')}_test`
  prueba.pathname = `/${nombre}`
  if (!nombre.endsWith('_test')) throw new Error('Por seguridad, la base de pruebas debe terminar en _test.')

  const mantenimiento = new URL(prueba)
  mantenimiento.pathname = '/postgres'
  const cliente = new pg.Client({ connectionString: mantenimiento.toString() })
  await cliente.connect()
  await cliente.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`)
  await cliente.query(`CREATE DATABASE "${nombre}"`)
  await cliente.end()

  const env = {
    ...process.env,
    DATABASE_URL: prueba.toString(),
    NODE_ENV: 'test',
    JWT_SECRET: 'clave-de-prueba-que-no-sirve-en-produccion',
    ORIGEN_WEB: 'http://localhost:5190',
    SEED_PIN_MOZO: PIN_PRUEBA.MOZO,
    SEED_PIN_COCINA: PIN_PRUEBA.COCINA,
    SEED_PIN_ADMIN: PIN_PRUEBA.ADMIN,
  }
  correr('npx', ['prisma', 'migrate', 'deploy'], env)
  correr('npx', ['tsx', 'prisma/seed.ts'], env)
  return env
}
