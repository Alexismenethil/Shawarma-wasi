import { expect, test } from '@playwright/test'
import { PIN, entrar, apiDesde } from './ayuda'

const vercel = process.env.PRUEBA_VERCEL === '1'

test.describe('Vercel: recuperación', () => {
  test.skip(!vercel, 'Se ejecuta con npm run test:vercel, contra dos procesos independientes.')

  test('la respuesta de Guardar se pierde después del COMMIT y el reintento no duplica la comanda', async ({ page }) => {
    await entrar(page, 'Mozo', PIN.MOZO)
    await page.locator('main').getByTitle('Mesa 24 · Libre').click()
    await page.getByRole('button', { name: 'Producto' }).last().click()
    await page.getByRole('option', { name: /^Shawarmas/ }).click()
    await page.getByRole('option', { name: /^Clásica/ }).click()
    await page.getByLabel('Cliente').fill('Respuesta perdida')
    let perdida = false
    const claves: string[] = []
    await page.route('**/api/mesas/*/enviar', async (ruta) => {
      claves.push(ruta.request().headers()['idempotency-key'])
      if (!perdida) {
        perdida = true
        const confirmada = await ruta.fetch()
        expect(confirmada.status()).toBe(200)
        await ruta.abort('connectionreset')
      } else await ruta.continue()
    })
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText(/Guardado\. Enviado/)).toBeVisible({ timeout: 15_000 })
    expect(claves.length).toBeGreaterThanOrEqual(2)
    expect(new Set(claves).size).toBe(1)
    const mesas = await apiDesde<any[]>(page, '/mesas')
    const m = mesas.find((m) => m.numero === 24 && m.tipo === 'SALON')
    const nota = await apiDesde<any>(page, `/mesas/${m.id}/pedido`)
    expect(nota.items).toHaveLength(1)
    expect(nota.items[0].cantidad).toBe(1)
  })

  test('sin internet conserva el borrador; al volver conecta y permite guardarlo', async ({ page, context }) => {
    await entrar(page, 'Mozo', PIN.MOZO)
    await page.locator('main').getByTitle('Mesa 25 · Libre').click()
    await page.getByRole('button', { name: 'Producto' }).last().click()
    await page.getByRole('option', { name: /^Shawarmas/ }).click()
    await page.getByRole('option', { name: /^Clásica/ }).click()
    await page.getByLabel('Cliente').fill('Borrador sin wifi')
    await context.setOffline(true)
    await expect(page.getByText('Sin conexión', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('wasi.borrador.')))).toBe(true)
    await context.setOffline(false)
    await expect(page.getByText('En línea', { exact: true })).toBeVisible({ timeout: 15_000 })
    await page.reload()
    await expect(page.getByLabel('Cliente')).toHaveValue('Borrador sin wifi')
    await expect(page.getByRole('button', { name: 'Shawarmas', exact: true }).first()).toContainText('Clásica')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText(/Guardado\. Enviado/)).toBeVisible()
  })

  test('si todas las funciones caen, vuelve a sincronizar tras arrancar otras sin recargar la página', async ({ page, request }) => {
    await entrar(page, 'Mozo', PIN.MOZO)
    await expect(page.getByText('En línea', { exact: true })).toBeVisible()
    await request.post('/__pruebas/pausar')
    try {
      await expect(page.getByText('Sin conexión', { exact: true })).toBeVisible({ timeout: 15_000 })
    } finally {
      await request.post('/__pruebas/reanudar')
    }
    await expect(page.getByText('En línea', { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Mesas del local')).toBeVisible()
    expect((await apiDesde<any[]>(page, '/mesas')).length).toBeGreaterThan(0)
  })
})
