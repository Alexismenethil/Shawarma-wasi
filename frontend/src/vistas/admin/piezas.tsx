import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { mdiCheckBold, mdiChevronRight } from '@mdi/js'
import { soles } from '../../lib/formato'
import { avisar } from '../../componentes/avisos'
import { Rueda } from '../../componentes/boton'
import { Icono } from '../../componentes/icono'

/**
 * Las piezas del panel de administración: páginas, paneles con barra de
 * título, tarjetas de cifras con degradado (como el panel Java de
 * referencia) y tablas con la cabecera de color de cada hoja del Excel.
 */

/** Los colores de cabecera del libro: reportes en rojo, gestión en verde. */
export const TONO = {
  verde: '#38761d',
  verdeOscuro: '#274e13',
  rojo: '#a61c00',
  rojoClaro: '#cc0000',
  naranja: '#b45f06',
  turquesa: '#134f5c',
} as const
export type Tono = keyof typeof TONO

export function Pagina({ titulo, detalle, acciones, children }: { titulo: string; detalle?: ReactNode; acciones?: ReactNode; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-medium text-tinta">{titulo}</h1>
          {detalle && <p className="mt-0.5 text-[13.5px] text-tinta-2 first-letter:uppercase">{detalle}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      {children}
    </motion.div>
  )
}

/**
 * Un panel. «excel»: barra de título de color con letra blanca, como «Reporte
 * Diario» del libro. «java»: título en negrita sobre blanco, como los gráficos
 * de la referencia.
 */
export function Panel({
  titulo,
  estilo = 'java',
  color = '#e06666',
  acciones,
  children,
  className = '',
  relleno = true,
}: {
  titulo?: ReactNode
  estilo?: 'excel' | 'java'
  color?: string
  acciones?: ReactNode
  children: ReactNode
  className?: string
  relleno?: boolean
}) {
  return (
    <section className={`hoja sombra-hoja flex min-w-0 flex-col ${className}`}>
      {titulo &&
        (estilo === 'excel' ? (
          <header className="flex min-h-[38px] items-center justify-between gap-2 px-3 text-white" style={{ background: color }}>
            <h2 className="flex-1 text-center text-[15px]">{titulo}</h2>
            {acciones}
          </header>
        ) : (
          <header className="flex min-h-11 items-center justify-between gap-2 border-b border-reja px-4 pt-1">
            <h2 className="text-[15.5px] font-bold text-tinta">{titulo}</h2>
            {acciones}
          </header>
        ))}
      <div className={`min-h-0 flex-1 ${relleno ? 'p-4' : ''}`}>{children}</div>
    </section>
  )
}

/** Tarjeta de cifra con degradado y su ícono en un círculo blanco. */
export function Kpi({
  titulo,
  valor,
  detalle,
  icono,
  color,
  a,
}: {
  titulo: string
  valor: ReactNode
  detalle?: ReactNode
  icono: string
  color: 'rojo' | 'turquesa' | 'verde' | 'magenta'
  a?: string
}) {
  const tinta = { rojo: 'text-[#cc4125]', turquesa: 'text-turquesa', verde: 'text-verde-2', magenta: 'text-magenta' }[color]
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`kpi kpi-${color} flex min-h-[112px] items-center gap-3 px-4 py-3.5`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-white/90">{titulo}</p>
        <p className="mt-1 truncate text-[24px] leading-tight font-bold tabular-nums">{valor}</p>
        {detalle && <p className="mt-0.5 truncate text-[12.5px] text-white/85">{detalle}</p>}
        {a && (
          <Link to={a} className="mt-1.5 inline-flex items-center text-[12px] font-medium text-white/90 hover:text-white hover:underline">
            Ver detalle <Icono d={mdiChevronRight} className="size-4" />
          </Link>
        )}
      </div>
      <span className={`grid size-14 shrink-0 place-items-center rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.18)] ${tinta}`}>
        <Icono d={icono} className="size-7" />
      </span>
    </motion.div>
  )
}

