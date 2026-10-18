import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useAnimationControls } from 'motion/react'
import { mdiBackspaceOutline } from '@mdi/js'
import type { Rol } from '@wasi/shared'
import { api } from '../lib/api'
import { guardarSesion, type Sesion } from '../lib/sesion'
import { despertarAudio } from '../lib/sonido'
import { Icono } from './icono'
import { Rueda } from './boton'

const LARGO = 4

/**
 * El teclado del PIN: cuatro casillas y un teclado numérico de teclas
 * rectangulares, grande para usarlo de pie con el pulgar. También acepta el
 * teclado de la computadora.
 */
export function TecladoPin({ rol, alEntrar }: { rol: Rol; alEntrar?: (s: Sesion) => void }) {
  const [pin, setPinEstado] = useState('')
  const pinRef = useRef('')
  const setPin = useCallback((valor: string | ((p: string) => string)) => {
    pinRef.current = typeof valor === 'function' ? valor(pinRef.current) : valor
    setPinEstado(pinRef.current)
  }, [])
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const temblor = useAnimationControls()

  useEffect(() => {
    setPin('')
    setError(null)
  }, [rol, setPin])

  const enviar = useCallback(
    async (valor: string) => {
      setEnviando(true)
      try {
        const sesion = await api<Sesion>('/auth/ingresar', { cuerpo: { rol, pin: valor } })
        guardarSesion(sesion)
        alEntrar?.(sesion)
      } catch (e) {
        setError((e as Error).message)
        setPin('')
        void temblor.start({ x: [0, -10, 8, -6, 4, 0], transition: { duration: 0.4 } })
      } finally {
        setEnviando(false)
      }
    },
    [rol, alEntrar, temblor, setPin],
  )

  const pulsar = useCallback(
    (d: string) => {
      despertarAudio()
      if (enviando) return
      setError(null)
      const nuevo = (pinRef.current + d).slice(0, LARGO)
      setPin(nuevo)
      if (nuevo.length === LARGO) void enviar(nuevo)
    },
    [enviando, enviar, setPin],
  )

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (/^\d$/.test(e.key)) pulsar(e.key)
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Escape') setPin('')
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [pulsar, setPin])

  const tecla =
    'grid h-14 place-items-center border border-reja bg-hoja text-[24px] font-normal text-tinta transition-colors hover:bg-gris-50 active:bg-gris-150 sm:h-[58px]'

  return (
    <div className="w-full">
      <motion.div animate={temblor} className="mb-2 grid grid-cols-4 gap-2" aria-label={`${pin.length} de ${LARGO} dígitos`}>
        {Array.from({ length: LARGO }, (_, i) => (
          <span
            key={i}
            className={`grid h-12 place-items-center border-2 bg-hoja transition-colors ${
              error ? 'border-rojo' : i === pin.length && !enviando ? 'border-azul' : i < pin.length ? 'border-verde-2' : 'border-reja-2'
            }`}
          >
            <motion.span
              initial={false}
              animate={{ scale: i < pin.length ? 1 : 0 }}
              transition={{ type: 'spring', stiffness: 700, damping: 30 }}
              className="size-3 rounded-full bg-tinta"
            />
          </span>
        ))}
      </motion.div>
      <p role="status" className={`mb-4 flex h-5 items-center gap-2 text-[13px] ${error ? 'text-rojo' : 'text-tinta-3'}`}>
        {enviando && <Rueda className="size-3.5" />}
        {error ?? (enviando ? 'Verificando…' : 'Ingresa tu PIN de 4 dígitos')}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className={tecla} onClick={() => pulsar(d)}>
            {d}
          </button>
        ))}
        <button className={`${tecla} !text-[14px] text-tinta-2`} onClick={() => setPin('')}>
          Limpiar
        </button>
        <button className={tecla} onClick={() => pulsar('0')}>
          0
        </button>
        <button aria-label="Borrar" className={`${tecla} text-tinta-2`} onClick={() => setPin((p) => p.slice(0, -1))}>
          <Icono d={mdiBackspaceOutline} className="size-6" />
        </button>
      </div>
    </div>
  )
}
