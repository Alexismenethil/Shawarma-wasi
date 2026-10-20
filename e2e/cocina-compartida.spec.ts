import { expect, test } from '@playwright/test'
import { CLAVE_ADMIN, PIN, PIN_SAN_CRISTOBAL, entrar } from './ayuda'

/**
 * Plaza More y Plaza San Cristóbal comparten (por ahora) la cocina de Plaza
 * More para la carta y los shawarmas; los emolientes, cada local en la suya.
 * Así queda la base desde la semilla, como en el primer deploy.
 */
test('cocina compartida: San Cristóbal anota, Plaza More cocina viendo el local y el mozo sabe dónde recoger; el dueño la deshace y la vuelve a poner', async ({
  browser,
}) => {
  // ── La cocina de Plaza More, en la hoja de shawarmas ──
  const cocina = await (await browser.newContext()).newPage()
  await entrar(cocina, 'Cocina', PIN.COCINA)
  await cocina.goto('/cocina?e=SHAWARMAS')
  const leyenda = cocina.getByText('Cocina compartida:')
  await expect(leyenda).toBeVisible()

  // ── El mozo de San Cristóbal anota un shawarma y un emoliente ──
  const mozo = await (await browser.newContext()).newPage()
  await entrar(mozo, 'Mozo', PIN_SAN_CRISTOBAL.MOZO, 'Plaza San Cristóbal')
  await expect(mozo.getByText('Plaza San Cristóbal').first()).toBeVisible()
  await mozo.locator('main').getByTitle('Mesa 9 · Libre').click()
  await mozo.getByRole('button', { name: 'Producto' }).last().click()
  await mozo.getByRole('option', { name: /^Shawarmas/ }).click()
  await mozo.getByRole('option', { name: /^Clásica/ }).click()
  await mozo.getByRole('button', { name: 'Producto' }).last().click()
  await mozo.getByRole('option', { name: /^Emolientes/ }).click()
  await mozo.getByRole('option', { name: /^Clásico/ }).click()
  await mozo.getByLabel('Cliente').fill('Rocío')
  await mozo.getByRole('button', { name: 'Guardar' }).click()
  // Al mozo se le dice que el shawarma va a la cocina de Plaza More.
  await expect(mozo.getByText(/Guardado\. Enviado a .*Cocina 2 \(Plaza More\)/)).toBeVisible()

  // ── Plaza More lo ve al instante, en la columna «Local» ──
  const comanda = cocina.getByRole('button', { name: 'Estado · 1 Shawarma Clásica' }).filter({ hasText: 'Pendiente' })
  await expect(comanda).toBeVisible({ timeout: 10_000 })
  await expect(cocina.getByText('Local:', { exact: true })).toBeVisible()
  await expect(cocina.getByText('Rocío').filter({ visible: true })).toBeVisible()
  await expect(cocina.locator('main').getByText('Plaza San Cristóbal', { exact: true }).filter({ visible: true }).last()).toBeVisible()
  // El emoliente de San Cristóbal no sale en la cocina 3 de Plaza More: es de su propio local.
  await cocina.goto('/cocina?e=BEBIDAS')
  await expect(cocina.getByText('Rocío')).toHaveCount(0)
  await cocina.goto('/cocina?e=SHAWARMAS')

  // ── Atendido: al mozo de San Cristóbal le llega dónde recogerlo ──
  await comanda.click()
  await cocina.getByRole('option', { name: 'Atendido', exact: true }).click()
  await expect(mozo.getByText('M9: cocina atendió el pedido · recógelo en Plaza More')).toBeVisible({ timeout: 10_000 })

  // ── El dueño la deshace con un clic, y la cocina de Plaza More deja de ver San Cristóbal ──
  const admin = await (await browser.newContext()).newPage()
  await entrar(admin, 'Administración', CLAVE_ADMIN)
  await admin.getByRole('link', { name: 'Sucursales' }).click()
  await expect(admin.getByText('Cocina compartida (temporal):')).toBeVisible()
  await admin.getByRole('button', { name: 'Cambiar' }).click()
  const dialogo = admin.getByRole('dialog', { name: 'Cocina de Plaza San Cristóbal' })
  await dialogo.getByRole('radio', { name: /Cocina propia/ }).click()
  await dialogo.getByRole('button', { name: 'Guardar' }).click()
  await expect(admin.getByText('Plaza San Cristóbal vuelve a su cocina propia')).toBeVisible()
  await expect(leyenda).toHaveCount(0, { timeout: 10_000 })
  await expect(cocina.getByText('Rocío')).toHaveCount(0)

  // ── Y la vuelve a poner como estaba: carta y shawarmas en Plaza More ──
  await admin.getByRole('button', { name: 'Cocina de Plaza San Cristóbal: propia' }).click()
  await dialogo.getByRole('radio', { name: /Compartida/ }).click()
  await expect(dialogo.getByRole('checkbox', { name: /Cocina 1/ })).toHaveAttribute('aria-checked', 'true')
  await expect(dialogo.getByRole('checkbox', { name: /Cocina 2/ })).toHaveAttribute('aria-checked', 'true')
  await expect(dialogo.getByRole('checkbox', { name: /Cocina 3/ })).toHaveAttribute('aria-checked', 'false')
  await dialogo.getByRole('button', { name: 'Guardar' }).click()
  await expect(admin.getByText('Plaza San Cristóbal: Carta y Shawarmas se preparan en Plaza More')).toBeVisible()
  await expect(leyenda).toBeVisible({ timeout: 10_000 })
  await expect(cocina.getByText('Rocío').filter({ visible: true })).toBeVisible()
})
