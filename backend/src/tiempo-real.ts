import type { Server as ServidorHttp } from 'node:http'
import { Server } from 'socket.io'
import type { Cambio, Usuario } from '@wasi/shared'
import { leerToken, usuarioVigente } from './servicios/auth.js'
import { env } from './env.js'
import { olvidar } from './memoria.js'
import { companeras, nombreDe } from './servicios/cocina-compartida.js'
import { contexto, type AvisoPendiente } from './contexto.js'

/**
 * Tiempo real.
 *
 * El servidor no manda datos por el socket, solo avisa *qué* cambió; cada
 * pantalla vuelve a pedir lo suyo por HTTP. Con 35 mesas y tres cocinas la
 * consulta cuesta milisegundos, y así es imposible que una tablet que perdió un
 * mensaje quede mostrando un estado viejo: el siguiente aviso la corrige.
 *
 * Cada sucursal es una sala: lo que pasa en una no despierta a las tablets de
 * la otra (salvo la cocina que comparten, ver abajo). El administrador escucha
 * la sucursal que eligió, o todas.
 */
let io: Server | null = null

export function crearTiempoReal(servidor: ServidorHttp) {
  io = new Server(servidor, {
    cors: { origin: env.origenes, credentials: true },
    pingInterval: 20_000,
    // Las pantallas no le mandan nada al servidor por el socket: solo escuchan.
    maxHttpBufferSize: 10_000,
  })

  io.use(async (socket, next) => {
    const datos = leerToken(socket.handshake.auth?.token as string | undefined)
    const usuario = datos && (await usuarioVigente(datos.id).catch(() => null))
    if (!usuario) return next(new Error('sin-sesion'))
    socket.data.usuario = usuario
    next()
  })

  io.on('connection', (socket) => {
    const usuario = socket.data.usuario as Usuario
    const elegida = Number(socket.handshake.auth?.sucursal)
    const sala = usuario.sucursalId ?? (Number.isInteger(elegida) && elegida > 0 ? elegida : null)
    void socket.join(sala ? `s:${sala}` : 'todas')
  })

  return io
}

/** Avisa un cambio a las pantallas de una sucursal (y a quien mira todas), o a todas si es de la carta o del negocio. */
export function avisar(cambio: Cambio, sucursalId?: number) {
  // Lo guardado en memoria deja de valer antes de que las pantallas lo pidan de nuevo.
  if (cambio.carta) olvidar('carta')
  if (cambio.ajustes) olvidar('ajustes', 'sucursales')
  const peticion = contexto.getStore()
  if (peticion) {
    peticion.avisos.push({ cambio, sucursalId })
    return
  }
  if (!io) return
  if (!sucursalId) {
    io.emit('cambio', cambio)
    return
  }
  io.to([`s:${sucursalId}`, 'todas']).emit('cambio', cambio)
  if (cambio.cocina) void avisarCocinaCompartida(cambio, sucursalId).catch(() => {})
}

/** Solo se publica después del COMMIT: las pantallas ya pueden leer lo guardado. */
export function emitirConfirmados(avisos: AvisoPendiente[]) {
  for (const { cambio, sucursalId, soloSucursal } of avisos) {
    // Una lectura concurrente pudo volver a cachear la versión anterior
    // mientras la transacción todavía estaba abierta.
    if (cambio.carta) olvidar('carta')
    if (cambio.ajustes) olvidar('ajustes', 'sucursales')
    if (!sucursalId) io?.emit('cambio', cambio)
    else io?.to(soloSucursal ? `s:${sucursalId}` : [`s:${sucursalId}`, 'todas']).emit('cambio', cambio)
  }
}

/**
 * Cocina compartida: lo que cambia en las comandas de una sucursal lo ve
 * también la pantalla de cocina de la otra. A esa sala le llega solo «cocina»
 * (sus mesas y su caja no cambiaron, y el «listo» es para los mozos de aquí),
 * y el pedido nuevo con las estaciones que comparten y el nombre del local:
 * así suena solo en la cocina que lo prepara.
 */
async function avisarCocinaCompartida(cambio: Cambio, sucursalId: number) {
  const otras = await companeras(sucursalId)
  if (!otras.length) return
  const local = await nombreDe(sucursalId)
  for (const o of otras) {
    const nuevo = cambio.aviso?.tipo === 'nuevo' ? cambio.aviso : null
    const estaciones = nuevo ? nuevo.estaciones.filter((e) => o.estaciones.includes(e)) : []
    const aviso: Cambio['aviso'] = nuevo && estaciones.length ? { tipo: 'nuevo', mesa: `${nuevo.mesa} · ${local}`, estaciones } : undefined
    io?.to(`s:${o.id}`).emit('cambio', { cocina: true, ...(aviso && { aviso }) } satisfies Cambio)
  }
}
