import { expect, test } from '@playwright/test'
import { PIN, abrirCajaSiHaceFalta, apiDesde, entrar } from './ayuda'

const soles = (c: number) => (c / 100).toFixed(2)

test('caja: un egreso, el arqueo al momento, el cierre contando y la reapertura', async ({ page }) => {
  await entrar(page, 'Caja', PIN.CAJA)
  await abrirCajaSiHaceFalta(page)

  // Un egreso del cajón
  await page.getByRole('link', { name: 'Ingresos y egresos' }).click()
  await page.getByLabel('Monto').fill('12.50')
  await page.getByLabel('Concepto').fill('Pan del día')
  await page.getByRole('button', { name: 'Anotar' }).click()
  await expect(page.getByText('Egreso de S/ 12.50 anotado')).toBeVisible()
  await expect(page.getByText('Pan del día')).toBeVisible()

  // El arqueo lo descuenta al momento
  await page.getByRole('link', { name: 'Arqueo y cierre' }).click()
  const { abierta } = await apiDesde<{ abierta: { esperado: number; egresos: number } }>(page, '/caja')
  expect(abierta.egresos).toBeGreaterThanOrEqual(1250)
  await expect(page.getByText(`S/ ${soles(abierta.esperado)}`).first()).toBeVisible()

  // Cierre: se cuenta solo el total, falta S/ 1.00, se explica y se cierra
  await page.getByRole('button', { name: 'Cerrar caja' }).click()
  await page.getByRole('radio', { name: 'Solo el total' }).click()
  await page.getByLabel('Total contado').fill(soles(abierta.esperado - 100))
  await expect(page.getByRole('status').filter({ hasText: 'Falta' })).toContainText('1.00')
  await page.getByLabel('Queda en caja').fill('0')
  await page.getByPlaceholder(/Ej\. Se pagó al proveedor/).fill('Se dio vuelto de más')
  await page.getByRole('button', { name: 'Cerrar caja' }).last().click()
  await page.getByRole('dialog', { name: 'Cerrar caja' }).getByRole('button', { name: 'Cerrar caja' }).click()
  await expect(page.getByText('Caja cerrada · Falta S/ 1.00')).toBeVisible()

  // Cerrada: se ve el último cierre con su arqueo, y se reabre (fue un error)
  await expect(page.getByText('Apertura de caja')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Último cierre' })).toBeVisible()
  await expect(page.getByText('Observación: Se dio vuelto de más')).toBeVisible()
  await page.getByRole('button', { name: 'Reabrir caja' }).click()
  await page.getByRole('dialog', { name: 'Reabrir caja' }).getByRole('button', { name: 'Reabrir caja' }).click()
  await expect(page.getByText('Caja reabierta')).toBeVisible()
  await expect(page.getByText(/^Caja abierta/).first()).toBeVisible()

  // Al salir con la caja abierta, el sistema lo recuerda
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  const aviso = page.getByRole('dialog', { name: 'La caja sigue abierta' })
  await expect(aviso).toBeVisible()
  await aviso.getByRole('button', { name: 'Cerrar caja' }).click()
  await expect(page).toHaveURL(/hoja=arqueo/)
  await expect(page.getByText('1. Cuenta el dinero del cajón')).toBeVisible()
})
