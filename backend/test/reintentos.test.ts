import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Carta, EstadoCaja, Pedido } from '@wasi/shared'
import { type Cliente, cajaAbierta, conApi, enCarta, ingresar, linea, mesa } from './ayuda.js'

const api = conApi()

/**
 * Se corta el wifi justo después de «Guardar»: la tablet no sabe si llegó y lo
 * vuelve a mandar con la misma clave. El servidor no lo repite: la cocina
 * recibe el pedido una vez y la caja anota el egreso una vez.
 */
describe('reintentos sin duplicar', () => {
  let mozo: Cliente, caja: Cliente
  let c: ReturnType<typeof enCarta>
  const notas: number[] = []
  const con = (clave: string) => ({ 'idempotency-key': clave })

  before(async () => {
    mozo = await ingresar(api.url, 'MOZO')
    caja = await ingresar(api.url, 'CAJA')
    c = enCarta((await mozo.get<Carta>('/carta')).datos)
  })

  after(async () => {
    for (const id of notas) await mozo.post(`/pedidos/${id}/anular`)
  })

  it('el mismo envío dos veces llega una sola vez a cocina, y devuelve lo mismo', async () => {
    const m = await mesa(mozo, 'M11')
    const cuerpo = { lineas: [linea(c.producto('Shawarma', 'Clásica').id)] }
    const primera = await mozo.pedir<Pedido>('POST', `/api/mesas/${m}/enviar`, cuerpo, con('envio-prueba-0001'))
    assert.equal(primera.estado, 200, primera.texto)
    notas.push(primera.datos.id)
    const segunda = await mozo.pedir<Pedido>('POST', `/api/mesas/${m}/enviar`, cuerpo, con('envio-prueba-0001'))
    assert.equal(segunda.estado, 200)
    assert.deepEqual(segunda.datos, primera.datos)
    assert.equal((await mozo.get<Pedido>(`/pedidos/${primera.datos.id}`)).datos.items.length, 1)

    // Con otra clave es otro envío (el mozo de verdad pidió otro).
    await mozo.pedir('POST', `/api/mesas/${m}/enviar`, cuerpo, con('envio-prueba-0002'))
    assert.equal((await mozo.get<Pedido>(`/pedidos/${primera.datos.id}`)).datos.items.length, 2)
  })

  it('si los dos llegan a la vez, el segundo espera al primero y recibe lo mismo', async () => {
    const m = await mesa(mozo, 'M12')
    const cuerpo = { lineas: [linea(c.producto('Emoliente', 'Clásico').id, { cantidad: 2 })] }
    const [a, b] = await Promise.all([
      mozo.pedir<Pedido>('POST', `/api/mesas/${m}/enviar`, cuerpo, con('envio-a-la-vez-01')),
      mozo.pedir<Pedido>('POST', `/api/mesas/${m}/enviar`, cuerpo, con('envio-a-la-vez-01')),
    ])
    assert.equal(a.estado, 200, a.texto)
    assert.equal(b.estado, 200, b.texto)
    assert.equal(a.datos.id, b.datos.id)
    notas.push(a.datos.id)
    const nota = (await mozo.get<Pedido>(`/pedidos/${a.datos.id}`)).datos
    assert.deepEqual(
      nota.items.map((i) => i.cantidad),
      [2],
    )
  })

  it('un egreso no se anota dos veces; si el primero falló, el reintento se vuelve a procesar', async () => {
    const antes = await cajaAbierta(caja, 5000)
    const movimientos = async () => (await caja.get<EstadoCaja>('/caja')).datos.abierta!.movimientos.length
    const n = antes.abierta!.movimientos.length

    // Un egreso mayor al efectivo no se puede: falla, y la clave queda libre para reintentar.
    const grande = { tipo: 'EGRESO', monto: 9_000_000, concepto: 'Prueba que no alcanza' }
    const fallo = await caja.pedir('POST', '/api/caja/movimientos', grande, con('mov-prueba-0001'))
    assert.ok(fallo.estado >= 400, fallo.texto)
    assert.equal((await caja.pedir('POST', '/api/caja/movimientos', grande, con('mov-prueba-0001'))).estado, fallo.estado)

    const pan = { tipo: 'EGRESO', monto: 150, concepto: 'Pan (reintento)' }
    assert.equal((await caja.pedir('POST', '/api/caja/movimientos', pan, con('mov-prueba-0002'))).estado, 200)
    assert.equal((await caja.pedir('POST', '/api/caja/movimientos', pan, con('mov-prueba-0002'))).estado, 200)
    assert.equal(await movimientos(), n + 1)
  })

  it('la clave es de cada persona y de una sola acción', async () => {
    const m = await mesa(mozo, 'M12')
    const cuerpo = { lineas: [linea(c.producto('Shawarma', 'Clásica').id)] }
    // Otra persona con la misma clave: es otro envío.
    const otra = await caja.pedir<Pedido>('POST', `/api/mesas/${m}/enviar`, cuerpo, con('envio-a-la-vez-01'))
    assert.equal(otra.estado, 200, otra.texto)
    assert.equal(otra.datos.items.length, 2)
    // La misma persona y clave para otra acción: no se confunde con la primera.
    const confusa = await mozo.pedir('POST', `/api/pedidos/${otra.datos.id}/cuenta`, {}, con('envio-a-la-vez-01'))
    assert.equal(confusa.estado, 422)
  })
})
