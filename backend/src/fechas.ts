import { ErrorNegocio } from './errores.js'

/**
 * Fechas en hora de Lima. Perú no cambia de hora (UTC−5 todo el año): el día
 * de Lima empieza a las 05:00 UTC, así que un día es un rango fijo de
 * instantes y los reportes filtran por rango (con índice) en vez de convertir
 * cada fila.
 */

export const ZONA = 'America/Lima'

/** Uno solo para todo el proceso: armar un formateador cuesta más que usarlo. */
const DIA_LIMA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA })

export function hoyEnLima(): string {
  return DIA_LIMA.format(new Date())
}

/** El día de Lima de un instante: «2026-10-18». */
export function diaEnLima(d: Date): string {
  return DIA_LIMA.format(d)
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
export function validarFecha(f: string) {
  if (!FECHA.test(f) || Number.isNaN(Date.parse(`${f}T12:00:00Z`))) throw new ErrorNegocio('Fecha inválida, se espera AAAA-MM-DD.')
  return f
}

export function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const inicioDia = (fecha: string) => new Date(`${fecha}T00:00:00-05:00`)

/** Del primer instante de `desde` al primero del día siguiente a `hasta`. */
export const rangoLima = (desde: string, hasta: string) => ({ gte: inicioDia(desde), lt: inicioDia(sumarDias(hasta, 1)) })

/** Un rango de fechas válido y razonable para un reporte. */
export function validarRango(desdeP: string, hastaP: string) {
  const desde = validarFecha(desdeP)
  const hasta = validarFecha(hastaP)
  if (hasta < desde) throw new ErrorNegocio('La fecha final es anterior a la inicial.')
  if (sumarDias(desde, 400) < hasta) throw new ErrorNegocio('El rango no puede pasar de 400 días.')
  return { desde, hasta }
}
