import { useSearchParams } from 'react-router'
import { hoyLima, sumarDias } from '../../lib/formato'
import { CampoFecha } from './piezas'

/** El rango de fechas vive en la dirección: se puede volver atrás y compartir. */
const PRESETS = [
  { clave: 'hoy', nombre: 'Hoy' },
  { clave: '7', nombre: '7 días' },
  { clave: '30', nombre: '30 días' },
  { clave: 'mes', nombre: 'Este mes' },
  { clave: 'pasado', nombre: 'Mes pasado' },
] as const

function calcular(clave: string, hoy: string) {
  if (clave === 'hoy') return { desde: hoy, hasta: hoy }
  if (clave === '7') return { desde: sumarDias(hoy, -6), hasta: hoy }
  if (clave === 'mes') return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
  if (clave === 'pasado') {
    const fin = sumarDias(`${hoy.slice(0, 7)}-01`, -1)
    return { desde: `${fin.slice(0, 7)}-01`, hasta: fin }
  }
  return { desde: sumarDias(hoy, -29), hasta: hoy }
}

export function useRango(porDefecto = '30') {
  const [params, setParams] = useSearchParams()
  const hoy = hoyLima()
  const preset = params.get('p') ?? (params.get('desde') ? null : porDefecto)
  const { desde, hasta } = preset ? calcular(preset, hoy) : { desde: params.get('desde')!, hasta: params.get('hasta') ?? hoy }
  const elegir = (p: string) => setParams((ps) => (ps.delete('desde'), ps.delete('hasta'), ps.set('p', p), ps), { replace: true })
  const fijar = (d: string, h: string) => setParams((ps) => (ps.delete('p'), ps.set('desde', d), ps.set('hasta', h), ps), { replace: true })
  return { desde, hasta, preset, hoy, elegir, fijar }
}

/** Botones de rango rápido pegados entre sí, como una barra de herramientas, y las dos fechas. */
export function FiltroRango({ rango }: { rango: ReturnType<typeof useRango> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex border border-reja-2 bg-hoja">
        {PRESETS.map((p) => (
          <button
            key={p.clave}
            onClick={() => rango.elegir(p.clave)}
            className={`h-9 border-r border-reja px-3 text-[13.5px] last:border-r-0 ${rango.preset === p.clave ? 'bg-verde-2 font-medium text-white' : 'text-tinta-2 hover:bg-gris-50 hover:text-tinta'}`}
          >
            {p.nombre}
          </button>
        ))}
      </div>
      <CampoFecha etiqueta="Desde" valor={rango.desde} max={rango.hasta} alCambiar={(d) => rango.fijar(d, rango.hasta)} />
      <CampoFecha etiqueta="Hasta" valor={rango.hasta} min={rango.desde} max={rango.hoy} alCambiar={(h) => rango.fijar(rango.desde, h)} />
    </div>
  )
}
