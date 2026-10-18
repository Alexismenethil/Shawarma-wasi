import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { mdiArrowRight, mdiBellRing, mdiShopping, mdiTableFurniture } from '@mdi/js'
import type { MesaResumen, TipoMesa } from '@wasi/shared'
import { codigoMesa, nombreMesa } from '@wasi/shared'
import { minutosDesde, soles, useAhora } from '../../lib/formato'
import { useAjustes } from '../../lib/ajustes'
import { avisar } from '../../componentes/avisos'
import { Membrete } from '../../componentes/marca'
import { ESTADO_HOJA, Icono, type EstadoHoja } from '../../componentes/icono'
import { estadoHoja, useLibro } from './libro'

/**
 * La hoja «Mesas»: todas las mesas y los pedidos para llevar como celdas de
 * una planilla, pintadas con el mismo formato condicional que el Excel usaba
 * para los estados. Una mirada basta para saber qué falta en cada una.
 */

const ORDEN: EstadoHoja[] = ['LIBRE', 'NOTA', 'EN_COCINA', 'LISTO', 'POR_COBRAR']

export function Salon() {
  const navegar = useNavigate()
  const { mesas, conBorrador, errorMesas } = useLibro()
  const { minutosAlerta } = useAjustes()
  const ahora = useAhora(20_000)
  const [numero, setNumero] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  // Escribir un número en cualquier parte lleva a esa mesa.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return
      if (/^\d$/.test(e.key)) campo.current?.focus()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const cuenta = useMemo(() => {
    const r: Record<EstadoHoja, number> = { LIBRE: 0, NOTA: 0, EN_COCINA: 0, LISTO: 0, POR_COBRAR: 0 }
    mesas?.forEach((m) => r[estadoHoja(m, conBorrador)]++)
    return r
  }, [mesas, conBorrador])

  const porServir = mesas?.filter((m) => m.estado === 'LISTO') ?? []

  const irA = (e: React.FormEvent) => {
    e.preventDefault()
    const texto = numero.trim().toUpperCase()
    const llevar = texto.startsWith('L')
    const n = Number(texto.replace(/^[ML]/, ''))
    const m = mesas?.find((x) => x.numero === n && x.tipo === (llevar ? 'LLEVAR' : 'SALON'))
    if (m) navegar(`/mozo/${m.id}`)
    else avisar(`No existe ${llevar ? 'el pedido para llevar' : 'la mesa'} ${n || texto}`, 'error')
    setNumero('')
  }

  return (
    <main className="mx-auto max-w-[1280px] sm:px-4 sm:py-4">
      <section className="hoja sombra-hoja">
        <Membrete
          derecha={
            <form onSubmit={irA} className="flex items-stretch border border-reja-2 focus-within:border-azul">
              <label htmlFor="ir-a" className="hidden items-center bg-gris-100 px-2.5 text-[13px] text-tinta-2 sm:flex">
                Ir a
              </label>
              <input
                id="ir-a"
                ref={campo}
                value={numero}
                onChange={(e) => setNumero(e.target.value.replace(/[^0-9mlML]/g, '').slice(0, 3))}
                placeholder="M1"
                inputMode="text"
                autoComplete="off"
                className="h-9 w-14 bg-hoja text-center text-[15px] font-medium uppercase outline-none placeholder:text-tinta-4"
              />
              <button disabled={!numero} aria-label="Abrir" className="grid w-9 place-items-center bg-verde-3 text-white disabled:bg-gris-150 disabled:text-tinta-4">
                <Icono d={mdiArrowRight} className="size-[18px]" />
              </button>
            </form>
          }
        />

        {/* Leyenda: el formato condicional, con cuántas hay de cada una. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-reja bg-gris-50 px-3 py-2.5 sm:px-5">
          {ORDEN.map((e) => (
            <span key={e} className="flex items-center gap-1.5 text-[13px] text-tinta-2">
              <span className={`size-3.5 border border-black/15 ${ESTADO_HOJA[e].fondo}`} />
              {ESTADO_HOJA[e].nombre}
              <b className="font-medium text-tinta tabular-nums">{cuenta[e]}</b>
            </span>
          ))}
        </div>

        {porServir.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-reja bg-rosa-2 px-3 py-2 sm:px-5">
            <Icono d={mdiBellRing} className="animate-latido size-5 text-rojo-oscuro" />
            <span className="mr-1 text-[14px] font-medium text-rojo-oscuro">Cocina atendió, falta servir:</span>
            {porServir.map((m) => (
              <button
                key={m.id}
                onClick={() => navegar(`/mozo/${m.id}`)}
                className="h-8 border border-rojo-oscuro/30 bg-hoja px-3 text-[13.5px] font-medium text-rojo-oscuro hover:bg-rosa"
              >
                {nombreMesa(m)}
              </button>
            ))}
          </div>
        )}

        {errorMesas && !mesas && <p className="border-t border-reja px-5 py-4 text-rojo">{errorMesas}</p>}

        {(['SALON', 'LLEVAR'] as TipoMesa[]).map((tipo) => {
          const lista = mesas?.filter((m) => m.tipo === tipo) ?? []
          const ocupadas = lista.filter((m) => m.estado !== 'LIBRE').length
          return (
            <div key={tipo}>
              <h2 className="flex h-9 items-center gap-2 bg-turquesa px-3 text-[14px] text-white sm:px-5">
                <Icono d={tipo === 'SALON' ? mdiTableFurniture : mdiShopping} className="size-[18px] text-white/85" />
                {tipo === 'SALON' ? 'Salón' : 'Para llevar'}
                <span className="ml-auto text-[13px] text-white/80 tabular-nums">
                  {ocupadas} ocupada{ocupadas === 1 ? '' : 's'} de {lista.length}
                </span>
              </h2>
              <div className="grid grid-cols-3 bg-hoja min-[360px]:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
                {lista.map((m, i) => (
                  <Celda key={m.id} mesa={m} indice={i} estado={estadoHoja(m, conBorrador)} ahora={ahora} alerta={minutosAlerta} alTocar={() => navegar(`/mozo/${m.id}`)} />
                ))}
                {!mesas && Array.from({ length: tipo === 'SALON' ? 10 : 5 }, (_, i) => <div key={i} className="h-[84px] border-r border-b border-reja sm:h-[92px]" />)}
              </div>
            </div>
          )
        })}
      </section>
    </main>
  )
}

function Celda({
  mesa,
  estado,
  ahora,
  alerta,
  indice,
  alTocar,
}: {
  mesa: MesaResumen
  estado: EstadoHoja
  ahora: number
  alerta: number
  indice: number
  alTocar: () => void
}) {
  const e = ESTADO_HOJA[estado]
  const p = mesa.pedido
  const espera = p?.esperaDesde ? minutosDesde(p.esperaDesde, ahora) : null
  const demorado = espera !== null && espera >= alerta
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(indice, 20) * 0.012, duration: 0.25 }}
      onClick={alTocar}
      title={`${nombreMesa(mesa)} · ${e.nombre}`}
      className={`group relative flex h-[84px] flex-col items-stretch justify-between border-r border-b border-reja p-2 text-left transition-[filter] hover:brightness-[0.97] focus-visible:z-10 sm:h-[92px] ${e.fondo}`}
    >
      <span className="flex items-start justify-between gap-1">
        <span className={`text-[17px] leading-none font-bold sm:text-[18px] ${estado === 'LIBRE' ? 'text-tinta-2' : 'text-tinta'}`}>{codigoMesa(mesa)}</span>
        {estado !== 'LIBRE' && <Icono d={e.d} className={`size-[18px] ${estado === 'LISTO' ? 'animate-latido' : ''} ${e.texto}`} />}
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-[12.5px] font-medium ${e.texto}`}>
          {estado === 'LIBRE' ? 'Libre' : estado === 'NOTA' ? 'Sin guardar' : p?.cliente || e.nombre}
        </span>
        {p && (
          <span className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-1 text-[12px] text-tinta-2 tabular-nums">
            <span className={demorado ? 'font-medium text-rojo' : ''}>{espera !== null ? `${espera} min` : `N° ${p.numero}`}</span>
            <span className="font-medium text-tinta">{soles(p.total)}</span>
          </span>
        )}
      </span>
      <span className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_2px_var(--color-azul)] opacity-0 transition-opacity group-hover:opacity-100" />
    </motion.button>
  )
}
