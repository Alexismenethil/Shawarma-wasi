import { expect, test } from '@playwright/test'
import { PIN, entrar } from './ayuda'

test.describe('entrada', () => {
  test('al cerrar sesión vuelve a la entrada general, con todas las áreas disponibles', async ({ page }) => {
    await entrar(page, 'Cocina', PIN.COCINA)
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await page.getByRole('dialog', { name: 'Cerrar sesión' }).getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/$/)
    for (const area of ['Mozo', 'Cocina', 'Administración']) {
      await expect(page.getByRole('radio', { name: area })).toBeEnabled()
    }
    // Recuerda la última área: la tablet de cocina vuelve a abrir en Cocina.
    await expect(page.getByRole('radio', { name: 'Cocina' })).toHaveAttribute('aria-checked', 'true')
    // Y se puede entrar a otra.
    await entrar(page, 'Mozo', PIN.MOZO)
    await expect(page.getByText('Mesas del local')).toBeVisible()
  })

  test('entrar directo a /admin sin sesión pide el PIN con Administración elegida, sin bloquear las otras', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('radio', { name: 'Administración' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: 'Mozo' })).toBeEnabled()
    await entrar(page, 'Mozo', PIN.MOZO)
    await expect(page).toHaveURL(/\/mozo$/)
  })

  test('un PIN equivocado avisa y no entra', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Mozo' }).click()
    for (const d of '0000') await page.getByRole('button', { name: d, exact: true }).click()
    await expect(page.getByText('PIN incorrecto.')).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  test('las rutas de la app cargan directo (el servidor devuelve la web) y una desconocida vuelve a la entrada', async ({ page }) => {
    await page.goto('/cocina?e=BEBIDAS')
    await expect(page.getByRole('radio', { name: 'Cocina' })).toHaveAttribute('aria-checked', 'true')
    await page.goto('/no-existe')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  })
})
