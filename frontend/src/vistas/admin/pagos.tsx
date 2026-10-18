import { useState } from 'react'
import { mdiArrowDown, mdiArrowUp, mdiDelete, mdiDotsVertical, mdiPlus } from '@mdi/js'
import type { MedioPago } from '@wasi/shared'
import { api } from '../../lib/api'
import { useRecurso } from '../../lib/recurso'
import { Menu } from '../../componentes/desplegable'
import { confirmar } from '../../componentes/dialogo'
import { Icono, iconoMedio } from '../../componentes/icono'
import { Casilla, CeldaEditable, Pagina, Panel, Tabla, useAccion } from './piezas'

/**
 * Los tipos de pago del desplegable «Tipo y Monto de Pago» de la nota. Los que
 * «dan vuelto» funcionan como el efectivo: se puede recibir de más y la nota
 * calcula el vuelto. Un medio con cobros no se borra: se desactiva.
 */
export function TiposPago() {
  const { datos, recargar } = useRecurso<(MedioPago & { pagos: number })[]>('/admin/medios', (c) => !!c.ajustes)
  const accion = useAccion(recargar)
  const [nuevo, setNuevo] = useState('')
  const medios = datos ?? []
  const ids = medios.map((m) => m.id)
  const guardar = (id: number, d: object) => api(`/admin/medios/${id}`, { metodo: 'PATCH', cuerpo: d }).then(recargar)
  const ordenar = (id: number, paso: -1 | 1) => {
    const i = ids.indexOf(id)
    const j = i + paso
    if (j < 0 || j >= ids.length) return
    const orden = [...ids]
    ;[orden[i], orden[j]] = [orden[j], orden[i]]
    void accion(() => api('/admin/orden', { metodo: 'PUT', cuerpo: { que: 'medioPago', ids: orden } }))
  }
  const agregar = async () => {
    if (!nuevo.trim()) return
    if (await accion(() => api('/admin/medios', { cuerpo: { nombre: nuevo.trim(), efectivo: false } }), 'Tipo de pago agregado')) setNuevo('')
  }

  return (
    <Pagina titulo="Tipos de pago" detalle="Lo que el mozo elige en «Tipo y Monto de Pago» al cobrar.">
      <div className="max-w-[820px]">
        <Panel titulo="Tipo de pago" estilo="excel" color="#e06666" relleno={false}>
          <Tabla
            tono="rojo"
            columnas={[
              { titulo: 'N°', ancho: '48px' },
              { titulo: 'Tipo de pago:' },
              { titulo: 'Da vuelto', ancho: '92px' },
              { titulo: 'Activo', ancho: '72px' },
              { titulo: 'Cobros', ancho: '84px' },
              { titulo: '', ancho: '48px' },
            ]}
          >
            {medios.map((m, i) => (
              <tr key={m.id} className={m.activo ? '' : 'text-tinta-3'}>
                <td className="text-center text-tinta-3 tabular-nums">{i + 1}</td>
                <td className="editable">
                  <span className="flex items-center">
                    <Icono d={iconoMedio(m)} className="ml-2 size-[18px] text-tinta-3" />
                    <CeldaEditable etiqueta="Nombre" valor={m.nombre} maximo={40} alGuardar={(v) => (v ? guardar(m.id, { nombre: v }) : Promise.reject(new Error('El nombre no puede quedar vacío.')))} />
                  </span>
                </td>
                <td>
                  <Casilla etiqueta="Da vuelto (como el efectivo)" marcada={m.efectivo} alCambiar={(v) => void accion(() => guardar(m.id, { efectivo: v }))} />
                </td>
                <td>
                  <Casilla etiqueta="Activo" marcada={m.activo} alCambiar={(v) => void accion(() => guardar(m.id, { activo: v }))} />
                </td>
                <td className="text-center text-tinta-2 tabular-nums">{m.pagos.toLocaleString('es-PE') || ''}</td>
                <td className="px-0!">
                  <Menu
                    titulo="Acciones"
                    disparador={<Icono d={mdiDotsVertical} className="size-5" />}
                    className="mx-auto grid size-8 place-items-center text-tinta-2 hover:bg-gris-150 hover:text-tinta"
                    acciones={[
                      { etiqueta: 'Subir', icono: mdiArrowUp, alElegir: () => ordenar(m.id, -1) },
                      { etiqueta: 'Bajar', icono: mdiArrowDown, alElegir: () => ordenar(m.id, 1) },
                      {
                        etiqueta: m.pagos ? 'Borrar (tiene cobros)' : 'Borrar',
                        icono: mdiDelete,
                        peligro: true,
                        deshabilitada: m.pagos > 0,
                        alElegir: async () => {
                          if (await confirmar({ titulo: 'Borrar tipo de pago', mensaje: `¿Borrar ${m.nombre}?`, aceptar: 'Borrar', peligro: true }))
                            void accion(() => api(`/admin/medios/${m.id}`, { metodo: 'DELETE' }), 'Tipo de pago borrado')
                        },
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td />
              <td className="editable" colSpan={3}>
                <input
                  value={nuevo}
                  onChange={(e) => setNuevo(e.target.value.slice(0, 40))}
                  onKeyDown={(e) => e.key === 'Enter' && void agregar()}
                  placeholder="Nuevo tipo de pago (ej. Tarjeta, BBVA) y Enter"
                  className="h-[38px] w-full bg-transparent px-2 text-[14px] outline-none placeholder:text-tinta-4 focus:shadow-[inset_0_0_0_2px_var(--color-azul)]"
                />
              </td>
              <td colSpan={2} className="px-1!">
                <button onClick={() => void agregar()} disabled={!nuevo.trim()} className="flex h-8 w-full items-center justify-center gap-1 text-[13px] text-verde-2 hover:bg-menta-suave disabled:text-tinta-4">
                  <Icono d={mdiPlus} className="size-4" /> Agregar
                </button>
              </td>
            </tr>
          </Tabla>
        </Panel>
        <p className="mt-2 text-[12.5px] text-tinta-3">Los electrónicos (Yape, Plin, bancos) se cobran por su monto exacto; con «Da vuelto» se puede recibir de más, como con el efectivo.</p>
      </div>
    </Pagina>
  )
}
