import { expect, test } from '@playwright/test'
import { PIN, entrar } from './ayuda'

test('en el celular los desplegables suben desde abajo y la nota se guarda', async ({ page }) => {
  await entrar(page, 'Mozo', PIN.MOZO)
  await page.locator('main').getByTitle('Mesa 9 · Libre').click()
  await page.getByRole('button', { name: 'Producto' }).last().click()
  const hoja = page.getByRole('dialog', { name: 'Producto' })
  await expect(hoja).toBeVisible()
  await hoja.getByRole('option', { name: /^Emolientes/ }).click()
  await page.getByRole('dialog', { name: 'Emolientes' }).getByRole('option', { name: /^Especial/ }).click()
  await expect(page.getByText('S/ 6.00')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(/Guardado\. Enviado a Cocina 3/)).toBeVisible()
  // Las pestañas del libro al pie: la de esta mesa ya tiene su franja de color.
  await expect(page.getByRole('link', { name: 'M9' })).toHaveAttribute('aria-current', 'page')
})
