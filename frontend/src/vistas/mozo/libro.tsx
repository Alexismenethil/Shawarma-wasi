import { createContext, useContext, useMemo } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { mdiViewGrid } from '@mdi/js'
import type { Carta, MesaResumen } from '@wasi/shared'
import { codigoMesa, nombreMesa } from '@wasi/shared'
import { useRecurso } from '../../lib/recurso'
import { useCambios } from '../../lib/tiempo-real'
import { useMesasConBorrador } from '../../lib/borrador'
import { sonarListo } from '../../lib/sonido'
import { avisar } from '../../componentes/avisos'
import { Barra } from '../../componentes/barra'
import { Pestanas, type Pestana } from '../../componentes/pestanas'
import { ESTADO_HOJA, Icono, type EstadoHoja } from '../../componentes/icono'

/**
 * El libro del mozo: como el Excel del local, una hoja por mesa (M1…M25) y por
 * pedido para llevar (L1…L10), con sus pestañas al pie, más la hoja «Mesas»
 * con todas a la vista. Las mesas y la carta se piden una vez para todo el
 * libro y se mantienen al día solas.
 */

interface Libro {
  mesas: MesaResumen[] | null
  carta: Carta | null
  conBorrador: Set<number>
  errorMesas: string | null
}

const Contexto = createContext<Libro>({ mesas: null, carta: null, conBorrador: new Set(), errorMesas: null })
export const useLibro = () => useContext(Contexto)

/** El estado de la hoja: si hay algo anotado sin guardar, manda eso. */
export function estadoHoja(m: MesaResumen, conBorrador: Set<number>): EstadoHoja {
  if (m.estado === 'LIBRE' && conBorrador.has(m.id)) return 'NOTA'
  return m.estado
}

export function LibroMozo() {
  const { mesaId } = useParams()
  const { datos: mesas, error } = useRecurso<MesaResumen[]>('/mesas', (c) => !!c.mesas)
  const { datos: carta } = useRecurso<Carta>('/carta', (c) => !!c.carta)
  const conBorrador = useMesasConBorrador()

  // Lo que cocina termina se anuncia en cualquier hoja que el mozo tenga abierta.
  useCambios((c) => {
    if (c.aviso?.tipo === 'listo') {
      sonarListo()
      avisar(`${c.aviso.mesa}: cocina atendió el pedido`, 'info')
    }
  })

  const grupos = useMemo<Pestana[][]>(() => {
    const pestana = (m: MesaResumen): Pestana => {
      const e = estadoHoja(m, conBorrador)
      return {
        clave: String(m.id),
        etiqueta: codigoMesa(m),
        a: `/mozo/${m.id}`,
        titulo: `${nombreMesa(m)} · ${ESTADO_HOJA[e].nombre}`,
        franja: e === 'LIBRE' ? undefined : ESTADO_HOJA[e].barra,
        aviso: e === 'LISTO',
      }
    }
    const lista = mesas ?? []
    return [lista.filter((m) => m.tipo === 'SALON').map(pestana), lista.filter((m) => m.tipo === 'LLEVAR').map(pestana)]
  }, [mesas, conBorrador])

  const mesa = mesas?.find((m) => String(m.id) === mesaId)
  const valor = useMemo(() => ({ mesas, carta, conBorrador, errorMesas: error }), [mesas, carta, conBorrador, error])

  return (
    <Contexto.Provider value={valor}>
      <div className="min-h-dvh pb-[calc(44px+env(safe-area-inset-bottom))]">
        <Barra titulo={mesa ? `Nota de Pedido · ${nombreMesa(mesa)}` : 'Mesas del local'} />
        <Outlet />
      </div>
      <Pestanas
        grupos={grupos}
        activa={mesaId ?? 'mesas'}
        inicio={
          <Link
            to="/mozo"
            replace
            aria-current={!mesaId ? 'page' : undefined}
            className={`flex h-11 shrink-0 items-center gap-1.5 border-r border-reja-2 px-3 text-[13.5px] ${
              !mesaId ? 'bg-hoja font-medium text-verde-2' : 'text-tinta-2 hover:bg-gris-150 hover:text-tinta'
            }`}
          >
            <Icono d={mdiViewGrid} className="size-[18px]" />
            <span className="hidden sm:inline">Mesas</span>
          </Link>
        }
      />
    </Contexto.Provider>
  )
}
