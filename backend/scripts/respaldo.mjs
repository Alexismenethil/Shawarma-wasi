// npm run db:respaldo — copia completa de la base (la de DATABASE_URL) en
// respaldos/wasi-AAAA-MM-DD-HHMM.dump, en esta máquina. Usa pg_dump si está
// instalado; si no, el de Docker (postgres:17, la misma versión que Neon).
//
// Para producción, desde tu máquina:
//   DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require" npm run db:respaldo
// Para volver a un respaldo (¡reemplaza lo que haya en esa base!):
//   pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" respaldos/wasi-….dump
import path from 'node:path'
import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { config as cargarEnv } from 'dotenv'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
cargarEnv({ path: path.join(RAIZ, '.env'), quiet: true })
const url = process.env.DATABASE_URL
if (!url) throw new Error('Falta DATABASE_URL')

const ahora = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }).format(new Date())
const carpeta = path.join(RAIZ, 'respaldos')
mkdirSync(carpeta, { recursive: true })
const archivo = path.join(carpeta, `wasi-${ahora.replace(' ', '-').replace(':', '')}.dump`)

// Sin pg_dump en la máquina, el de un contenedor (desde Docker, «localhost» es la máquina misma).
const local = spawnSync('pg_dump', ['--version'], { stdio: 'ignore' }).status === 0
const [comando, args] = local
  ? ['pg_dump', ['-Fc', '--no-owner', url]]
  : ['docker', ['run', '--rm', '--network', 'host', 'postgres:17', 'pg_dump', '-Fc', '--no-owner', url.replace('@localhost:', '@host.docker.internal:')]]

console.log(`\n  Respaldo de la base con ${local ? 'pg_dump' : 'Docker (postgres:17)'}…`)
const salida = createWriteStream(archivo)
const proceso = spawn(comando, args, { stdio: ['ignore', 'pipe', 'inherit'] })
proceso.stdout.pipe(salida)
// Termina cuando pg_dump terminó y el archivo quedó escrito en el disco.
const [codigo] = await Promise.all([new Promise((listo) => proceso.on('close', listo)), new Promise((listo) => salida.on('finish', listo))])
if (codigo !== 0) {
  console.error('  No se pudo hacer el respaldo.')
  rmSync(archivo, { force: true })
  process.exit(typeof codigo === 'number' ? codigo : 1)
}
console.log(`  Listo: ${path.relative(RAIZ, archivo)} (${(statSync(archivo).size / 1024).toFixed(0)} KB)\n`)
