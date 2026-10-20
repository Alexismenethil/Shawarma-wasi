import { expect, type Page } from '@playwright/test'

/** Los PIN y la contraseña de la base de pruebas (los pone backend/scripts/base-prueba.mjs). */
export const PIN = {
  MOZO: process.env.SEED_PIN_MOZO!,
  COCINA: process.env.SEED_PIN_COCINA!,
  CAJA: process.env.SEED_PIN_CAJA!,
}
/** Los de Plaza San Cristóbal: ningún PIN se repite entre sucursales (la semilla de prueba los toma de SEED_PINES_OTRAS). */
const otros = (process.env.SEED_PINES_OTRAS ?? '').split(',')
export const PIN_SAN_CRISTOBAL = { MOZO: otros[0], COCINA: otros[1], CAJA: otros[2] }
export const CLAVE_ADMIN = process.env.SEED_ADMIN_CLAVE!
const USUARIO_ADMIN = process.env.SEED_ADMIN_USUARIO!

export type Area = 'Mozo' | 'Cocina' | 'Caja' | 'Administración'
const RUTA: Record<Area, RegExp> = { Mozo: /\/mozo/, Cocina: /\/cocina/, Caja: /\/caja/, Administración: /\/admin/ }

/** En la entrada: la sucursal de esta tablet, si no es ya la elegida. */
export async function elegirSucursal(page: Page, nombre: string) {
  const sucursal = page.getByRole('button', { name: 'Sucursal' })
  if (!(await sucursal.isVisible()) || (await sucursal.textContent())?.includes(nombre)) return
  await sucursal.click()
  await page.getByRole('option', { name: new RegExp(`^${nombre}`) }).click()
}

/**
 * Entra como lo haría el personal: elige el área, su sucursal (Plaza More si
 * no se dice otra) y teclea su PIN. La administración entra con usuario y
 * contraseña.
 */
export async function entrar(page: Page, area: Area, credencial: string, sucursal = 'Plaza More') {
  if (!/\/(mozo|cocina|caja|admin)/.test(page.url())) await page.goto('/')
  await page.getByRole('radio', { name: area }).click()
  if (area === 'Administración') {
    await page.getByLabel('Usuario').fill(USUARIO_ADMIN)
    await page.getByLabel('Contraseña', { exact: true }).fill(credencial)
    await page.getByRole('button', { name: 'Ingresar' }).click()
  } else {
    await elegirSucursal(page, sucursal)
    for (const d of credencial) await page.getByRole('button', { name: d, exact: true }).click()
  }
  await expect(page).toHaveURL(RUTA[area])
}

/** El dueño mira una sola sucursal desde el selector de arriba del panel. */
export async function verSucursal(page: Page, nombre: string) {
  await page.getByRole('button', { name: 'Ver sucursal' }).click()
  await page.getByRole('option', { name: new RegExp(`^${nombre}`) }).click()
}

/** En la pantalla de caja: si está cerrada, la abre con S/ 100 de fondo. */
export async function abrirCajaSiHaceFalta(page: Page) {
  const abrir = page.getByRole('button', { name: /^Abrir caja con/ })
  await expect(abrir.or(page.getByText('Caja abierta', { exact: false }).first())).toBeVisible()
  if (await abrir.isVisible()) {
    await page.getByLabel('Fondo inicial').fill('100')
    await abrir.click()
    await expect(page.getByText(/^Caja abierta/).first()).toBeVisible()
  }
}

/**
 * Una venta completa hecha por la API con la sesión de la página (el
 * administrador puede todo): anota, cocina atiende, se sirve y caja cobra
 * (si la caja estaba cerrada, la abre).
 */
export async function ventaRapida(page: Page, mesa: { tipo: 'SALON' | 'LLEVAR'; numero: number }) {
  return page.evaluate(
    async (m) => {
      // La sesión que la página guardó; el administrador mira la sucursal 1 si no eligió otra.
      const { token } = JSON.parse(localStorage.getItem('wasi.sesion') ?? '{}')
      const base = { authorization: `Bearer ${token}`, 'x-sucursal': localStorage.getItem('wasi.vista') ?? '1' }
      const pedir = (ruta: string, cuerpo?: unknown) =>
        fetch(`/api${ruta}`, {
          method: cuerpo === undefined ? 'GET' : 'POST',
          headers: { ...base, ...(cuerpo !== undefined && { 'content-type': 'application/json' }) },
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        }).then((r) => r.json())
      const mesas = await pedir('/mesas')
      const id = mesas.find((x: { tipo: string; numero: number }) => x.tipo === m.tipo && x.numero === m.numero).id
      const carta = await pedir('/carta')
      const producto = carta.familias[0].productos[0].id
      const p = await pedir(`/mesas/${id}/enviar`, { lineas: [{ productoId: producto, cantidad: 1, adicionales: [], detalle: null, paraLlevar: false, observacion: null }] })
      for (const i of p.items) await pedir(`/cocina/items/${i.id}`, { listo: true })
      await pedir(`/pedidos/${p.id}/servir`, {})
      if (!(await pedir('/caja')).abierta) await pedir('/caja/abrir', { montoInicial: 0 })
      return pedir(`/pedidos/${p.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: p.total }] })
    },
    mesa,
  )
}

/** Llama a la API con la sesión que la página guardó. */
export async function apiDesde<T>(page: Page, ruta: string): Promise<T> {
  return page.evaluate(async (r) => {
    const { token } = JSON.parse(localStorage.getItem('wasi.sesion') ?? '{}')
    const res = await fetch(`/api${r}`, { headers: { authorization: `Bearer ${token}`, 'x-sucursal': localStorage.getItem('wasi.vista') ?? '1' } })
    return res.json()
  }, ruta)
}
