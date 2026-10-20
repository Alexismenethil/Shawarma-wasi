import type { Estacion, TipoMesa } from '@wasi/shared'

/** Lo que devuelven los reportes del servidor. */

export interface Totales {
  ventas: number
  pedidos: number
  unidades: number
  ticketPromedio: number
}
export interface Metodo {
  /** Clave del medio de pago (EFECTIVO, YAPE…). */
  metodo: string
  nombre: string
  monto: number
  pagos: number
  vuelto: number
}
export interface Vendido {
  nombre: string
  familia: string
  estacion: Estacion
  unidades: number
  monto: number
}
export interface PorEstacion {
  estacion: Estacion
  unidades: number
  monto: number
}
export interface LineaArqueo {
  cantidad: number
  nombre: string
  familia: string
  adicionales: string[]
  detalle: string | null
  paraLlevar: boolean
  observacion: string | null
  precio: number
  precioAdicionales: number
  subtotal: number
}
export interface PedidoArqueo {
  id: number
  sucursal: string
  mesa: { numero: number; tipo: TipoMesa }
  cliente: string | null
  mozo: string | null
  total: number
  cobradoEn: string
  creadoEn: string
  pagos: { metodo: string; monto: number; recibido: number | null }[]
  items: LineaArqueo[]
}
/** Cómo va una sucursal en el día: ventas, lo que tiene abierto y su caja. */
export interface SucursalDelDia {
  id: number
  nombre: string
  ventas: number
  pedidos: number
  ticketPromedio: number
  enCurso: { pedidos: number; total: number }
  caja: { estado: 'ABIERTA' | 'CERRADA'; abiertaPor: string; abiertaEn: string; cerradaEn: string | null; diferencia: number | null } | null
}
export interface ReporteDia {
  fecha: string
  totales: Totales
  metodos: Metodo[]
  porHora: { hora: number; ventas: number; pedidos: number }[]
  estaciones: PorEstacion[]
  masVendidos: Vendido[]
  enCurso: { pedidos: number; total: number }
  /** Cada sucursal (o solo la elegida). */
  sucursales: SucursalDelDia[]
  pedidos: PedidoArqueo[]
}
export interface ReporteRango {
  desde: string
  hasta: string
  totales: Totales
  anterior: Totales & { desde: string; hasta: string }
  serie: { fecha: string; ventas: number; pedidos: number }[]
  metodos: Metodo[]
  estaciones: PorEstacion[]
  familias: { familia: string; unidades: number; monto: number }[]
  masVendidos: Vendido[]
  /** Con todas las sucursales: cada una lado a lado. */
  sucursales: { id: number; nombre: string; ventas: number; pedidos: number; ticketPromedio: number }[] | null
}
export interface Acumulado {
  mes: string
  diasMes: number
  diasConVenta: number[]
  productos: { nombre: string; familia: string; dias: Record<string, number>; total: number; minimo: number; maximo: number; promedio: number }[]
}
/** Una página del consolidado, con el resumen de todo lo filtrado. */
export interface PaginaConsolidado {
  pagina: number
  porPagina: number
  paginas: number
  lineas: number
  notas: number
  unidades: number
  monto: number
  filas: FilaConsolidado[]
}

export interface FilaConsolidado {
  id: number
  pedidoId: number
  cantidad: number
  nombre: string
  familia: string
  estacion: Estacion
  adicionales: { nombre: string; precio: number }[]
  detalle: string | null
  paraLlevar: boolean
  observacion: string | null
  precio: number
  precioAdicionales: number
  subtotal: number
  total: number
  sucursal: string
  mesaTipo: TipoMesa
  mesaNumero: number
  cliente: string | null
  mozo: string | null
  cobradoEn: string
  metodos: string[]
}
