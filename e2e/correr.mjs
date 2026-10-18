// npm run test:e2e: base de pruebas limpia, build de producción y Playwright.
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { prepararBasePrueba } from '../backend/scripts/base-prueba.mjs'

const RAIZ = path.resolve(import.meta.dirname, '..')
const env = await prepararBasePrueba()

const paso = (comando, args, extra = {}) => {
  const r = spawnSync(comando, args, { cwd: RAIZ, env: { ...env, ...extra }, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

// La misma web y API que se despliegan.
paso('npm', ['run', 'build'], { NODE_ENV: 'production' })
paso('npx', ['playwright', 'test', '--config', 'e2e/playwright.config.ts', ...process.argv.slice(2)])
