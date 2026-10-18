import { guardarSesion, sesionActual } from './sesion'

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

export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; señal?: AbortSignal } = {}): Promise<T> {
  const token = sesionActual()?.token
  let respuesta: Response
  try {
    respuesta = await fetch(`${URL_API}/api${ruta}`, {
      method: opciones.metodo ?? (opciones.cuerpo === undefined ? 'GET' : 'POST'),
      headers: {
        ...(opciones.cuerpo !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
      signal: opciones.señal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ErrorApi('Sin conexión con el servidor.', 0)
  }
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) {
    if (respuesta.status === 401 && token) guardarSesion(null)
    throw new ErrorApi((datos as { error?: string }).error ?? 'Algo salió mal.', respuesta.status)
  }
  return datos as T
}

/** Baja un archivo que arma el servidor (con la sesión), como el consolidado para Excel. */
export async function descargar(ruta: string, nombre: string) {
  const token = sesionActual()?.token
  const respuesta = await fetch(`${URL_API}/api${ruta}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }).catch(() => {
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
