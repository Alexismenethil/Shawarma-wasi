import { env } from './env.js'
import { contexto } from './contexto.js'

/**
 * Lo que todas las pantallas piden a cada rato y casi nunca cambia —la carta
 * y los datos del local— se calcula una vez y se guarda en memoria. Cuando
 * Administración cambia algo, `avisar` lo olvida y la siguiente consulta lo
 * vuelve a leer. Hay un solo proceso de API, así que basta un Map.
 */
const guardado = new Map<string, Promise<unknown>>()

export function recordar<T>(clave: string, calcular: () => Promise<T>): Promise<T> {
  // Vercel no comparte memoria. Los datos sin confirmar tampoco se cachean.
  if (env.sinServidor || contexto.getStore()) return calcular()
  let valor = guardado.get(clave) as Promise<T> | undefined
  if (!valor) {
    valor = calcular()
    guardado.set(clave, valor)
    // Un error no se recuerda: la próxima vez se vuelve a intentar.
    valor.catch(() => guardado.get(clave) === valor && guardado.delete(clave))
  }
  return valor
}

/** Olvida cada clave y las que cuelgan de ella: «carta» se lleva también «carta:2». */
export function olvidar(...claves: string[]) {
  for (const k of [...guardado.keys()]) {
    if (claves.some((c) => k === c || k.startsWith(`${c}:`))) guardado.delete(k)
  }
}
