import type { ReactNode } from 'react'
import { useAjustes } from '../lib/ajustes'
import { Icono, mdiTrompo } from './icono'

/**
 * La marca: un sello redondo color vino con el trompo del shawarma, como el
 * logo que encabeza cada hoja del Excel (el de ese libro dice «Fusion
 * Shawarma»; este es propio del sistema).
 */
export function Logo({ className = 'size-10' }: { className?: string }) {
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full bg-vino text-white ${className}`} aria-hidden>
      <span className="absolute inset-[7%] rounded-full border border-white/45" />
      <Icono d={mdiTrompo} className="size-[52%]" />
    </span>
  )
}

/** «SHAWARMA WASI / Peruvian Cuisine» en vino y negrita, como el título de cada hoja. */
export function Titulo({ color = 'vino', compacto = false, alinear = 'centro' }: { color?: 'vino' | 'verde' | 'blanco'; compacto?: boolean; alinear?: 'centro' | 'izquierda' }) {
  const { nombre, subtitulo } = useAjustes()
  const tono = color === 'vino' ? 'text-vino' : color === 'verde' ? 'text-verde-3' : 'text-white'
  return (
    <span className={`block min-w-0 leading-tight font-bold ${tono} ${alinear === 'centro' ? 'text-center' : 'text-left'}`}>
      <span className={`block truncate uppercase ${compacto ? 'text-[15px]' : 'text-[19px] sm:text-[22px]'}`}>{nombre}</span>
      {subtitulo && <span className={`block truncate ${compacto ? 'text-[12px]' : 'text-[15px] sm:text-[17px]'}`}>{subtitulo}</span>}
    </span>
  )
}

/**
 * El membrete de una hoja: logo a la izquierda, nombre del local al centro y
 * lo propio de la hoja a la derecha («Mesa: 1», el botón «Limpiar»…).
 */
export function Membrete({ derecha, color = 'vino', className = '' }: { derecha?: ReactNode; color?: 'vino' | 'verde'; className?: string }) {
  return (
    <div className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:px-5 sm:py-4 ${className}`}>
      <Logo className="size-11 sm:size-14" />
      <Titulo color={color} />
      <div className="flex min-w-11 justify-end sm:min-w-14">{derecha}</div>
    </div>
  )
}
