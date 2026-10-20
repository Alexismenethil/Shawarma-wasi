import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fork, type ChildProcess } from 'node:child_process'
import type { Cambio, Carta, Pedido } from '@wasi/shared'
import { Cliente, ingresar, linea, mesa, enCarta, otraIp, PIN } from './ayuda.js'
import { prisma } from '../src/db.js'

const procesos = new Set<ChildProcess>()
const notas: number[] = []

async function iniciar(caer = false) {
  const hijo = fork(new URL('./instancia.ts', import.meta.url), [], {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env, SINCRONIZACION: 'consulta', DB_CONEXIONES: '2', PRUEBA_CAIDA: caer ? '1' : '0' },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  })
  procesos.add(hijo)
  let errores = ''
  hijo.stderr?.on('data', (d) => { errores += String(d) })
  const url = await new Promise<string>((resolve, reject) => {
    const reloj = setTimeout(() => reject(new Error(`La instancia no arrancó: ${errores}`)), 15_000)
    hijo.once('exit', (codigo) => { clearTimeout(reloj); reject(new Error(`La instancia terminó (${codigo}): ${errores}`)) })
    hijo.on('message', (m: any) => { if (m.tipo === 'lista') { clearTimeout(reloj); if (m.base !== new URL(process.env.DATABASE_URL!).pathname) reject(new Error('La instancia no está usando la base de pruebas')); else resolve(m.url) } })
  })
  return { hijo, url }
}

async function matar(hijo: ChildProcess) {
  if (hijo.exitCode !== null || hijo.signalCode !== null) return
  const termino = new Promise((r) => hijo.once('exit', r))
  hijo.kill('SIGKILL')
  await termino
  procesos.delete(hijo)
}

interface Lote { cursor: string; cambios: { id: string; cambio: Cambio }[]; recargar: boolean; mas?: boolean }

