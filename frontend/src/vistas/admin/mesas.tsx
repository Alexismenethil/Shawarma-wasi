import { useState } from 'react'
import { mdiDelete, mdiDotsVertical, mdiPlus, mdiRestore, mdiShopping, mdiTableFurniture, mdiTableRemove } from '@mdi/js'
import type { TipoMesa } from '@wasi/shared'
import { codigoMesa, nombreMesa } from '@wasi/shared'
import { api } from '../../lib/api'
import { useRecurso } from '../../lib/recurso'
import { Boton } from '../../componentes/boton'
import { Menu } from '../../componentes/desplegable'
import { confirmar } from '../../componentes/dialogo'
import { Icono } from '../../componentes/icono'
import { CeldaEditable, Pagina, Panel, Tabla, useAccion } from './piezas'

interface MesaAdmin {
  id: number
  numero: number
  tipo: TipoMesa
  activa: boolean
  ocupada: boolean
  pedidos: number
}

/**
 * Las mesas del salón y los turnos para llevar: las pestañas M1…M25 y L1…L10
 * del Excel. Se agregan, se renumeran o se retiran; una mesa con ventas no se
 * borra (sus notas la nombran), se retira y puede volver.
 */
export function Mesas() {
  const { datos, recargar } = useRecurso<MesaAdmin[]>('/admin/mesas', (c) => !!c.mesas)
  const activas = datos?.filter((m) => m.activa) ?? []
  return (
    <Pagina
      titulo="Mesas"
      detalle={datos ? `${activas.filter((m) => m.tipo === 'SALON').length} mesas en el salón y ${activas.filter((m) => m.tipo === 'LLEVAR').length} para llevar` : 'cargando…'}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <HojaMesas tipo="SALON" mesas={datos?.filter((m) => m.tipo === 'SALON') ?? []} recargar={recargar} />
        <HojaMesas tipo="LLEVAR" mesas={datos?.filter((m) => m.tipo === 'LLEVAR') ?? []} recargar={recargar} />
      </div>
    </Pagina>
  )
}

function HojaMesas({ tipo, mesas, recargar }: { tipo: TipoMesa; mesas: MesaAdmin[]; recargar: () => unknown }) {
  const accion = useAccion(recargar)
  const [cuantas, setCuantas] = useState('1')
  const salon = tipo === 'SALON'
  const n = Math.max(1, Math.min(30, Number(cuantas) || 1))

  // Todas de una vez, en una sola transacción del servidor.
  const agregar = () =>
    void accion(() => api('/admin/mesas', { cuerpo: { tipo, cantidad: n } }), n === 1 ? `${salon ? 'Mesa agregada' : 'Pedido para llevar agregado'}` : `${n} ${salon ? 'mesas agregadas' : 'pedidos para llevar agregados'}`)

  return (
    <Panel
      titulo={
        <span className="flex items-center justify-center gap-2">
          <Icono d={salon ? mdiTableFurniture : mdiShopping} className="size-[18px]" />
          {salon ? 'Salón · hojas M' : 'Para llevar · hojas L'}
        </span>
      }
      estilo="excel"
      color="#134f5c"
      relleno={false}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-reja bg-gris-50 px-3 py-2.5">
        <span className="text-[13.5px] text-tinta-2">Agregar</span>
        <input
          value={cuantas}
          onChange={(e) => setCuantas(e.target.value.replace(/\D/g, '').slice(0, 2))}
          inputMode="numeric"
          aria-label="Cuántas agregar"
          className="campo h-9 w-14 text-center tabular-nums"
        />
        <span className="text-[13.5px] text-tinta-2">{salon ? (n === 1 ? 'mesa' : 'mesas') : n === 1 ? 'pedido para llevar' : 'pedidos para llevar'}</span>
        <Boton variante="guardar" icono={mdiPlus} onClick={agregar} className="ml-auto h-9">
          Agregar
        </Boton>
      </div>
      <Tabla
        tono="turquesa"
        alto="560px"
        columnas={[{ titulo: 'Hoja', ancho: '70px' }, { titulo: 'Número', ancho: '90px' }, { titulo: 'Estado' }, { titulo: 'Notas', ancho: '80px' }, { titulo: '', ancho: '48px' }]}
      >
        {mesas.map((m) => (
          <tr key={m.id} className={m.activa ? '' : 'text-tinta-3'}>
            <td className="text-center font-bold">{codigoMesa(m)}</td>
            <td className="editable">
              <CeldaEditable
                etiqueta="Número"
                tipo="numero"
                alinear="centro"
                valor={m.numero}
                alGuardar={(v) =>
                  typeof v === 'number' && Number.isInteger(v) && v > 0
                    ? api(`/admin/mesas/${m.id}`, { metodo: 'PATCH', cuerpo: { numero: v } }).then(recargar)
                    : Promise.reject(new Error('El número debe ser un entero mayor que cero.'))
                }
              />
            </td>
            <td>
              {!m.activa ? (
                <span className="bg-ambar px-2 py-0.5 text-[12.5px] text-ambar-oscuro">Retirada</span>
              ) : m.ocupada ? (
                <span className="bg-menta px-2 py-0.5 text-[12.5px] text-verde-3">Con nota abierta</span>
              ) : (
                <span className="text-[13px] text-tinta-2">Libre</span>
              )}
            </td>
            <td className="text-center text-tinta-2 tabular-nums">{m.pedidos || ''}</td>
            <td className="px-0!">
              <Menu
                titulo={nombreMesa(m)}
                disparador={<Icono d={mdiDotsVertical} className="size-5" />}
                className="mx-auto grid size-8 place-items-center text-tinta-2 hover:bg-gris-150 hover:text-tinta"
                acciones={[
                  m.activa
                    ? {
                        etiqueta: 'Retirar (ya no aparece)',
                        icono: mdiTableRemove,
                        deshabilitada: m.ocupada,
                        alElegir: () => void accion(() => api(`/admin/mesas/${m.id}`, { metodo: 'PATCH', cuerpo: { activa: false } }), `${nombreMesa(m)} retirada`),
                      }
                    : {
                        etiqueta: 'Volver a usar',
                        icono: mdiRestore,
                        alElegir: () => void accion(() => api(`/admin/mesas/${m.id}`, { metodo: 'PATCH', cuerpo: { activa: true } }), `${nombreMesa(m)} de vuelta`),
                      },
                  {
                    etiqueta: 'Borrar',
                    icono: mdiDelete,
                    peligro: true,
                    deshabilitada: m.pedidos > 0,
                    alElegir: async () => {
                      if (await confirmar({ titulo: 'Borrar mesa', mensaje: `¿Borrar ${nombreMesa(m)}?`, aceptar: 'Borrar', peligro: true }))
                        void accion(() => api(`/admin/mesas/${m.id}`, { metodo: 'DELETE' }), 'Mesa borrada')
                    },
                  },
                ]}
              />
            </td>
          </tr>
        ))}
      </Tabla>
    </Panel>
  )
}
