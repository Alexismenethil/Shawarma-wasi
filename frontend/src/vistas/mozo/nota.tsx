import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { mdiBellRing, mdiBroom, mdiCancel, mdiContentSave, mdiDotsVertical, mdiPlusBox, mdiPrinter, mdiSwapHorizontal } from '@mdi/js'
import type { Estacion, MesaResumen, Pedido } from '@wasi/shared'
import { nombreMesa } from '@wasi/shared'
import { api } from '../../lib/api'
import { useRecurso } from '../../lib/recurso'
import { useSesion } from '../../lib/sesion'
import { useAjustes, nombreCocina } from '../../lib/ajustes'
import { guardarClienteBorrador, indiceCarta, leerClienteBorrador, precioLinea, useBorrador, type LineaBorrador } from '../../lib/borrador'
import { soles, useAhora } from '../../lib/formato'
import { sonarOk } from '../../lib/sonido'
import { avisar } from '../../componentes/avisos'
import { confirmar } from '../../componentes/dialogo'
import { Boton } from '../../componentes/boton'
import { Menu } from '../../componentes/desplegable'
import { Membrete } from '../../componentes/marca'
import { ESTADO_HOJA, ICONO_PAGADO, Icono } from '../../componentes/icono'
import { estadoHoja, useLibro } from './libro'
import { CabeceraNota, FilaBorrador, FilaGuardada, FilaNueva } from './filas'
import { PieNota, aCentimos, cuadrarPago, filaPagoVacia, type FilaPago } from './pago'
import { DialogoLibre, DialogoMover } from './dialogos'
import { Ticket } from './ticket'

/** La hoja de una mesa. Cambiar de pestaña monta una hoja nueva: nada se mezcla entre mesas. */
export function Nota() {
  const { mesaId } = useParams()
  return <HojaNota key={mesaId} id={Number(mesaId)} />
}

const fechaHora = (d: Date) =>
  d.toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

