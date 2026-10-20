import { expect, test } from '@playwright/test'
import { CLAVE_ADMIN, PIN, abrirCajaSiHaceFalta, apiDesde, entrar } from './ayuda'

test('servicio completo: el mozo anota y pide la cuenta, cocina atiende y caja cobra con vuelto', async ({ browser }) => {
  // ── Caja abre su turno ──
  const caja = await (await browser.newContext()).newPage()
  // La impresora: se cuenta cada vez que la página manda a imprimir.
  await caja.addInitScript(() => {
    const w = window as unknown as { impresiones: number }
    w.impresiones = 0
    window.print = () => void w.impresiones++
  })
  await entrar(caja, 'Caja', PIN.CAJA)
  await abrirCajaSiHaceFalta(caja)

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

  // El mozo no ve el tipo de pago: eso es de caja.
  await expect(mozo.getByRole('button', { name: 'Tipo de pago' })).toHaveCount(0)
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

  // ── El mozo se entera solo (tiempo real), sirve y pide la cuenta ──
  await expect(mozo.getByText(/Cocina atendió 1 plato/)).toBeVisible({ timeout: 10_000 })
  await mozo.getByRole('button', { name: 'Marcar servido' }).click()
  await expect(mozo.getByText('Se cobra en caja')).toBeVisible()
  await mozo.getByRole('button', { name: 'Pedir la cuenta' }).click()
  await expect(mozo.getByText(/Cuenta pedida a caja a las/)).toBeVisible()

  // ── Caja: la mesa aparece primero, avisando; se cobra con vuelto ──
  await expect(caja.getByText('M8 pide la cuenta')).toBeVisible({ timeout: 10_000 })
  const nota = caja.getByRole('listitem').filter({ has: caja.getByText('M8', { exact: true }) })
  await expect(nota.getByText('Pide la cuenta').filter({ visible: true })).toBeVisible()
  await nota.getByRole('button').click()
  await expect(caja.getByText('Mesa 8', { exact: true })).toBeVisible()
  await caja.getByRole('button', { name: 'Tipo de pago' }).click()
  await caja.getByRole('option', { name: 'Efectivo' }).click()
  await caja.getByLabel('Monto recibido').fill('50')
  await expect(caja.getByText('Vuelto', { exact: true })).toBeVisible()
  await caja.getByRole('button', { name: 'Cobrar S/ 18.00' }).click()
  const dialogo = caja.getByRole('dialog', { name: 'Cobrar Mesa 8' })
  await expect(dialogo.getByText(/Vuelto: S\/ 32\.00/)).toBeVisible()
  await dialogo.getByRole('button', { name: 'Cobrar S/ 18.00' }).click()
  await expect(caja.getByText('Cobrado · vuelto S/ 32.00')).toBeVisible()
  await expect(caja.getByText('PAGADO').first()).toBeVisible()
  // El comprobante sale solo al cobrar (la casilla «Imprimir al cobrar» viene marcada)…
  await expect(caja.getByRole('checkbox', { name: 'Imprimir al cobrar' })).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => caja.evaluate(() => (window as unknown as { impresiones: number }).impresiones)).toBe(1)
  // …y lleva el pago con su vuelto.
  const comprobante = caja.locator('body > div.print\\:block')
  await expect(comprobante).toContainText('Vuelto')
  await expect(comprobante).toContainText('32.00')
  await expect(comprobante).toContainText('PAGADO')

  // Pagada y servida: la nota se cierra, la mesa queda libre y el mozo lo ve.
  const mesas = await apiDesde<{ numero: number; tipo: string; estado: string }[]>(mozo, '/mesas')
  expect(mesas.find((m) => m.tipo === 'SALON' && m.numero === 8)?.estado).toBe('LIBRE')
  const arqueo = await apiDesde<{ abierta: { notas: number } }>(caja, '/caja')
  expect(arqueo.abierta.notas).toBeGreaterThan(0)

  // ── Administración ve la venta en el Reporte diario ──
  const admin = await (await browser.newContext()).newPage()
  await entrar(admin, 'Administración', CLAVE_ADMIN)
  await admin.getByRole('link', { name: 'Reporte diario' }).click()
  await expect(admin.getByRole('cell', { name: 'Shawarma Clásica' }).first()).toBeVisible()
  await expect(admin.getByRole('cell', { name: '18.00' }).first()).toBeVisible()
})
