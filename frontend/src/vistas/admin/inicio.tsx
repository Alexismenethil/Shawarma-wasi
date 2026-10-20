import { Link, useSearchParams } from 'react-router'
import { mdiAlertCircle, mdiCash, mdiCashRegister, mdiCheckCircle, mdiChevronRight, mdiReceiptText, mdiScaleBalance, mdiStorefront, mdiTableFurniture } from '@mdi/js'
import { useRecurso } from '../../lib/recurso'
import { useSesion } from '../../lib/sesion'
import { useAjustes } from '../../lib/ajustes'
import { elegirVista, useSucursal } from '../../lib/sucursal'
import { fechaLarga, hora, hoyLima, soles, textoDiferencia } from '../../lib/formato'
import { iconoMedio } from '../../componentes/icono'
import { Icono } from '../../componentes/icono'
import { Barras, BarrasH, PALETA, Torta } from './graficos'
import { CampoFecha, Kpi, Pagina, Panel, Tabla, enSoles, solesCortos } from './piezas'
import type { ReporteDia, SucursalDelDia } from './tipos'

function saludo() {
  // El local cierra de madrugada: hasta las 5 todavía es de noche.
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false })) % 24
  return h < 5 || h >= 19 ? 'Buenas noches' : h < 12 ? 'Buenos días' : 'Buenas tardes'
}

/**
 * Inicio: el día de un vistazo, como el panel de referencia. Cuatro tarjetas
 * (ventas, pedidos, ticket promedio y lo que está en curso), la venta por
 * hora, el tipo de pago, la preferencia de productos y el resumen de caja.
 * Con todas las sucursales, el dueño ve además cada una lado a lado con su
 * caja; con una, cómo está su caja ahora.
 */
