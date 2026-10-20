import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
config({ path: new URL('../../.env', import.meta.url), quiet: true })
if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) throw new Error('Configura DATABASE_URL (pooled) y DIRECT_URL (directa) antes de preparar el despliegue.')
const cwd = fileURLToPath(new URL('..', import.meta.url))
for (const args of [['prisma', 'migrate', 'deploy'], ...(process.argv.includes('--solo-migraciones') ? [] : [['tsx', 'prisma/seed.ts']])]) {
  const r = spawnSync('npx', args, { cwd, env: process.env, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
