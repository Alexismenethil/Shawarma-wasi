import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas de punta a punta en Chrome, contra el build de producción servido
 * por un solo servidor (igual que en el despliegue) y la base de pruebas.
 * Se corren con `npm run test:e2e`, que prepara todo eso antes.
 */
const PUERTO = 4399
const vercel = process.env.PRUEBA_VERCEL === '1'

export default defineConfig({
  testDir: '.',
  outputDir: 'resultados',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    // El Chrome instalado en la máquina: no hace falta bajar navegadores.
    channel: 'chrome',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', testIgnore: /celular/, use: { viewport: { width: 1366, height: 900 } } },
    { name: 'celular', testMatch: /celular/, use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: vercel ? 'node e2e/servidor-vercel.mjs' : 'node backend/dist/index.js',
    cwd: '..',
    url: `http://localhost:${PUERTO}/salud`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: String(PUERTO), NODE_ENV: 'production', SINCRONIZACION: vercel ? 'consulta' : 'socket' },
  },
})
