import { useCallback, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { mdiAccountCircle, mdiCashRegister, mdiLogout, mdiStorefront, mdiSwapHorizontal, mdiWifi, mdiWifiOff } from '@mdi/js'
import type { EstadoCaja } from '@wasi/shared'
import { api } from '../lib/api'
import { guardarSesion, sesionActual, useSesion } from '../lib/sesion'
import { elegirVista, useSucursal } from '../lib/sucursal'
import { useEnLinea } from '../lib/tiempo-real'
import { hora, soles } from '../lib/formato'
import { confirmar, elegir } from './dialogo'
import { Icono } from './icono'
import { Logo } from './marca'

/** «En línea» / «Sin conexión»: si el wifi se cae, el mozo lo sabe. */
export function EnLinea({ claro = false }: { claro?: boolean }) {
  const enLinea = useEnLinea()
  return (
    <span
      className={`flex items-center gap-1.5 text-[12.5px] ${enLinea ? (claro ? 'text-white/80' : 'text-tinta-2') : 'font-medium text-[#ffb4a8]'}`}
      title={enLinea ? 'Conectado: las pantallas se actualizan automáticamente' : 'Sin conexión: se reintenta solo'}
    >
      <Icono d={enLinea ? mdiWifi : mdiWifiOff} className="size-4" />
      <span className="hidden sm:inline">{enLinea ? 'En línea' : 'Sin conexión'}</span>
    </span>
  )
}

/**
 * Cerrar sesión. Quien atiende la caja no se va sin pensarlo: si la caja sigue
 * abierta, el sistema recuerda que lo normal es cerrarla y contar el dinero.
 */
export function useSalir() {
  const navegar = useNavigate()
  return useCallback(async () => {
    const sesion = sesionActual()
    if (!sesion) return
    if (sesion.usuario.rol === 'CAJA' || location.pathname.startsWith('/caja')) {
      const estado = await api<EstadoCaja>('/caja').catch(() => null)
      const abierta = estado?.abierta
      if (abierta) {
        const eleccion = await elegir({
          titulo: 'La caja sigue abierta',
          icono: mdiCashRegister,
          cancelar: 'Seguir aquí',
          mensaje: (
            <div className="space-y-2">
              <p>
                La abrió <b className="font-medium">{abierta.abiertaPor}</b> a las {hora(abierta.abiertaEn)}. En el cajón debería haber{' '}
                <b className="font-medium">S/ {soles(abierta.esperado)}</b> en efectivo.
              </p>
              <p>Lo normal al terminar el turno es cerrarla y contar el dinero (el arqueo).</p>
            </div>
          ),
          opciones: [
            { etiqueta: 'Salir sin cerrar', valor: 'salir' as const, variante: 'claro' },
            { etiqueta: 'Cerrar caja', valor: 'cerrar' as const, variante: 'cobrar' },
          ],
        })
        if (eleccion === 'cerrar') navegar('/caja?hoja=arqueo&cerrar=1')
        if (eleccion === 'salir') guardarSesion(null)
        return
      }
    }
    if (await confirmar({ titulo: 'Cerrar sesión', mensaje: '¿Cerrar la sesión en este dispositivo?', aceptar: 'Cerrar sesión', variante: 'oscuro' })) {
      guardarSesion(null)
    }
  }, [navegar])
}

/**
 * La sucursal en que se trabaja, a la vista cuando hay más de una. El
 * administrador, que puede estar en cualquiera, la toca para cambiar.
 */
export function SucursalActual({ claro = true }: { claro?: boolean }) {
  const { sucursal, sucursales, propia } = useSucursal()
  if (!sucursal || sucursales.length < 2) return null
  const tono = claro ? 'text-white/90' : 'text-tinta-2'
  const contenido = (
    <>
      <Icono d={mdiStorefront} className={`size-4 ${claro ? 'text-white/70' : 'text-tinta-3'}`} />
      <span className="max-w-[140px] truncate">{sucursal.nombre}</span>
      {!propia && <Icono d={mdiSwapHorizontal} className={`size-4 ${claro ? 'text-white/60' : 'text-tinta-3'}`} />}
    </>
  )
  return propia ? (
    <span className={`flex items-center gap-1.5 text-[13px] ${tono}`}>{contenido}</span>
  ) : (
    <button onClick={() => elegirVista(null)} title="Cambiar de sucursal" className={`flex h-9 items-center gap-1.5 px-2 text-[13px] ${tono} ${claro ? 'hover:bg-white/10' : 'hover:bg-gris-100'}`}>
      {contenido}
    </button>
  )
}

/**
 * La barra de arriba, como la de una ventana de escritorio: dónde estoy a la
 * izquierda; la sucursal, quién soy, la conexión y «Salir» a la derecha.
 */
export function Barra({ titulo, color = 'bg-verde-3', izquierda, derecha }: { titulo: ReactNode; color?: string; izquierda?: ReactNode; derecha?: ReactNode }) {
  const sesion = useSesion()
  const salir = useSalir()
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
        <span className="hidden md:block">
          <SucursalActual />
        </span>
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