function HojaNota({ id }: { id: number }) {
  const navegar = useNavigate()
  const sesion = useSesion()
  const ajustes = useAjustes()
  const { mesas, carta, conBorrador } = useLibro()
  const mesa = mesas?.find((m) => m.id === id)
  const nota = useRecurso<Pedido | null>(`/mesas/${id}/pedido`, (c) => !!c.mesas)
  const pedido = nota.datos
  const borrador = useBorrador(id, mesa?.tipo === 'LLEVAR')
  const indice = useMemo(() => indiceCarta(carta), [carta])
  const ahora = useAhora(30_000)

  const [cliente, setCliente] = useState(() => leerClienteBorrador(id))
  const [pagos, setPagos] = useState<FilaPago[]>(() => [filaPagoVacia()])
  const [guardando, setGuardando] = useState(false)
  const [libre, setLibre] = useState<{ abierto: boolean; linea?: LineaBorrador }>({ abierto: false })
  const [moviendo, setMoviendo] = useState(false)

  // Al llegar la nota del servidor, su cliente manda.
  useEffect(() => {
    if (pedido?.cliente) setCliente(pedido.cliente)
  }, [pedido?.id, pedido?.cliente])

  const pagado = !!pedido?.cobradoEn
  const items = pedido?.items ?? []
  const vivos = items.filter((i) => i.estado !== 'ANULADO')
  const atendidos = vivos.filter((i) => i.estado === 'LISTO')
  const porGuardar = borrador.lineas.reduce((s, l) => s + precioLinea(l, indice).subtotal, 0)
  const total = (pedido?.total ?? 0) + porGuardar
  const cuadre = cuadrarPago(total, pagos, ajustes.medios)
  const hayAlgo = borrador.lineas.length > 0 || pagos.some((p) => p.metodo || p.monto)

  if (mesas && !mesa) {
    return (
      <div className="grid place-items-center px-6 py-24 text-center">
        <p className="text-[15px] text-tinta-2">Esa mesa no existe o fue retirada.</p>
        <Link to="/mozo" className="mt-3 text-[15px] font-medium text-azul underline">
          Ver todas las mesas
        </Link>
      </div>
    )
  }

  const estado = mesa ? estadoHoja(mesa, conBorrador) : 'LIBRE'
  const etiquetaEstado = pagado ? 'Pagado' : estado === 'LIBRE' ? (borrador.lineas.length ? 'Nota de pedido' : 'Libre') : ESTADO_HOJA[estado].nombre

  const accion = async (fn: () => Promise<Pedido | null | void>, ok?: string) => {
    try {
      const p = await fn()
      if (p !== undefined) nota.setDatos(p)
      if (ok) avisar(ok, 'ok')
    } catch (e) {
      avisar((e as Error).message, 'error')
    }
  }

  const cambiarCliente = (valor: string) => {
    setCliente(valor)
    if (!pedido) guardarClienteBorrador(id, valor)
  }
  const confirmarCliente = () => {
    if (pedido && (pedido.cliente ?? '') !== cliente.trim()) {
      void accion(() => api<Pedido>(`/pedidos/${pedido.id}`, { metodo: 'PATCH', cuerpo: { cliente: cliente.trim() || null } }))
    }
  }

  /**
   * «Guardar», como en el Excel: manda a cocina lo anotado y, si se llenó el
   * tipo y monto de pago, registra el cobro. Cobrar pide confirmación; mandar
   * a cocina no (es lo que el mozo hace veinte veces por hora).
   */
  const guardar = async () => {
    const lineas = borrador.lineas
    const cobrar = cuadre.usadas.length > 0
    if (!lineas.length && !cobrar) {
      avisar(pagado ? 'La nota ya está pagada.' : 'No hay nada nuevo que guardar.', 'info')
      return
    }
    if (cobrar) {
      if (cuadre.excedeElectronico) return avisar('El pago electrónico supera el total.', 'error')
      if (cuadre.debe > 0) return avisar(`El pago no cubre el total: debe S/ ${soles(cuadre.debe)}.`, 'error')
      const nombre = (clave: string | null) => ajustes.medios.find((m) => m.clave === clave)?.nombre ?? clave
      const ok = await confirmar({
        titulo: 'Guardar y cobrar',
        aceptar: 'Guardar y cobrar',
        mensaje: (
          <div className="space-y-2">
            {lineas.length > 0 && <p>Se enviarán {lineas.reduce((s, l) => s + l.cantidad, 0)} platos a cocina.</p>}
            <p>
              Cobro de <b>S/ {soles(total)}</b>: {cuadre.usadas.map((f) => `${nombre(f.metodo)} S/ ${soles(aCentimos(f.monto))}`).join(' + ')}.
            </p>
            {cuadre.vuelto > 0 && (
              <p className="font-medium text-verde-2">
                Vuelto: S/ {soles(cuadre.vuelto)}
              </p>
            )}
          </div>
        ),
      })
      if (!ok) return
    }

    setGuardando(true)
    try {
      let p = pedido
      if (lineas.length) {
        p = await api<Pedido>(`/mesas/${id}/enviar`, {
          cuerpo: { cliente: cliente.trim() || null, lineas: lineas.map(({ clave: _c, ...l }) => l) },
        })
        borrador.vaciar()
        guardarClienteBorrador(id, '')
        nota.setDatos(p)
      }
      if (cobrar && p) {
        p = await api<Pedido>(`/pedidos/${p.id}/cobrar`, {
          cuerpo: { pagos: cuadre.usadas.map((f) => ({ metodo: f.metodo!, monto: aCentimos(f.monto) })) },
        })
        nota.setDatos(p)
        setPagos([filaPagoVacia()])
      }
      sonarOk()
      if (lineas.length && p) {
        const ronda = Math.max(...p.items.map((i) => i.ronda))
        const cocinas = [...new Set(p.items.filter((i) => i.ronda === ronda).map((i) => i.estacion))] as Estacion[]
        avisar(`Guardado. Enviado a ${cocinas.map((e) => nombreCocina(ajustes, e).split(' · ')[0]).join(', ')}${cobrar ? ' y cobrado' : ''}`, 'ok')
      } else {
        avisar('Cobro registrado', 'ok')
      }
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  const limpiar = async () => {
    if (!hayAlgo) return
    const ok = await confirmar({
      titulo: 'Limpiar',
      mensaje: 'Se borra lo anotado que aún no se guardó (las filas en amarillo y el pago). Lo que ya está en cocina no se toca.',
      aceptar: 'Limpiar',
      variante: 'limpiar',
    })
    if (!ok) return
    borrador.vaciar()
    setPagos([filaPagoVacia()])
    if (!pedido) cambiarCliente('')
  }

  const anularFila = async (itemId: number) => {
    if (!(await confirmar({ titulo: 'Anular fila', mensaje: '¿Anular esta fila? Cocina la verá como anulada.', aceptar: 'Anular', peligro: true }))) return
    void accion(() => api<Pedido>(`/items/${itemId}/anular`, { cuerpo: {} }), 'Fila anulada')
  }

  const anularNota = async () => {
    if (!pedido) return
    if (!(await confirmar({ titulo: 'Anular nota', mensaje: `¿Anular toda la nota de ${mesa ? nombreMesa(mesa) : 'esta mesa'}? Cocina dejará de prepararla.`, aceptar: 'Anular nota', peligro: true }))) return
    await accion(async () => {
      await api(`/pedidos/${pedido.id}/anular`, { cuerpo: {} })
      return null
    }, 'Nota anulada')
  }

  const mover = async (destino: MesaResumen) => {
    if (!pedido) return
    setMoviendo(false)
    try {
      await api<Pedido>(`/pedidos/${pedido.id}/mover`, { cuerpo: { mesaId: destino.id } })
      avisar(`Nota pasada a ${nombreMesa(destino)}`, 'ok')
      navegar(`/mozo/${destino.id}`, { replace: true })
    } catch (e) {
      avisar((e as Error).message, 'error')
    }
  }

  const masAcciones = [
    { etiqueta: 'Otros (producto libre)', icono: mdiPlusBox, alElegir: () => setLibre({ abierto: true }), deshabilitada: pagado },
    { etiqueta: 'Imprimir nota', icono: mdiPrinter, alElegir: () => window.print(), deshabilitada: !pedido },
    { etiqueta: 'Mover a otra mesa', icono: mdiSwapHorizontal, alElegir: () => setMoviendo(true), deshabilitada: !pedido },
    { etiqueta: 'Anular toda la nota', icono: mdiCancel, peligro: true, alElegir: () => void anularNota(), deshabilitada: !pedido || pagado },
  ]

  const fecha = pedido ? fechaHora(new Date(pedido.creadoEn)) : borrador.lineas.length ? fechaHora(new Date(ahora)) : ''
  const puedeAnular = (estadoItem: string) => estadoItem === 'PENDIENTE' || sesion?.usuario.rol === 'ADMIN'

  return (
    <>
      <main className="mx-auto max-w-[1240px] pb-[76px] sm:px-4 sm:pt-4 lg:pb-6 print:hidden">
        <section className="hoja sombra-hoja relative">
          <Membrete
            derecha={
              <div className="flex items-center gap-1">
                <span className="flex h-10 items-center border border-vino-3 bg-rosa px-3 text-[16px] whitespace-nowrap text-vino-3 sm:h-11 sm:px-5 sm:text-[18px]">
                  {mesa ? `${mesa.tipo === 'SALON' ? 'Mesa' : 'Llevar'}: ${mesa.numero}` : '…'}
                </span>
                <Menu
                  titulo="Más acciones"
                  acciones={masAcciones}
                  disparador={<Icono d={mdiDotsVertical} className="size-5" />}
                  className="grid h-10 w-8 place-items-center text-tinta-2 hover:bg-gris-100 lg:hidden"
                />
              </div>
            }
          />

          {/* Cliente · Fecha · N° · Estado: la segunda fila de la nota del Excel */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] border-y border-black text-[14px] lg:grid-cols-[auto_minmax(0,1.6fr)_auto_minmax(0,1fr)_auto_70px_minmax(0,0.9fr)]">
            <span className="rotulo-negro h-10">Cliente:</span>
            <input
              value={cliente}
              onChange={(e) => cambiarCliente(e.target.value.slice(0, 60))}
              onBlur={confirmarCliente}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder={mesa?.tipo === 'LLEVAR' ? 'Nombre de quien recoge' : 'Opcional'}
              aria-label="Cliente"
              className="h-10 min-w-0 bg-campo px-3 text-[15px] outline-none placeholder:text-tinta-3 focus:bg-hoja focus:shadow-[inset_0_0_0_2px_var(--color-azul)]"
            />
            <span className="rotulo-negro h-10 border-t border-white/20 lg:border-t-0">Fecha</span>
            <span className="flex h-10 items-center justify-center border-t border-reja bg-campo px-2 tabular-nums lg:border-t-0 lg:border-l lg:border-l-white">{fecha}</span>
            <span className="rotulo-negro hidden h-10 lg:flex">N°</span>
            <span className="hidden h-10 items-center justify-center bg-campo font-medium tabular-nums lg:flex">{pedido?.numero ?? ''}</span>
            <span className={`col-span-2 flex h-10 items-center justify-center gap-2 border-t border-reja font-medium lg:col-span-1 lg:border-t-0 ${pagado || estado !== 'LIBRE' || borrador.lineas.length ? (pagado ? 'bg-menta text-verde-3' : ESTADO_HOJA[estado].fondo) : 'bg-hoja text-tinta-3'}`}>
              <Icono d={pagado ? ICONO_PAGADO : ESTADO_HOJA[estado].d} className="size-[18px]" />
              {etiquetaEstado}
              {pedido && <span className="font-normal text-tinta-2 lg:hidden">· N° {pedido.numero}</span>}
            </span>
          </div>

          {atendidos.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-reja bg-rosa-2 px-3 py-2">
              <Icono d={mdiBellRing} className="animate-latido size-5 text-rojo-oscuro" />
              <span className="flex-1 text-[14px] font-medium text-rojo-oscuro">
                Cocina atendió {atendidos.reduce((s, i) => s + i.cantidad, 0)} plato{atendidos.length === 1 && atendidos[0].cantidad === 1 ? '' : 's'}: llévalos a la mesa.
              </span>
              <Boton variante="claro" className="h-9" onClick={() => void accion(() => api<Pedido>(`/pedidos/${pedido!.id}/servir`, { cuerpo: {} }), 'Marcado como servido')}>
                Marcar servido
              </Boton>
            </div>
          )}

          {/* La tabla */}
          <CabeceraNota />
          <div className="flex h-9 items-center justify-between bg-verde-3 px-3 text-[13px] text-white lg:hidden">
            <span>Cant: · Producto: · Adicional: · Detalle: · Obs:</span>
            <span className="bg-verde-2 px-2 py-0.5">Subtotal:</span>
          </div>

          {items.map((i) => (
            <FilaGuardada
              key={i.id}
              item={i}
              indice={indice}
              puedeAnular={!pagado && puedeAnular(i.estado)}
              alServir={() => void accion(() => api<Pedido>(`/pedidos/${pedido!.id}/servir`, { cuerpo: { itemIds: [i.id] } }), 'Servido')}
              alAnular={() => void anularFila(i.id)}
            />
          ))}
          {borrador.lineas.map((l) => (
            <div key={l.clave} className="animate-destello">
              <FilaBorrador
                linea={l}
                carta={carta}
                indice={indice}
                alCambiar={(parcial) => borrador.cambiar(l.clave, parcial)}
                alQuitar={() => borrador.quitar(l.clave)}
                alLibre={() => setLibre({ abierto: true, linea: l })}
              />
            </div>
          ))}
          <FilaNueva carta={carta} deshabilitada={pagado} alElegir={(p) => borrador.agregar(p)} alLibre={() => setLibre({ abierto: true })} />

          <PieNota total={total} filas={pagos} setFilas={setPagos} medios={ajustes.medios} pagos={pedido?.pagos ?? []} pagado={pagado} />

          {pagado && (
            <span className="sello pointer-events-none absolute right-6 bottom-24 px-3 py-1 text-[20px] text-verde-2 opacity-80 lg:right-[230px] lg:bottom-6">PAGADO</span>
          )}
        </section>

        {/* Limpiar y Guardar, como los dos botones al pie de la nota del Excel */}
        <div className="mt-4 hidden items-center justify-between gap-3 lg:flex">
          <Boton variante="limpiar" icono={mdiBroom} onClick={() => void limpiar()} disabled={!hayAlgo} className="h-11 min-w-36 text-[15px]">
            Limpiar
          </Boton>
          <div className="flex items-center gap-2">
            <Menu
              titulo="Más acciones"
              acciones={masAcciones}
              disparador={
                <>
                  <Icono d={mdiDotsVertical} className="size-5" /> Más
                </>
              }
              className="boton boton-claro h-11"
            />
            <Boton variante="guardar" icono={mdiContentSave} onClick={() => void guardar()} cargando={guardando} className="h-11 min-w-44 text-[15px]">
              Guardar
            </Boton>
          </div>
        </div>
      </main>

      {/* En el celular, los botones quedan siempre a mano sobre las pestañas */}
      <div className="no-imprimir fixed inset-x-0 bottom-[calc(44px+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 border-t border-reja bg-hoja/95 px-2 py-2 backdrop-blur lg:hidden print:hidden">
        <Boton variante="limpiar" icono={mdiBroom} onClick={() => void limpiar()} disabled={!hayAlgo} className="h-11 px-3">
          Limpiar
        </Boton>
        <span className="min-w-0 flex-1 text-center leading-tight">
          <span className="block text-[11.5px] text-tinta-3">Monto total</span>
          <span className="block text-[17px] font-bold tabular-nums">S/ {soles(total)}</span>
        </span>
        <Boton variante="guardar" icono={mdiContentSave} onClick={() => void guardar()} cargando={guardando} className="h-11 min-w-[124px]">
          Guardar
        </Boton>
      </div>

      <datalist id="observaciones-rapidas">
        {ajustes.observaciones.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <DialogoLibre
        abierto={libre.abierto}
        inicial={libre.linea?.libre}
        alCerrar={() => setLibre({ abierto: false })}
        alGuardar={(datos) => (libre.linea ? borrador.cambiar(libre.linea.clave, { libre: datos, productoId: null }) : borrador.agregarLibre(datos))}
      />
      {mesas && <DialogoMover abierto={moviendo} mesas={mesas} actual={id} alCerrar={() => setMoviendo(false)} alElegir={(m) => void mover(m)} />}
      {pedido && mesa && <Ticket pedido={pedido} mesa={mesa} />}
    </>
  )
}
