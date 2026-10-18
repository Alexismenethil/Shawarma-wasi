import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Carta, ComandaCocina, MesaResumen, Pedido } from '@wasi/shared'
import { type Cliente, conApi, enCarta, ingresar, linea, mesa } from './ayuda.js'

const api = conApi()

describe('cocina («Atención al Cliente»)', () => {
  let mozo: Cliente, cocina: Cliente
  let c: ReturnType<typeof enCarta>
  let pedido: Pedido

  const hoja = async (consulta = '') => (await cocina.get<ComandaCocina[]>(`/cocina${consulta}`)).datos.filter((x) => x.pedidoId === pedido.id)

  before(async () => {
    mozo = await ingresar(api.url, 'MOZO')
    cocina = await ingresar(api.url, 'COCINA')
    c = enCarta((await mozo.get<Carta>('/carta')).datos)
    const r = await mozo.post<Pedido>(`/mesas/${await mesa(mozo, 'M10')}/enviar`, {
      cliente: 'Kevin',
      lineas: [linea(c.producto('Shawarma', 'Clásica').id, { cantidad: 2 }), linea(c.producto('Emoliente', 'Clásico').id), linea(c.producto('Caldo', 'Gallina').id)],
    })
    assert.equal(r.estado, 200, r.texto)
    pedido = r.datos
  })

  it('cada cocina ve solo lo suyo, con el Nro del día, la mesa y el cliente', async () => {
    const shawarmas = await hoja('?estacion=SHAWARMAS')
    assert.equal(shawarmas.length, 1)
    assert.equal(shawarmas[0].numero, pedido.numero)
    assert.equal(shawarmas[0].cliente, 'Kevin')
    assert.deepEqual(shawarmas[0].mesa, { numero: 10, tipo: 'SALON' })
    assert.ok(shawarmas[0].items.every((i) => i.estacion === 'SHAWARMAS'))
    const todas = await hoja()
    assert.equal(todas.length, 3)
    assert.equal((await cocina.get('/cocina?estacion=PIZZERIA')).estado, 400)
  })

  it('marcar una comanda entera como atendida avisa al salón', async () => {
    const [comanda] = await hoja('?estacion=SHAWARMAS')
    const r = await cocina.post('/cocina/comandas', { pedidoId: pedido.id, ronda: comanda.ronda, estacion: 'SHAWARMAS', listo: true })
    assert.equal(r.estado, 200)
    const [despues] = await hoja('?estacion=SHAWARMAS')
    assert.ok(despues.items.every((i) => i.estado === 'LISTO' && i.listoEn))
    const m = (await mozo.get<MesaResumen[]>('/mesas')).datos.find((x) => x.id === pedido.mesa.id)!
    assert.equal(m.estado, 'LISTO')
    assert.equal(m.pedido?.listos, 1)
  })

  it('lo agregado después llega como otra comanda (ronda 2)', async () => {
    await mozo.post(`/mesas/${pedido.mesa.id}/enviar`, { lineas: [linea(c.producto('Shawarma', 'Huamanguina').id)] })
    const shawarmas = await hoja('?estacion=SHAWARMAS')
    assert.deepEqual(
      shawarmas.map((x) => x.ronda),
      [1, 2],
    )
  })

  it('«Limpiar» saca de la hoja lo resuelto antes de esa hora; lo pendiente se queda', async () => {
    const limpiado = new Date().toISOString()
    const shawarmas = await hoja(`?estacion=SHAWARMAS&desde=${encodeURIComponent(limpiado)}`)
    assert.deepEqual(
      shawarmas.map((x) => x.ronda),
      [2],
    )
  })

  it('se puede devolver un plato a pendiente, pero no uno ya servido ni uno anulado', async () => {
    const [ronda1] = await hoja('?estacion=SHAWARMAS')
    const item = ronda1.items[0]
    assert.equal((await cocina.post(`/cocina/items/${item.id}`, { listo: false })).estado, 200)
    const [otra] = await hoja('?estacion=SHAWARMAS')
    assert.equal(otra.items[0].estado, 'PENDIENTE')

    await cocina.post(`/cocina/items/${item.id}`, { listo: true })
    await mozo.post(`/pedidos/${pedido.id}/servir`, { itemIds: [item.id] })
    const servido = await cocina.post(`/cocina/items/${item.id}`, { listo: false })
    assert.equal(servido.estado, 400)

    const [bebidas] = await hoja('?estacion=BEBIDAS')
    await mozo.post(`/items/${bebidas.items[0].id}/anular`)
    assert.equal((await cocina.post(`/cocina/items/${bebidas.items[0].id}`, { listo: true })).estado, 404)
    // Lo anulado se sigue viendo en la hoja (en ámbar), hasta «Limpiar».
    const [conAnulado] = await hoja('?estacion=BEBIDAS')
    assert.equal(conAnulado.items[0].estado, 'ANULADO')
  })
})
