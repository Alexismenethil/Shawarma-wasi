import { useState } from 'react'
import { Link } from 'react-router'
import { mdiClose, mdiContentSave, mdiPlus } from '@mdi/js'
import type { Ajustes, Estacion } from '@wasi/shared'
import { ESTACIONES, NUMERO_ESTACION } from '@wasi/shared'
import { api } from '../../lib/api'
import { useAjustes } from '../../lib/ajustes'
import { avisar } from '../../componentes/avisos'
import { Boton } from '../../componentes/boton'
import { Icono } from '../../componentes/icono'
import { Logo } from '../../componentes/marca'
import { Pagina, Panel } from './piezas'

type Formulario = Omit<Ajustes, 'medios' | 'sucursales'>

/**
 * Los datos generales, los que comparten todas las sucursales: el nombre y el
 * subtítulo que encabezan cada hoja, el RUC y el pie de la nota impresa, el
 * nombre de cada cocina, las observaciones rápidas de la columna «Obs:» y
 * cuándo un pedido se considera demorado. La dirección y el teléfono son de
 * cada sucursal (Administración → Sucursales).
 */
export function DatosLocal() {
  const ajustes = useAjustes()
  const [f, setF] = useState<Formulario | null>(null)
  const [nueva, setNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cargado, setCargado] = useState(false)
  if (ajustes.cargado && !cargado) {
    setCargado(true)
    const { medios: _m, sucursales: _s, cargado: _c, ...resto } = ajustes
    setF(resto)
  }
  if (!f) return null

  const original = (() => {
    const { medios: _m, sucursales: _s, cargado: _c, ...resto } = ajustes
    return JSON.stringify(resto)
  })()
  const cambiado = JSON.stringify(f) !== original
  const poner = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF({ ...f, [k]: v })

  const guardar = async () => {
    if (!f.nombre.trim()) return avisar('El nombre del local no puede quedar vacío.', 'error')
    setGuardando(true)
    try {
      await api('/admin/ajustes', { metodo: 'PATCH', cuerpo: f })
      avisar('Datos generales guardados', 'ok')
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  const agregarObs = () => {
    const t = nueva.trim()
    if (!t || f.observaciones.includes(t)) return setNueva('')
    poner('observaciones', [...f.observaciones, t])
    setNueva('')
  }

  const campo = (k: 'nombre' | 'subtitulo' | 'ruc' | 'pieNota', etiqueta: string, placeholder = '', max = 60) => (
    <label className="grid gap-1.5 text-[13px] text-tinta-2">
      {etiqueta}
      <input className="campo" value={f[k]} maxLength={max} placeholder={placeholder} onChange={(e) => poner(k, e.target.value)} />
    </label>
  )

  return (
    <Pagina
      titulo="Datos generales"
      detalle="Lo que comparten todas las sucursales: el encabezado de cada hoja y la nota impresa."
      acciones={
        <Boton variante="guardar" icono={mdiContentSave} disabled={!cambiado} cargando={guardando} onClick={() => void guardar()} className="h-9">
          Guardar cambios
        </Boton>
      }
    >
      <div className="grid max-w-[1100px] gap-4 lg:grid-cols-2">
        <Panel titulo="El negocio" estilo="excel" color="#93c47d">
          <div className="grid gap-4">
            <div className="flex items-center gap-3 border border-reja bg-gris-50 px-3 py-3">
              <Logo className="size-12" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-tinta-3">Así se ve el encabezado:</p>
                <TituloVista nombre={f.nombre} subtitulo={f.subtitulo} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {campo('nombre', 'Nombre del local', 'Shawarma Wasi', 40)}
              {campo('subtitulo', 'Subtítulo', 'Peruvian Cuisine')}
            </div>
            {campo('ruc', 'RUC', '', 20)}
            {campo('pieNota', 'Mensaje al pie de la nota impresa', '¡Gracias por su visita!', 140)}
            <p className="text-[12.5px] text-tinta-3">
              La dirección y el teléfono que salen en la nota son de cada sucursal: se editan en{' '}
              <Link to="/admin/sucursales" className="text-azul underline">
                Sucursales
              </Link>
              .
            </p>
          </div>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel titulo="Cocinas" estilo="excel" color="#134f5c">
            <div className="grid gap-3">
              {ESTACIONES.map((e: Estacion) => (
                <label key={e} className="grid grid-cols-[86px_1fr] items-center gap-2 text-[13.5px] text-tinta-2">
                  Cocina {NUMERO_ESTACION[e]}
                  <input className="campo" value={f.estaciones[e]} maxLength={30} onChange={(ev) => poner('estaciones', { ...f.estaciones, [e]: ev.target.value })} />
                </label>
              ))}
              <label className="grid grid-cols-[1fr_90px] items-center gap-2 border-t border-reja pt-3 text-[13.5px] text-tinta-2">
                Minutos para marcar un pedido como demorado
                <input
                  className="campo text-center tabular-nums"
                  inputMode="numeric"
                  value={f.minutosAlerta}
                  onChange={(e) => poner('minutosAlerta', Math.max(0, Math.min(120, Number(e.target.value.replace(/\D/g, '')) || 0)))}
                />
              </label>
            </div>
          </Panel>

          <Panel titulo="Observaciones rápidas (columna «Obs:»)" estilo="excel" color="#b45f06">
            <div className="flex flex-wrap gap-1.5">
              {f.observaciones.map((o) => (
                <span key={o} className="flex h-8 items-center gap-1 border border-reja-2 bg-gris-50 pr-1 pl-2.5 text-[13.5px]">
                  {o}
                  <button onClick={() => poner('observaciones', f.observaciones.filter((x) => x !== o))} aria-label={`Quitar ${o}`} className="grid size-6 place-items-center text-tinta-3 hover:text-rojo">
                    <Icono d={mdiClose} className="size-4" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="campo"
                value={nueva}
                maxLength={40}
                placeholder="Nueva observación (ej. Sin mayonesa)"
                onChange={(e) => setNueva(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && agregarObs()}
              />
              <Boton icono={mdiPlus} onClick={agregarObs} disabled={!nueva.trim()} className="h-9">
                Agregar
              </Boton>
            </div>
            <p className="mt-2 text-[12.5px] text-tinta-3">El mozo las ve como sugerencias al escribir en «Obs:»; igual puede escribir lo que quiera.</p>
          </Panel>
        </div>
      </div>
    </Pagina>
  )
}

/** Vista previa del título con lo que se está escribiendo (aún sin guardar). */
function TituloVista({ nombre, subtitulo }: { nombre: string; subtitulo: string }) {
  return (
    <span className="block leading-tight font-bold text-vino">
      <span className="block truncate text-[17px] uppercase">{nombre || ' '}</span>
      {subtitulo && <span className="block truncate text-[14px]">{subtitulo}</span>}
    </span>
  )
}