describe('Vercel: instancias independientes y caídas', () => {
  let a: Awaited<ReturnType<typeof iniciar>>, b: Awaited<ReturnType<typeof iniciar>>
  let mozoA: Cliente, mozoB: Cliente, adminA: Cliente, adminB: Cliente, otro: Cliente
  let producto: number
  before(async () => {
    a = await iniciar(); b = await iniciar()
    mozoA = await ingresar(a.url, 'MOZO')
    mozoB = new Cliente(b.url, mozoA.token)
    adminA = await ingresar(a.url, 'ADMIN')
    adminB = new Cliente(b.url, adminA.token, 1)
    otro = await ingresar(b.url, 'MOZO', undefined, 2)
    producto = enCarta((await mozoA.get<Carta>('/carta')).datos).producto('Shawarma', 'Clásica').id
  })
  after(async () => {
    for (const id of notas) await adminA.post(`/pedidos/${id}/anular`)
    for (const hijo of procesos) await matar(hijo)
    await prisma.$disconnect()
  })

  it('los avisos guardados en A llegan desde B y no cruzan las mesas de otra sucursal', async () => {
    const cursor = (await mozoB.get<Lote>('/cambios')).datos.cursor
    const m = await mesa(mozoA, 'M20')
    const r = await mozoA.post<Pedido>(`/mesas/${m}/enviar`, { lineas: [linea(producto)] })
    assert.equal(r.estado, 200, r.texto); notas.push(r.datos.id)
    const cambios = (await mozoB.get<Lote>(`/cambios?desde=${cursor}`)).datos
    assert.ok(cambios.cambios.some((c) => c.cambio.pedidoId === r.datos.id && c.cambio.aviso?.tipo === 'nuevo'))
    const ajenos = (await otro.get<Lote>(`/cambios?desde=${cursor}`)).datos
    assert.ok(!ajenos.cambios.some((c) => c.cambio.mesas || c.cambio.pedidoId === r.datos.id))
    assert.equal((await mozoB.get<Lote>(`/cambios?desde=${cambios.cursor}`)).datos.cambios.length, 0)
  })

  it('un reinicio conserva los avisos pendientes y la respuesta del envío', async () => {
    const cursor = (await mozoB.get<Lote>('/cambios')).datos.cursor
    const m = await mesa(mozoA, 'M21')
    const cuerpo = { lineas: [linea(producto)] }
    const cabeceras = { 'idempotency-key': 'vercel-reinicio-0001' }
    const original = await mozoA.pedir<Pedido>('POST', `/api/mesas/${m}/enviar`, cuerpo, cabeceras)
    assert.equal(original.estado, 200, original.texto); notas.push(original.datos.id)
    await matar(a.hijo); a = await iniciar()
    mozoA = new Cliente(a.url, mozoA.token); adminA = new Cliente(a.url, adminA.token, 1)
    const repetida = await mozoA.pedir<Pedido>('POST', `/api/mesas/${m}/enviar`, cuerpo, cabeceras)
    assert.deepEqual(repetida.datos, original.datos)
    const pendientes = (await mozoA.get<Lote>(`/cambios?desde=${cursor}`)).datos
    assert.equal(pendientes.cambios.filter((c) => c.cambio.pedidoId === original.datos.id).length, 1)
  })

  it('doce reintentos simultáneos entre A y B guardan un solo pedido', async () => {
    const m = await mesa(mozoA, 'M22')
    const cuerpo = { lineas: [linea(producto, { cantidad: 2 })] }
    const envios = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? mozoA : mozoB).pedir<Pedido>('POST', `/api/mesas/${m}/enviar`, cuerpo, { 'idempotency-key': 'vercel-concurrente-0001' })))
    for (const r of envios) { assert.equal(r.estado, 200, r.texto); assert.deepEqual(r.datos, envios[0].datos) }
    notas.push(envios[0].datos.id)
    assert.equal(envios[0].datos.items.length, 1)
    assert.equal((await mozoB.get<Pedido>(`/pedidos/${envios[0].datos.id}`)).datos.items.length, 1)
  })

  it('rechaza reutilizar una clave con otro cuerpo o con otra sucursal', async () => {
    const m = await mesa(mozoA, 'M22')
    const r = await mozoB.pedir('POST', `/api/mesas/${m}/enviar`, { lineas: [linea(producto, { cantidad: 3 })] }, { 'idempotency-key': 'vercel-concurrente-0001' })
    assert.equal(r.estado, 422)
    const h = { 'idempotency-key': 'vercel-contexto-0001' }
    assert.equal((await adminA.pedir('PATCH', '/api/admin/ajustes', { minutosAlerta: 15 }, h)).estado, 200)
    assert.equal((await adminB.en(2).pedir('PATCH', '/api/admin/ajustes', { minutosAlerta: 15 }, h)).estado, 422)
  })

  it('egresos simultáneos no gastan dos veces el mismo efectivo, ni se quita un ingreso ya gastado', async () => {
    assert.equal((await adminA.post('/caja/abrir', { montoInicial: 1000 })).estado, 200)
    const retiros = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? adminA : adminB).post('/caja/movimientos', { tipo: 'EGRESO', monto: 800, concepto: 'Concurrente' })))
    assert.equal(retiros.filter((r) => r.estado === 200).length, 1)
    assert.ok(retiros.every((r) => r.estado === 200 || r.estado === 400), JSON.stringify(retiros.map((r) => r.estado)))
    assert.equal((await adminB.get('/caja')).datos.abierta.esperado, 200)
    await adminA.post('/caja/movimientos', { tipo: 'INGRESO', monto: 1000, concepto: 'Ingreso que luego se usa' })
    const caja = (await adminA.get('/caja')).datos.abierta
    const ingreso = caja.movimientos.find((m: any) => m.concepto === 'Ingreso que luego se usa')
    assert.equal((await adminB.post('/caja/movimientos', { tipo: 'EGRESO', monto: 1100, concepto: 'Se usó el ingreso' })).estado, 200)
    assert.equal((await adminA.delete(`/caja/movimientos/${ingreso.id}`)).estado, 400)
    assert.equal((await adminB.get('/caja')).datos.abierta.esperado, 100)
  })

  it('cobrar y anular la misma nota a la vez deja una sola resolución coherente', async () => {
    const m = await mesa(mozoA, 'M24')
    const creada = (await mozoA.post<Pedido>(`/mesas/${m}/enviar`, { lineas: [linea(producto)] })).datos
    const [cobro, anulacion] = await Promise.all([
      adminA.post(`/pedidos/${creada.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: creada.total }] }),
      adminB.post(`/pedidos/${creada.id}/anular`),
    ])
    assert.equal([cobro, anulacion].filter((r) => r.estado === 200).length, 1)
    const final = await prisma.pedido.findUniqueOrThrow({ where: { id: creada.id }, include: { pagos: true } })
    if (final.estado === 'ANULADO') { assert.equal(final.cobradoEn, null); assert.equal(final.pagos.length, 0) }
    else { assert.ok(final.cobradoEn); assert.ok(final.pagos.length > 0); await adminA.post(`/pedidos/${final.id}/servir`, { itemIds: creada.items.map((i) => i.id) }) }
    const caja = (await adminA.get('/caja')).datos.abierta
    assert.equal((await adminA.post('/caja/cerrar', { contado: caja.esperado })).estado, 200)
  })

  it('al matar la instancia antes del COMMIT no quedan pedido, aviso ni clave; el reintento sí se guarda una vez', async () => {
    const caida = await iniciar(true)
    const cliente = new Cliente(caida.url, mozoA.token)
    const m = await mesa(mozoA, 'M23')
    const cuerpo = { mesaId: m, lineas: [linea(producto)] }
    const h = { 'idempotency-key': 'vercel-caida-0001' }
    const sinConfirmar = new Promise<void>((r) => caida.hijo.on('message', (m: any) => { if (m.tipo === 'sin-confirmar') r() }))
    const cortada = cliente.pedir('POST', '/api/prueba/caida', cuerpo, h).catch(() => null)
    await Promise.race([sinConfirmar, new Promise((_, fallo) => setTimeout(() => fallo(new Error('No empezó la escritura')), 10_000).unref())])
    await matar(caida.hijo); await cortada
    assert.equal(await prisma.pedido.count({ where: { mesaId: m } }), 0)
    assert.equal(await prisma.idempotencia.count({ where: { clave: `${(await mozoB.get('/auth/yo')).datos.id}:${h['idempotency-key']}` } }), 0)
    const recuperada = await mozoB.pedir<Pedido>('POST', '/api/prueba/caida', cuerpo, h)
    assert.equal(recuperada.estado, 200, recuperada.texto); notas.push(recuperada.datos.id)
    assert.equal((await mozoA.pedir<Pedido>('POST', '/api/prueba/caida', cuerpo, h)).datos.id, recuperada.datos.id)
    assert.equal(await prisma.pedido.count({ where: { mesaId: m } }), 1)
  })

  it('el bloqueo por PIN fallido se comparte entre instancias y resiste un reinicio', async () => {
    const ip = otraIp()
    const h = { 'x-forwarded-for': ip }
    const cuerpo = { area: 'MOZO', sucursalId: 1, pin: '0000' }
    for (let i = 0; i < 5; i++) assert.equal((await new Cliente(i % 2 ? a.url : b.url).pedir('POST', '/api/auth/ingresar', cuerpo, h)).estado, 401)
    assert.equal((await new Cliente(a.url).pedir('POST', '/api/auth/ingresar', { ...cuerpo, pin: PIN.MOZO }, h)).estado, 429)
    await matar(b.hijo); b = await iniciar(); mozoB = new Cliente(b.url, mozoA.token); adminB = new Cliente(b.url, adminA.token, 1)
    assert.equal((await new Cliente(b.url).pedir('POST', '/api/auth/ingresar', cuerpo, h)).estado, 429)
  })

  it('una edición de la carta en A ya aparece en B, sin caché antigua', async () => {
    const anterior = (await adminB.get('/admin/detalles')).datos
    const creada = await adminA.post('/admin/detalles', { nombre: 'Vercel sin memoria compartida' })
    assert.equal(creada.estado, 200, creada.texto)
    assert.ok(!(anterior as any[]).some((d) => d.id === creada.datos.id))
    assert.ok((await adminB.get('/admin/detalles')).datos.some((d: any) => d.id === creada.datos.id))
    await adminA.delete(`/admin/detalles/${creada.datos.id}`)
  })

  it('la sesión desactivada en A pierde acceso de inmediato en B', async () => {
    const creada = await adminA.post('/admin/equipo', { nombre: 'Temporal Vercel', rol: 'MOZO', sucursalId: 1, pin: '8496' })
    assert.equal(creada.estado, 200, creada.texto)
    const temporal = await ingresar(b.url, 'MOZO', '8496')
    assert.equal((await temporal.get('/auth/yo')).estado, 200)
    assert.equal((await adminA.patch(`/admin/equipo/${creada.datos.id}`, { activo: false })).estado, 200)
    assert.equal((await temporal.get('/auth/yo')).estado, 401)
    assert.equal((await temporal.get('/cambios')).estado, 401)
  })

  it('dos altas simultáneas con el mismo PIN crean solo una persona, aun en distintas sucursales', async () => {
    const altas = await Promise.all([
      adminA.post('/admin/equipo', { nombre: 'PIN simultáneo A', rol: 'MOZO', sucursalId: 1, pin: '8497' }),
      adminB.post('/admin/equipo', { nombre: 'PIN simultáneo B', rol: 'MOZO', sucursalId: 2, pin: '8497' }),
    ])
    assert.deepEqual(altas.map((r) => r.estado).sort(), [200, 409])
    const creada = altas.find((r) => r.estado === 200)!
    assert.equal((await adminA.patch(`/admin/equipo/${creada.datos.id}`, { activo: false })).estado, 200)
  })

  it('un cursor inválido no expone errores internos y el cron exige su secreto', async () => {
    assert.equal((await mozoA.get('/cambios?desde=-1')).estado, 400)
    assert.equal((await mozoA.get('/cambios?desde=99999999999999999999')).estado, 400)
    assert.equal((await new Cliente(a.url).get('/cambios')).estado, 401)
    assert.equal((await new Cliente(a.url).get('/interno/limpiar')).estado, 401)
    const cron = await new Cliente(a.url).pedir('GET', '/api/interno/limpiar', undefined, { authorization: `Bearer ${process.env.CRON_SECRET}` })
    assert.equal(cron.estado, 200, cron.texto)
    const reiniciar = (await mozoA.get<Lote>('/cambios?desde=9223372036854775807')).datos
    assert.equal(reiniciar.recargar, true)
  })
})
