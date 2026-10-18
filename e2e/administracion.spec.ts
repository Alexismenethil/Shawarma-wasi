import { expect, test } from '@playwright/test'
import { PIN, apiDesde, entrar, ventaRapida } from './ayuda'

test.describe('administración', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'Administración', PIN.ADMIN)
  })

  test('el panel abre con las tarjetas del día y los gráficos', async ({ page }) => {
    await expect(page.getByText('Ventas de hoy')).toBeVisible()
    await expect(page.getByText('Pedidos cobrados')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tipo de pago' })).toBeVisible()
  })

  test('un precio se edita en la misma celda y la carta del mozo lo ve', async ({ page }) => {
    await page.getByRole('link', { name: 'Carta y precios' }).click()
    const precio = page.getByLabel('Precio').first()
    await precio.click()
    await precio.fill('16.50')
    await precio.press('Enter')
    await expect
      .poll(async () => (await apiDesde<{ familias: { productos: { variante: string; precio: number }[] }[] }>(page, '/carta')).familias[0].productos[0].precio)
      .toBe(1650)
    await precio.click()
    await precio.fill('15')
    await precio.press('Enter')
    await expect.poll(async () => (await apiDesde<{ familias: { productos: { precio: number }[] }[] }>(page, '/carta')).familias[0].productos[0].precio).toBe(1500)
  })

  test('agregar mesas para llevar de una vez', async ({ page }) => {
    await page.getByRole('link', { name: 'Mesas' }).first().click()
    const llevar = page.locator('section', { hasText: 'Para llevar · hojas L' })
    await llevar.getByLabel('Cuántas agregar').fill('2')
    await llevar.getByRole('button', { name: 'Agregar' }).click()
    await expect(page.getByText('2 pedidos para llevar agregados')).toBeVisible()
    await expect(llevar.getByRole('cell', { name: 'L12', exact: true })).toBeVisible()
  })

  test('los datos del local se guardan y encabezan cada hoja', async ({ page }) => {
    await page.getByRole('link', { name: 'Datos del local' }).click()
    const subtitulo = page.getByLabel('Subtítulo')
    await subtitulo.fill('Comida peruana')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Datos del local guardados')).toBeVisible()
    await page.goto('/mozo')
    await expect(page.getByText('Comida peruana').first()).toBeVisible()
    await page.goto('/admin/local')
    await page.getByLabel('Subtítulo').fill('Peruvian Cuisine')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Datos del local guardados')).toBeVisible()
  })

  test('el consolidado trae el resumen y se puede descargar para Excel', async ({ page }) => {
    await ventaRapida(page, { tipo: 'SALON', numero: 24 })
    await page.getByRole('link', { name: 'Consolidado' }).click()
    await expect(page.getByText(/^[1-9]\d* notas · [1-9]\d* platos/)).toBeVisible()
    await expect(page.getByRole('cell', { name: 'M24' }).first()).toBeVisible()
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar (Excel)' }).click()])
    expect(descarga.suggestedFilename()).toMatch(/^consolidado-.*\.csv$/)
  })
})
