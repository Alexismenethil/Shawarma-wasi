import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { mdiAccountCircle, mdiLogout, mdiWifi, mdiWifiOff } from '@mdi/js'
import { guardarSesion, useSesion } from '../lib/sesion'
import { useEnLinea } from '../lib/tiempo-real'
import { confirmar } from './dialogo'
import { Icono } from './icono'
import { Logo } from './marca'

/** «En línea» / «Sin conexión»: si el wifi se cae, el mozo lo sabe. */
export function EnLinea({ claro = false }: { claro?: boolean }) {
  const enLinea = useEnLinea()
  return (
    <span
      className={`flex items-center gap-1.5 text-[12.5px] ${enLinea ? (claro ? 'text-white/80' : 'text-tinta-2') : 'font-medium text-[#ffb4a8]'}`}
      title={enLinea ? 'Conectado: los cambios llegan al instante' : 'Sin conexión: se reintenta solo'}
    >
      <Icono d={enLinea ? mdiWifi : mdiWifiOff} className="size-4" />
      <span className="hidden sm:inline">{enLinea ? 'En línea' : 'Sin conexión'}</span>
    </span>
  )
}

export async function salir() {
  if (await confirmar({ titulo: 'Cerrar sesión', mensaje: '¿Cerrar la sesión en este dispositivo?', aceptar: 'Cerrar sesión', variante: 'oscuro' })) {
    guardarSesion(null)
  }
}

/**
 * La barra de arriba, como la de una ventana de escritorio: dónde estoy a la
 * izquierda; quién soy, la conexión y «Salir» a la derecha.
 */
export function Barra({ titulo, color = 'bg-verde-3', izquierda, derecha }: { titulo: ReactNode; color?: string; izquierda?: ReactNode; derecha?: ReactNode }) {
  const sesion = useSesion()
  return (
    <header className={`no-imprimir sticky top-0 z-30 text-white ${color}`}>
      <div className="flex h-12 items-center gap-2 pr-1 pl-2 sm:pl-3">
        {izquierda ?? (
          <Link to="/" className="flex items-center" aria-label="Inicio">
            <Logo className="size-8 ring-1 ring-white/40" />
          </Link>
        )}
        <div className="min-w-0 flex-1 truncate pl-1 text-[15px] font-medium">{titulo}</div>
        {derecha}
        <EnLinea claro />
        <span className="ml-2 hidden items-center gap-1.5 border-l border-white/20 pl-3 text-[13.5px] text-white/90 sm:flex">
          <Icono d={mdiAccountCircle} className="size-5 text-white/70" />
          {sesion?.usuario.nombre}
        </span>
        <button onClick={() => void salir()} title="Cerrar sesión" aria-label="Cerrar sesión" className="grid size-11 place-items-center text-white/80 transition-colors hover:bg-white/10 hover:text-white">
          <Icono d={mdiLogout} className="size-5" />
        </button>
      </div>
    </header>
  )
}
