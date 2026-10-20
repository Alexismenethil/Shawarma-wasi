import { createServer } from 'node:http'
import { crearApp } from './app.js'
import { crearTiempoReal } from './tiempo-real.js'
import { env } from './env.js'
import { prisma } from './db.js'
import { limpiarTemporales } from './servicios/sincronizacion.js'

const servidor = createServer(crearApp())
const io = crearTiempoReal(servidor)

servidor.keepAliveTimeout = 61_000
servidor.headersTimeout = 65_000

servidor.listen(env.PORT, () => {
  console.log(`\n  Shawarma Wasi · API`)
  console.log(`  http://localhost:${env.PORT}\n`)
})

// En el servidor tradicional el mantenimiento reemplaza al cron de Vercel.
const limpiar = () => void limpiarTemporales().catch((e) => console.error('Limpieza de temporales:', e))
limpiar()
setInterval(limpiar, 6 * 3600_000).unref()

// Primero se dejan de aceptar conexiones y después se suelta la base: al revés,
// una nota a medio guardar se quedaría sin Postgres.
const cerrar = (codigo = 0) => {
  io.close()
  servidor.close(() => {
    void prisma.$disconnect().finally(() => process.exit(codigo))
  })
  setTimeout(() => process.exit(codigo), 8_000).unref()
}
process.on('SIGINT', () => cerrar())
process.on('SIGTERM', () => cerrar())
// Una promesa olvidada se anota y el servicio sigue; un error que rompió el proceso lo
// reinicia en orden (el hosting lo vuelve a levantar en segundos).
process.on('unhandledRejection', (e) => console.error('Promesa sin atender:', e))
process.on('uncaughtException', (e) => {
  console.error('Error no atrapado, se reinicia:', e)
  cerrar(1)
})
