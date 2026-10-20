import {
  mdiAccountGroup,
  mdiCashRegister,
  mdiChartBar,
  mdiChartPie,
  mdiCogOutline,
  mdiCreditCardMultiple,
  mdiFileTable,
  mdiReceiptText,
  mdiScaleBalance,
  mdiSilverwareForkKnife,
  mdiStorefront,
  mdiTableFurniture,
  mdiTableLarge,
  mdiViewDashboard,
} from '@mdi/js'
import type { Rol } from '@wasi/shared'

/**
 * Las páginas del panel, en el mismo orden que las hojas de análisis y de
 * datos del Excel: primero los reportes, después lo que se edita.
 *
 * La encargada ve lo de su sucursal: los reportes del día a día, las cajas,
 * su equipo, sus mesas y los agotados. Lo que es de todo el negocio (la
 * carta y sus precios, los medios de pago, las sucursales, los costos) es del
 * administrador.
 */
const TODOS: Rol[] = ['ENCARGADO', 'ADMIN']
const ADMIN: Rol[] = ['ADMIN']

export interface Seccion {
  ruta: string
  nombre: string
  grupo: 'Reportes' | 'Gestión'
  icono: string
  hoja?: string
  roles: Rol[]
  /** El nombre que ve la encargada, si es otro (ella solo marca agotados en la carta). */
  nombreEncargada?: string
}

export const SECCIONES: Seccion[] = [
  { ruta: '', nombre: 'Inicio', grupo: 'Reportes', icono: mdiViewDashboard, roles: TODOS },
  { ruta: 'reporte-diario', nombre: 'Reporte diario', grupo: 'Reportes', icono: mdiReceiptText, hoja: 'Arqueo · Resumen', roles: TODOS },
  { ruta: 'cajas', nombre: 'Cajas y arqueos', grupo: 'Reportes', icono: mdiCashRegister, hoja: 'Arqueo de cada turno', roles: TODOS },
  { ruta: 'ventas', nombre: 'Ventas por fecha', grupo: 'Reportes', icono: mdiChartBar, hoja: 'VentasFecha · Tendencia', roles: TODOS },
  { ruta: 'preferencias', nombre: 'Preferencias', grupo: 'Reportes', icono: mdiChartPie, hoja: 'Preferencias', roles: TODOS },
  { ruta: 'acumulado', nombre: 'Acumulado del mes', grupo: 'Reportes', icono: mdiTableLarge, hoja: 'Acumulado', roles: ADMIN },
  { ruta: 'consolidado', nombre: 'Consolidado', grupo: 'Reportes', icono: mdiFileTable, hoja: 'Consolidado · Filtro_Pref', roles: ADMIN },
  {
    ruta: 'carta',
    nombre: 'Carta y precios',
    nombreEncargada: 'Carta y agotados',
    grupo: 'Gestión',
    icono: mdiSilverwareForkKnife,
    hoja: 'Productos · Adicional · Detalle',
    roles: TODOS,
  },
  { ruta: 'mesas', nombre: 'Mesas', grupo: 'Gestión', icono: mdiTableFurniture, hoja: 'M1…M25 · L1…L10', roles: TODOS },
  { ruta: 'equipo', nombre: 'Equipo', grupo: 'Gestión', icono: mdiAccountGroup, roles: TODOS },
  { ruta: 'sucursales', nombre: 'Sucursales', grupo: 'Gestión', icono: mdiStorefront, roles: ADMIN },
  { ruta: 'pagos', nombre: 'Tipos de pago', grupo: 'Gestión', icono: mdiCreditCardMultiple, roles: ADMIN },
  { ruta: 'costos', nombre: 'Insumos y costos', grupo: 'Gestión', icono: mdiScaleBalance, hoja: 'Costos · Insumos', roles: ADMIN },
  { ruta: 'local', nombre: 'Datos generales', grupo: 'Gestión', icono: mdiCogOutline, roles: ADMIN },
]

export const rutaDe = (ruta: string) => (ruta ? `/admin/${ruta}` : '/admin')

export const seccionesDe = (rol: Rol) => SECCIONES.filter((s) => s.roles.includes(rol))

export const nombreSeccion = (s: Seccion, rol: Rol) => (rol === 'ENCARGADO' && s.nombreEncargada) || s.nombre
