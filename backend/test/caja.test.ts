import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ArqueoCaja, Carta, CobroCaja, EstadoCaja, Pedido } from '@wasi/shared'
import { type Cliente, conApi, enCarta, ingresar, linea, mesa } from './ayuda.js'

const api = conApi()

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())

describe('caja', () => {
  let mozo: Cliente, caja: Cliente, cajaTarde: Cliente, admin: Cliente
  let c: ReturnType<typeof enCarta>
  let a: Pedido, b: Pedido
  let primera: number

  const estado = async (quien = caja) => (await quien.get<EstadoCaja>('/caja')).datos
  const nota = async (codigo: string, variante = 'Clásica') =>
    (await mozo.post<Pedido>(`/mesas/${await mesa(mozo, codigo)}/enviar`, { lineas: [linea(c.producto('Shawarma', variante).id)] })).datos

  before(async () => {
    mozo = await ingresar(api.url, 'MOZO')
    caja = await ingresar(api.url, 'CAJA')
    admin = await ingresar(api.url, 'ADMIN')
    c = enCarta((await mozo.get<Carta>('/carta')).datos)
    assert.equal((await admin.post('/admin/equipo', { nombre: 'Caja Tarde', rol: 'CAJA', sucursalId: 1, pin: '8642' })).estado, 200)
    cajaTarde = await ingresar(api.url, 'CAJA', '8642')
    // Si otra prueba dejó la caja abierta, se cierra cuadrada para empezar de cero.
    const e = await estado()
    if (e.abierta) assert.equal((await caja.post('/caja/cerrar', { contado: e.abierta.esperado })).estado, 200)
  })

  it('con la caja cerrada no se cobra', async () => {
    a = await nota('M18')
    const r = await caja.post(`/pedidos/${a.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: a.total }] })
    assert.equal(r.estado, 409)
    assert.match(r.datos.error, /caja está cerrada/)
  })

  it('se abre con su fondo, y no se abren dos a la vez', async () => {
    const r = await caja.post<EstadoCaja>('/caja/abrir', { montoInicial: 10000 })
    assert.equal(r.estado, 200, r.texto)
    assert.equal(r.datos.abierta?.montoInicial, 10000)
    assert.equal(r.datos.abierta?.abiertaPor, 'Caja')
    assert.equal(r.datos.abierta?.esperado, 10000)
    primera = r.datos.abierta!.id
    const otra = await cajaTarde.post('/caja/abrir', { montoInicial: 5000 })
    assert.equal(otra.estado, 409)
    assert.match(otra.datos.error, /ya está abierta/)
  })

  it('el arqueo: fondo + cobros en efectivo (sin el vuelto) + ingresos − egresos', async () => {
    assert.equal((await caja.post(`/pedidos/${a.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: a.total + 500 }] })).estado, 200)
    b = await nota('M19', 'Huamanguina')
    assert.equal((await caja.post(`/pedidos/${b.id}/cobrar`, { pagos: [{ metodo: 'YAPE', monto: b.total }] })).estado, 200)
    assert.equal((await caja.post('/caja/movimientos', { tipo: 'INGRESO', monto: 2000, concepto: 'Sencillo para vuelto' })).estado, 200)
    assert.equal((await caja.post('/caja/movimientos', { tipo: 'EGRESO', monto: 1500, concepto: 'Compra de gas' })).estado, 200)

    const arqueo = (await estado()).abierta!
    assert.equal(arqueo.efectivo, a.total)
    assert.equal(arqueo.ingresos, 2000)
    assert.equal(arqueo.egresos, 1500)
    assert.equal(arqueo.esperado, 10000 + a.total + 2000 - 1500)
    assert.equal(arqueo.ventas, a.total + b.total)
    assert.equal(arqueo.notas, 2)
    const efectivo = arqueo.medios.find((m) => m.metodo === 'EFECTIVO')!
    assert.equal(efectivo.vuelto, 500)
    assert.equal(arqueo.medios.find((m) => m.metodo === 'YAPE')!.monto, b.total)
    assert.deepEqual(
      arqueo.movimientos.map((m) => [m.tipo, m.concepto, m.usuario]),
      [
        ['INGRESO', 'Sencillo para vuelto', 'Caja'],
        ['EGRESO', 'Compra de gas', 'Caja'],
      ],
    )
  })

  it('no sale del cajón más efectivo del que hay', async () => {
    const hay = (await estado()).abierta!.esperado
    const r = await caja.post('/caja/movimientos', { tipo: 'EGRESO', monto: hay + 1, concepto: 'Imposible' })
    assert.equal(r.estado, 400)
    assert.match(r.datos.error, /no alcanza/)
  })

  it('el tipo de pago se corrige mientras la caja siga abierta, y el arqueo se recalcula', async () => {
    const antes = (await estado()).abierta!.esperado
    const r = await caja.post<Pedido>(`/pedidos/${b.id}/corregir-pago`, { pagos: [{ metodo: 'EFECTIVO', monto: b.total }] })
    assert.equal(r.estado, 200, r.texto)
    assert.deepEqual(
      r.datos.pagos.map((g) => g.metodo),
      ['EFECTIVO'],
    )
    assert.equal((await estado()).abierta!.esperado, antes + b.total)
    // El total no cambia: un pago que no cubre la cuenta no se acepta.
    assert.equal((await caja.post(`/pedidos/${b.id}/corregir-pago`, { pagos: [{ metodo: 'YAPE', monto: b.total - 100 }] })).estado, 400)
    const cobros = (await caja.get<CobroCaja[]>(`/caja/${primera}/cobros`)).datos
    assert.deepEqual(new Set(cobros.map((x) => x.pedidoId)), new Set([a.id, b.id]))
  })

  it('un movimiento lo quita quien lo anotó o la encargada, no otro cajero', async () => {
    const gas = (await estado()).abierta!.movimientos.find((m) => m.concepto === 'Compra de gas')!
    assert.equal((await cajaTarde.delete(`/caja/movimientos/${gas.id}`)).estado, 403)
    assert.equal((await admin.delete(`/caja/movimientos/${gas.id}`)).estado, 200)
    assert.equal((await estado()).abierta!.egresos, 0)
    assert.equal((await caja.post('/caja/movimientos', { tipo: 'EGRESO', monto: 1500, concepto: 'Compra de gas' })).estado, 200)
  })

  it('al cerrar, lo contado por billetes tiene que sumar y la diferencia queda en la bitácora', async () => {
    const esperado = (await estado()).abierta!.esperado
    assert.equal((await caja.post('/caja/cerrar', { contado: esperado, conteo: { '10000': 1 } })).estado, 400)
    assert.equal((await caja.post('/caja/cerrar', { contado: 1000, fondoSiguiente: 5000 })).estado, 400)

    // Faltan S/ 2.00: se cuenta en monedas de S/ 1 lo que no llega a un billete de S/ 10.
    const contado = esperado - 200
    const conteo = Object.fromEntries(
      Object.entries({ '1000': Math.floor(contado / 1000), '100': (contado % 1000) / 100 }).filter(([, n]) => n > 0),
    )
    assert.ok(Object.values(conteo).every(Number.isInteger))
    const r = await caja.post<ArqueoCaja>('/caja/cerrar', { contado, conteo, fondoSiguiente: 5000, observacion: 'Faltó sencillo' })
    assert.equal(r.estado, 200, r.texto)
    assert.equal(r.datos.estado, 'CERRADA')
    assert.equal(r.datos.diferencia, -200)
    assert.equal(r.datos.esperado, esperado)
    assert.deepEqual(r.datos.conteo, conteo)
    assert.deepEqual(
      r.datos.eventos.map((e) => [e.tipo, e.diferencia]),
      [
        ['APERTURA', null],
        ['CIERRE', -200],
      ],
    )

    const e = await estado()
    assert.equal(e.abierta, null)
    assert.equal(e.ultima?.id, primera)
    assert.equal(e.fondoSugerido, 5000)
    assert.equal(e.puedeReabrir, true)
    // Cerrada, ya no cobra ni corrige.
    const otra = await nota('M20')
    assert.equal((await caja.post(`/pedidos/${otra.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: otra.total }] })).estado, 409)
    assert.equal((await caja.post(`/pedidos/${a.id}/corregir-pago`, { pagos: [{ metodo: 'YAPE', monto: a.total }] })).estado, 409)
    await mozo.post(`/pedidos/${otra.id}/anular`)
  })

  it('reabrir: el cajero, su propio cierre de hoy; la encargada, cualquiera; y solo el último', async () => {
    assert.equal((await estado(cajaTarde)).puedeReabrir, false)
    const ajeno = await cajaTarde.post(`/caja/${primera}/reabrir`)
    assert.equal(ajeno.estado, 403)
    assert.match(ajeno.datos.error, /encargada/)

    const r = await caja.post<EstadoCaja>(`/caja/${primera}/reabrir`)
    assert.equal(r.estado, 200, r.texto)
    const abierta = r.datos.abierta!
    assert.equal(abierta.id, primera)
    assert.equal(abierta.notas, 2)
    assert.equal(abierta.contado, null)
    const reapertura = abierta.eventos.at(-1)!
    assert.equal(reapertura.tipo, 'REAPERTURA')
    assert.equal(reapertura.usuario, 'Caja')
    // Lo que se había contado queda en la bitácora.
    assert.equal(reapertura.diferencia, -200)

    // Se vuelve a cerrar, esta vez cuadrada y escribiendo solo el total.
    assert.equal((await caja.post('/caja/cerrar', { contado: abierta.esperado })).estado, 200)
    // Otra caja después: la primera ya no es el último cierre.
    assert.equal((await cajaTarde.post('/caja/abrir', { montoInicial: 5000 })).estado, 200)
    assert.equal((await cajaTarde.post('/caja/cerrar', { contado: 5000 })).estado, 200)
    const vieja = await admin.post(`/caja/${primera}/reabrir`)
    assert.equal(vieja.estado, 409)
    assert.match(vieja.datos.error, /último cierre/)
  })

  it('el panel ve el historial de cajas con su diferencia, y cada una con sus cobros', async () => {
    const lista = (await admin.get<{ id: number; diferencia: number | null; reaperturas: number; sucursal: string }[]>(`/reportes/cajas?desde=${hoy()}&hasta=${hoy()}`)).datos
    const la = lista.find((x) => x.id === primera)!
    assert.equal(la.diferencia, 0)
    assert.equal(la.reaperturas, 1)
    assert.equal(la.sucursal, 'Plaza More')
    const detalle = (await admin.get<ArqueoCaja & { cobros: CobroCaja[] }>(`/reportes/cajas/${primera}`)).datos
    assert.equal(detalle.cobros.length, 2)
    assert.deepEqual(
      detalle.eventos.map((e) => e.tipo),
      ['APERTURA', 'CIERRE', 'REAPERTURA', 'CIERRE'],
    )
    // Caja no ve el panel.
    assert.equal((await caja.get(`/reportes/cajas?desde=${hoy()}&hasta=${hoy()}`)).estado, 403)
  })
})
