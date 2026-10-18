import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Carta, Pedido } from '@wasi/shared'
import { type Cliente, conApi, enCarta, ingresar, linea, mesa } from './ayuda.js'

const api = conApi()

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
const sumarDias = (f: string, d: number) => {
  const x = new Date(`${f}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + d)
  return x.toISOString().slice(0, 10)
}

describe('reportes', () => {
  let admin: Cliente, mozo: Cliente, cocina: Cliente
  let c: ReturnType<typeof enCarta>
  let antes: any
  const notas: Pedido[] = []
  const MARCA = 'prueba-de-reporte'

  /** Abre una nota, la atiende, la sirve y la cobra. */
  async function venta(codigo: string, lineas: object[], pagos: (total: number) => { metodo: string; monto: number }[]) {
    const p = (await mozo.post<Pedido>(`/mesas/${await mesa(mozo, codigo)}/enviar`, { lineas })).datos
    for (const i of p.items) await cocina.post(`/cocina/items/${i.id}`, { listo: true })
    await mozo.post(`/pedidos/${p.id}/servir`)
    const r = await mozo.post<Pedido>(`/pedidos/${p.id}/cobrar`, { pagos: pagos(p.total) })
    assert.equal(r.estado, 200, r.texto)
    assert.equal(r.datos.estado, 'COBRADO')
    notas.push(r.datos)
    return r.datos
  }

  before(async () => {
    admin = await ingresar(api.url, 'ADMIN')
    mozo = await ingresar(api.url, 'MOZO')
    cocina = await ingresar(api.url, 'COCINA')
    c = enCarta((await mozo.get<Carta>('/carta')).datos)
    antes = (await admin.get(`/reportes/dia?fecha=${hoy()}`)).datos

    const sh = c.producto('Shawarma', 'Huamanguina')
    await venta('M20', [linea(sh.id, { cantidad: 2, observacion: MARCA })], (t) => [{ metodo: 'EFECTIVO', monto: t + 700 }])
    await venta('M21', [linea(c.producto('Emoliente', 'Clásico').id)], (t) => [{ metodo: 'YAPE', monto: t }])
    await venta('M22', [linea(sh.id), linea(c.producto('Pizza', c.familia('Pizza').productos[0].variante).id)], (t) => [
      { metodo: 'YAPE', monto: 1000 },
      { metodo: 'EFECTIVO', monto: t - 1000 },
    ])
    // Una nota anulada no cuenta para nada.
    const anulada = (await mozo.post<Pedido>(`/mesas/${await mesa(mozo, 'M23')}/enviar`, { lineas: [linea(sh.id)] })).datos
    await mozo.post(`/pedidos/${anulada.id}/anular`)
  })

  it('Reporte diario: totales, tipo de pago, vuelto y las notas del día', async () => {
    const d = (await admin.get(`/reportes/dia?fecha=${hoy()}`)).datos
    const vendido = notas.reduce((s, n) => s + n.total, 0)
    assert.equal(d.totales.ventas - antes.totales.ventas, vendido)
    assert.equal(d.totales.pedidos - antes.totales.pedidos, 3)
    const delta = (clave: string, campo: 'monto' | 'vuelto') =>
      d.metodos.find((m: any) => m.metodo === clave)[campo] - (antes.metodos.find((m: any) => m.metodo === clave)?.[campo] ?? 0)
    assert.equal(delta('YAPE', 'monto'), notas[1].total + 1000)
    assert.equal(delta('EFECTIVO', 'monto'), notas[0].total + notas[2].total - 1000)
    assert.equal(delta('EFECTIVO', 'vuelto'), 700)
    assert.ok(d.metodos.every((m: any) => typeof m.nombre === 'string'))
    const primera = d.pedidos.find((p: any) => p.id === notas[0].id)
    assert.equal(primera.items[0].observacion, MARCA)
    assert.ok(d.porHora.length >= 1)
  })

  it('Ventas por fecha: la serie trae todos los días y el periodo anterior es del mismo largo', async () => {
    const h = hoy()
    const d = (await admin.get(`/reportes/rango?desde=${sumarDias(h, -6)}&hasta=${h}`)).datos
    assert.equal(d.serie.length, 7)
    assert.equal(d.serie.at(-1).fecha, h)
    assert.ok(d.serie.at(-1).ventas >= notas.reduce((s, n) => s + n.total, 0))
    assert.equal(d.anterior.hasta, sumarDias(h, -7))
    assert.equal(d.anterior.desde, sumarDias(h, -13))
    assert.ok(d.masVendidos.some((p: any) => p.nombre === 'Shawarma Huamanguina'))
    assert.equal(d.estaciones.length, 3)
  })

  it('fechas inválidas o rangos imposibles responden 400', async () => {
    assert.equal((await admin.get('/reportes/dia?fecha=2026-02-30x')).estado, 400)
    assert.equal((await admin.get('/reportes/rango?desde=2026-10-10&hasta=2026-10-01')).estado, 400)
    assert.equal((await admin.get('/reportes/rango?desde=2024-01-01&hasta=2026-01-01')).estado, 400)
    assert.equal((await admin.get('/reportes/acumulado?mes=2026-13')).estado, 400)
  })

  it('Acumulado: unidades por producto y día del mes', async () => {
    const d = (await admin.get(`/reportes/acumulado?mes=${hoy().slice(0, 7)}`)).datos
    const dia = Number(hoy().slice(8))
    assert.ok(d.diasConVenta.includes(dia))
    const sh = d.productos.find((p: any) => p.nombre === 'Shawarma Huamanguina')
    assert.ok(sh.dias[dia] >= 3)
    assert.ok(sh.maximo >= sh.minimo)
  })

  it('Consolidado: por páginas, con el resumen de todo lo filtrado', async () => {
    const h = hoy()
    const p1 = (await admin.get(`/reportes/consolidado?desde=${h}&hasta=${h}&pagina=1&porPagina=10`)).datos
    assert.ok(p1.filas.length <= 10)
    assert.ok(p1.lineas >= 4)
    assert.equal(p1.paginas, Math.max(1, Math.ceil(p1.lineas / 10)))
    const lejos = (await admin.get(`/reportes/consolidado?desde=${h}&hasta=${h}&pagina=999&porPagina=10`)).datos
    assert.equal(lejos.filas.length, 0)
    assert.equal(lejos.lineas, p1.lineas)

    const marcadas = (await admin.get(`/reportes/consolidado?desde=${h}&hasta=${h}&q=${MARCA}`)).datos
    assert.equal(marcadas.lineas, 1)
    assert.equal(marcadas.unidades, 2)
    assert.equal(marcadas.filas[0].pedidoId, notas[0].id)
    assert.deepEqual(marcadas.filas[0].metodos, ['EFECTIVO'])

    const yape = (await admin.get(`/reportes/consolidado?desde=${h}&hasta=${h}&metodo=YAPE`)).datos
    const ids = new Set(yape.filas.map((f: any) => f.pedidoId))
    assert.ok(ids.has(notas[1].id) && ids.has(notas[2].id) && !ids.has(notas[0].id))
    // Los comodines de la búsqueda no rompen nada.
    assert.equal((await admin.get(`/reportes/consolidado?desde=${h}&hasta=${h}&q=%25_%25`)).estado, 200)
  })

  it('Consolidado para Excel: todo lo filtrado en CSV con punto y coma', async () => {
    const h = hoy()
    const r = await admin.pedir('GET', `/api/reportes/consolidado.csv?desde=${h}&hasta=${h}&q=${MARCA}`)
    assert.equal(r.estado, 200)
    assert.match(r.cabeceras.get('content-type') ?? '', /text\/csv/)
    assert.match(r.cabeceras.get('content-disposition') ?? '', /attachment/)
    const [cabecera, fila, sobra] = r.texto.replace(/^﻿/, '').split('\r\n')
    assert.match(cabecera, /^Nota;Cant;Producto;Familia;Adicional;Detalle;Obs;/)
    assert.match(fila, new RegExp(`^${notas[0].id};2;Shawarma Huamanguina;`))
    assert.ok(fila.includes(MARCA))
    assert.equal(sobra, undefined)
  })
})
