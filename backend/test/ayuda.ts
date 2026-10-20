import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import type { Cambio, Carta, EstadoCaja } from '@wasi/shared'
import { crearApp } from '../src/app.js'
import { crearTiempoReal } from '../src/tiempo-real.js'
import { prisma } from '../src/db.js'

/**
 * Lo común a todas las pruebas: levantar la API en un puerto libre contra la
 * base de pruebas (la prepara scripts/probar.mjs) y llamarla como lo haría
 * la web: mozo, cocina y caja con su PIN en su sucursal; el administrador con
 * usuario y contraseña.
 */

export const PIN = {
  MOZO: process.env.SEED_PIN_MOZO!,
  COCINA: process.env.SEED_PIN_COCINA!,
  CAJA: process.env.SEED_PIN_CAJA!,
}

/** Los PIN que la semilla da en cada sucursal: la 1, los del .env; las demás, SEED_PINES_OTRAS de tres en tres. */
export function pinesDe(sucursalId: number): typeof PIN {
  if (sucursalId === 1) return PIN
  const otros = (process.env.SEED_PINES_OTRAS ?? '').split(',')
  const i = (sucursalId - 2) * 3
  return { MOZO: otros[i], COCINA: otros[i + 1], CAJA: otros[i + 2] }
}

export const ADMIN = { usuario: process.env.SEED_ADMIN_USUARIO!, clave: process.env.SEED_ADMIN_CLAVE! }

export interface Respuesta<T = any> {
  estado: number
  datos: T
  texto: string
  cabeceras: Headers
}

export class Cliente {
  constructor(
    public url: string,
    public token?: string,
    /** La sucursal que mira el administrador (cabecera x-sucursal); al resto no le aplica. */
    public sucursal?: number,
  ) {}

  /** El mismo usuario mirando otra sucursal, o todas (null). */
  en(sucursal: number | null) {
    return new Cliente(this.url, this.token, sucursal ?? undefined)
  }

