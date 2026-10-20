/**
 * Lo que backend y frontend tienen que entender igual.
 *
 * El dinero viaja siempre en céntimos enteros (S/ 4.50 = 450) para que ninguna
 * suma de la caja termine en 45.99999.
 */

export const ROLES = ['MOZO', 'COCINA', 'CAJA', 'ENCARGADO', 'ADMIN'] as const
export type Rol = (typeof ROLES)[number]

/**
 * Mozo, cocina y caja entran con un PIN de cuatro cifras en la tablet de su
 * sucursal. La encargada y el administrador manejan dinero y personal: entran
 * con usuario y contraseña.
 */
export const ROLES_PIN = ['MOZO', 'COCINA', 'CAJA'] as const
export type RolPin = (typeof ROLES_PIN)[number]
export const entraConPin = (rol: Rol): rol is RolPin => (ROLES_PIN as readonly Rol[]).includes(rol)

/** Las pantallas del sistema y quién entra a cada una. */
export const AREAS = ['MOZO', 'COCINA', 'CAJA', 'PANEL'] as const
export type Area = (typeof AREAS)[number]

export const ENTRAN: Record<Area, readonly Rol[]> = {
  // Caja también anota (los pedidos del mostrador); la encargada cubre cualquier puesto.
  MOZO: ['MOZO', 'CAJA', 'ENCARGADO', 'ADMIN'],
  COCINA: ['COCINA', 'ENCARGADO', 'ADMIN'],
  CAJA: ['CAJA', 'ENCARGADO', 'ADMIN'],
  PANEL: ['ENCARGADO', 'ADMIN'],
}

export const puedeEntrar = (rol: Rol, area: Area) => ENTRAN[area].includes(rol)

/** Solo cobra quien entra a Caja: así todo el dinero pasa por el arqueo. */
export const puedeCobrar = (rol: Rol) => puedeEntrar(rol, 'CAJA')

/** La encargada y el administrador: anulan lo ya preparado, reabren cajas de otro día… */
export const esJefe = (rol: Rol) => rol === 'ENCARGADO' || rol === 'ADMIN'

export const NOMBRE_ROL: Record<Rol, string> = {
  MOZO: 'Mozo',
  COCINA: 'Cocina',
  CAJA: 'Caja',
  ENCARGADO: 'Encargado(a)',
  ADMIN: 'Administración',
}

/** Una sucursal del negocio, con lo que sale impreso en sus notas. */
export interface Sucursal {
  id: number
  nombre: string
  direccion: string
  telefono: string
  /** Si por ahora otra sucursal le prepara parte de sus pedidos (ver `cocinaQuePrepara`). */
  cocinaCompartida: CocinaCompartida | null
}

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

/**
 * Cocina compartida (temporal). Plaza More y Plaza San Cristóbal están en la
 * misma ciudad y, por ahora, la carta y los shawarmas de las dos salen de una
 * sola cocina; los emolientes, cada local en la suya. Mientras dure, esas
 * comandas se ven en una sola pantalla con el nombre de su local, para que el
 * mozo sepa a dónde llevarlas. Se deshace en Administración → Sucursales.
 */
export interface CocinaCompartida {
  /** La sucursal cuya cocina prepara. */
  en: number
  /** Las cocinas (estaciones) que van allá; las demás se preparan en la propia. */
  estaciones: Estacion[]
}

type ConCocina = Pick<Sucursal, 'id' | 'cocinaCompartida'>

/** La sucursal cuya cocina prepara lo de una estación: la misma, o la que por ahora le cocina. */
export function cocinaQuePrepara(sucursales: readonly ConCocina[], sucursalId: number, estacion: Estacion): number {
  const c = sucursales.find((s) => s.id === sucursalId)?.cocinaCompartida
  return c && c.estaciones.includes(estacion) ? c.en : sucursalId
}

