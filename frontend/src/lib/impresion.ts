import { useEffect, useState } from 'react'

/**
 * Al cobrar, el comprobante sale solo, en la caja y en la nota del mostrador.
 * Se puede apagar en cada equipo (una tablet sin impresora): la elección queda
 * guardada en ese equipo. Para que salga directo, sin el cuadro de impresión,
 * Chrome de la PC de caja se abre con --kiosk-printing (ver README).
 */

const LLAVE = 'wasi.imprimirAlCobrar'
const oyentes = new Set<(si: boolean) => void>()

export function imprimeAlCobrar() {
  try {
    return localStorage.getItem(LLAVE) !== 'no'
  } catch {
    return true
  }
}

export function guardarImprimeAlCobrar(si: boolean) {
  try {
    localStorage.setItem(LLAVE, si ? 'si' : 'no')
  } catch {
    /* sin almacenamiento: dura lo que la pestaña */
  }
  oyentes.forEach((o) => o(si))
}

/**
 * La preferencia del equipo y una forma de pedir la impresión del comprobante
 * de una nota recién cobrada: se imprime cuando la nota ya muestra el pago
 * (después de pintarse en pantalla), no antes.
 */
export function useImprimirAlCobrar(pagadoEn: string | null | undefined) {
  const [activo, setActivo] = useState(imprimeAlCobrar)
  const [pendiente, setPendiente] = useState(false)

  useEffect(() => {
    oyentes.add(setActivo)
    return () => void oyentes.delete(setActivo)
  }, [])

  useEffect(() => {
    if (!pendiente || !pagadoEn) return
    // Se apaga el pedido dentro del mismo cuadro: apagarlo antes cancelaría la impresión.
    const cuadro = requestAnimationFrame(() => {
      setPendiente(false)
      window.print()
    })
    return () => cancelAnimationFrame(cuadro)
  }, [pendiente, pagadoEn])

  return {
    activo,
    cambiar: (si: boolean) => guardarImprimeAlCobrar(si),
    /** Llamar justo después de cobrar. */
    alCobrar: () => {
      if (imprimeAlCobrar()) setPendiente(true)
    },
  }
}
