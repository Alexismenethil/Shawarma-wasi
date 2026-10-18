import { useEffect, useState } from 'react'
import type { Estacion, MesaResumen } from '@wasi/shared'
import { ESTACIONES, codigoMesa } from '@wasi/shared'
import { useAjustes, nombreCocina } from '../../lib/ajustes'
import { Dialogo } from '../../componentes/dialogo'
import { Boton } from '../../componentes/boton'
import { Desplegable } from '../../componentes/desplegable'
import { aCentimos } from './pago'

/**
 * «Otros» del Excel: un producto que no está en la carta (allí el precio se
 * escribía entre paréntesis en la columna Obs). Aquí se pide nombre, precio y
 * a qué cocina va.
 */
export function DialogoLibre({
  abierto,
  inicial,
  alCerrar,
  alGuardar,
}: {
  abierto: boolean
  inicial?: { nombre: string; precio: number; estacion: Estacion }
  alCerrar: () => void
  alGuardar: (libre: { nombre: string; precio: number; estacion: Estacion }) => void
}) {
  const ajustes = useAjustes()
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [estacion, setEstacion] = useState<Estacion>('CARTA')

  useEffect(() => {
    if (!abierto) return
    setNombre(inicial?.nombre ?? '')
    setPrecio(inicial ? (inicial.precio / 100).toFixed(2) : '')
    setEstacion(inicial?.estacion ?? 'CARTA')
  }, [abierto, inicial])

  const valido = nombre.trim().length > 0 && aCentimos(precio) > 0
  const guardar = () => {
    if (!valido) return
    alGuardar({ nombre: nombre.trim(), precio: aCentimos(precio), estacion })
    alCerrar()
  }

  return (
    <Dialogo
      abierto={abierto}
      titulo="Otros · producto libre"
      alCerrar={alCerrar}
      botones={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton variante="guardar" disabled={!valido} onClick={guardar} className="min-w-28">
            {inicial ? 'Cambiar' : 'Agregar a la nota'}
          </Boton>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          guardar()
        }}
        className="grid gap-4"
      >
        <label className="grid gap-1.5 text-[13px] text-tinta-2">
          Producto
          <input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value.slice(0, 80))} placeholder="Ej. Tamal, Porción de papas" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-[13px] text-tinta-2">
            Precio (S/)
            <input className="campo text-right tabular-nums" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, '').slice(0, 8))} placeholder="0.00" />
          </label>
          <div className="grid gap-1.5 text-[13px] text-tinta-2">
            Va a
            <Desplegable
              titulo="Cocina"
              estilo="campo"
              valor={estacion}
              opciones={ESTACIONES.map((e) => ({ valor: e, etiqueta: nombreCocina(ajustes, e) }))}
              alCambiar={setEstacion}
              buscador={false}
            />
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Dialogo>
  )
}

/** Pasar la nota a otra mesa libre: los clientes se cambiaron de sitio. */
export function DialogoMover({
  abierto,
  mesas,
  actual,
  alCerrar,
  alElegir,
}: {
  abierto: boolean
  mesas: MesaResumen[]
  actual: number
  alCerrar: () => void
  alElegir: (m: MesaResumen) => void
}) {
  const libres = mesas.filter((m) => m.estado === 'LIBRE' && m.id !== actual)
  return (
    <Dialogo abierto={abierto} titulo="Mover la nota a otra mesa" alCerrar={alCerrar} botones={<Boton onClick={alCerrar}>Cancelar</Boton>}>
      {(['SALON', 'LLEVAR'] as const).map((tipo) => {
        const lista = libres.filter((m) => m.tipo === tipo)
        if (!lista.length) return null
        return (
          <div key={tipo} className="mb-4 last:mb-0">
            <p className="mb-2 text-[13px] font-medium text-tinta-2">{tipo === 'SALON' ? 'Mesas libres del salón' : 'Para llevar libres'}</p>
            <div className="grid grid-cols-5 gap-px border border-reja bg-reja sm:grid-cols-6">
              {lista.map((m) => (
                <button key={m.id} onClick={() => alElegir(m)} className="h-12 bg-hoja text-[15px] font-medium hover:bg-menta-suave hover:text-verde-2">
                  {codigoMesa(m)}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      {libres.length === 0 && <p className="text-[14px] text-tinta-2">No hay mesas libres ahora.</p>}
    </Dialogo>
  )
}
