// Emula el CDN y distribuye cada petición entre dos procesos sin sockets.
// Importa el mismo api/index.js que se empaqueta para Vercel.
import { createServer, request } from 'node:http'
import { fork } from 'node:child_process'
import { readFileSync } from 'node:fs'
import express from 'express'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)))
const puerto = Number(process.env.PORT ?? 4399)
let instancias = []
let turno = 0
let detenido = false

async function iniciar() {
  const hijo = fork(new URL('./funcion-vercel.mjs', import.meta.url), [], {
    env: { ...process.env, VERCEL: '1', SINCRONIZACION: 'consulta', DB_CONEXIONES: '2' },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  const puerto = await new Promise((resolve, reject) => {
    hijo.once('message', (m) => resolve(m.puerto))
    hijo.once('exit', (codigo) => reject(new Error(`La función terminó: ${codigo}`)))
  })
  return { hijo, puerto }
}
async function apagar() {
  const viejas = instancias
  instancias = []
  await Promise.all(viejas.map(({ hijo }) => new Promise((r) => { hijo.once('exit', r); hijo.kill('SIGKILL') })))
}
async function arrancar() { instancias = await Promise.all([iniciar(), iniciar()]) }
await arrancar()

const app = express()
app.use((req, res, next) => {
  for (const regla of config.headers) {
    const aplica = regla.source === '/(.*)' || (regla.source.startsWith('/api/') && req.path.startsWith('/api/')) || (regla.source.startsWith('/assets/') && req.path.startsWith('/assets/')) || regla.source === req.path
    if (aplica) for (const { key, value } of regla.headers) res.setHeader(key, value)
  }
  next()
})
// Exclusivo del emulador de pruebas, nunca forma parte de api/index.js.
app.post('/__pruebas/pausar', async (_req, res) => { detenido = true; await apagar(); res.json({ ok: true }) })
app.post('/__pruebas/reanudar', async (_req, res) => { await arrancar(); detenido = false; res.json({ ok: true }) })
app.post('/__pruebas/reiniciar', async (_req, res) => { await apagar(); await arrancar(); res.json({ ok: true }) })
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') && req.path !== '/salud') return next()
  if (detenido || !instancias.length) return void res.status(503).json({ error: 'Reiniciando.' })
  const elegida = instancias[turno++ % instancias.length]
  const reenviada = request({ hostname: '127.0.0.1', port: elegida.puerto, path: req.originalUrl, method: req.method, headers: {
    ...req.headers,
    'x-vercel-forwarded-for': req.socket.remoteAddress,
  } }, (respuesta) => {
    res.writeHead(respuesta.statusCode, respuesta.headers)
    respuesta.pipe(res)
  })
  reenviada.on('error', () => { if (!res.headersSent) res.status(503).json({ error: 'Reiniciando.' }); else res.destroy() })
  req.on('aborted', () => reenviada.destroy())
  req.pipe(reenviada)
})
app.use(express.static(new URL('../frontend/dist', import.meta.url).pathname, { index: false }))
app.get('/{*ruta}', (_req, res) => { res.setHeader('cache-control', 'no-cache'); res.sendFile(new URL('../frontend/dist/index.html', import.meta.url).pathname) })
const servidor = createServer(app)
servidor.listen(puerto, '127.0.0.1')
const cerrar = () => { void apagar().finally(() => servidor.close(() => process.exit(0))) }
process.on('SIGTERM', cerrar)
process.on('SIGINT', cerrar)
