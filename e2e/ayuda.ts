import { expect, type Page } from '@playwright/test'

/** Los PIN de la base de pruebas (los pone backend/scripts/base-prueba.mjs). */
export const PIN = {
  MOZO: process.env.SEED_PIN_MOZO!,
  COCINA: process.env.SEED_PIN_COCINA!,
  ADMIN: process.env.SEED_PIN_ADMIN!,
}

export type Area = 'Mozo' | 'Cocina' | 'Administración'

/** Entra como lo haría el personal: elige el área y teclea el PIN. */
export async function entrar(page: Page, area: Area, pin: string) {
  if (!/\/(mozo|cocina|admin)/.test(page.url())) await page.goto('/')
  await page.getByRole('radio', { name: area }).click()
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
  await expect(page).toHaveURL(area === 'Mozo' ? /\/mozo/ : area === 'Cocina' ? /\/cocina/ : /\/admin/)
}

/**
 * Una venta completa hecha por la API con la sesión de la página (el
 * administrador puede todo): anota, cocina atiende, se sirve y se cobra.
 */
export async function ventaRapida(page: Page, mesa: { tipo: 'SALON' | 'LLEVAR'; numero: number }) {
  return page.evaluate(async (m) => {
    const { token } = JSON.parse(localStorage.getItem('wasi.sesion') ?? '{}')
    const pedir = (ruta: string, cuerpo?: unknown) =>
      fetch(`/api${ruta}`, {
        method: cuerpo === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, ...(cuerpo !== undefined && { 'content-type': 'application/json' }) },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      }).then((r) => r.json())
    const mesas = await pedir('/mesas')
    const id = mesas.find((x: { tipo: string; numero: number }) => x.tipo === m.tipo && x.numero === m.numero).id
    const carta = await pedir('/carta')
    const producto = carta.familias[0].productos[0].id
    const p = await pedir(`/mesas/${id}/enviar`, { lineas: [{ productoId: producto, cantidad: 1, adicionales: [], detalle: null, paraLlevar: false, observacion: null }] })
    for (const i of p.items) await pedir(`/cocina/items/${i.id}`, { listo: true })
    await pedir(`/pedidos/${p.id}/servir`, {})
    return pedir(`/pedidos/${p.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: p.total }] })
  }, mesa)
}

/** Llama a la API con la sesión que la página guardó. */
export async function apiDesde<T>(page: Page, ruta: string): Promise<T> {
  return page.evaluate(async (r) => {
    const { token } = JSON.parse(localStorage.getItem('wasi.sesion') ?? '{}')
    const res = await fetch(`/api${r}`, { headers: { authorization: `Bearer ${token}` } })
    return res.json()
  }, ruta)
}
