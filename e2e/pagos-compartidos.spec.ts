import { test } from '@playwright/test'
import { probarPagosCompartidos } from './pagos-compartidos-ayuda'

test('pagos compartidos: vueltos independientes, ticket, corrección y respuesta perdida', async ({ page }) => {
  await probarPagosCompartidos(page, 'escritorio')
})
