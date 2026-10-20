// npm test: base de pruebas limpia y todas las pruebas de la API, una por una
// (comparten la base, así que no corren en paralelo).
import path from 'node:path'
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { prepararBasePrueba } from './base-prueba.mjs'

const BACKEND = path.resolve(import.meta.dirname, '..')
const env = await prepararBasePrueba()
const archivos = readdirSync(path.join(BACKEND, 'test'))
  .filter((a) => a.endsWith('.test.ts') && (process.argv.length === 2 || process.argv.slice(2).some((f) => a.includes(f))))
  .sort()
  .map((a) => path.join('test', a))

const r = spawnSync('npx', ['tsx', '--test', '--test-concurrency=1', ...archivos], { cwd: BACKEND, env, stdio: 'inherit' })
process.exit(r.status ?? 1)