/** Las sucursales cuyas comandas de esa estación salen en la misma pantalla de cocina, ella incluida. */
export function juntasEnCocina(sucursales: readonly ConCocina[], sucursalId: number, estacion: Estacion): number[] {
  const cocina = cocinaQuePrepara(sucursales, sucursalId, estacion)
  const ids = sucursales.filter((s) => s.id !== sucursalId && cocinaQuePrepara(sucursales, s.id, estacion) === cocina).map((s) => s.id)
  return [sucursalId, ...ids]
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

/** Los datos del negocio y las listas que usan todas las pantallas. */
export interface Ajustes {
  nombre: string
  subtitulo: string
  ruc: string
  pieNota: string
  estaciones: Record<Estacion, string>
  observaciones: string[]
  minutosAlerta: number
  /** Solo los activos, en su orden. */
  medios: MedioPago[]
  /** Las sucursales activas: la entrada pregunta en cuál está la tablet. */
  sucursales: Sucursal[]
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
  /** La sucursal donde trabaja; el administrador no tiene una: las ve todas. */
  sucursalId: number | null
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
  sucursalId: number
  /** El número de la nota en el día y en su sucursal: 1, 2, 3… Vuelve a empezar cada mañana. */
  numero: number
  mesa: { id: number; numero: number; tipo: TipoMesa }
  mozo: string | null
  cliente: string | null
  estado: EstadoPedido
  total: number
  creadoEn: string
  /** El mozo avisó a caja que la mesa pide la cuenta. */
  cuentaPedidaEn: string | null
  cobradoEn: string | null
  cobradoPor: string | null
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
    /** El mozo avisó que la mesa pide la cuenta. */
    cuentaPedidaEn: string | null
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
  /** De qué local es: con la cocina compartida, una pantalla muestra las de dos. */
  sucursalId: number
  /** El número de la nota en el día (la columna «Nro:» de Atención al Cliente). */
  numero: number
  ronda: number
  mesa: { numero: number; tipo: TipoMesa }
  cliente: string | null
  mozo: string | null
  enviadoEn: string
  items: ItemPedido[]
}

/* ── Caja ─────────────────────────────────────────────────────────────── */

/** Los billetes y monedas que circulan en el Perú, en céntimos, para contar la caja. */
export const DENOMINACIONES: { valor: number; tipo: 'Billete' | 'Moneda' }[] = [
  { valor: 20000, tipo: 'Billete' },
  { valor: 10000, tipo: 'Billete' },
  { valor: 5000, tipo: 'Billete' },
  { valor: 2000, tipo: 'Billete' },
  { valor: 1000, tipo: 'Billete' },
  { valor: 500, tipo: 'Moneda' },
  { valor: 200, tipo: 'Moneda' },
  { valor: 100, tipo: 'Moneda' },
  { valor: 50, tipo: 'Moneda' },
  { valor: 20, tipo: 'Moneda' },
  { valor: 10, tipo: 'Moneda' },
]

/** Cuántos de cada billete y moneda: { "20000": 1, "50": 4 }. */
export type Conteo = Record<string, number>

export const sumarConteo = (conteo: Conteo) => DENOMINACIONES.reduce((s, d) => s + d.valor * (conteo[d.valor] ?? 0), 0)

export interface MedioEnCaja {
  metodo: string
  nombre: string
  efectivo: boolean
  cobros: number
  monto: number
  vuelto: number
}

export interface MovimientoCaja {
  id: number
  tipo: 'INGRESO' | 'EGRESO'
  monto: number
  concepto: string
  usuario: string
  usuarioId: number
  creadoEn: string
}

export interface EventoCaja {
  tipo: 'APERTURA' | 'CIERRE' | 'REAPERTURA'
  usuario: string
  creadoEn: string
  /** Apertura: el fondo. Cierre: lo contado. */
  monto: number | null
  /** Cierre: lo contado menos lo esperado (negativo = faltó). */
  diferencia: number | null
}

/**
 * El arqueo de un turno de caja, como la hoja «Arqueo» del Excel:
 *   esperado = fondo inicial + cobros en efectivo + ingresos − egresos
 * y al cerrar, la diferencia entre lo contado y lo esperado.
 */
export interface ArqueoCaja {
  id: number
  sucursalId: number
  estado: 'ABIERTA' | 'CERRADA'
  abiertaPor: string
  abiertaEn: string
  cerradaPor: string | null
  cerradaEn: string | null
  montoInicial: number
  medios: MedioEnCaja[]
  /** Notas cobradas en este turno. */
  notas: number
  /** Todo lo cobrado, con cualquier medio. */
  ventas: number
  /** Lo cobrado en efectivo (lo que entró al cajón, ya descontado el vuelto). */
  efectivo: number
  ingresos: number
  egresos: number
  esperado: number
  contado: number | null
  diferencia: number | null
  conteo: Conteo | null
  fondoSiguiente: number | null
  observacion: string | null
  movimientos: MovimientoCaja[]
  eventos: EventoCaja[]
}

export interface EstadoCaja {
  abierta: ArqueoCaja | null
  /** El último turno cerrado: para reabrirlo si fue un error, o ver su arqueo. */
  ultima: ArqueoCaja | null
  puedeReabrir: boolean
  /** Lo que el último cierre dejó en la caja para este turno. */
  fondoSugerido: number | null
  /** Las notas abiertas que todavía no se cobran. */
  porCobrar: { notas: number; total: number }
}

/** Una nota cobrada en un turno de caja. */
export interface CobroCaja {
  pedidoId: number
  numero: number
  mesa: { numero: number; tipo: TipoMesa }
  cliente: string | null
  mozo: string | null
  cobradoPor: string | null
  total: number
  cobradoEn: string
  pagos: Pago[]
}

export type Cambio = {
  mesas?: boolean
  carta?: boolean
  cocina?: boolean
  ajustes?: boolean
  caja?: boolean
  pedidoId?: number
  aviso?:
    | { tipo: 'nuevo'; mesa: string; estaciones: Estacion[] }
    | {
        tipo: 'listo'
        mesa: string
        estacion: Estacion
        /** Con la cocina compartida: el local donde se recoge el pedido. */
        en?: string
      }
    | { tipo: 'cuenta'; mesa: string }
}

export const formatoSoles = (centimos: number) =>
  `S/ ${(centimos / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const nombreMesa = (m: { numero: number; tipo: TipoMesa }) =>
  m.tipo === 'SALON' ? `Mesa ${m.numero}` : `Llevar ${m.numero}`

export const codigoMesa = (m: { numero: number; tipo: TipoMesa }) =>
  `${m.tipo === 'SALON' ? 'M' : 'L'}${m.numero}`
