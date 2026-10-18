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

export function Pestanas({ grupos, activa, inicio }: { grupos: Pestana[][]; activa: string; inicio?: React.ReactNode }) {
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
      <div ref={lista} className="sin-barra flex h-11 min-w-0 flex-1 overflow-x-auto">
        {grupos.map((grupo, g) => (
          <div key={g} className={`flex shrink-0 ${g > 0 ? 'ml-2 border-l border-reja-2' : ''}`}>
            {grupo.map((p) => {
              const esta = p.clave === activa
              return (
                <Link
                  key={p.clave}
                  to={p.a}
                  replace
                  aria-current={esta ? 'page' : undefined}
                  title={p.titulo}
                  className={`relative flex h-full shrink-0 items-center gap-1.5 border-r border-reja px-3.5 text-[13.5px] transition-colors ${
                    esta ? 'bg-hoja font-medium text-verde-2 shadow-[0_-1px_0_var(--color-reja)]' : 'text-tinta-2 hover:bg-gris-150 hover:text-tinta'
                  }`}
                >
                  {p.icono && <Icono d={p.icono} className="size-[17px]" />}
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