export interface Columna {
  titulo: string
  ancho?: string
  alinear?: 'izquierda' | 'centro' | 'derecha'
}

/** Tabla con la cabecera de color de la hoja; se desplaza de lado en el celular. */
export function Tabla({
  columnas,
  tono = 'verde',
  children,
  pie,
  alto,
  className = '',
}: {
  columnas: Columna[]
  tono?: Tono
  children: ReactNode
  pie?: ReactNode
  alto?: string
  className?: string
}) {
  return (
    <div className={`barra-fina overflow-auto ${className}`} style={alto ? { maxHeight: alto } : undefined}>
      <table className="tabla" style={{ '--tono': TONO[tono] } as CSSProperties}>
        <colgroup>
          {columnas.map((c, i) => (
            <col key={i} style={c.ancho ? { width: c.ancho } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th key={i}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
        {pie && <tfoot>{pie}</tfoot>}
      </table>
    </div>
  )
}

export const alinear = (a?: Columna['alinear']) => (a === 'derecha' ? 'text-right tabular-nums' : a === 'centro' ? 'text-center' : 'text-left')

/** La casilla de verificación de Sheets: cuadrada, verde al marcarla. */
export function Casilla({
  marcada,
  alCambiar,
  etiqueta,
  deshabilitada = false,
}: {
  marcada: boolean
  alCambiar: (v: boolean) => void
  etiqueta: string
  deshabilitada?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcada}
      aria-label={etiqueta}
      title={etiqueta}
      disabled={deshabilitada}
      onClick={() => alCambiar(!marcada)}
      className="mx-auto grid size-8 place-items-center disabled:opacity-40"
    >
      <span className={`grid size-[18px] place-items-center border-2 transition-colors ${marcada ? 'border-verde-2 bg-verde-2 text-white' : 'border-tinta-3 bg-hoja'}`}>
        {marcada && <Icono d={mdiCheckBold} className="size-3.5" />}
      </span>
    </button>
  )
}

/**
 * Una celda que se edita en el sitio: se ve como texto, se toca y se escribe,
 * y se guarda al salir o con Enter. Escape deshace.
 */
export function CeldaEditable({
  valor,
  alGuardar,
  tipo = 'texto',
  alinear: al,
  placeholder,
  maximo = 90,
  etiqueta,
}: {
  valor: string | number | null
  alGuardar: (v: string | number | null) => Promise<unknown>
  tipo?: 'texto' | 'soles' | 'numero'
  alinear?: Columna['alinear']
  placeholder?: string
  maximo?: number
  etiqueta: string
}) {
  const mostrar = (v: string | number | null) => (v === null || v === undefined ? '' : tipo === 'soles' ? soles(Number(v)) : String(v))
  const [texto, setTexto] = useState(mostrar(valor))
  const [antes, setAntes] = useState(valor)
  const [guardando, setGuardando] = useState(false)
  if (valor !== antes) {
    setAntes(valor)
    setTexto(mostrar(valor))
  }

  const convertir = (t: string): string | number | null => {
    const limpio = t.trim()
    if (tipo === 'texto') return limpio || null
    if (!limpio) return null
    const n = Number(limpio.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return NaN
    return tipo === 'soles' ? Math.round(n * 100) : n
  }

  const guardar = async () => {
    const nuevo = convertir(texto)
    if (nuevo === valor || (nuevo === null && (valor === '' || valor === null))) return setTexto(mostrar(valor))
    if (typeof nuevo === 'number' && Number.isNaN(nuevo)) {
      avisar('Escribe un número válido.', 'error')
      return setTexto(mostrar(valor))
    }
    setGuardando(true)
    try {
      await alGuardar(nuevo)
    } catch (e) {
      avisar((e as Error).message, 'error')
      setTexto(mostrar(valor))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <span className="relative flex h-[38px] items-center">
      <input
        value={texto}
        aria-label={etiqueta}
        placeholder={placeholder}
        inputMode={tipo === 'texto' ? undefined : 'decimal'}
        onChange={(e) => setTexto(e.target.value.slice(0, maximo))}
        onFocus={(e) => e.target.select()}
        onBlur={() => void guardar()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setTexto(mostrar(valor))
            requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
          }
        }}
        className={`h-full w-full min-w-0 border-0 bg-transparent px-2 text-[14px] outline-none placeholder:text-tinta-4 focus:bg-hoja focus:shadow-[inset_0_0_0_2px_var(--color-azul)] ${alinear(al)}`}
      />
      {guardando && <Rueda className="absolute right-1.5 size-3.5 text-azul" />}
    </span>
  )
}

/** Campo de fecha o mes, rectangular, con su etiqueta delante. */
export function CampoFecha({
  valor,
  alCambiar,
  max,
  min,
  etiqueta,
  tipo = 'date',
}: {
  valor: string
  alCambiar: (v: string) => void
  max?: string
  min?: string
  etiqueta?: string
  tipo?: 'date' | 'month'
}) {
  return (
    <label className="flex h-9 items-stretch border border-reja-2 bg-hoja text-[13.5px] focus-within:border-azul">
      {etiqueta && <span className="flex items-center border-r border-reja bg-gris-100 px-2.5 text-tinta-2">{etiqueta}</span>}
      <input
        type={tipo}
        value={valor}
        max={max}
        min={min}
        onChange={(e) => e.target.value && alCambiar(e.target.value)}
        className="min-w-0 bg-transparent px-2 text-[13.5px] tabular-nums outline-none"
      />
    </label>
  )
}

/** Pestañas dentro de una página (Productos · Familias · Adicionales…). */
export function PestanasPagina<T extends string>({
  pestanas,
  activa,
  alCambiar,
}: {
  pestanas: { clave: T; etiqueta: string; icono?: string; cuenta?: number }[]
  activa: T
  alCambiar: (t: T) => void
}) {
  return (
    <div role="tablist" className="sin-barra mb-0 flex overflow-x-auto border-b border-reja-2">
      {pestanas.map((p) => {
        const esta = p.clave === activa
        return (
          <button
            key={p.clave}
            role="tab"
            aria-selected={esta}
            onClick={() => alCambiar(p.clave)}
            className={`relative -mb-px flex h-10 shrink-0 items-center gap-2 border border-b-0 px-4 text-[14px] transition-colors ${
              esta ? 'border-reja-2 bg-hoja font-medium text-verde-2' : 'border-transparent text-tinta-2 hover:text-tinta'
            }`}
          >
            {esta && <span className="absolute inset-x-0 -top-px h-[3px] bg-verde-2" />}
            {p.icono && <Icono d={p.icono} className="size-[18px]" />}
            {p.etiqueta}
            {p.cuenta !== undefined && <span className="bg-gris-150 px-1.5 text-[12px] text-tinta-2 tabular-nums">{p.cuenta}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Envuelve una llamada al servidor: avisa el error y, si sale bien, recarga. */
export function useAccion(recargar?: () => unknown) {
  return async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) avisar(ok, 'ok')
      await recargar?.()
      return true
    } catch (e) {
      avisar((e as Error).message, 'error')
      return false
    }
  }
}

/** «S/ 1 234.50», para tarjetas y totales. */
export const enSoles = (c: number) => `S/ ${soles(c)}`

/** Para las cifras grandes de las tarjetas: «S/ 12.4 mil». */
export const solesCortos = (c: number) => {
  const s = c / 100
  return s >= 10000 ? `S/ ${(s / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} mil` : enSoles(c)
}

/** Descarga una tabla como CSV que abre Excel (con BOM y punto y coma). */
export function descargarCsv(nombre: string, filas: (string | number | null)[][]) {
  const csv = filas
    .map((f) => f.map((v) => (v === null || v === undefined ? '' : /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(';'))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
