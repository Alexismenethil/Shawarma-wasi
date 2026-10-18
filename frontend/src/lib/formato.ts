import { useEffect, useState } from 'react'

/** "46.00" — el S/ va aparte, más chico, como en una boleta. */
export const soles = (centimos: number) =>
  (centimos / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const solesCorto = (centimos: number) =>
  centimos % 100 === 0 ? (centimos / 100).toLocaleString('es-PE') : soles(centimos)

export const hora = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' })

export const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })

export const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }).replace('.', '')

export function hoyLima() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}

export function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Un reloj compartido que late cada segundo (o cada minuto, si basta). */
export function useAhora(cada = 1000) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cada)
    return () => clearInterval(t)
  }, [cada])
  return ahora
}

export function minutosDesde(iso: string, ahora: number) {
  return Math.max(0, Math.floor((ahora - Date.parse(iso)) / 60_000))
}

export function cronometro(iso: string, ahora: number) {
  const s = Math.max(0, Math.floor((ahora - Date.parse(iso)) / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Las variantes del Excel abrevian: «Fam» es familiar, «Lt» es litro. */
export const varianteLegible = (v: string) => v.replace(/ Fam$/, ' familiar').replace(/ Lt$/, ' · litro')
