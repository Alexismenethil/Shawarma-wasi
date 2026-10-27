import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Icono } from './icono'

/**
 * Las pestañas del libro, al pie de la pantalla como en Sheets: una por hoja.
 * La franja de color de cada pestaña dice cómo está esa hoja.
 */
export interface Pestana {
  clave: string
  etiqueta: string
  /** En el celular, si la etiqueta es larga: «Cocina 2». */
  corta?: string
  a: string
  icono?: string
  /** Clase de fondo de la franja inferior (el «color de pestaña» de Sheets). */
  franja?: string
  titulo?: string
  /** Un punto que late: algo espera en esa hoja. */
  aviso?: boolean
}

/**
 * `grandes`: en el celular las pestañas se reparten el ancho, más altas y con
 * el ícono arriba (la caja se maneja con el pulgar). En pantalla grande, igual
 * que siempre.
 */
export function Pestanas({ grupos, activa, inicio, grandes = false }: { grupos: Pestana[][]; activa: string; inicio?: React.ReactNode; grandes?: boolean }) {
  const lista = useRef<HTMLDivElement>(null)

  // La pestaña activa siempre a la vista, aunque sea la M25.
  useEffect(() => {
    const el = lista.current?.querySelector<HTMLElement>('[aria-current="page"]')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activa])

  return (
    <nav
      aria-label="Hojas"
      className="no-imprimir fixed inset-x-0 bottom-0 z-30 flex border-t border-reja bg-gris-100 pb-[env(safe-area-inset-bottom)]"
    >
      {inicio}
      <div ref={lista} className={`sin-barra flex min-w-0 flex-1 overflow-x-auto ${grandes ? 'h-16 sm:h-11' : 'h-11'}`}>
        {grupos.map((grupo, g) => (
          <div key={g} className={`flex ${grandes ? 'min-w-0 flex-1 sm:flex-none sm:shrink-0' : 'shrink-0'} ${g > 0 ? 'ml-2 border-l border-reja-2' : ''}`}>
            {grupo.map((p) => {
              const esta = p.clave === activa
              return (
                <Link
                  key={p.clave}
                  to={p.a}
                  replace
                  aria-current={esta ? 'page' : undefined}
                  title={p.titulo}
                  className={`relative flex h-full items-center border-r border-reja transition-colors ${
                    grandes
                      ? 'min-w-0 flex-1 flex-col justify-center gap-1 px-1 text-[14px] sm:flex-none sm:shrink-0 sm:flex-row sm:gap-1.5 sm:px-3.5 sm:text-[13.5px]'
                      : 'shrink-0 gap-1.5 px-3.5 text-[13.5px]'
                  } ${esta ? 'bg-hoja font-medium text-verde-2 shadow-[0_-1px_0_var(--color-reja)]' : 'text-tinta-2 hover:bg-gris-150 hover:text-tinta'}`}
                >
                  {p.icono && <Icono d={p.icono} className={grandes ? 'size-6 sm:size-[17px]' : 'size-[17px]'} />}
                  {p.corta ? (
                    <>
                      <span className="sm:hidden">{p.corta}</span>
                      <span className="hidden sm:inline">{p.etiqueta}</span>
                    </>
                  ) : (
                    p.etiqueta
                  )}
                  {p.aviso && <span className="animate-latido size-1.5 rounded-full bg-rojo" />}
                  {p.franja && <span className={`absolute inset-x-0 bottom-0 h-[3px] ${p.franja}`} />}
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}
