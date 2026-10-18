import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

/**
 * Gráficos sin librería, con el estilo de los de Sheets que el local ya usaba
 * («Tendencia de Ventas», «Preferencia de Productos»): colores planos de la
 * paleta de Google, barras rectas, porcentajes dentro de la torta y la leyenda
 * con sus montos al lado.
 */

export const PALETA = ['#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01', '#46bdc6', '#7baaf7', '#f07b72', '#a142f4', '#9aa0a6']

export function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const obs = new ResizeObserver(([e]) => setAncho(e.contentRect.width))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, ancho] as const
}

/** Divisiones redondas para el eje: 0 / 500 / 1 000… */
function marcas(max: number, cuantas = 4) {
  if (max <= 0) return [0, 1]
  const crudo = max / cuantas
  const potencia = 10 ** Math.floor(Math.log10(crudo))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= crudo)!
  const lista: number[] = []
  for (let v = 0; v <= max + paso * 0.001; v += paso) lista.push(v)
  if (lista[lista.length - 1] < max) lista.push(lista[lista.length - 1] + paso)
  return lista
}

/* ── Torta / dona ───────────────────────────────────────────────────────── */

export interface Tajada {
  nombre: string
  valor: number
  color?: string
  detalle?: string
}

function arco(cx: number, cy: number, r: number, ri: number, a0: number, a1: number) {
  // Una tajada entera no se puede dibujar como arco: se parte en dos.
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4
  const p = (a: number, rr: number) => [cx + rr * Math.sin(a), cy - rr * Math.cos(a)]
  const grande = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = p(a0, r)
  const [x1, y1] = p(a1, r)
  if (ri <= 0) return `M${cx},${cy}L${x0},${y0}A${r},${r} 0 ${grande} 1 ${x1},${y1}Z`
  const [x2, y2] = p(a1, ri)
  const [x3, y3] = p(a0, ri)
  return `M${x0},${y0}A${r},${r} 0 ${grande} 1 ${x1},${y1}L${x2},${y2}A${ri},${ri} 0 ${grande} 0 ${x3},${y3}Z`
}

