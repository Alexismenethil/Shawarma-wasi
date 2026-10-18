import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icono } from './icono'

/**
 * Botón rectangular de color sólido. «guardar» y «limpiar» son los dos
 * botones de la nota del Excel, con sus mismos colores.
 */
export type Variante = 'guardar' | 'limpiar' | 'oscuro' | 'cobrar' | 'peligro' | 'claro' | 'plano'

export function Boton({
  variante = 'claro',
  icono,
  children,
  className = '',
  cargando = false,
  ...resto
}: { variante?: Variante; icono?: string; children?: ReactNode; cargando?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...resto} disabled={resto.disabled || cargando} className={`boton boton-${variante} ${className}`}>
      {cargando ? <Rueda /> : icono && <Icono d={icono} className="size-[18px]" />}
      {children}
    </button>
  )
}

/** Botón cuadrado solo con ícono, para las barras y las filas. */
export function BotonIcono({
  icono,
  titulo,
  className = '',
  ...resto
}: { icono: string; titulo: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      {...resto}
      className={`grid size-10 shrink-0 place-items-center text-tinta-2 transition-colors hover:bg-gris-100 hover:text-tinta disabled:opacity-40 ${className}`}
    >
      <Icono d={icono} className="size-5" />
    </button>
  )
}

/** El indicador de «trabajando…»: un aro que gira. */
export function Rueda({ className = 'size-4' }: { className?: string }) {
  return <span className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-hidden />
}
