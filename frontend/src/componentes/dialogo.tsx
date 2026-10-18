import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { mdiAlert, mdiClose, mdiHelpCircle } from '@mdi/js'
import { Boton, type Variante } from './boton'
import { Icono } from './icono'

/**
 * La ventana de diálogo, como en un programa de escritorio: barra de título
 * de color, el contenido y los botones abajo a la derecha.
 */
export function Dialogo({
  abierto,
  titulo,
  alCerrar,
  children,
  botones,
  ancho = 'max-w-[460px]',
}: {
  abierto: boolean
  titulo: string
  alCerrar: () => void
  children: ReactNode
  botones?: ReactNode
  ancho?: string
}) {
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar()
    window.addEventListener('keydown', tecla)
    // El foco entra a la ventana: al primer campo, o a la ventana misma.
    const t = setTimeout(() => {
      const campo = caja.current?.querySelector<HTMLElement>('input, textarea, [data-foco]')
      ;(campo ?? caja.current)?.focus()
    }, 30)
    return () => {
      window.removeEventListener('keydown', tecla)
      clearTimeout(t)
    }
  }, [abierto, alCerrar])

  return createPortal(
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={alCerrar} />
          <motion.div
            ref={caja}
            role="dialog"
            aria-modal
            aria-label={titulo}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className={`sombra-menu relative flex max-h-[92dvh] w-full flex-col border border-reja-2 bg-hoja outline-none ${ancho}`}
          >
            <div className="flex h-11 shrink-0 items-center justify-between bg-verde-3 pr-1 pl-4 text-white">
              <span className="truncate text-[15px] font-medium">{titulo}</span>
              <button onClick={alCerrar} aria-label="Cerrar" className="grid size-10 place-items-center text-white/80 hover:bg-white/10 hover:text-white">
                <Icono d={mdiClose} className="size-5" />
              </button>
            </div>
            <div className="barra-fina min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
            {botones && (
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-reja bg-gris-50 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-5">
                {botones}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ── Confirmación rápida: const ok = await confirmar({ … }) ── */

interface Pedido {
  titulo: string
  mensaje: ReactNode
  aceptar?: string
  cancelar?: string
  variante?: Variante
  peligro?: boolean
  resolver: (ok: boolean) => void
}

let actual: Pedido | null = null
const oyentes = new Set<() => void>()
const publicar = () => oyentes.forEach((o) => o())

export function confirmar(p: Omit<Pedido, 'resolver'>): Promise<boolean> {
  return new Promise((resolver) => {
    actual?.resolver(false)
    actual = { ...p, resolver }
    publicar()
  })
}

function responder(ok: boolean) {
  actual?.resolver(ok)
  actual = null
  publicar()
}

export function Confirmaciones() {
  const p = useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => oyentes.delete(o)
    },
    () => actual,
  )
  return (
    <Dialogo
      abierto={!!p}
      titulo={p?.titulo ?? ''}
      alCerrar={() => responder(false)}
      botones={
        <>
          <Boton variante="claro" onClick={() => responder(false)} className="min-w-28">
            {p?.cancelar ?? 'Cancelar'}
          </Boton>
          <Boton variante={p?.variante ?? (p?.peligro ? 'peligro' : 'guardar')} onClick={() => responder(true)} className="min-w-28" data-foco>
            {p?.aceptar ?? 'Aceptar'}
          </Boton>
        </>
      }
    >
      <div className="flex gap-3">
        <Icono d={p?.peligro ? mdiAlert : mdiHelpCircle} className={`size-9 ${p?.peligro ? 'text-rojo' : 'text-azul'}`} />
        <div className="min-w-0 flex-1 pt-1 text-[14.5px] text-tinta">{p?.mensaje}</div>
      </div>
    </Dialogo>
  )
}
