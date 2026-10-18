import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before } from 'node:test'
import type { Carta, Rol } from '@wasi/shared'
import { crearApp } from '../src/app.js'
import { crearTiempoReal } from '../src/tiempo-real.js'
import { prisma } from '../src/db.js'

/**
 * Lo común a todas las pruebas: levantar la API en un puerto libre contra la
 * base de pruebas (la prepara scripts/probar.mjs) y llamarla como lo haría
 * la web, con el PIN de cada área.
 */

export const PIN = {
  MOZO: process.env.SEED_PIN_MOZO!,
  COCINA: process.env.SEED_PIN_COCINA!,
  ADMIN: process.env.SEED_PIN_ADMIN!,
}

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
  ) {}

  async pedir<T = any>(metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<Respuesta<T>> {
    const r = await fetch(`${this.url}${ruta}`, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined && { 'content-type': 'application/json' }),
        ...(this.token && { authorization: `Bearer ${this.token}` }),
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
  const estado: { url: string; servidor?: Server } = { url: '' }
  before(async () => {
    const servidor = createServer(crearApp())
    crearTiempoReal(servidor)
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
    estado.servidor = servidor
    estado.url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
  })
  after(async () => {
    await new Promise((r) => estado.servidor?.close(r))
    await prisma.$disconnect()
  })
  return estado
}

let ipFalsa = 1
/** Cada inicio de sesión desde una «IP» distinta, para que el freno de intentos de una prueba no toque a otra. */
export async function ingresar(url: string, rol: Rol, pin = PIN[rol]) {
  const r = await new Cliente(url).pedir('POST', '/api/auth/ingresar', { rol, pin }, { 'x-forwarded-for': `10.0.0.${ipFalsa++}` })
  if (r.estado !== 200) throw new Error(`No se pudo ingresar como ${rol}: ${r.estado} ${r.texto}`)
  return new Cliente(url, r.datos.token)
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

/** El id de una mesa por su código (M1, L3). */
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