export function Inicio() {
  const sesion = useSesion()
  const ajustes = useAjustes()
  const { id: vista, sucursal, sucursales } = useSucursal()
  const [params, setParams] = useSearchParams()
  const hoy = hoyLima()
  const fecha = params.get('fecha') ?? hoy
  const { datos: d } = useRecurso<ReporteDia>(`/reportes/dia?fecha=${fecha}`, (c) => !!c.mesas || !!c.caja)
  const esHoy = fecha === hoy
  const donde = vista ? (sucursales.length > 1 ? ` · ${sucursal?.nombre ?? ''}` : '') : ' · todas las sucursales'

  const horas = (() => {
    if (!d) return []
    const conVenta = d.porHora.map((h) => h.hora)
    const desde = Math.min(11, ...conVenta)
    const hasta = Math.max(22, ...conVenta)
    return Array.from({ length: hasta - desde + 1 }, (_, i) => {
      const h = desde + i
      const f = d.porHora.find((x) => x.hora === h)
      return { etiqueta: `${h}h`, valor: f?.ventas ?? 0, detalle: `${h}:00 – ${h}:59 · ${f?.pedidos ?? 0} pedidos` }
    })
  })()

  const top = d?.masVendidos ?? []
  const preferencia = [
    ...top.slice(0, 6).map((p) => ({ nombre: p.nombre, valor: p.unidades })),
    ...(top.length > 6 ? [{ nombre: 'Otros', valor: top.slice(6).reduce((s, p) => s + p.unidades, 0), color: '#bdc1c6' }] : []),
  ]

  return (
    <Pagina
      titulo={`${saludo()}, ${sesion?.usuario.nombre ?? ''}`}
      detalle={`${esHoy ? `Hoy, ${fechaLarga(fecha)}` : fechaLarga(fecha)}${donde}`}
      acciones={<CampoFecha etiqueta="Día" valor={fecha} max={hoy} alCambiar={(f) => setParams(f === hoy ? {} : { fecha: f }, { replace: true })} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi color="rojo" icono={mdiCash} titulo={esHoy ? 'Ventas de hoy' : 'Ventas del día'} valor={d ? solesCortos(d.totales.ventas) : '…'} detalle={d && `${d.totales.unidades} platos vendidos`} a="/admin/reporte-diario" />
        <Kpi color="turquesa" icono={mdiReceiptText} titulo="Pedidos cobrados" valor={d?.totales.pedidos ?? '…'} detalle="notas cerradas" a="/admin/consolidado" />
        <Kpi color="verde" icono={mdiScaleBalance} titulo="Ticket promedio" valor={d ? enSoles(d.totales.ticketPromedio) : '…'} detalle="por nota" a="/admin/ventas" />
        <Kpi
          color="magenta"
          icono={mdiTableFurniture}
          titulo="En curso ahora"
          valor={d ? `${d.enCurso.pedidos} mesa${d.enCurso.pedidos === 1 ? '' : 's'}` : '…'}
          detalle={d && `${enSoles(d.enCurso.total)} por cobrar`}
          a="/mozo"
        />
      </div>

      {d && !vista && d.sucursales.length > 1 && <PanelSucursales sucursales={d.sucursales} esHoy={esHoy} />}
      {d && vista && esHoy && d.sucursales[0] && <CajaDeHoy s={d.sucursales[0]} />}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel titulo="Ventas por hora">
          <Barras datos={horas} formato={(v) => enSoles(v)} formatoEje={(v) => (v >= 100000 ? `${v / 100000}k` : String(v / 100))} />
        </Panel>
        <Panel titulo="Tipo de pago">
          <Torta
            datos={(d?.metodos ?? []).filter((m) => m.monto > 0).map((m, i) => ({ nombre: m.nombre, valor: m.monto, color: PALETA[i % PALETA.length] }))}
            formato={enSoles}
            tamano={170}
          />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel titulo="Preferencia de productos">
          <Torta datos={preferencia} formato={(v) => `${v} u.`} dona tamano={170} />
        </Panel>
        <Panel titulo="Lo más pedido">
          {top.length ? (
            <BarrasH datos={top.slice(0, 8).map((p) => ({ nombre: p.nombre, valor: p.unidades, detalle: enSoles(p.monto) }))} formato={(v) => `${v} u.`} color={PALETA[3]} />
          ) : (
            <p className="py-10 text-center text-[13.5px] text-tinta-3">Sin ventas este día</p>
          )}
        </Panel>
        <Panel titulo="Resumen" estilo="excel" color="#e06666" relleno={false}>
          <Tabla
            tono="rojo"
            columnas={[{ titulo: 'Tipo de pago:' }, { titulo: 'Cobros', ancho: '70px' }, { titulo: 'SubTotal', ancho: '110px' }]}
            pie={
              <tr>
                <td>Suma total</td>
                <td className="text-center tabular-nums">{d?.metodos.reduce((s, m) => s + m.pagos, 0) ?? ''}</td>
                <td className="text-right tabular-nums">{d ? soles(d.totales.ventas) : ''}</td>
              </tr>
            }
          >
            {(d?.metodos ?? ajustes.medios.map((m) => ({ metodo: m.clave, nombre: m.nombre, monto: 0, pagos: 0, vuelto: 0 }))).map((m) => (
              <tr key={m.metodo}>
                <td>
                  <span className="flex items-center gap-2">
                    <Icono d={iconoMedio({ clave: m.metodo, nombre: m.nombre })} className="size-[18px] text-tinta-3" />
                    {m.nombre}
                  </span>
                </td>
                <td className="text-center text-tinta-2 tabular-nums">{m.pagos || ''}</td>
                <td className="text-right tabular-nums">{soles(m.monto)}</td>
              </tr>
            ))}
          </Tabla>
        </Panel>
      </div>
    </Pagina>
  )
}

const tonoDiferencia = (d: number) => (d === 0 ? 'text-verde-2' : d < 0 ? 'text-rojo' : 'text-azul-oscuro')

/** Cómo está la caja de una sucursal ahora: abierta (por quién, desde cuándo) o cerrada (si cuadró). */
function EstadoCaja({ caja }: { caja: SucursalDelDia['caja'] }) {
  if (!caja) return <span className="text-tinta-3">Sin abrir hoy</span>
  if (caja.estado === 'ABIERTA')
    return (
      <span className="flex items-center gap-1.5">
        <span className="size-2 shrink-0 rounded-full bg-verde-2" />
        Abierta · {caja.abiertaPor} · {hora(caja.abiertaEn)}
      </span>
    )
  return (
    <span className={`flex items-center gap-1.5 ${caja.diferencia === null ? 'text-tinta-2' : tonoDiferencia(caja.diferencia)}`}>
      <Icono d={caja.diferencia === 0 ? mdiCheckCircle : mdiAlertCircle} className="size-4 shrink-0" />
      Cerrada {caja.cerradaEn && hora(caja.cerradaEn)} · {caja.diferencia === null ? '' : textoDiferencia(caja.diferencia).toLowerCase()}
    </span>
  )
}

/** Cada sucursal lado a lado: lo que vendió, lo que tiene en curso y su caja. Tocar una la abre. */
function PanelSucursales({ sucursales, esHoy }: { sucursales: SucursalDelDia[]; esHoy: boolean }) {
  const total = sucursales.reduce((s, x) => s + x.ventas, 0)
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Panel titulo="Sucursales" estilo="excel" color="#134f5c" relleno={false}>
        <Tabla
          tono="turquesa"
          columnas={[
            { titulo: 'Sucursal' },
            { titulo: 'Ventas', ancho: '110px' },
            { titulo: 'Pedidos', ancho: '80px' },
            { titulo: 'Ticket prom.', ancho: '104px' },
            ...(esHoy ? [{ titulo: 'En curso', ancho: '110px' }, { titulo: 'Caja ahora', ancho: '220px' }] : []),
          ]}
          pie={
            <tr>
              <td>Todas</td>
              <td className="text-right tabular-nums">{soles(total)}</td>
              <td className="text-center tabular-nums">{sucursales.reduce((s, x) => s + x.pedidos, 0)}</td>
              <td />
              {esHoy && <td className="text-right tabular-nums">{soles(sucursales.reduce((s, x) => s + x.enCurso.total, 0))}</td>}
              {esHoy && <td />}
            </tr>
          }
        >
          {sucursales.map((s) => (
            <tr key={s.id} onClick={() => elegirVista(s.id)} className="cursor-pointer" title={`Ver solo ${s.nombre}`}>
              <td>
                <span className="flex items-center gap-2 font-medium">
                  <Icono d={mdiStorefront} className="size-[18px] text-verde-2" /> {s.nombre}
                  <Icono d={mdiChevronRight} className="ml-auto size-4 text-tinta-3" />
                </span>
              </td>
              <td className="text-right font-medium tabular-nums">{soles(s.ventas)}</td>
              <td className="text-center text-tinta-2 tabular-nums">{s.pedidos}</td>
              <td className="text-right tabular-nums">{soles(s.ticketPromedio)}</td>
              {esHoy && (
                <td className="text-right text-tinta-2 tabular-nums">
                  {s.enCurso.pedidos ? `${s.enCurso.pedidos} · ${soles(s.enCurso.total)}` : '—'}
                </td>
              )}
              {esHoy && (
                <td className="text-[13px]">
                  <EstadoCaja caja={s.caja} />
                </td>
              )}
            </tr>
          ))}
        </Tabla>
      </Panel>
      <Panel titulo="Cuánto aporta cada sucursal">
        {total > 0 ? (
          <BarrasH datos={sucursales.map((s) => ({ nombre: s.nombre, valor: s.ventas, detalle: `${Math.round((s.ventas / total) * 100)}%` }))} formato={enSoles} color={PALETA[1]} />
        ) : (
          <p className="py-10 text-center text-[13.5px] text-tinta-3">Sin ventas este día</p>
        )}
      </Panel>
    </div>
  )
}

/** La caja de la sucursal elegida, en una línea, con el atajo para verla. */
function CajaDeHoy({ s }: { s: SucursalDelDia }) {
  return (
    <div className="hoja sombra-hoja mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[14px]">
      <span className="flex items-center gap-2 font-medium">
        <Icono d={mdiCashRegister} className="size-5 text-azul-oscuro" /> Caja
      </span>
      <EstadoCaja caja={s.caja} />
      <Link to="/admin/cajas" className="ml-auto flex items-center text-[13px] text-azul hover:underline">
        Ver arqueos <Icono d={mdiChevronRight} className="size-4" />
      </Link>
    </div>
  )
}
