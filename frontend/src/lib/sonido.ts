/**
 * Avisos sonoros hechos con WebAudio: nada que descargar, y suenan igual en
 * cualquier tablet. El navegador exige un toque antes del primer sonido; el
 * teclado del PIN ya cuenta como ese toque.
 */
let ctx: AudioContext | null = null
let silencio = false

try {
  silencio = localStorage.getItem('wasi.silencio') === '1'
} catch {
  silencio = false
}

export const estaSilenciado = () => silencio
export function silenciar(valor: boolean) {
  silencio = valor
  try {
    localStorage.setItem('wasi.silencio', valor ? '1' : '0')
  } catch {
    /* sin almacenamiento */
  }
}

/** El navegador deja el audio dormido hasta el primer toque en la página. */
export const audioDespierto = () => ctx?.state === 'running'

export function despertarAudio() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

function nota(frecuencia: number, inicio: number, duracion: number, volumen = 0.18, tipo: OscillatorType = 'sine') {
  if (!ctx) return
  const t = ctx.currentTime + inicio
  const osc = ctx.createOscillator()
  const gan = ctx.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(frecuencia, t)
  gan.gain.setValueAtTime(0, t)
  gan.gain.linearRampToValueAtTime(volumen, t + 0.012)
  gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion)
  osc.connect(gan).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + duracion + 0.05)
}

/** Comanda nueva en cocina: dos golpes de campana, cálidos. */
export function sonarComanda() {
  if (silencio || !ctx) return
  nota(784, 0, 0.9, 0.16)
  nota(1568, 0, 0.5, 0.05)
  nota(988, 0.16, 1.1, 0.16)
  nota(1976, 0.16, 0.6, 0.04)
}

/** Algo listo para servir: una campanita corta para el mozo. */
export function sonarListo() {
  if (silencio || !ctx) return
  nota(1318, 0, 0.5, 0.12, 'triangle')
  nota(1760, 0.09, 0.7, 0.1, 'triangle')
}

/** Confirmación suave (enviar, cobrar). */
export function sonarOk() {
  if (silencio || !ctx) return
  nota(660, 0, 0.25, 0.08, 'triangle')
  nota(990, 0.07, 0.35, 0.07, 'triangle')
}
