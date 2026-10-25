import type { MedioPago, PagoCobro } from '@wasi/shared'
import { idAlAzar } from './azar.js'
import { soles } from './formato.js'

export interface FilaPago {
  clave: string
  metodo: string | null
  /** Parte del total asignada a este pago. */
  monto: string
  /** Vacío significa que entrega el importe exacto. */
  recibido: string
}

export const filaPagoVacia = (): FilaPago => ({ clave: idAlAzar(), metodo: null, monto: '', recibido: '' })

/** «12,5» → 1250 céntimos. Vacío o inválido → 0. */
export function aCentimos(texto: string) {
  const n = Number(texto.replace(',', '.').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function cuadrarPago(total: number, filas: FilaPago[], medios: MedioPago[]) {
  const usadas = filas.filter((f) => f.metodo && aCentimos(f.monto) > 0)
  const pagos: PagoCobro[] = []
  let error: string | null = null
  let vuelto = 0
  for (const [i, f] of filas.entries()) {
    if (!f.metodo && !f.monto && !f.recibido) continue
    const medio = medios.find((m) => m.clave === f.metodo && m.activo)
    const monto = aCentimos(f.monto)
    const recibido = medio?.efectivo && f.recibido.trim() ? aCentimos(f.recibido) : monto
    if (!medio) error ??= `Pago ${i + 1}: elige un medio de pago disponible.`
    else if (monto <= 0) error ??= `Pago ${i + 1}: escribe cuánto se debe cobrar.`
    else if (recibido < monto) error ??= `Pago ${i + 1}: el dinero recibido no cubre los S/ ${soles(monto)} a cobrar.`
    if (medio && monto > 0) {
      pagos.push({ metodo: medio.clave, monto, recibido })
      vuelto += medio.efectivo ? Math.max(0, recibido - monto) : 0
    }
  }
  const aplicado = pagos.reduce((s, p) => s + p.monto, 0)
  const excede = Math.max(0, aplicado - total)
  if (excede) error ??= `Los importes a cobrar superan el total por S/ ${soles(excede)}.`
  return { usadas, pagos, aplicado, vuelto, debe: Math.max(0, total - aplicado), excede, error }
}
