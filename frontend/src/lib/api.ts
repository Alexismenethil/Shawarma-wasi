import { idAlAzar } from './azar'
import { guardarSesion, sesionActual } from './sesion'
import { sucursalPedida } from './sucursal'

/**
 * Dónde está la API. En producción el mismo servidor entrega la web y la API:
 * mismo origen, sin CORS. En desarrollo Vite corre aparte y la API está en el
 * puerto 4310 de la misma máquina (así entran también las tablets por la IP).
 * VITE_API_EXTERNA solo hace falta si la API vive en otro dominio.
 */
// Se decide por el modo de Vite (siempre «production» al compilar), no por
// NODE_ENV: un build hecho con NODE_ENV=test no debe buscar la API en el 4310.
export const URL_API =
  (import.meta.env.VITE_API_EXTERNA as string | undefined) ||
  (import.meta.env.MODE === 'development' ? `${location.protocol}//${location.hostname}:4310` : '')

export class ErrorApi extends Error {
  constructor(
    message: string,
    public estado: number,
  ) {
    super(message)
  }
}

/** La sesión y la sucursal que el administrador eligió mirar (al resto el servidor les usa la suya). */
function cabeceras(): Record<string, string> {
  const token = sesionActual()?.token
  const sucursal = sucursalPedida()
  return {
    ...(token && { authorization: `Bearer ${token}` }),
    ...(sucursal && { 'x-sucursal': String(sucursal) }),
  }
}

/** Lo más que se espera una respuesta antes de darla por perdida (el wifi se cortó a mitad). */
const LIMITE_MS = 20_000
/** Cuánto se espera antes de cada reintento automático. */
const REINTENTOS_MS = [700, 2000]
/** El servidor se está reiniciando (un deploy, una caída): se vuelve a intentar. */
const DE_PASO = new Set([502, 503, 504])
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Opciones {
  metodo?: string
  cuerpo?: unknown
  señal?: AbortSignal
  /**
   * La clave del envío. Si la respuesta se pierde, se reintenta con la misma y
   * el servidor no lo repite (idempotencia.ts). Sin clave, cada llamada lleva
   * una al azar; «Guardar» y «Cobrar» dan una propia, estable mientras lo que
   * se envía no cambie, para que tampoco se duplique si el mozo vuelve a pulsar.
   */
  clave?: string
}

/**
 * Llama a la API. Si no hay respuesta (wifi cortado, servidor reiniciándose),
 * reintenta solo, dos veces, con la misma clave: un pedido nunca llega dos
 * veces a cocina ni un cobro se anota dos veces.
 */
export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const metodo = opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST')
  const clave = metodo === 'GET' ? undefined : (opciones.clave ?? idAlAzar())
  const token = sesionActual()?.token
  const headers = cabeceras()
  for (let intento = 0; ; intento++) {
    const puedeReintentar = intento < REINTENTOS_MS.length
    if (opciones.señal?.aborted || sesionActual()?.token !== token || cabeceras()['x-sucursal'] !== headers['x-sucursal']) {
      throw new DOMException('La petición ya no corresponde a esta pantalla.', 'AbortError')
    }
    let respuesta: Response
    let datos: { error?: string; enProceso?: boolean }
    try {
      ;({ respuesta, datos } = await pedirUnaVez(`${URL_API}/api${ruta}`, metodo, opciones, clave, headers))
    } catch (e) {
      if (opciones.señal?.aborted) throw e
      if (puedeReintentar) {
        await esperar(REINTENTOS_MS[intento])
        continue
      }
      throw new ErrorApi('Sin conexión con el servidor.', 0)
    }
    // El servidor se reinicia, o la primera vez todavía se está guardando: se pregunta de nuevo.
    if (puedeReintentar && (DE_PASO.has(respuesta.status) || (respuesta.status === 409 && datos.enProceso))) {
      await esperar(REINTENTOS_MS[intento])
      continue
    }
    if (!respuesta.ok) {
      if (respuesta.status === 401 && token && sesionActual()?.token === token) guardarSesion(null)
      throw new ErrorApi(datos.error ?? 'Algo salió mal.', respuesta.status)
    }
    return datos as T
  }
}

async function pedirUnaVez(url: string, metodo: string, opciones: Opciones, clave: string | undefined, headers: Record<string, string>) {
  const limite = new AbortController()
  const reloj = setTimeout(() => limite.abort(), LIMITE_MS)
  const cortar = () => limite.abort()
  opciones.señal?.addEventListener('abort', cortar)
  try {
    const respuesta = await fetch(url, {
      method: metodo,
      headers: {
        ...(opciones.cuerpo !== undefined && { 'content-type': 'application/json' }),
        ...(clave && { 'idempotency-key': clave }),
        ...headers,
      },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
      signal: limite.signal,
      cache: 'no-store',
    })
    const datos = await respuesta.json().catch((e: unknown) => {
      if (DE_PASO.has(respuesta.status)) return {}
      throw e
    }) as { error?: string; enProceso?: boolean }
    return { respuesta, datos }
  } finally {
    clearTimeout(reloj)
    opciones.señal?.removeEventListener('abort', cortar)
  }
}

/** Baja un archivo que arma el servidor (con la sesión), como el consolidado para Excel. */
export async function descargar(ruta: string, nombre: string) {
  const respuesta = await fetch(`${URL_API}/api${ruta}`, { headers: cabeceras() }).catch(() => {
    throw new ErrorApi('Sin conexión con el servidor.', 0)
  })
  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => ({}))
    throw new ErrorApi((datos as { error?: string }).error ?? 'No se pudo descargar.', respuesta.status)
  }
  const url = URL.createObjectURL(await respuesta.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
