/**
 * Lo que todas las pantallas piden a cada rato y casi nunca cambia —la carta
 * y los datos del local— se calcula una vez y se guarda en memoria. Cuando
 * Administración cambia algo, `avisar` lo olvida y la siguiente consulta lo
 * vuelve a leer. Hay un solo proceso de API, así que basta un Map.
 */
const guardado = new Map<string, Promise<unknown>>()

export function recordar<T>(clave: string, calcular: () => Promise<T>): Promise<T> {
  let valor = guardado.get(clave) as Promise<T> | undefined
  if (!valor) {
    valor = calcular()
    guardado.set(clave, valor)
    // Un error no se recuerda: la próxima vez se vuelve a intentar.
    valor.catch(() => guardado.get(clave) === valor && guardado.delete(clave))
  }
  return valor
}

export function olvidar(...claves: string[]) {
  for (const c of claves) guardado.delete(c)
}
