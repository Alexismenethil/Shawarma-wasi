import { spawnSync } from 'node:child_process'

// El frontend consulta cambios persistidos. La API lo decide con VERCEL=1.
for (const args of [['prisma', 'generate', '--config', 'backend/prisma.config.ts'], ['npm', 'run', 'build']]) {
  const [comando, ...resto] = args
  const r = spawnSync(comando === 'prisma' ? 'npx' : comando, comando === 'prisma' ? args : resto, {
    stdio: 'inherit',
    env: { ...process.env, VITE_SINCRONIZACION: 'consulta' },
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
