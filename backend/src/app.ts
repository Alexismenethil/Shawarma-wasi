import path from 'node:path'
import { existsSync } from 'node:fs'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import { env } from './env.js'
import { api } from './rutas/api.js'
import { prisma } from './db.js'
import { manejarErrores, noEncontrado } from './errores.js'

/** La web ya compilada (`npm run build`). En producción la sirve este mismo servidor. */
const WEB = path.resolve(import.meta.dirname, '..', '..', 'frontend', 'dist')

export function crearApp({ servirWeb = true } = {}) {
  const app = express()
  app.set('trust proxy', env.PROXIES)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // El socket va al mismo servidor: ws:// en el local, wss:// en internet.
          connectSrc: ["'self'", (req) => `ws://${req.headers.host}`, (req) => `wss://${req.headers.host}`],
          // En un servidor del local sin HTTPS, forzar https rompería la página.
          upgradeInsecureRequests: null,
        },
      },
    }),
  )
  app.use(cors({ origin: env.origenes, credentials: true }))
  app.use(compression())
  app.use(express.json({ limit: '200kb' }))
  app.use((_req, res, next) => {
    res.setHeader('x-robots-tag', 'noindex, nofollow')
    next()
  })

  /** Para el balanceador del hosting: responde solo si la base también responde. */
  app.get('/salud', async (_req, res) => {
    res.setHeader('cache-control', 'no-store')
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ ok: true })
    } catch {
      res.status(503).json({ ok: false })
    }
  })
  // Lo que responde la API es de quien inició sesión: ningún navegador ni proxy lo guarda.
  app.use('/api', (_req, res, next) => {
    res.setHeader('cache-control', 'no-store')
    next()
  })
  app.use('/api', api)

  if (servirWeb && env.esProduccion && existsSync(WEB)) {
    // Los archivos con hash no cambian nunca: se guardan un año. El index.html, nunca.
    app.use('/assets', express.static(path.join(WEB, 'assets'), { immutable: true, maxAge: '1y', index: false }))
    app.use(express.static(WEB, { index: false, maxAge: '1d' }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io') || path.extname(req.path)) return next()
      res.setHeader('cache-control', 'no-cache')
      res.sendFile(path.join(WEB, 'index.html'))
    })
  }

  app.use(noEncontrado)
  app.use(manejarErrores)
  return app
}
