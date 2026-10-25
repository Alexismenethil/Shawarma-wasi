import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { EstadoCaja, MedioPago, MesaResumen, PagoCobro, Pedido } from '@wasi/shared'
import { MAX_PAGOS_NOTA } from '@wasi/shared'
import { cuadrarPago, type FilaPago } from '../../frontend/src/lib/pagos.js'
import { type Cliente, cajaAbierta, conApi, ingresar } from './ayuda.js'

const api = conApi()

describe('pagos compartidos por persona', () => {
  let caja: Cliente
  let medios: MedioPago[]
  const estado = async () => (await caja.get<EstadoCaja>('/caja')).datos.abierta!
  const crear = async (total: number) => {
    const libre = (await caja.get<MesaResumen[]>('/mesas')).datos.find((m) => m.estado === 'LIBRE')!
    assert.ok(libre)
    const r = await caja.post<Pedido>(`/mesas/${libre.id}/enviar`, {
      lineas: [
        {
          productoId: null,
          libre: { nombre: 'Prueba pagos compartidos', precio: total, estacion: 'CARTA' },
          cantidad: 1,
          adicionales: [],
          detalle: null,
          paraLlevar: false,
          observacion: null,
        },
      ],
    })
    assert.equal(r.estado, 200, r.texto)
    await caja.post(`/pedidos/${r.datos.id}/servir`, { itemIds: r.datos.items.map((i) => i.id) })
    return r.datos
  }
  const guardar = (pedido: Pedido, pagos: object[]) => caja.post<Pedido>(`/pedidos/${pedido.id}/cobrar`, { pagos })
  before(async () => {
    caja = await ingresar(api.url, 'CAJA')
    await cajaAbierta(caja)
    medios = (await caja.get<{ medios: MedioPago[] }>('/ajustes')).datos.medios
  })

  it('S/15 con S/200 y S/26 con S/30 guardan vueltos S/185 y S/4, sin juntarlos', async () => {
    const p = await crear(5000)
    const antes = await estado()
    const pagos: PagoCobro[] = [
      { metodo: 'EFECTIVO', monto: 1500, recibido: 20000 },
      { metodo: 'EFECTIVO', monto: 2600, recibido: 3000 },
      { metodo: 'YAPE', monto: 900, recibido: 900 },
    ]
    const r = await guardar(p, pagos)
    assert.equal(r.estado, 200, r.texto)
    assert.deepEqual(
      r.datos.pagos.map((g) => [g.metodo, g.monto, g.recibido]),
      [
        ['EFECTIVO', 1500, 20000],
        ['EFECTIVO', 2600, 3000],
        ['YAPE', 900, null],
      ]
    )
    assert.deepEqual(
      r.datos.pagos.slice(0, 2).map((g) => g.recibido! - g.monto),
      [18500, 400]
    )
    const despues = await estado()
    assert.equal(despues.ventas - antes.ventas, 5000)
    assert.equal(despues.efectivo - antes.efectivo, 4100)
    assert.equal(despues.esperado - antes.esperado, 4100)
    assert.equal(despues.notas - antes.notas, 1)
    assert.equal(despues.medios.find((m) => m.metodo === 'EFECTIVO')!.vuelto - antes.medios.find((m) => m.metodo === 'EFECTIVO')!.vuelto, 18900)
    // Una corrección conserva los dos efectivos y solo cambia el tercer medio.
    const corregido = await caja.post<Pedido>(`/pedidos/${p.id}/corregir-pago`, {
      pagos: pagos.map((g) => (g.metodo === 'YAPE' ? { ...g, metodo: 'PLIN' } : g)),
    })
    assert.equal(corregido.estado, 200, corregido.texto)
    assert.deepEqual(
      corregido.datos.pagos.map((g) => [g.metodo, g.monto, g.recibido]),
      [
        ['EFECTIVO', 1500, 20000],
        ['EFECTIVO', 2600, 3000],
        ['PLIN', 900, null],
      ]
    )
    assert.equal((await estado()).esperado, despues.esperado)
  })

  it('una cuenta de S/85 se reparte en S/48, S/22 y S/15, con los cambios independientes', async () => {
    const p = await crear(8500)
    const r = await guardar(p, [
      { metodo: 'EFECTIVO', monto: 4800, recibido: 10000 },
      { metodo: 'YAPE', monto: 1500, recibido: 1500 },
      { metodo: 'EFECTIVO', monto: 2200, recibido: 3000 },
    ])
    assert.equal(r.estado, 200, r.texto)
    assert.equal(
      r.datos.pagos.reduce((s, g) => s + g.monto, 0),
      8500
    )
    assert.deepEqual(
      r.datos.pagos.filter((g) => g.recibido !== null).map((g) => g.recibido! - g.monto),
      [5200, 800]
    )
  })

  it('el sobrante de una persona nunca paga la parte faltante de otra; rechaza datos inválidos sin guardar pagos', async () => {
    const p = await crear(4100)
    for (const pagos of [
      [{ metodo: 'EFECTIVO', monto: 1500, recibido: 20000 }],
      [
        { metodo: 'EFECTIVO', monto: 1500, recibido: 20000 },
        { metodo: 'EFECTIVO', monto: 2700, recibido: 3000 },
      ],
      [
        { metodo: 'EFECTIVO', monto: 1500, recibido: 1400 },
        { metodo: 'EFECTIVO', monto: 2600, recibido: 3000 },
      ],
      [{ metodo: 'YAPE', monto: 4100, recibido: 5000 }],
      [{ metodo: 'YAPE', monto: 4100, recibido: 4000 }],
      [
        { metodo: 'EFECTIVO', monto: 0, recibido: 20000 },
        { metodo: 'YAPE', monto: 4100, recibido: 4100 },
      ],
      [
        { metodo: 'EFECTIVO', monto: 1500, recibido: 20000 },
        { metodo: 'YAPE', monto: 2600 },
      ],
      [{ metodo: 'NO_EXISTE', monto: 4100, recibido: 4100 }],
      [{ metodo: 'EFECTIVO', monto: 4100, recibido: -1 }],
      [{ metodo: 'EFECTIVO', monto: 4100, recibido: 4100.1 }],
    ]) {
      assert.equal((await guardar(p, pagos)).estado, 400, JSON.stringify(pagos))
      const actual = (await caja.get<Pedido>(`/pedidos/${p.id}`)).datos
      assert.equal(actual.cobradoEn, null)
      assert.equal(actual.pagos.length, 0)
    }
    assert.equal((await guardar(p, [{ metodo: 'EFECTIVO', monto: 4100, recibido: 4100 }])).estado, 200)
  })

  it('admite una mesa grande de 30 aportes y rechaza superar el límite', async () => {
    const p = await crear(MAX_PAGOS_NOTA * 100)
    const pagos = Array.from({ length: MAX_PAGOS_NOTA }, (_, i) => ({ metodo: i % 2 ? 'YAPE' : 'EFECTIVO', monto: 100, recibido: i % 2 ? 100 : 500 }))
    assert.equal((await guardar(p, [...pagos, { metodo: 'YAPE', monto: 100, recibido: 100 }])).estado, 400)
    const r = await guardar(p, pagos)
    assert.equal(r.estado, 200, r.texto)
    assert.equal(r.datos.pagos.length, MAX_PAGOS_NOTA)
    assert.equal(
      r.datos.pagos.reduce((s, g) => s + g.monto, 0),
      p.total
    )
  })

  it('repetir el cobro compartido con la misma clave no duplica pagos ni ventas', async () => {
    const p = await crear(4100)
    const cuerpo = {
      pagos: [
        { metodo: 'EFECTIVO', monto: 1500, recibido: 20000 },
        { metodo: 'EFECTIVO', monto: 2600, recibido: 3000 },
      ],
    }
    const antes = await estado()
    const respuestas = await Promise.all(
      Array.from({ length: 3 }, () => caja.pedir<Pedido>('POST', `/api/pedidos/${p.id}/cobrar`, cuerpo, { 'idempotency-key': `compartidos-${p.id}` }))
    )
    respuestas.forEach((r) => {
      assert.equal(r.estado, 200, r.texto)
      assert.equal(r.datos.pagos.length, 2)
    })
    const despues = await estado()
    assert.equal(despues.ventas - antes.ventas, 4100)
    assert.equal(despues.notas - antes.notas, 1)
  })

  it('las pestañas anteriores pueden terminar su cobro con el contrato anterior', async () => {
    const p = await crear(4100)
    const r = await guardar(p, [
      { metodo: 'YAPE', monto: 1500 },
      { metodo: 'EFECTIVO', monto: 3000 },
    ])
    assert.equal(r.estado, 200, r.texto)
    assert.deepEqual(
      r.datos.pagos.map((g) => [g.metodo, g.monto, g.recibido]),
      [
        ['YAPE', 1500, null],
        ['EFECTIVO', 2600, 3000],
      ]
    )
  })

  it('la interfaz suma lo cobrado, separa los vueltos y convierte decimales sin perder céntimos', () => {
    const fila = (metodo: string | null, monto: string, recibido = ''): FilaPago => ({ clave: String(Math.random()), metodo, monto, recibido })
    const c = cuadrarPago(8500, [fila('EFECTIVO', '48', '100'), fila('EFECTIVO', '22', '30'), fila('YAPE', '15')], medios)
    assert.equal(c.error, null)
    assert.equal(c.debe, 0)
    assert.equal(c.vuelto, 6000)
    assert.equal(c.aplicado, 8500)
    assert.deepEqual(c.pagos, [
      { metodo: 'EFECTIVO', monto: 4800, recibido: 10000 },
      { metodo: 'EFECTIVO', monto: 2200, recibido: 3000 },
      { metodo: 'YAPE', monto: 1500, recibido: 1500 },
    ])
    const decimales = cuadrarPago(100, [fila('EFECTIVO', '0,10', '0,50'), fila('YAPE', '0,90')], medios)
    assert.equal(decimales.error, null)
    assert.equal(decimales.debe, 0)
    assert.equal(decimales.vuelto, 40)
    assert.equal(cuadrarPago(4100, [fila('EFECTIVO', '15', '200')], medios).debe, 2600)
    assert.match(cuadrarPago(4100, [fila('EFECTIVO', '15', '14'), fila('EFECTIVO', '26', '30')], medios).error!, /no cubre/)
    assert.match(cuadrarPago(4100, [fila('YAPE', '42')], medios).error!, /superan/)
    assert.match(cuadrarPago(4100, [fila(null, '41')], medios).error!, /elige/)
    assert.match(cuadrarPago(4100, [fila('YAPE', '')], medios).error!, /cuánto/)
  })
})
