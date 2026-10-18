/**
 * Lo que backend y frontend tienen que entender igual.
 *
 * El dinero viaja siempre en céntimos enteros (S/ 4.50 = 450) para que ninguna
 * suma de la caja termine en 45.99999.
 */

export const ROLES = ['MOZO', 'COCINA', 'ADMIN'] as const
export type Rol = (typeof ROLES)[number]

/**
 * Las tres cocinas del local, en el orden en que las nombra el personal. Son
 * parte de cómo trabaja el local (cada comanda va a una), así que la lista es
 * fija; el nombre de cada una se edita en Administración → Datos del local.
 */
export const ESTACIONES = ['CARTA', 'SHAWARMAS', 'BEBIDAS'] as const
export type Estacion = (typeof ESTACIONES)[number]

export const NUMERO_ESTACION: Record<Estacion, number> = { CARTA: 1, SHAWARMAS: 2, BEBIDAS: 3 }

/** Nombre de cada cocina mientras el local no ponga el suyo. */
export const ESTACION_POR_DEFECTO: Record<Estacion, string> = {
  CARTA: 'Carta',
  SHAWARMAS: 'Shawarmas',
  BEBIDAS: 'Emolientes y bebidas',
}

/** «Tipo y Monto de Pago»: Efectivo, Yape, Plin… La lista se edita en Administración. */
export interface MedioPago {
  id: number
  clave: string
  nombre: string
  /** Da vuelto, como el efectivo. Los demás se cobran por su monto exacto. */
  efectivo: boolean
  orden: number
  activo: boolean
}

/** Los datos del local y las listas que usan todas las pantallas. */
export interface Ajustes {
  nombre: string
  subtitulo: string
  direccion: string
  telefono: string
  ruc: string
  pieNota: string
  estaciones: Record<Estacion, string>
  observaciones: string[]
  minutosAlerta: number
  /** Solo los activos, en su orden. */
  medios: MedioPago[]
}

export type TipoMesa = 'SALON' | 'LLEVAR'
export type EstadoItem = 'PENDIENTE' | 'LISTO' | 'ENTREGADO' | 'ANULADO'
export type EstadoPedido = 'ABIERTO' | 'COBRADO' | 'ANULADO'

/**
 * El estado de una mesa no se guarda: sale de su nota abierta. Así nunca hay
 * una mesa «ocupada» sin pedido ni una «libre» con platos en cocina.
 */
export type EstadoMesa = 'LIBRE' | 'EN_COCINA' | 'LISTO' | 'POR_COBRAR'

export const ESTADO_MESA: Record<EstadoMesa, string> = {
  LIBRE: 'Libre',
  EN_COCINA: 'En cocina',
  LISTO: 'Listo para servir',
  POR_COBRAR: 'Por cobrar',
}

export interface Usuario {
  id: number
  nombre: string
  rol: Rol
}

export interface AdicionalCarta {
  id: number
  codigo: string | null
  nombre: string
  precio: number
  estaciones: Estacion[]
  familia: string | null
}

export interface ProductoCarta {
  id: number
  familiaId: number
  codigo: string | null
  variante: string
  nombre: string
  descripcion: string | null
  precio: number
  disponible: boolean
}

export interface FamiliaCarta {
  id: number
  clave: string
  nombre: string
  estacion: Estacion
  icono: string
  /** Si ofrece los detalles de corte (Corte 2 =, Individual…). */
  admiteCorte: boolean
  productos: ProductoCarta[]
}

/** Lo que el mozo puede poner en una línea de la nota. */
export interface Carta {
  familias: FamiliaCarta[]
  adicionales: AdicionalCarta[]
  /** La hoja «Detalle»: Corte 2 =, Corte 2 ≠, Corte 3 =, Individual… */
  detalles: string[]
}

export interface AdicionalElegido {
  id: number
  nombre: string
  precio: number
}

export interface ItemPedido {
  id: number
  ronda: number
  productoId: number | null
  nombre: string
  familia: string
  estacion: Estacion
  cantidad: number
  precio: number
  adicionales: AdicionalElegido[]
  precioAdicionales: number
  subtotal: number
  detalle: string | null
  paraLlevar: boolean
  observacion: string | null
  estado: EstadoItem
  creadoEn: string
  listoEn: string | null
  entregadoEn: string | null
}

export interface Pago {
  id: number
  /** Clave del medio de pago (EFECTIVO, YAPE…). */
  metodo: string
  monto: number
  recibido: number | null
}

export interface Pedido {
  id: number
  /** El número de la nota en el día: 1, 2, 3… Vuelve a empezar cada mañana. */
  numero: number
  mesa: { id: number; numero: number; tipo: TipoMesa }
  mozo: string | null
  cliente: string | null
  estado: EstadoPedido
  total: number
  creadoEn: string
  cobradoEn: string | null
  items: ItemPedido[]
  pagos: Pago[]
}

export interface MesaResumen {
  id: number
  numero: number
  tipo: TipoMesa
  estado: EstadoMesa
  pedido: null | {
    id: number
    /** El número de la nota en el día. */
    numero: number
    cliente: string | null
    mozo: string | null
    total: number
    /** Pagada pero todavía con algo por servir (lo normal en un pedido para llevar). */
    pagado: boolean
    items: number
    pendientes: number
    listos: number
    desde: string
    /** Desde cuándo espera lo más antiguo que sigue en cocina. */
    esperaDesde: string | null
  }
}

/** Lo que el mozo manda a cocina: una línea de la nota todavía sin guardar. */
export interface LineaNueva {
  productoId: number | null
  libre?: { nombre: string; precio: number; estacion: Estacion }
  cantidad: number
  adicionales: number[]
  /** Uno de los detalles de la carta, o nada. */
  detalle: string | null
  paraLlevar: boolean
  observacion: string | null
}

export interface ComandaCocina {
  clave: string
  pedidoId: number
  /** El número de la nota en el día (la columna «Nro:» de Atención al Cliente). */
  numero: number
  ronda: number
  mesa: { numero: number; tipo: TipoMesa }
  cliente: string | null
  mozo: string | null
  enviadoEn: string
  items: ItemPedido[]
}

export type Cambio = {
  mesas?: boolean
  carta?: boolean
  cocina?: boolean
  ajustes?: boolean
  pedidoId?: number
  aviso?:
    | { tipo: 'nuevo'; mesa: string; estaciones: Estacion[] }
    | { tipo: 'listo'; mesa: string; estacion: Estacion }
}

export const formatoSoles = (centimos: number) =>
  `S/ ${(centimos / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const nombreMesa = (m: { numero: number; tipo: TipoMesa }) =>
  m.tipo === 'SALON' ? `Mesa ${m.numero}` : `Llevar ${m.numero}`

export const codigoMesa = (m: { numero: number; tipo: TipoMesa }) =>
  `${m.tipo === 'SALON' ? 'M' : 'L'}${m.numero}`
