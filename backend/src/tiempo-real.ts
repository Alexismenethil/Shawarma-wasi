import type { Server as ServidorHttp } from 'node:http'
import { Server } from 'socket.io'
import type { Cambio } from '@wasi/shared'
import { leerToken } from './servicios/auth.js'
import { env } from './env.js'
import { olvidar } from './memoria.js'

/**
 * Tiempo real.
 *
 * El servidor no manda datos por el socket, solo avisa *qué* cambió; cada
 * pantalla vuelve a pedir lo suyo por HTTP. Con 35 mesas y tres cocinas la
 * consulta cuesta milisegundos, y así es imposible que una tablet que perdió un
 * mensaje quede mostrando un estado viejo: el siguiente aviso la corrige.
 */
let io: Server | null = null

export function crearTiempoReal(servidor: ServidorHttp) {
  io = new Server(servidor, {
    cors: { origin: env.origenes, credentials: true },
    pingInterval: 20_000,
  })

  io.use((socket, next) => {
    const usuario = leerToken(socket.handshake.auth?.token as string | undefined)
    if (!usuario) return next(new Error('sin-sesion'))
    socket.data.usuario = usuario
    next()
  })

  return io
}

export function avisar(cambio: Cambio) {
  // Lo guardado en memoria deja de valer antes de que las pantallas lo pidan de nuevo.
  if (cambio.carta) olvidar('carta')
  if (cambio.ajustes) olvidar('ajustes')
  io?.emit('cambio', cambio)
}
