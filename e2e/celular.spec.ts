import { expect, test } from '@playwright/test'
import { PIN, abrirCajaSiHaceFalta, entrar } from './ayuda'

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

test('en el celular, caja abre la nota a pantalla completa y la cobra con Yape', async ({ page }) => {
  await entrar(page, 'Caja', PIN.CAJA)
  await abrirCajaSiHaceFalta(page)
  // Caja también anota: un pedido para llevar del mostrador.
  await page.getByRole('link', { name: 'Anotar pedido' }).first().click()
  await page.locator('main').getByTitle('Llevar 7 · Libre').click()
  await page.getByRole('button', { name: 'Producto' }).last().click()
  await page.getByRole('dialog', { name: 'Producto' }).getByRole('option', { name: /^Emolientes/ }).click()
  await page.getByRole('dialog', { name: 'Emolientes' }).getByRole('option', { name: /^Especial/ }).click()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(/Guardado\. Enviado a Cocina 3/)).toBeVisible()

  // De vuelta en caja: la nota está en la lista y se abre sola en la pantalla.
  await page.getByRole('link', { name: 'Caja' }).first().click()
  await page.getByRole('listitem').filter({ hasText: 'L7' }).getByRole('button').click()
  await expect(page.getByRole('button', { name: 'Todas las notas' })).toBeVisible()
  await page.getByRole('button', { name: 'Tipo de pago' }).click()
  await page.getByRole('dialog', { name: 'Tipo de pago' }).getByRole('option', { name: 'Yape' }).click()
  await page.getByRole('button', { name: 'Cobrar S/ 6.00' }).click()
  await page.getByRole('dialog', { name: 'Cobrar Llevar 7' }).getByRole('button', { name: 'Cobrar S/ 6.00' }).click()
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible()
  await expect(page.getByText('PAGADO').first()).toBeVisible()
})
