import type { ItemPedido, MesaResumen, Pedido } from '@wasi/shared'
import { nombreMesa } from '@wasi/shared'
import { soles } from '../../lib/formato'
import { useAjustes } from '../../lib/ajustes'
import { textoDetalle } from './filas'

/**
 * La nota impresa (ticketera de 80 mm). En pantalla no se ve; al imprimir es
 * lo único que sale.
 */
export function Ticket({ pedido, mesa }: { pedido: Pedido; mesa: MesaResumen }) {
  const a = useAjustes()
  const vivos = pedido.items.filter((i: ItemPedido) => i.estado !== 'ANULADO')
  const nombre = (clave: string) => a.medios.find((m) => m.clave === clave)?.nombre ?? clave
  const fecha = new Date(pedido.creadoEn).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })
  return (
    <div className="hidden w-[72mm] font-sans text-[11px] leading-snug text-black print:block">
      <p className="text-center text-[14px] font-bold uppercase">{a.nombre}</p>
      {a.subtitulo && <p className="text-center">{a.subtitulo}</p>}
      {a.direccion && <p className="text-center">{a.direccion}</p>}
      {(a.ruc || a.telefono) && <p className="text-center">{[a.ruc && `RUC ${a.ruc}`, a.telefono && `Tel. ${a.telefono}`].filter(Boolean).join(' · ')}</p>}
      <p className="my-1.5 border-y border-dashed border-black py-1 text-center font-bold">
        NOTA DE PEDIDO N° {pedido.numero} · {nombreMesa(mesa)}
      </p>
      <p>Fecha: {fecha}</p>
      {pedido.cliente && <p>Cliente: {pedido.cliente}</p>}
      {pedido.mozo && <p>Atendió: {pedido.mozo}</p>}
      <table className="mt-1.5 w-full border-t border-dashed border-black">
        <tbody>
          {vivos.map((i) => (
            <tr key={i.id} className="align-top">
              <td className="w-6 pt-1">{i.cantidad}</td>
              <td className="pt-1">
                {i.nombre}
                {i.adicionales.length > 0 && <div>+ {i.adicionales.map((x) => x.nombre).join(' + ')}</div>}
                {(i.detalle || i.paraLlevar) && <div>{textoDetalle(i.paraLlevar, i.detalle)}</div>}
                {i.observacion && <div>{i.observacion}</div>}
              </td>
              <td className="pt-1 text-right tabular-nums">{soles(i.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 flex justify-between border-t border-dashed border-black pt-1 text-[13px] font-bold">
        <span>TOTAL S/</span>
        <span>{soles(pedido.total)}</span>
      </p>
      {pedido.pagos.map((g) => (
        <p key={g.id} className="flex justify-between">
          <span>{nombre(g.metodo)}</span>
          <span>{soles(g.recibido ?? g.monto)}</span>
        </p>
      ))}
      {a.pieNota && <p className="mt-2 text-center">{a.pieNota}</p>}
    </div>
  )
}
