import {
  mdiAccountGroup,
  mdiCashRegister,
  mdiChartBar,
  mdiChartPie,
  mdiFileTable,
  mdiReceiptText,
  mdiScaleBalance,
  mdiSilverwareForkKnife,
  mdiStorefront,
  mdiTableFurniture,
  mdiTableLarge,
  mdiViewDashboard,
} from '@mdi/js'

/**
 * Las páginas del panel, en el mismo orden que las hojas de análisis y de
 * datos del Excel: primero los reportes, después lo que se edita.
 */
export const SECCIONES: { ruta: string; nombre: string; grupo: 'Reportes' | 'Gestión'; icono: string; hoja?: string }[] = [
  { ruta: '', nombre: 'Inicio', grupo: 'Reportes', icono: mdiViewDashboard },
  { ruta: 'reporte-diario', nombre: 'Reporte diario', grupo: 'Reportes', icono: mdiReceiptText, hoja: 'Arqueo · Resumen' },
  { ruta: 'ventas', nombre: 'Ventas por fecha', grupo: 'Reportes', icono: mdiChartBar, hoja: 'VentasFecha · Tendencia' },
  { ruta: 'preferencias', nombre: 'Preferencias', grupo: 'Reportes', icono: mdiChartPie, hoja: 'Preferencias' },
  { ruta: 'acumulado', nombre: 'Acumulado del mes', grupo: 'Reportes', icono: mdiTableLarge, hoja: 'Acumulado' },
  { ruta: 'consolidado', nombre: 'Consolidado', grupo: 'Reportes', icono: mdiFileTable, hoja: 'Consolidado · Filtro_Pref' },
  { ruta: 'carta', nombre: 'Carta y precios', grupo: 'Gestión', icono: mdiSilverwareForkKnife, hoja: 'Productos · Adicional · Detalle' },
  { ruta: 'mesas', nombre: 'Mesas', grupo: 'Gestión', icono: mdiTableFurniture, hoja: 'M1…M25 · L1…L10' },
  { ruta: 'pagos', nombre: 'Tipos de pago', grupo: 'Gestión', icono: mdiCashRegister },
  { ruta: 'equipo', nombre: 'Equipo', grupo: 'Gestión', icono: mdiAccountGroup },
  { ruta: 'costos', nombre: 'Insumos y costos', grupo: 'Gestión', icono: mdiScaleBalance, hoja: 'Costos · Insumos' },
  { ruta: 'local', nombre: 'Datos del local', grupo: 'Gestión', icono: mdiStorefront },
]

export const rutaDe = (ruta: string) => (ruta ? `/admin/${ruta}` : '/admin')
