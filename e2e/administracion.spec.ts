import { expect, test } from '@playwright/test'
import { CLAVE_ADMIN, apiDesde, entrar, ventaRapida, verSucursal } from './ayuda'

test.describe('administración', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, 'Administración', CLAVE_ADMIN)
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
    // Las mesas son de cada sucursal: el dueño elige cuál mira.
    await page.getByRole('link', { name: 'Mesas' }).first().click()
    await expect(page.getByText('Las mesas son de cada sucursal. ¿De cuál?')).toBeVisible()
    await page.getByRole('button', { name: 'Plaza More' }).click()
    await expect(page.getByRole('heading', { name: 'Mesas · Plaza More' })).toBeVisible()
    const llevar = page.locator('section', { hasText: 'Para llevar · hojas L' })
    await llevar.getByLabel('Cuántas agregar').fill('2')
    await llevar.getByRole('button', { name: 'Agregar' }).click()
    await expect(page.getByText('2 pedidos para llevar agregados')).toBeVisible()
    await expect(llevar.getByRole('cell', { name: 'L12', exact: true })).toBeVisible()
  })

  test('los datos generales se guardan y encabezan cada hoja', async ({ page }) => {
    await page.getByRole('link', { name: 'Datos generales' }).click()
    const subtitulo = page.getByLabel('Subtítulo')
    await subtitulo.fill('Comida peruana')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Datos generales guardados')).toBeVisible()
    // El dueño, en un área del local, primero dice en qué sucursal entra.
    await page.goto('/mozo')
    await page.getByRole('button', { name: 'Plaza More' }).click()
    await expect(page.getByText('Comida peruana').first()).toBeVisible()
    await page.goto('/admin/local')
    await page.getByLabel('Subtítulo').fill('Peruvian Cuisine')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Datos generales guardados')).toBeVisible()
  })

  test('el consolidado trae el resumen y se puede descargar para Excel', async ({ page }) => {
    await ventaRapida(page, { tipo: 'SALON', numero: 24 })
    await page.getByRole('link', { name: 'Consolidado' }).click()
    await expect(page.getByText(/^[1-9]\d* notas · [1-9]\d* platos/)).toBeVisible()
    await expect(page.getByRole('cell', { name: 'M24' }).first()).toBeVisible()
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar (Excel)' }).click()])
    expect(descarga.suggestedFilename()).toMatch(/^consolidado-.*\.csv$/)
  })

  test('el dueño agrega una sucursal, la mira sola desde arriba y la desactiva', async ({ page }) => {
    await page.getByRole('link', { name: 'Sucursales' }).click()
    await page.getByRole('button', { name: 'Agregar sucursal' }).click()
    const nueva = page.getByRole('dialog', { name: 'Agregar sucursal' })
    await nueva.getByPlaceholder('Ej. Wasi Centro').fill('Sur')
    await nueva.getByRole('button', { name: 'Crear sucursal' }).click()
    await page.getByRole('dialog', { name: 'Sucursal creada' }).getByRole('button', { name: 'Después' }).click()
    // Después de Plaza More, Plaza San Cristóbal y la Sucursal 3 (apagada).
    await expect(page.getByLabel('Nombre de la sucursal').nth(3)).toHaveValue('Sur')

    // Arriba, el selector: todas o una.
    await verSucursal(page, 'Sur')
    await page.getByRole('link', { name: 'Inicio' }).click()
    await expect(page.getByText(/· Sur$/)).toBeVisible()
    await page.getByRole('link', { name: 'Mesas' }).first().click()
    await expect(page.getByRole('heading', { name: 'Mesas · Sur' })).toBeVisible()
    await expect(page.locator('section', { hasText: 'Salón · hojas M' }).getByRole('cell', { name: 'M10', exact: true })).toBeVisible()

    // Se desactiva y desaparece del selector (el panel vuelve a «todas»).
    await page.getByRole('link', { name: 'Sucursales' }).click()
    await page.getByRole('checkbox', { name: 'Activa' }).nth(3).click()
    await page.getByRole('dialog', { name: 'Desactivar sucursal' }).getByRole('button', { name: 'Desactivar' }).click()
    await expect(page.getByText('Sur desactivada')).toBeVisible()
    await page.getByRole('button', { name: 'Ver sucursal' }).click()
    await expect(page.getByRole('option', { name: /^Plaza San Cristóbal/ })).toBeVisible()
    await expect(page.getByRole('option', { name: /^Sur/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
  })

  test('Cajas y arqueos lista los turnos con su caja abierta', async ({ page }) => {
    await ventaRapida(page, { tipo: 'SALON', numero: 23 })
    await page.getByRole('link', { name: 'Cajas y arqueos' }).click()
    await expect(page.getByText('Turnos de caja').first()).toBeVisible()
    await page.getByRole('row').filter({ hasText: 'Abierta' }).first().click()
    const detalle = page.getByRole('dialog', { name: /^Caja N° \d+ · Plaza More/ })
    await expect(detalle.getByText('Arqueo de caja')).toBeVisible()
    await expect(detalle.getByText(/Notas cobradas en el turno \([1-9]/)).toBeVisible()
  })
})
