import { useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { mdiAlertCircle, mdiBellRing, mdiCheckCircle } from '@mdi/js'
import { Icono } from './icono'

/** Avisos breves: «Guardado y enviado a cocina», «PIN incorrecto». */
type Aviso = { id: number; texto: string; tipo: 'ok' | 'error' | 'info' }

let avisos: Aviso[] = []
let siguiente = 1
const oyentes = new Set<() => void>()
const publicar = () => oyentes.forEach((o) => o())

export function avisar(texto: string, tipo: Aviso['tipo'] = 'info') {
  const id = siguiente++
  avisos = [...avisos.slice(-2), { id, texto, tipo }]
  publicar()
  setTimeout(() => {
    avisos = avisos.filter((a) => a.id !== id)
    publicar()
  }, tipo === 'error' ? 4500 : 3200)
}

const ESTILO = {
  ok: { d: mdiCheckCircle, barra: 'bg-verde-boton', icono: 'text-verde-boton' },
  error: { d: mdiAlertCircle, barra: 'bg-rojo', icono: 'text-rojo' },
  info: { d: mdiBellRing, barra: 'bg-turquesa', icono: 'text-turquesa' },
}

export function Avisos() {
  const lista = useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => oyentes.delete(o)
    },
    () => avisos,
  )
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+116px)] z-[90] flex flex-col items-center gap-2 px-3 sm:right-5 sm:bottom-16 sm:left-auto sm:items-end"
    >
      <AnimatePresence>
        {lista.map((a) => (
          <motion.div
            key={a.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="sombra-menu flex w-full max-w-[380px] items-stretch border border-reja-2 bg-hoja"
          >
            <span className={`w-1.5 shrink-0 ${ESTILO[a.tipo].barra}`} />
            <span className="flex items-center gap-2.5 px-3 py-2.5 text-[14px] font-medium text-tinta">
              <Icono d={ESTILO[a.tipo].d} className={`size-5 ${ESTILO[a.tipo].icono}`} />
              {a.texto}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
