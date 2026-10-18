import { expect, test } from '@playwright/test'
import { PIN, apiDesde, entrar } from './ayuda'

test('servicio completo: el mozo anota con desplegables, cocina atiende, se sirve y se cobra con vuelto', async ({ browser }) => {
  // ── Mozo ──
  const mozo = await (await browser.newContext()).newPage()
  await entrar(mozo, 'Mozo', PIN.MOZO)
  await mozo.locator('main').getByTitle('Mesa 8 · Libre').click()
  await expect(mozo.getByText('Mesa: 8')).toBeVisible()

  await mozo.getByRole('button', { name: 'Producto' }).last().click()
  await mozo.getByRole('option', { name: /^Shawarmas/ }).click()
  await mozo.getByRole('option', { name: /^Clásica/ }).click()
  await mozo.getByRole('button', { name: 'Adicional' }).first().click()
  await mozo.getByRole('option', { name: /^Huevo/ }).click()
  await mozo.getByRole('button', { name: 'Listo' }).click()
  await mozo.getByRole('button', { name: 'Detalle' }).first().click()
  await mozo.getByRole('option', { name: 'M: Corte 2 =' }).click()
  await mozo.getByLabel('Observación').fill('Sin cebolla')
  await mozo.getByLabel('Cliente').fill('Maribel')

  await mozo.getByRole('button', { name: 'Guardar' }).click()
  await expect(mozo.getByText(/Guardado\. Enviado a Cocina 2/)).toBeVisible()
  await expect(mozo.getByText('Pendiente').first()).toBeVisible()
  await expect(mozo.getByText('Sin guardar')).toHaveCount(0)

  // ── Cocina ──
  const cocina = await (await browser.newContext()).newPage()
  await entrar(cocina, 'Cocina', PIN.COCINA)
  await cocina.goto('/cocina?e=SHAWARMAS')
  // La hoja también muestra lo ya atendido (hasta «Limpiar»): se toma la fila pendiente.
  const fila = cocina.getByRole('button', { name: 'Estado · 1 Shawarma Clásica' }).filter({ hasText: 'Pendiente' })
  await expect(fila).toBeVisible()
  // (cada fila tiene su versión de celular, oculta en pantalla grande)
  await expect(cocina.getByText('Maribel').filter({ visible: true }).first()).toBeVisible()
  await expect(cocina.getByText('Sin cebolla').filter({ visible: true }).first()).toBeVisible()
  await fila.click()
  await cocina.getByRole('option', { name: 'Atendido', exact: true }).click()

  // ── El mozo se entera solo (tiempo real) y sirve ──
  await expect(mozo.getByText(/Cocina atendió 1 plato/)).toBeVisible({ timeout: 10_000 })
  await mozo.getByRole('button', { name: 'Marcar servido' }).click()
  await expect(mozo.getByText('Por cobrar').first()).toBeVisible()

  // ── Cobro: «Tipo y Monto de Pago», vuelto y confirmación ──
  await mozo.getByRole('button', { name: 'Tipo de pago' }).click()
  await mozo.getByRole('option', { name: 'Efectivo' }).click()
  await mozo.getByLabel('Monto recibido').fill('50')
  await expect(mozo.getByText('Vuelto', { exact: true })).toBeVisible()
  await mozo.getByRole('button', { name: 'Guardar' }).click()
  const dialogo = mozo.getByRole('dialog', { name: 'Guardar y cobrar' })
  await expect(dialogo.getByText(/Vuelto: S\/ 32\.00/)).toBeVisible()
  await dialogo.getByRole('button', { name: 'Guardar y cobrar' }).click()
  await expect(mozo.getByText('Cobro registrado')).toBeVisible()

  // Pagada y servida: la nota se cierra y la mesa queda libre.
  const mesas = await apiDesde<{ numero: number; tipo: string; estado: string }[]>(mozo, '/mesas')
  expect(mesas.find((m) => m.tipo === 'SALON' && m.numero === 8)?.estado).toBe('LIBRE')

  // ── Administración ve la venta en el Reporte diario ──
  const admin = await (await browser.newContext()).newPage()
  await entrar(admin, 'Administración', PIN.ADMIN)
  await admin.getByRole('link', { name: 'Reporte diario' }).click()
  await expect(admin.getByRole('cell', { name: 'Shawarma Clásica' }).first()).toBeVisible()
  await expect(admin.getByRole('cell', { name: '18.00' }).first()).toBeVisible()
})