export function Torta({
  datos,
  formato,
  dona = false,
  tamano = 190,
  vacio = 'Sin datos en este periodo',
}: {
  datos: Tajada[]
  formato: (v: number) => string
  dona?: boolean
  tamano?: number
  vacio?: string
}) {
  const [activa, setActiva] = useState<number | null>(null)
  const total = datos.reduce((s, d) => s + d.valor, 0)
  if (total <= 0) return <p className="grid h-[190px] place-items-center text-[13.5px] text-tinta-3">{vacio}</p>

  const r = tamano / 2
  const ri = dona ? r * 0.55 : 0
  let angulo = 0
  const tajadas = datos.map((d, i) => {
    const a0 = angulo
    angulo += (d.valor / total) * Math.PI * 2
    return { ...d, i, a0, a1: angulo, color: d.color ?? PALETA[i % PALETA.length], parte: d.valor / total }
  })

  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-4 @md:flex-row @md:items-center">
        <svg viewBox={`0 0 ${tamano} ${tamano}`} className="shrink-0" style={{ width: tamano, height: tamano }} role="img" aria-label="Gráfico circular">
          {tajadas.map((t) => {
            const medio = (t.a0 + t.a1) / 2
            const rl = dona ? (r + ri) / 2 : r * 0.64
            return (
              <g key={t.nombre} onPointerEnter={() => setActiva(t.i)} onPointerLeave={() => setActiva(null)}>
                <motion.path
                  d={arco(r, r, r - 2, ri, t.a0, t.a1)}
                  fill={t.color}
                  stroke="#fff"
                  strokeWidth={1.5}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: activa === null || activa === t.i ? 1 : 0.45, scale: 1 }}
                  transition={{ duration: 0.35, delay: t.i * 0.04 }}
                  style={{ transformOrigin: `${r}px ${r}px` }}
                />
                {t.parte >= 0.06 && (
                  <text x={r + rl * Math.sin(medio)} y={r - rl * Math.cos(medio)} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-white text-[11.5px] font-medium">
                    {Math.round(t.parte * 100)}%
                  </text>
                )}
              </g>
            )
          })}
          {dona && (
            <text x={r} y={r} textAnchor="middle" dominantBaseline="central" className="fill-tinta text-[13px] font-bold">
              {activa !== null ? `${Math.round(tajadas[activa].parte * 100)}%` : formato(total)}
            </text>
          )}
        </svg>
        <ul className="w-full min-w-0 space-y-1 text-[13px]">
          {tajadas.map((t) => (
            <li
              key={t.nombre}
              onPointerEnter={() => setActiva(t.i)}
              onPointerLeave={() => setActiva(null)}
              className={`flex items-center gap-2 px-1 py-0.5 ${activa === t.i ? 'bg-gris-100' : ''}`}
            >
              <span className="size-3 shrink-0" style={{ background: t.color }} />
              <span className="min-w-0 flex-1 truncate text-tinta">{t.nombre}</span>
              <span className="shrink-0 text-tinta-2 tabular-nums">{formato(t.valor)}</span>
              <span className="w-10 shrink-0 text-right text-tinta-3 tabular-nums">{Math.round(t.parte * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ── Barras verticales ──────────────────────────────────────────────────── */

export function Barras({
  datos,
  formato,
  formatoEje = formato,
  alto = 230,
  color = PALETA[0],
  vacio = 'Sin ventas en este periodo',
}: {
  datos: { etiqueta: string; valor: number; detalle?: string; resaltar?: boolean }[]
  formato: (v: number) => string
  formatoEje?: (v: number) => string
  alto?: number
  color?: string
  vacio?: string
}) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const [activa, setActiva] = useState<number | null>(null)
  const max = Math.max(0, ...datos.map((d) => d.valor))
  const ejes = marcas(max)
  const tope = ejes[ejes.length - 1] || 1
  const izq = 52
  const abajo = 26
  const arriba = 12
  const util = Math.max(0, ancho - izq - 8)
  const paso = datos.length ? util / datos.length : 0
  const w = Math.max(2, Math.min(42, paso * 0.68))
  const cada = Math.max(1, Math.ceil(datos.length / Math.max(1, Math.floor(util / 46))))
  const y = (v: number) => arriba + (alto - abajo - arriba) * (1 - v / tope)

  return (
    <div ref={ref} className="relative w-full" style={{ height: alto }}>
      {max <= 0 ? (
        <p className="grid h-full place-items-center text-[13.5px] text-tinta-3">{vacio}</p>
      ) : (
        ancho > 0 && (
          <svg width={ancho} height={alto} role="img" aria-label="Gráfico de barras">
            {ejes.map((v) => (
              <g key={v}>
                <line x1={izq} x2={ancho - 4} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#9aa0a6' : '#e8eaed'} />
                <text x={izq - 6} y={y(v)} textAnchor="end" dominantBaseline="central" className="fill-tinta-3 text-[11px] tabular-nums">
                  {formatoEje(v)}
                </text>
              </g>
            ))}
            {datos.map((d, i) => {
              const x = izq + paso * i + (paso - w) / 2
              const h = (alto - abajo) - y(d.valor)
              return (
                <g key={i} onPointerEnter={() => setActiva(i)} onPointerLeave={() => setActiva(null)}>
                  <rect x={izq + paso * i} y={0} width={paso} height={alto - abajo} fill="transparent" />
                  <motion.rect
                    x={x}
                    width={w}
                    initial={{ y: alto - abajo, height: 0 }}
                    animate={{ y: y(d.valor), height: h }}
                    transition={{ duration: 0.45, delay: Math.min(i, 30) * 0.012, ease: [0.2, 0.8, 0.2, 1] }}
                    fill={d.resaltar ? '#ea4335' : color}
                    opacity={activa === null || activa === i ? 1 : 0.55}
                  />
                  {i % cada === 0 && (
                    <text x={x + w / 2} y={alto - 8} textAnchor="middle" className="fill-tinta-2 text-[11px] tabular-nums">
                      {d.etiqueta}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )
      )}
      {activa !== null && datos[activa] && (
        <div
          className="sombra-menu pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full border border-reja-2 bg-hoja px-2.5 py-1.5 text-[12.5px] whitespace-nowrap"
          style={{ left: izq + paso * activa + paso / 2, top: y(datos[activa].valor) - 6 }}
        >
          <b className="block font-medium text-tinta">{datos[activa].detalle ?? datos[activa].etiqueta}</b>
          <span className="text-tinta-2 tabular-nums">{formato(datos[activa].valor)}</span>
        </div>
      )}
    </div>
  )
}

/* ── Barras horizontales (ranking) ──────────────────────────────────────── */

export function BarrasH({
  datos,
  formato,
  color = PALETA[0],
}: {
  datos: { nombre: string; valor: number; detalle?: string }[]
  formato: (v: number) => string
  color?: string
}) {
  const max = Math.max(1, ...datos.map((d) => d.valor))
  return (
    <ol className="space-y-1.5">
      {datos.map((d, i) => (
        <li key={d.nombre} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2 text-[13px]">
          <span className="text-right text-tinta-3 tabular-nums">{i + 1}</span>
          <span className="min-w-0">
            <span className="block truncate text-tinta">{d.nombre}</span>
            <span className="mt-0.5 block h-2.5 bg-gris-100">
              <motion.span
                className="block h-full"
                style={{ background: color }}
                initial={{ width: 0 }}
                animate={{ width: `${(d.valor / max) * 100}%` }}
                transition={{ duration: 0.5, delay: i * 0.03, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </span>
          </span>
          <span className="text-right leading-tight tabular-nums">
            <b className="block font-medium text-tinta">{formato(d.valor)}</b>
            {d.detalle && <span className="block text-[11.5px] text-tinta-3">{d.detalle}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** «+12 %» en verde o «−5 %» en rojo, contra el periodo anterior. */
export function Delta({ actual, anterior }: { actual: number; anterior: number }) {
  if (!anterior) return null
  const d = ((actual - anterior) / anterior) * 100
  const sube = d >= 0
  return (
    <span className={`text-[12.5px] font-medium tabular-nums ${sube ? 'text-[#c9f2cf]' : 'text-[#ffd0c8]'}`}>
      {sube ? '▲' : '▼'} {Math.abs(d).toLocaleString('es-PE', { maximumFractionDigits: 1 })}% vs. periodo anterior
    </span>
  )
}
