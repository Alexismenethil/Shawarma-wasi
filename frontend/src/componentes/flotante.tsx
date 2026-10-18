import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { mdiClose } from '@mdi/js'
import { Icono } from './icono'

/**
 * Lo que flota sobre la hoja: la lista de un desplegable o un menú. En
 * computadora y tablet cuelga de su celda, como en Excel, y un clic afuera la
 * cierra sin perder ese clic; en el celular sube desde abajo a todo el ancho,
 * con filas grandes para el dedo.
 */

export const esCelular = () => typeof window !== 'undefined' && window.innerWidth < 640

interface Posicion {
  left: number
  top?: number
  bottom?: number
  maxHeight: number
  minWidth: number
}

function calcular(ancla: HTMLElement, ancho: number): Posicion {
  const r = ancla.getBoundingClientRect()
  const abajo = window.innerHeight - r.bottom - 10
  const arriba = r.top - 10
  const haciaArriba = abajo < 260 && arriba > abajo
  const minWidth = Math.max(r.width, ancho)
  return {
    left: Math.max(8, Math.min(r.left, window.innerWidth - minWidth - 8)),
    ...(haciaArriba ? { bottom: window.innerHeight - r.top + 2 } : { top: r.bottom + 2 }),
    maxHeight: Math.min(380, haciaArriba ? arriba : abajo),
    minWidth,
  }
}

export function Flotante({
  abierto,
  alCerrar,
  ancla,
  titulo,
  ancho = 0,
  children,
  pie,
}: {
  abierto: boolean
  alCerrar: () => void
  ancla: RefObject<HTMLElement | null>
  titulo?: string
  ancho?: number
  children: ReactNode
  pie?: ReactNode
}) {
  const [pos, setPos] = useState<Posicion | null>(null)
  const [celular, setCelular] = useState(esCelular)
  const caja = useRef<HTMLDivElement>(null)
  const cerrar = useRef(alCerrar)
  cerrar.current = alCerrar

  useLayoutEffect(() => {
    if (!abierto || !ancla.current) return
    const ubicar = () => {
      setCelular(esCelular())
      if (ancla.current) setPos(calcular(ancla.current, ancho))
    }
    ubicar()
    const alDesplazar = (e: Event) => {
      // Desplazar la propia lista no la mueve; desplazar la hoja, sí.
      if (caja.current && e.target instanceof Node && caja.current.contains(e.target)) return
      ubicar()
    }
    window.addEventListener('resize', ubicar)
    window.addEventListener('scroll', alDesplazar, true)
    return () => {
      window.removeEventListener('resize', ubicar)
      window.removeEventListener('scroll', alDesplazar, true)
    }
  }, [abierto, ancla, ancho])

  useEffect(() => {
    if (!abierto) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cerrar.current()
        ancla.current?.focus()
      }
    }
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node
      if (caja.current?.contains(t) || ancla.current?.contains(t)) return
      cerrar.current()
    }
    window.addEventListener('keydown', tecla, true)
    // En el celular el fondo oscuro ya cierra; en pantalla grande, cualquier clic afuera.
    if (!celular) document.addEventListener('pointerdown', fuera, true)
    return () => {
      window.removeEventListener('keydown', tecla, true)
      document.removeEventListener('pointerdown', fuera, true)
    }
  }, [abierto, ancla, celular])

  return createPortal(
    <AnimatePresence>
      {abierto &&
        (celular ? (
          <div key="hoja" className="fixed inset-0 z-[80]">
            <motion.div
              className="absolute inset-0 bg-black/35"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onPointerDown={() => cerrar.current()}
            />
            <motion.div
              ref={caja}
              role="dialog"
              aria-label={titulo}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col bg-hoja pb-[env(safe-area-inset-bottom)]"
            >
              <div className="flex h-12 shrink-0 items-center justify-between bg-verde-3 pr-1 pl-4 text-white">
                <span className="truncate text-[15px] font-medium">{titulo}</span>
                <button onClick={() => cerrar.current()} aria-label="Cerrar" className="grid size-11 place-items-center text-white/85 hover:text-white">
                  <Icono d={mdiClose} />
                </button>
              </div>
              {children}
              {pie}
            </motion.div>
          </div>
        ) : (
          pos && (
            <motion.div
              key="lista"
              ref={caja}
              initial={{ opacity: 0, y: pos.top !== undefined ? -4 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.12 }}
              style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.minWidth, maxHeight: pos.maxHeight }}
              className="sombra-menu fixed z-[80] flex max-w-[min(440px,calc(100vw-16px))] flex-col border border-reja-2 bg-hoja"
            >
              {children}
              {pie}
            </motion.div>
          )
        ))}
    </AnimatePresence>,
    document.body,
  )
}
