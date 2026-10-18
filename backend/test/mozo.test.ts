import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Carta, MesaResumen, Pedido } from '@wasi/shared'
import { type Cliente, conApi, enCarta, ingresar, linea, mesa } from './ayuda.js'

const api = conApi()

describe('nota de pedido', () => {
  let mozo: Cliente, cocina: Cliente, admin: Cliente
  let carta: Carta
  let c: ReturnType<typeof enCarta>

  const estadoDe = async (codigo: string) => {
    const id = await mesa(mozo, codigo)
    return (await mozo.get<MesaResumen[]>('/mesas')).datos.find((m) => m.id === id)!
  }
  const atenderTodo = async (p: Pedido) => {
    for (const i of p.items.filter((x) => x.estado === 'PENDIENTE')) {
      assert.equal((await cocina.post(`/cocina/items/${i.id}`, { listo: true })).estado, 200)
    }
  }

  before(async () => {
    mozo = await ingresar(api.url, 'MOZO')
    cocina = await ingresar(api.url, 'COCINA')
    admin = await ingresar(api.url, 'ADMIN')
    carta = (await mozo.get<Carta>('/carta')).datos
    c = enCarta(carta)
  })

  it('la carta trae familias, adicionales y los detalles de la hoja Detalle', () => {
    assert.ok(carta.familias.length >= 20)
    assert.ok(carta.familias.every((f) => f.productos.length > 0))
    assert.deepEqual(carta.detalles, ['Corte 2 =', 'Corte 2 ≠', 'Corte 3 =', 'Individual'])
    assert.ok(carta.adicionales.some((a) => a.nombre === 'Huevo'))
  })

  it('al guardar se abre la nota: número del día, ronda 1 y el subtotal del Excel', async () => {
    const sh = c.producto('Shawarma', 'Huamanguina')
    const emo = c.producto('Emoliente', 'Especial')
    const huevo = c.adicional('Huevo')
    const r = await mozo.post<Pedido>(`/mesas/${await mesa(mozo, 'M1')}/enviar`, {
      cliente: 'Rosa',
      lineas: [
        linea(sh.id, { cantidad: 2, adicionales: [huevo.id], detalle: 'Corte 2 =', observacion: '  Sin cebolla  ' }),
        linea(emo.id, { paraLlevar: true }),
      ],
    })
    assert.equal(r.estado, 200, r.texto)
    const p = r.datos
    assert.ok(p.numero >= 1)
    assert.equal(p.cliente, 'Rosa')
    // Subtotal = Cant × (Precio + PAdic)
    assert.equal(p.items[0].subtotal, 2 * (sh.precio + huevo.precio))
    assert.equal(p.total, 2 * (sh.precio + huevo.precio) + emo.precio)
    assert.equal(p.items[0].detalle, 'Corte 2 =')
    assert.equal(p.items[0].observacion, 'Sin cebolla')
    assert.equal(p.items[1].paraLlevar, true)
    assert.ok(p.items.every((i) => i.ronda === 1 && i.estado === 'PENDIENTE'))
    const m1 = await estadoDe('M1')
    assert.equal(m1.estado, 'EN_COCINA')
    assert.equal(m1.pedido?.numero, p.numero)
  })

  it('lo que se agrega después es otra ronda (la «A» del Excel)', async () => {
    const r = await mozo.post<Pedido>(`/mesas/${await mesa(mozo, 'M1')}/enviar`, { lineas: [linea(c.producto('Shawarma', 'Clásica').id)] })
    assert.equal(r.estado, 200, r.texto)
    assert.deepEqual([...new Set(r.datos.items.map((i) => i.ronda))], [1, 2])
  })

  it('rechaza detalles que no existen, productos agotados, adicionales inexistentes y notas vacías', async () => {
    const m2 = await mesa(mozo, 'M2')
    const sh = c.producto('Shawarma', 'Napolitana')
    const detalle = await mozo.post(`/mesas/${m2}/enviar`, { lineas: [linea(sh.id, { detalle: 'Corte 9 =' })] })
    assert.equal(detalle.estado, 400)
    assert.match(detalle.datos.error, /ya no existe/)

    assert.equal((await admin.patch(`/admin/productos/${sh.id}`, { disponible: false })).estado, 200)
    const agotado = await mozo.post(`/mesas/${m2}/enviar`, { lineas: [linea(sh.id)] })
    assert.equal(agotado.estado, 400)
    assert.match(agotado.datos.error, /agotado/)
    await admin.patch(`/admin/productos/${sh.id}`, { disponible: true })

    assert.equal((await mozo.post(`/mesas/${m2}/enviar`, { lineas: [linea(sh.id, { adicionales: [99999] })] })).estado, 400)
    assert.equal((await mozo.post(`/mesas/${m2}/enviar`, { lineas: [] })).estado, 400)
    assert.equal((await mozo.post(`/mesas/${m2}/enviar`, { lineas: [linea(sh.id, { cantidad: 0 })] })).estado, 400)
    assert.equal((await mozo.post(`/mesas/99999/enviar`, { lineas: [linea(sh.id)] })).estado, 404)
    // Nada de eso abrió una nota.
    assert.equal((await estadoDe('M2')).estado, 'LIBRE')
  })

  it('un producto libre («Otros») lleva su nombre, precio y cocina', async () => {
    const r = await mozo.post<Pedido>(`/mesas/${await mesa(mozo, 'M7')}/enviar`, {
      lineas: [{ ...linea(0), productoId: null, libre: { nombre: 'Tamal', precio: 500, estacion: 'CARTA' } }],
    })
    assert.equal(r.estado, 200, r.texto)
    assert.equal(r.datos.items[0].familia, 'Otros')
    assert.equal(r.datos.items[0].estacion, 'CARTA')
    assert.equal(r.datos.total, 500)
    // Se anula para dejar la mesa libre.
    assert.equal((await mozo.post(`/pedidos/${r.datos.id}/anular`)).estado, 200)
  })

  it('el cliente de una nota abierta se puede cambiar', async () => {
    const p = (await mozo.get<Pedido>(`/mesas/${await mesa(mozo, 'M1')}/pedido`)).datos
    const r = await mozo.patch<Pedido>(`/pedidos/${p.id}`, { cliente: 'Rosa M.' })
    assert.equal(r.datos.cliente, 'Rosa M.')
  })

  it('cocina atiende y la mesa pasa a «Atendido»; el mozo sirve y queda «Por cobrar»', async () => {
    const p = (await mozo.get<Pedido>(`/mesas/${await mesa(mozo, 'M1')}/pedido`)).datos
    await atenderTodo(p)
    assert.equal((await estadoDe('M1')).estado, 'LISTO')
    const servida = await mozo.post<Pedido>(`/pedidos/${p.id}/servir`)
    assert.ok(servida.datos.items.every((i) => i.estado === 'ENTREGADO'))
    assert.equal((await estadoDe('M1')).estado, 'POR_COBRAR')
  })

  it('cobra como la nota del Excel: «Debe», electrónico exacto y vuelto en efectivo', async () => {
    const p = (await mozo.get<Pedido>(`/mesas/${await mesa(mozo, 'M1')}/pedido`)).datos
    const pasado = await mozo.post(`/pedidos/${p.id}/cobrar`, { pagos: [{ metodo: 'YAPE', monto: p.total + 100 }] })
    assert.equal(pasado.estado, 400)
    assert.match(pasado.datos.error, /supera/)
    const corto = await mozo.post(`/pedidos/${p.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: p.total - 100 }] })
    assert.equal(corto.estado, 400)
    assert.match(corto.datos.error, /Debe S\/ 1\.00/)

    const r = await mozo.post<Pedido>(`/pedidos/${p.id}/cobrar`, {
      pagos: [
        { metodo: 'YAPE', monto: 1000 },
        { metodo: 'EFECTIVO', monto: p.total - 1000 + 500 },
      ],
    })
    assert.equal(r.estado, 200, r.texto)
    const yape = r.datos.pagos.find((g) => g.metodo === 'YAPE')!
    const efectivo = r.datos.pagos.find((g) => g.metodo === 'EFECTIVO')!
    assert.equal(yape.monto, 1000)
    assert.equal(efectivo.monto, p.total - 1000)
    assert.equal(efectivo.recibido! - efectivo.monto, 500) // el vuelto
    assert.equal(r.datos.estado, 'COBRADO')
    assert.equal((await estadoDe('M1')).estado, 'LIBRE')
    assert.equal((await mozo.post(`/pedidos/${p.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: 100 }] })).estado, 400)
  })

  it('para llevar: se paga antes y la nota sigue abierta hasta entregar todo', async () => {
    const l1 = await mesa(mozo, 'L1')
    const p = (await mozo.post<Pedido>(`/mesas/${l1}/enviar`, { cliente: 'Jhon', lineas: [linea(c.producto('Shawarma', 'Clásica').id, { paraLlevar: true })] })).datos
    const pagado = await mozo.post<Pedido>(`/pedidos/${p.id}/cobrar`, { pagos: [{ metodo: 'YAPE', monto: p.total }] })
    assert.equal(pagado.estado, 200, pagado.texto)
    assert.equal(pagado.datos.estado, 'ABIERTO')
    const enLista = await estadoDe('L1')
    assert.equal(enLista.estado, 'EN_COCINA')
    assert.equal(enLista.pedido?.pagado, true)
    const otra = await mozo.post(`/mesas/${l1}/enviar`, { lineas: [linea(c.producto('Shawarma', 'Clásica').id)] })
    assert.equal(otra.estado, 400)
    assert.match(otra.datos.error, /pagada/)
    await atenderTodo(p)
    await mozo.post(`/pedidos/${p.id}/servir`)
    assert.equal((await estadoDe('L1')).estado, 'LIBRE')
  })

  it('el mozo anula lo pendiente; lo que cocina ya terminó solo lo anula el administrador', async () => {
    const m2 = await mesa(mozo, 'M2')
    const p = (await mozo.post<Pedido>(`/mesas/${m2}/enviar`, { lineas: [linea(c.producto('Caldo', 'Gallina').id), linea(c.producto('Chifa', 'Arroz Chaufa').id)] })).datos
    const [a, b] = p.items
    const tras = await mozo.post<Pedido>(`/items/${a.id}/anular`)
    assert.equal(tras.estado, 200, tras.texto)
    assert.equal(tras.datos.total, b.subtotal)
    await cocina.post(`/cocina/items/${b.id}`, { listo: true })
    assert.equal((await mozo.post(`/items/${b.id}/anular`)).estado, 403)
    const final = await admin.post<Pedido>(`/items/${b.id}/anular`)
    assert.equal(final.estado, 200)
    assert.equal(final.datos.estado, 'ANULADO')
    assert.equal((await estadoDe('M2')).estado, 'LIBRE')
  })

  it('una nota se mueve a una mesa libre (no a una ocupada) y se puede anular', async () => {
    const [m3, m4, m5] = await Promise.all(['M3', 'M4', 'M5'].map((x) => mesa(mozo, x)))
    const p = (await mozo.post<Pedido>(`/mesas/${m3}/enviar`, { lineas: [linea(c.producto('Shawarma', 'Clásica').id)] })).datos
    assert.equal((await mozo.post(`/pedidos/${p.id}/mover`, { mesaId: m4 })).estado, 200)
    assert.equal((await estadoDe('M3')).estado, 'LIBRE')
    assert.equal((await estadoDe('M4')).estado, 'EN_COCINA')
    const otra = (await mozo.post<Pedido>(`/mesas/${m5}/enviar`, { lineas: [linea(c.producto('Shawarma', 'Clásica').id)] })).datos
    assert.equal((await mozo.post(`/pedidos/${p.id}/mover`, { mesaId: m5 })).estado, 400)
    assert.equal((await mozo.post(`/pedidos/${p.id}/anular`)).estado, 200)
    assert.equal((await mozo.post(`/pedidos/${p.id}/anular`)).estado, 400)
    assert.equal((await mozo.post(`/pedidos/${otra.id}/anular`)).estado, 200)
    assert.equal((await estadoDe('M4')).estado, 'LIBRE')
  })

  it('un medio de pago desactivado ya no sirve para cobrar', async () => {
    const medios = (await admin.get('/admin/medios')).datos as { id: number; clave: string }[]
    const plin = medios.find((m) => m.clave === 'PLIN')!
    await admin.patch(`/admin/medios/${plin.id}`, { activo: false })
    const p = (await mozo.post<Pedido>(`/mesas/${await mesa(mozo, 'M6')}/enviar`, { lineas: [linea(c.producto('Shawarma', 'Clásica').id)] })).datos
    const r = await mozo.post(`/pedidos/${p.id}/cobrar`, { pagos: [{ metodo: 'PLIN', monto: p.total }] })
    assert.equal(r.estado, 400)
    assert.match(r.datos.error, /ya no está disponible/)
    await admin.patch(`/admin/medios/${plin.id}`, { activo: true })
    assert.equal((await mozo.post(`/pedidos/${p.id}/cobrar`, { pagos: [{ metodo: 'PLIN', monto: p.total }] })).estado, 200)
  })
})