  async pedir<T = any>(metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<Respuesta<T>> {
    const r = await fetch(`${this.url}${ruta}`, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined && { 'content-type': 'application/json' }),
        ...(this.token && { authorization: `Bearer ${this.token}` }),
        ...(this.sucursal && { 'x-sucursal': String(this.sucursal) }),
        ...cabeceras,
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
    const texto = await r.text()
    let datos: any = null
    try {
      datos = JSON.parse(texto)
    } catch {
      datos = null
    }
    return { estado: r.status, datos, texto, cabeceras: r.headers }
  }

  get = <T = any>(ruta: string) => this.pedir<T>('GET', `/api${ruta}`)
  post = <T = any>(ruta: string, cuerpo: unknown = {}) => this.pedir<T>('POST', `/api${ruta}`, cuerpo)
  patch = <T = any>(ruta: string, cuerpo: unknown) => this.pedir<T>('PATCH', `/api${ruta}`, cuerpo)
  put = <T = any>(ruta: string, cuerpo: unknown) => this.pedir<T>('PUT', `/api${ruta}`, cuerpo)
  delete = <T = any>(ruta: string) => this.pedir<T>('DELETE', `/api${ruta}`)
}

/** Levanta la API para el archivo de pruebas y la apaga al final. */
export function conApi() {
  const estado: { url: string; servidor?: Server; tiempoReal?: ReturnType<typeof crearTiempoReal> } = { url: '' }
  before(async () => {
    const servidor = createServer(crearApp())
    estado.tiempoReal = crearTiempoReal(servidor)
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
    estado.servidor = servidor
    estado.url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
  })
  after(async () => {
    // Las tablets de prueba que sigan escuchando se desconectan; cerrar el tiempo real apaga también el servidor.
    for (const s of sockets) s.disconnect()
    await new Promise((r) => (estado.tiempoReal ? estado.tiempoReal.close(r) : estado.servidor?.close(r)))
    await prisma.$disconnect()
  })
  return estado
}

let ipFalsa = 1
/** Cada inicio de sesión desde una «IP» distinta, para que el freno de intentos de una prueba no toque a otra. */
export const otraIp = () => {
  const n = ipFalsa++
  return `10.${process.pid % 250}.${Math.floor(n / 250) % 250}.${(n % 250) + 1}`
}

/** Entra como lo haría el personal: su área, su sucursal y su PIN. El administrador entra con usuario y contraseña. */
export async function ingresar(url: string, rol: 'MOZO' | 'COCINA' | 'CAJA' | 'ADMIN', pin?: string, sucursalId = 1) {
  if (rol === 'ADMIN') return entrar(url, ADMIN.usuario, ADMIN.clave)
  const r = await new Cliente(url).pedir('POST', '/api/auth/ingresar', { area: rol, sucursalId, pin: pin ?? pinesDe(sucursalId)[rol] }, { 'x-forwarded-for': otraIp() })
  if (r.estado !== 200) throw new Error(`No se pudo ingresar como ${rol}: ${r.estado} ${r.texto}`)
  return new Cliente(url, r.datos.token)
}

/** Usuario y contraseña (encargada o administrador). El administrador queda mirando la sucursal 1, salvo que se pida otra. */
export async function entrar(url: string, usuario: string, clave: string, sucursal: number | null = 1) {
  const r = await new Cliente(url).pedir('POST', '/api/auth/entrar', { usuario, clave }, { 'x-forwarded-for': otraIp() })
  if (r.estado !== 200) throw new Error(`No se pudo entrar como ${usuario}: ${r.estado} ${r.texto}`)
  return new Cliente(url, r.datos.token, r.datos.usuario.rol === 'ADMIN' ? (sucursal ?? undefined) : undefined)
}

/** Deja la caja de la sucursal abierta (con el fondo que se diga), para poder cobrar. */
export async function cajaAbierta(caja: Cliente, montoInicial = 0): Promise<EstadoCaja> {
  const estado = (await caja.get<EstadoCaja>('/caja')).datos
  if (estado.abierta) return estado
  const r = await caja.post<EstadoCaja>('/caja/abrir', { montoInicial })
  assert.equal(r.estado, 200, r.texto)
  return r.datos
}

/** Escucha el tiempo real como una tablet con esa sesión: guarda cada cambio que le llega. */
const sockets = new Set<Socket>()

export async function escuchar(cliente: Cliente) {
  const socket = io(cliente.url, { auth: { token: cliente.token, sucursal: cliente.sucursal }, transports: ['websocket'], forceNew: true, reconnection: false })
  sockets.add(socket)
  const cambios: Cambio[] = []
  socket.on('cambio', (c: Cambio) => cambios.push(c))
  await new Promise<void>((listo, fallo) => {
    socket.once('connect', () => listo())
    socket.once('connect_error', fallo)
  })
  return {
    cambios,
    /** Espera hasta que llegue un cambio que cumpla la condición (o falla a los 2 s). */
    async esperar(condicion: (c: Cambio) => boolean) {
      for (let t = 0; t < 40; t++) {
        const c = cambios.find(condicion)
        if (c) return c
        await new Promise((r) => setTimeout(r, 50))
      }
      throw new Error(`No llegó el aviso esperado. Llegaron: ${JSON.stringify(cambios)}`)
    },
    olvidar: () => cambios.splice(0),
    cerrar: () => {
      socket.disconnect()
      sockets.delete(socket)
    },
  }
}

/** Atajos sobre la carta sembrada. */
export function enCarta(carta: Carta) {
  const familia = (clave: string) => {
    const f = carta.familias.find((x) => x.clave === clave)
    if (!f) throw new Error(`No está la familia ${clave}`)
    return f
  }
  const producto = (clave: string, variante: string) => {
    const p = familia(clave).productos.find((x) => x.variante === variante)
    if (!p) throw new Error(`No está ${clave} ${variante}`)
    return p
  }
  const adicional = (nombre: string) => {
    const a = carta.adicionales.find((x) => x.nombre === nombre)
    if (!a) throw new Error(`No está el adicional ${nombre}`)
    return a
  }
  return { familia, producto, adicional }
}

/** El id de una mesa por su código (M1, L3), en la sucursal de quien pregunta. */
export async function mesa(cliente: Cliente, codigo: string): Promise<number> {
  const r = await cliente.get<{ id: number; numero: number; tipo: string }[]>('/mesas')
  const tipo = codigo[0] === 'L' ? 'LLEVAR' : 'SALON'
  const m = r.datos.find((x) => x.tipo === tipo && x.numero === Number(codigo.slice(1)))
  if (!m) throw new Error(`No existe la mesa ${codigo}`)
  return m.id
}

export const linea = (productoId: number, extra: Record<string, unknown> = {}) => ({
  productoId,
  cantidad: 1,
  adicionales: [] as number[],
  detalle: null as string | null,
  paraLlevar: false,
  observacion: null as string | null,
  ...extra,
})
