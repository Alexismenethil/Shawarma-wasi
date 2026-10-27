import { expect, type Page } from '@playwright/test'
import type { EstadoCaja, MesaResumen, Pedido } from '@wasi/shared'
import { PIN, abrirCajaSiHaceFalta, apiDesde, entrar } from './ayuda'

export async function probarPagosCompartidos(page: Page, nombre: string) {
  await page.addInitScript(() => {
    window.print = () => {}
  })
  await entrar(page, 'Caja', PIN.CAJA)
  await abrirCajaSiHaceFalta(page)
  const antes = (await apiDesde<EstadoCaja>(page, '/caja')).abierta!
  const libre = (await apiDesde<MesaResumen[]>(page, '/mesas')).find((m) => m.estado === 'LIBRE')!
  const p = await apiDesde<Pedido>(page, `/mesas/${libre.id}/enviar`, {
    cliente: `Compartidos ${nombre}`,
    lineas: [1500, 2600, 900].map((precio, i) => ({
      productoId: null,
      libre: { nombre: `Plato ${i + 1}`, precio, estacion: 'CARTA' },
      cantidad: 1,
      adicionales: [],
      detalle: null,
      paraLlevar: false,
      observacion: null,
    })),
  })
  await page.goto(`/caja?nota=${p.id}`)
  const pago1 = page.getByRole('group', { name: 'Pago 1', exact: true })
  await pago1.getByRole('button', { name: 'Tipo de pago' }).click()
  await page.getByRole('option', { name: 'Efectivo', exact: true }).click()
  // Con un solo pago se cobra el total: «A cobrar» aparece al dividir la cuenta.
  await expect(pago1.getByLabel('Monto a cobrar')).toBeHidden()
  await page.getByRole('button', { name: 'Otro pago', exact: true }).click()
  await pago1.getByLabel('Monto a cobrar').fill('15')
  await pago1.getByLabel('Monto recibido').fill('200')
  await expect(pago1.getByText('Vuelto de este pago: S/ 185.00')).toBeVisible()
  await page.getByRole('button', { name: 'Cobrar S/ 50.00', exact: true }).click()
  await expect(page.getByText('Falta cubrir S/ 35.00.', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: /^Cobrar / })).toHaveCount(0)

  const pago2 = page.getByRole('group', { name: 'Pago 2', exact: true })
  await pago2.getByRole('button', { name: 'Tipo de pago' }).click()
  await page.getByRole('option', { name: 'Efectivo', exact: true }).click()
  await pago2.getByLabel('Monto a cobrar').fill('26')
  await pago2.getByLabel('Monto recibido').fill('20')
  await expect(pago2.getByText('Faltan S/ 6.00 en este pago')).toBeVisible()
  await pago2.getByLabel('Monto recibido').fill('30')
  await expect(pago2.getByText('Vuelto de este pago: S/ 4.00')).toBeVisible()

  await page.getByRole('button', { name: 'Otro pago', exact: true }).click()
  const pago3 = page.getByRole('group', { name: 'Pago 3', exact: true })
  await pago3.getByRole('button', { name: 'Tipo de pago' }).click()
  await page.getByRole('option', { name: 'Yape', exact: true }).click()
  await expect(pago3.getByLabel('Monto a cobrar')).toHaveValue('9.00')
  await expect(pago3.getByLabel('Monto recibido')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Tipo de pago', exact: true })).toHaveCount(0)
  await expect(page.getByText('Falta cubrir S/ 35.00.', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Pago completo', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `e2e/resultados/pagos-compartidos-${nombre}.png`, fullPage: true })

  // El servidor confirma, pero se pierde su respuesta. La tablet repite el mismo cobro.
  let perdida = false
  await page.route(`**/api/pedidos/${p.id}/cobrar`, async (ruta) => {
    const respuesta = await ruta.fetch()
    if (!perdida) {
      perdida = true
      await ruta.abort('failed')
    } else await ruta.fulfill({ response: respuesta })
  })
  await page.getByRole('button', { name: 'Cobrar S/ 50.00', exact: true }).click()
  const dialogo = page.getByRole('dialog', { name: /^Cobrar / })
  await expect(dialogo.getByText('Recibido S/ 200.00 · Vuelto S/ 185.00')).toBeVisible()
  await expect(dialogo.getByText('Recibido S/ 30.00 · Vuelto S/ 4.00')).toBeVisible()
  await dialogo.getByRole('button', { name: 'Cobrar S/ 50.00', exact: true }).click()
  await expect(page.getByText('Cobrado · vuelto S/ 189.00', { exact: true })).toBeVisible()
  const guardado = await apiDesde<Pedido>(page, `/pedidos/${p.id}`)
  expect(guardado.pagos.map((g) => [g.metodo, g.monto, g.recibido])).toEqual([
    ['EFECTIVO', 1500, 20000],
    ['EFECTIVO', 2600, 3000],
    ['YAPE', 900, null],
  ])
  const despues = (await apiDesde<EstadoCaja>(page, '/caja')).abierta!
  expect(despues.ventas - antes.ventas).toBe(5000)
  expect(despues.esperado - antes.esperado).toBe(4100)
  expect(despues.notas - antes.notas).toBe(1)
  const ticket = page.locator('body > div.print\\:block')
  await expect(ticket).toContainText('Pago 1 · Efectivo15.00Recibido200.00Vuelto185.00')
  await expect(ticket).toContainText('Pago 2 · Efectivo26.00Recibido30.00Vuelto4.00')

  // Al corregir, los importes y billetes de cada persona deben conservarse.
  await page.goto('/caja?hoja=cobrados')
  const cobro = page.getByRole('listitem').filter({ hasText: `Compartidos ${nombre}` })
  await cobro.getByRole('button').click()
  await page.getByRole('menuitem', { name: 'Corregir tipo de pago' }).click()
  const correccion = page.getByRole('dialog', { name: /^Corregir pago/ })
  await expect(correccion.getByRole('group', { name: 'Pago 1', exact: true }).getByLabel('Monto a cobrar')).toHaveValue('15.00')
  await expect(correccion.getByRole('group', { name: 'Pago 1', exact: true }).getByLabel('Monto recibido')).toHaveValue('200.00')
  await expect(correccion.getByRole('group', { name: 'Pago 2', exact: true }).getByLabel('Monto recibido')).toHaveValue('30.00')
  await correccion.getByRole('group', { name: 'Pago 3', exact: true }).getByRole('button', { name: 'Tipo de pago' }).click()
  await page.getByRole('option', { name: 'Plin', exact: true }).click()
  await correccion.getByRole('button', { name: 'Guardar corrección' }).click()
  await expect(correccion).toHaveCount(0)
  const corregido = await apiDesde<Pedido>(page, `/pedidos/${p.id}`)
  expect(corregido.pagos.map((g) => [g.metodo, g.monto, g.recibido])).toEqual([
    ['EFECTIVO', 1500, 20000],
    ['EFECTIVO', 2600, 3000],
    ['PLIN', 900, null],
  ])
  expect((await apiDesde<EstadoCaja>(page, '/caja')).abierta!.esperado).toBe(despues.esperado)
}
