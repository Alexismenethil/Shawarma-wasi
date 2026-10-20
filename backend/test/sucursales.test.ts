import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Ajustes, Carta, ComandaCocina, EstadoCaja, MesaResumen, Pedido } from '@wasi/shared'
import { Cliente, PIN, cajaAbierta, conApi, enCarta, entrar, ingresar, linea, mesa, otraIp } from './ayuda.js'

const api = conApi()

/**
 * Una sola base para todas las sucursales: lo que se prueba aquí es que nada
 * se cruce. Cada sucursal ve, numera, cocina y cobra solo lo suyo; la carta es
 * una con lo propio de cada sucursal; la encargada ve y maneja solo la suya.
 */
describe('sucursales', () => {
  let admin: Cliente, todas: Cliente
  let mozo1: Cliente, cocina1: Cliente, caja1: Cliente
  let norte: number
  let mozoN: Cliente, cocinaN: Cliente, cajaN: Cliente, adminN: Cliente
  let c: ReturnType<typeof enCarta>
  let notaN: Pedido

  before(async () => {
    admin = await ingresar(api.url, 'ADMIN')
    todas = admin.en(null)
    mozo1 = await ingresar(api.url, 'MOZO')
    cocina1 = await ingresar(api.url, 'COCINA')
    caja1 = await ingresar(api.url, 'CAJA')
    c = enCarta((await mozo1.get<Carta>('/carta')).datos)
  })

  it('una sucursal nueva nace con sus mesas; el nombre no se repite', async () => {
    const r = await todas.post('/admin/sucursales', { nombre: 'Norte', direccion: 'Av. Norte 100', telefono: '966 000 111', mesas: 4, llevar: 2 })
    assert.equal(r.estado, 200, r.texto)
    norte = r.datos.id
    adminN = admin.en(norte)
    const mesas = (await adminN.get<MesaResumen[]>('/mesas')).datos
    assert.deepEqual(
      mesas.map((m) => `${m.tipo[0]}${m.numero}`),
      ['S1', 'S2', 'S3', 'S4', 'L1', 'L2'],
    )
    assert.equal((await todas.post('/admin/sucursales', { nombre: 'norte' })).estado, 409)
    const publicos = (await new Cliente(api.url).get<Ajustes>('/ajustes')).datos
    assert.ok(publicos.sucursales.some((s) => s.id === norte && s.direccion === 'Av. Norte 100'))
  })

  it('su personal entra solo en ella, y ningún PIN se repite entre sucursales', async () => {
    // Si el mismo PIN existiera en dos locales, quien elige mal la sucursal entraría como otra persona.
    const repetido = await todas.post('/admin/equipo', { nombre: 'Mozo Norte', rol: 'MOZO', sucursalId: norte, pin: PIN.MOZO })
    assert.equal(repetido.estado, 409)
    assert.match(repetido.datos.error, /ni entre sucursales/)
    for (const [nombre, rol, pin] of [
      ['Mozo Norte', 'MOZO', '4101'],
      ['Cocina Norte', 'COCINA', '4102'],
      ['Caja Norte', 'CAJA', '4103'],
    ] as const) {
      assert.equal((await todas.post('/admin/equipo', { nombre, rol, sucursalId: norte, pin })).estado, 200)
    }
    mozoN = await ingresar(api.url, 'MOZO', '4101', norte)
    cocinaN = await ingresar(api.url, 'COCINA', '4102', norte)
    cajaN = await ingresar(api.url, 'CAJA', '4103', norte)
    assert.deepEqual(await mozoN.get('/auth/yo').then((r) => [r.datos.nombre, r.datos.sucursalId]), ['Mozo Norte', norte])

    // Con la sucursal equivocada en la tablet, el PIN no entra, y el aviso dice que revise la sucursal.
    const entrarCon = (sucursalId: number, pin: string) =>
      new Cliente(api.url).pedir('POST', '/api/auth/ingresar', { area: 'MOZO', sucursalId, pin }, { 'x-forwarded-for': otraIp() })
    const errada = await entrarCon(norte, PIN.MOZO)
    assert.equal(errada.estado, 401)
    assert.match(errada.datos.error, /Revisa que la sucursal elegida sea la tuya/)
    assert.equal((await entrarCon(1, '4101')).estado, 401)

    // Al pasar a alguien a otra sucursal, su PIN va con él (ya es único): entra allá y ya no aquí.
    const ayudante = (await todas.post<{ id: number }>('/admin/equipo', { nombre: 'Ayudante Norte', rol: 'MOZO', sucursalId: norte, pin: '4104' })).datos
    const pasa = await todas.patch(`/admin/equipo/${ayudante.id}`, { sucursalId: 1 })
    assert.equal(pasa.estado, 200, pasa.texto)
    assert.equal((await entrarCon(1, '4104')).estado, 200)
    assert.equal((await entrarCon(norte, '4104')).estado, 401)
    await todas.patch(`/admin/equipo/${ayudante.id}`, { activo: false })
  })

  it('las notas no se cruzan: cada sucursal ve, numera y cocina solo lo suyo', async () => {
    const m1 = await mesa(mozoN, 'M1')
    notaN = (await mozoN.post<Pedido>(`/mesas/${m1}/enviar`, { cliente: 'Norteño', lineas: [linea(c.producto('Shawarma', 'Clásica').id)] })).datos
    assert.equal(notaN.sucursalId, norte)
    // La primera nota del día en Norte es la N° 1, aunque la sucursal 1 ya lleve varias.
    assert.equal(notaN.numero, 1)

    // Para la sucursal 1, la nota de Norte no existe.
    assert.equal((await mozo1.get(`/pedidos/${notaN.id}`)).estado, 404)
    assert.equal((await mozo1.post(`/pedidos/${notaN.id}/servir`)).estado, 404)
    assert.equal((await mozo1.patch(`/pedidos/${notaN.id}`, { cliente: 'Intruso' })).estado, 404)
    assert.equal((await mozo1.post(`/pedidos/${notaN.id}/anular`)).estado, 404)
    assert.equal((await mozo1.post(`/items/${notaN.items[0].id}/anular`)).estado, 404)
    assert.equal((await mozo1.post(`/mesas/${m1}/enviar`, { lineas: [linea(c.producto('Shawarma', 'Clásica').id)] })).estado, 404)
    assert.ok(!(await mozo1.get<MesaResumen[]>('/mesas')).datos.some((m) => m.id === m1))
    // Ni se puede pasar una nota de la sucursal 1 a una mesa de Norte.
    const propia = (await mozo1.post<Pedido>(`/mesas/${await mesa(mozo1, 'M24')}/enviar`, { lineas: [linea(c.producto('Shawarma', 'Clásica').id)] })).datos
    assert.equal((await mozo1.post(`/pedidos/${propia.id}/mover`, { mesaId: m1 })).estado, 404)
    await mozo1.post(`/pedidos/${propia.id}/anular`)

    // La cocina de la sucursal 1 no ve ni marca la comanda de Norte; la de Norte sí.
    assert.ok(!(await cocina1.get<ComandaCocina[]>('/cocina')).datos.some((x) => x.pedidoId === notaN.id))
    assert.equal((await cocina1.post(`/cocina/items/${notaN.items[0].id}`, { listo: true })).estado, 404)
    assert.equal((await cocina1.post('/cocina/comandas', { pedidoId: notaN.id, ronda: 1, estacion: 'SHAWARMAS', listo: true })).estado, 404)
    assert.ok((await cocinaN.get<ComandaCocina[]>('/cocina')).datos.some((x) => x.pedidoId === notaN.id))
    assert.equal((await cocinaN.post(`/cocina/items/${notaN.items[0].id}`, { listo: true })).estado, 200)
  })

  it('cada sucursal cobra en su propia caja', async () => {
    await cajaAbierta(caja1)
    // La caja de la sucursal 1 no cobra lo de Norte…
    assert.equal((await caja1.post(`/pedidos/${notaN.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: notaN.total }] })).estado, 404)
    // …y Norte, con su caja cerrada, tampoco: primero la abre.
    assert.equal((await cajaN.post(`/pedidos/${notaN.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: notaN.total }] })).estado, 409)
    await cajaAbierta(cajaN, 3000)
    assert.equal((await cajaN.post(`/pedidos/${notaN.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: notaN.total }] })).estado, 200)
    const enNorte = (await cajaN.get<EstadoCaja>('/caja')).datos.abierta!
    assert.equal(enNorte.esperado, 3000 + notaN.total)
    assert.equal(enNorte.notas, 1)
    const enLa1 = (await caja1.get<EstadoCaja>('/caja')).datos.abierta!
    assert.notEqual(enLa1.id, enNorte.id)
    assert.ok(!(await caja1.get<{ pedidoId: number }[]>(`/caja/${enLa1.id}/cobros`)).datos.some((x) => x.pedidoId === notaN.id))
    assert.equal((await caja1.get(`/caja/${enNorte.id}/cobros`)).estado, 404)
  })

  it('la carta es una para todas, con el precio, lo ofrecido y lo agotado de cada sucursal', async () => {
    const clasica = c.producto('Shawarma', 'Clásica')
    const pizza = c.familia('Pizza').productos[0]
    assert.equal((await adminN.put(`/admin/productos/${clasica.id}/sucursal`, { precio: clasica.precio - 300 })).estado, 200)
    assert.equal((await adminN.put(`/admin/productos/${pizza.id}/sucursal`, { oculto: true })).estado, 200)

    const cartaN = enCarta((await mozoN.get<Carta>('/carta')).datos)
    assert.equal(cartaN.producto('Shawarma', 'Clásica').precio, clasica.precio - 300)
    assert.ok(!cartaN.familia('Pizza').productos.some((p) => p.id === pizza.id))
    // En la sucursal 1 nada cambió.
    const carta1 = enCarta((await mozo1.get<Carta>('/carta')).datos)
    assert.equal(carta1.producto('Shawarma', 'Clásica').precio, clasica.precio)
    assert.ok(carta1.familia('Pizza').productos.some((p) => p.id === pizza.id))

    // El precio de Norte es el que se cobra en Norte; lo que no ofrece, no se pide.
    const m2 = await mesa(mozoN, 'M2')
    const p = (await mozoN.post<Pedido>(`/mesas/${m2}/enviar`, { lineas: [linea(clasica.id)] })).datos
    assert.equal(p.items[0].precio, clasica.precio - 300)
    const oculta = await mozoN.post(`/mesas/${m2}/enviar`, { lineas: [linea(pizza.id)] })
    assert.equal(oculta.estado, 400)
    assert.match(oculta.datos.error, /ya no está en la carta/)
    await mozoN.post(`/pedidos/${p.id}/anular`)

    // Escribir el mismo precio de la carta es volver a la carta.
    assert.equal((await adminN.put(`/admin/productos/${clasica.id}/sucursal`, { precio: clasica.precio })).estado, 200)
    const enPanel = (await adminN.get('/admin/carta')).datos.familias.flatMap((f: any) => f.productos).find((x: any) => x.id === clasica.id)
    assert.deepEqual(enPanel.enSucursal, { precio: null, oculto: false, agotado: false })
  })

  it('un producto exclusivo (el combo de inauguración) solo existe en su sucursal', async () => {
    const shawarmas = c.familia('Shawarma')
    const r = await todas.post('/admin/productos', { familiaId: shawarmas.id, variante: 'Combo Norte', precio: 990, sucursalId: norte })
    assert.equal(r.estado, 200, r.texto)
    assert.ok(enCarta((await mozoN.get<Carta>('/carta')).datos).producto('Shawarma', 'Combo Norte'))
    assert.ok(!(await mozo1.get<Carta>('/carta')).datos.familias.flatMap((f) => f.productos).some((p) => p.id === r.datos.id))
    const enLa1 = await mozo1.post(`/mesas/${await mesa(mozo1, 'M25')}/enviar`, { lineas: [linea(r.datos.id)] })
    assert.equal(enLa1.estado, 400)
  })

  it('la encargada ve y maneja solo su sucursal', async () => {
    assert.equal((await todas.post('/admin/equipo', { nombre: 'Encargada Norte', rol: 'ENCARGADO', sucursalId: norte, usuario: 'enc.norte', clave: 'clave-de-norte' })).estado, 200)
    // Aunque pida otra sucursal, la encargada ve la suya.
    const enc = (await entrar(api.url, 'enc.norte', 'clave-de-norte')).en(1)

    const dia = (await enc.get('/reportes/dia')).datos
    assert.deepEqual(
      dia.sucursales.map((s: { id: number }) => s.id),
      [norte],
    )
    assert.equal(dia.totales.ventas, notaN.total)
    assert.equal((await enc.get<MesaResumen[]>('/admin/mesas')).datos.length, 6)

    // Su equipo: solo mozos, cocina y caja de Norte; lo que agrega queda en Norte.
    const equipo = (await enc.get<{ nombre: string; sucursalId: number; rol: string }[]>('/admin/equipo')).datos
    assert.ok(equipo.every((m) => m.sucursalId === norte && ['MOZO', 'COCINA', 'CAJA'].includes(m.rol)))
    const nuevo = await enc.post('/admin/equipo', { nombre: 'Mozo Nuevo', rol: 'MOZO', sucursalId: 1, pin: '5151' })
    assert.equal(nuevo.estado, 200, nuevo.texto)
    assert.equal(nuevo.datos.sucursalId, norte)
    assert.equal((await enc.post('/admin/equipo', { nombre: 'Jefe', rol: 'ADMIN', usuario: 'jefe', clave: 'clave-de-jefe' })).estado, 403)
    assert.equal((await enc.post('/admin/equipo', { nombre: 'Otra', rol: 'ENCARGADO', usuario: 'otra', clave: 'clave-de-otra' })).estado, 403)
    const mozoDeLa1 = (await todas.get<{ id: number; nombre: string }[]>('/admin/equipo')).datos.find((m) => m.nombre === 'Mozo')!
    assert.equal((await enc.patch(`/admin/equipo/${mozoDeLa1.id}`, { activo: false })).estado, 404)

    // Marca agotados en su sucursal, pero los precios son del administrador.
    const clasica = c.producto('Shawarma', 'Clásica')
    assert.equal((await enc.put(`/admin/productos/${clasica.id}/sucursal`, { agotado: true })).estado, 200)
    assert.equal(enCarta((await mozoN.get<Carta>('/carta')).datos).producto('Shawarma', 'Clásica').disponible, false)
    assert.equal(enCarta((await mozo1.get<Carta>('/carta')).datos).producto('Shawarma', 'Clásica').disponible, true)
    assert.equal((await enc.put(`/admin/productos/${clasica.id}/sucursal`, { precio: 100 })).estado, 400)
    await enc.put(`/admin/productos/${clasica.id}/sucursal`, { agotado: false })

    // Lo que es de todo el negocio no es suyo.
    for (const ruta of ['/admin/sucursales', '/admin/medios', '/admin/costos', '/admin/detalles', '/reportes/acumulado', '/reportes/consolidado?desde=2026-01-01&hasta=2026-01-02']) {
      assert.equal((await enc.get(ruta)).estado, 403, ruta)
    }
    assert.equal((await enc.patch(`/admin/productos/${clasica.id}`, { precio: 1 })).estado, 403)
    assert.equal((await enc.patch('/admin/ajustes', { nombre: 'Otro' })).estado, 403)
    // Cubre cualquier puesto de su sucursal: también cobra y ve su cocina.
    assert.equal((await enc.get('/caja')).datos.abierta.sucursalId, norte)
    assert.ok((await enc.get<ComandaCocina[]>('/cocina')).estado === 200)
  })

  it('el dueño ve todas juntas o una por una', async () => {
    const juntas = (await todas.get('/reportes/dia')).datos
    const soloN = (await adminN.get('/reportes/dia')).datos
    const solo1 = (await admin.get('/reportes/dia')).datos
    assert.equal(juntas.totales.ventas, soloN.totales.ventas + solo1.totales.ventas)
    assert.deepEqual(new Set(juntas.sucursales.map((s: { id: number }) => s.id)), new Set([1, 2, norte]))
    assert.equal(soloN.totales.ventas, notaN.total)
    const hoy = juntas.fecha
    const csv = (await todas.pedir('GET', `/api/reportes/consolidado.csv?desde=${hoy}&hasta=${hoy}`)).texto
    assert.ok(csv.includes(`Norte;${notaN.id};`))
    const cajas = (await todas.get<{ sucursal: string }[]>(`/reportes/cajas?desde=${hoy}&hasta=${hoy}`)).datos
    assert.ok(cajas.some((x) => x.sucursal === 'Norte') && cajas.some((x) => x.sucursal === 'Plaza More'))
  })

  it('desactivar una sucursal: no con caja o notas abiertas; después su personal ya no entra', async () => {
    const r = await todas.patch(`/admin/sucursales/${norte}`, { activa: false })
    assert.equal(r.estado, 409)
    assert.match(r.datos.error, /caja abierta/)
    const e = (await cajaN.get<EstadoCaja>('/caja')).datos.abierta!
    assert.equal((await cajaN.post('/caja/cerrar', { contado: e.esperado })).estado, 200)
    // La nota de Norte está pagada pero no servida: sigue abierta.
    assert.equal((await todas.patch(`/admin/sucursales/${norte}`, { activa: false })).estado, 409)
    await mozoN.post(`/pedidos/${notaN.id}/servir`)
    assert.equal((await todas.patch(`/admin/sucursales/${norte}`, { activa: false })).estado, 200)

    assert.equal((await mozoN.get('/mesas')).estado, 401)
    const sinEntrar = await new Cliente(api.url).pedir('POST', '/api/auth/ingresar', { area: 'MOZO', sucursalId: norte, pin: PIN.MOZO }, { 'x-forwarded-for': otraIp() })
    assert.equal(sinEntrar.estado, 401)
    assert.ok(!(await new Cliente(api.url).get<Ajustes>('/ajustes')).datos.sucursales.some((s) => s.id === norte))
    // Sus ventas siguen en los reportes.
    assert.equal((await adminN.get('/reportes/dia')).datos.totales.ventas, notaN.total)
    // Plaza More no se apaga mientras San Cristóbal use su cocina; apagada San Cristóbal, tampoco: siempre queda una activa.
    assert.match((await todas.patch('/admin/sucursales/1', { activa: false })).datos.error, /usa la cocina de Plaza More/)
    assert.equal((await todas.patch('/admin/sucursales/2', { activa: false })).estado, 200)
    const ultima = await todas.patch('/admin/sucursales/1', { activa: false })
    assert.equal(ultima.estado, 409)
    assert.match(ultima.datos.error, /al menos una sucursal activa/)
  })
})
