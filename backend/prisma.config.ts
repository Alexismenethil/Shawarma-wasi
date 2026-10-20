import path from 'node:path'
import { config as cargarEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'

// El .env vive en la raíz del monorepo, no dentro de backend/.
cargarEnv({ path: path.resolve(import.meta.dirname, '..', '.env'), quiet: true })

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` no necesita la base (se corre al instalar, incluso en
    // un build sin variables); migrar y sembrar sí, y fallan claro si falta.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
})
