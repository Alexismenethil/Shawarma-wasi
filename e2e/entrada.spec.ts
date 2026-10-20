import { expect, test } from '@playwright/test'
import { PIN, elegirSucursal, entrar } from './ayuda'

test.describe('entrada', () => {
  test('al cerrar sesión vuelve a la entrada general, con todas las áreas disponibles', async ({ page }) => {
    await entrar(page, 'Cocina', PIN.COCINA)
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await page.getByRole('dialog', { name: 'Cerrar sesión' }).getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/$/)
    for (const area of ['Mozo', 'Cocina', 'Caja', 'Administración']) {
      await expect(page.getByRole('radio', { name: area })).toBeEnabled()
    }
    // Recuerda la última área: la tablet de cocina vuelve a abrir en Cocina.
    await expect(page.getByRole('radio', { name: 'Cocina' })).toHaveAttribute('aria-checked', 'true')
    // Y se puede entrar a otra.
    await entrar(page, 'Mozo', PIN.MOZO)
    await expect(page.getByText('Mesas del local')).toBeVisible()
  })

  test('entrar directo a /admin sin sesión pide usuario y contraseña, sin bloquear las otras áreas', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('radio', { name: 'Administración' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByLabel('Usuario')).toBeVisible()
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Mozo' })).toBeEnabled()
    await entrar(page, 'Mozo', PIN.MOZO)
    await expect(page).toHaveURL(/\/mozo$/)
  })

  test('un PIN o una contraseña equivocados avisan y no entran', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Mozo' }).click()
    await elegirSucursal(page, 'Plaza More')
    for (const d of '0000') await page.getByRole('button', { name: d, exact: true }).click()
    await expect(page.getByText('PIN incorrecto.')).toBeVisible()
    await page.getByRole('radio', { name: 'Administración' }).click()
    await page.getByLabel('Usuario').fill('admin')
    await page.getByLabel('Contraseña', { exact: true }).fill('no-es-la-clave')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  test('con la sucursal equivocada en la tablet, el PIN de otro local no entra y avisa que revise la sucursal', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Mozo' }).click()
    await elegirSucursal(page, 'Plaza San Cristóbal')
    // El PIN del mozo de Plaza More: ningún PIN se repite entre sucursales, así que aquí no es de nadie.
    for (const d of PIN.MOZO) await page.getByRole('button', { name: d, exact: true }).click()
    await expect(page.getByText('PIN incorrecto. Revisa que la sucursal elegida sea la tuya.')).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    // Con su sucursal, entra.
    await entrar(page, 'Mozo', PIN.MOZO)
    await expect(page.getByText('Plaza More').first()).toBeVisible()
  })

  test('las rutas de la app cargan directo (el servidor devuelve la web) y una desconocida vuelve a la entrada', async ({ page }) => {
    await page.goto('/cocina?e=BEBIDAS')
    await expect(page.getByRole('radio', { name: 'Cocina' })).toHaveAttribute('aria-checked', 'true')
    await page.goto('/caja')
    await expect(page.getByRole('radio', { name: 'Caja' })).toHaveAttribute('aria-checked', 'true')
    await page.goto('/no-existe')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  })
})
