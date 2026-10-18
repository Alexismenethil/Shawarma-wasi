import { createServer } from 'node:http'
import { crearApp } from './app.js'
import { crearTiempoReal } from './tiempo-real.js'
import { env } from './env.js'
import { prisma } from './db.js'

const servidor = createServer(crearApp())
const io = crearTiempoReal(servidor)

servidor.keepAliveTimeout = 61_000
servidor.headersTimeout = 65_000

servidor.listen(env.PORT, () => {
  console.log(`\n  Shawarma Wasi · API`)
  console.log(`  http://localhost:${env.PORT}\n`)
})

// Primero se dejan de aceptar conexiones y después se suelta la base: al revés,
// una nota a medio guardar se quedaría sin Postgres.
const cerrar = () => {
  io.close()
  servidor.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0))
  })
  setTimeout(() => process.exit(0), 8_000).unref()
}
process.on('SIGINT', cerrar)
process.on('SIGTERM', cerrar)
