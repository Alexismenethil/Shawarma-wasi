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

/**
 * Todo sale por aquí: se sube el volumen y una curva suave redondea los picos,
 * para que suene fuerte sin que cruja.
 */
let salida: AudioNode | null = null
function bus(c: AudioContext) {
  if (salida) return salida
  const volumen = c.createGain()
  volumen.gain.value = 1.3
  const recorte = c.createWaveShaper()
  const curva = new Float32Array(1024)
  for (let i = 0; i < curva.length; i++) curva[i] = Math.tanh(((i / (curva.length - 1)) * 2 - 1) * 1.4)
  recorte.curve = curva
  volumen.connect(recorte).connect(c.destination)
  salida = volumen
  return salida
}

function nota(frecuencia: number, inicio: number, duracion: number, volumen = 0.18, tipo: OscillatorType = 'sine') {
  if (!ctx) return
  const t = ctx.currentTime + inicio
  const osc = ctx.createOscillator()
  const gan = ctx.createGain()
  osc.type = tipo
  osc.frequency.setValueAtTime(frecuencia, t)
  gan.gain.setValueAtTime(0, t)
  gan.gain.linearRampToValueAtTime(volumen, t + 0.008)
  gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion)
  osc.connect(gan).connect(bus(ctx))
  osc.start(t)
  osc.stop(t + duracion + 0.05)
}

/**
 * Una lámina de vibráfono: tono puro con un brillo corto al golpe. Es el
 * timbre de los avisos de pedidos (limpio, sin zumbido), y su tono agudo se
 * oye por encima de la plancha y el extractor.
 */
function lamina(frecuencia: number, inicio: number, duracion: number, volumen: number) {
  nota(frecuencia, inicio, duracion, volumen)
  nota(frecuencia * 2, inicio, duracion * 0.45, volumen * 0.22)
  nota(frecuencia * 4, inicio, 0.18, volumen * 0.1)
}

/**
 * Vibrar el celular (en Android; el iPhone no lo permite desde la web). No
 * depende del audio: aunque el navegador no haya despertado el sonido, el
 * mozo con el celular en el bolsillo siente el aviso. Si está silenciado, no.
 */
export function vibrar(patron: number | number[]) {
  if (silencio) return
  try {
    navigator.vibrate?.(patron)
  } catch {
    /* sin vibración */
  }
}

/** Un golpecito al tocar una tecla, como el teclado del celular. */
export function toque() {
  try {
    navigator.vibrate?.(8)
  } catch {
    /* sin vibración */
  }
}

/** El navegador puede dormir el audio si la pantalla estuvo quieta: se despierta antes de sonar. */
function listo() {
  if (silencio || !ctx) return false
  if (ctx.state !== 'running') void ctx.resume()
  return true
}

/**
 * Comanda nueva en cocina: un arpegio que sube (sol, do, mi, sol), dos veces,
 * unos 3 segundos. Alegre y claro, como el aviso de los sistemas de pedidos;
 * se distingue de cualquier otro ruido de la cocina. En el celular, además,
 * vibra.
 */
export function sonarComanda() {
  if (!listo()) return
  for (const t of [0, 1.35]) {
    lamina(784, t, 1.1, 0.34)
    lamina(1046.5, t + 0.13, 1.1, 0.34)
    lamina(1318.5, t + 0.26, 1.2, 0.34)
    lamina(1568, t + 0.39, 1.7, 0.4)
  }
  vibrar([400, 150, 400, 150, 700])
}

/** Algo listo para servir: una campanita corta para el mozo, y dos vibraciones en el bolsillo. */
export function sonarListo() {
  vibrar([180, 90, 180])
  if (!listo()) return
  lamina(1318.5, 0, 0.6, 0.2)
  lamina(1760, 0.1, 0.9, 0.2)
}

/** Confirmación suave (enviar, cobrar). */
export function sonarOk() {
  if (!listo()) return
  nota(660, 0, 0.25, 0.08, 'triangle')
  nota(990, 0.07, 0.35, 0.07, 'triangle')
}
