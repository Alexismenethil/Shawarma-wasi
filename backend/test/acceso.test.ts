import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ADMIN, Cliente, PIN, conApi, entrar, ingresar, otraIp } from './ayuda.js'

const api = conApi()

const conPin = (cuerpo: object, ip = otraIp()) => new Cliente(api.url).pedir('POST', '/api/auth/ingresar', cuerpo, { 'x-forwarded-for': ip })
const conClave = (cuerpo: object, ip = otraIp()) => new Cliente(api.url).pedir('POST', '/api/auth/entrar', cuerpo, { 'x-forwarded-for': ip })

describe('acceso', () => {
  it('mozo, cocina y caja entran con su PIN en su sucursal y reciben su usuario', async () => {
    for (const rol of ['MOZO', 'COCINA', 'CAJA'] as const) {
      const c = await ingresar(api.url, rol)
      const yo = await c.get('/auth/yo')
      assert.equal(yo.estado, 200)
      assert.equal(yo.datos.rol, rol)
      assert.equal(yo.datos.sucursalId, 1)
    }
  })

  it('un PIN equivocado no entra, y el de una área no abre otra', async () => {
    const r = await conPin({ area: 'MOZO', sucursalId: 1, pin: '0000' })
    assert.equal(r.estado, 401)
    assert.match(r.datos.error, /PIN incorrecto/)
    // El PIN del mozo no abre la caja…
    assert.equal((await conPin({ area: 'CAJA', sucursalId: 1, pin: PIN.MOZO })).estado, 401)
    // …pero caja sí entra a anotar pedidos (el mostrador).
    const caja = await conPin({ area: 'MOZO', sucursalId: 1, pin: PIN.CAJA })
    assert.equal(caja.estado, 200)
    assert.equal(caja.datos.usuario.rol, 'CAJA')
  })

  it('cinco intentos fallidos frenan esa área desde esa IP', async () => {
    for (let i = 0; i < 5; i++) await conPin({ area: 'COCINA', sucursalId: 1, pin: '0001' }, '10.9.9.2')
    const r = await conPin({ area: 'COCINA', sucursalId: 1, pin: PIN.COCINA }, '10.9.9.2')
    assert.equal(r.estado, 429)
    // Desde otra IP sí puede entrar.
    assert.equal((await conPin({ area: 'COCINA', sucursalId: 1, pin: PIN.COCINA }, '10.9.9.3')).estado, 200)
  })

  it('el administrador entra con usuario y contraseña, no con PIN', async () => {
    const r = await conClave({ usuario: ` ${ADMIN.usuario.toUpperCase()} `, clave: ADMIN.clave })
    assert.equal(r.estado, 200, r.texto)
    assert.equal(r.datos.usuario.rol, 'ADMIN')
    assert.equal(r.datos.usuario.sucursalId, null)
    const mala = await conClave({ usuario: ADMIN.usuario, clave: 'no-es-la-clave' })
    assert.equal(mala.estado, 401)
    assert.equal(mala.datos.error, 'Usuario o contraseña incorrectos.')
    // Un usuario que no existe responde igual: no se delata quién existe.
    assert.equal((await conClave({ usuario: 'nadie', clave: 'no-es-la-clave' })).datos.error, 'Usuario o contraseña incorrectos.')
    // Un PIN de cuatro cifras ya no abre Administración.
    assert.equal((await conPin({ area: 'PANEL', sucursalId: 1, pin: '1234' })).estado, 400)
  })

  it('cinco contraseñas equivocadas frenan a ese usuario desde esa IP', async () => {
    for (let i = 0; i < 5; i++) await conClave({ usuario: ADMIN.usuario, clave: 'mal' }, '10.9.9.4')
    assert.equal((await conClave({ usuario: ADMIN.usuario, clave: ADMIN.clave }, '10.9.9.4')).estado, 429)
    assert.equal((await conClave({ usuario: ADMIN.usuario, clave: ADMIN.clave }, '10.9.9.5')).estado, 200)
  })

  it('cambiar la propia contraseña exige la actual', async () => {
    const admin = await ingresar(api.url, 'ADMIN')
    assert.equal((await admin.post('/auth/clave', { actual: 'no-es', nueva: 'otra-clave-larga' })).estado, 400)
    assert.equal((await admin.post('/auth/clave', { actual: ADMIN.clave, nueva: 'corta' })).estado, 400)
    assert.equal((await admin.post('/auth/clave', { actual: ADMIN.clave, nueva: 'otra-clave-larga' })).estado, 200)
    await entrar(api.url, ADMIN.usuario, 'otra-clave-larga')
    assert.equal((await admin.post('/auth/clave', { actual: 'otra-clave-larga', nueva: ADMIN.clave })).estado, 200)
    // El personal con PIN no tiene contraseña que cambiar.
    const mozo = await ingresar(api.url, 'MOZO')
    assert.equal((await mozo.post('/auth/clave', { actual: 'x', nueva: 'otra-clave-larga' })).estado, 403)
  })

  it('sin sesión no se ve nada privado; los datos del negocio y las sucursales sí son públicos', async () => {
    const anonimo = new Cliente(api.url)
    assert.equal((await anonimo.get('/mesas')).estado, 401)
    assert.equal((await anonimo.get('/carta')).estado, 401)
    assert.equal((await anonimo.get('/caja')).estado, 401)
    assert.equal((await new Cliente(api.url, 'token-falso').get('/mesas')).estado, 401)
    const ajustes = await anonimo.get('/ajustes')
    assert.equal(ajustes.estado, 200)
    assert.equal(ajustes.datos.nombre, 'Shawarma Wasi')
    assert.ok(ajustes.datos.medios.length >= 6)
    assert.equal(ajustes.datos.sucursales[0].nombre, 'Plaza More')
  })

  it('cada área solo ve lo suyo', async () => {
    const mozo = await ingresar(api.url, 'MOZO')
    const cocina = await ingresar(api.url, 'COCINA')
    const caja = await ingresar(api.url, 'CAJA')
    assert.equal((await mozo.get('/admin/carta')).estado, 403)
    assert.equal((await mozo.get('/cocina')).estado, 403)
    assert.equal((await mozo.get('/caja')).estado, 403)
    assert.equal((await mozo.post('/pedidos/1/cobrar', { pagos: [{ metodo: 'EFECTIVO', monto: 100 }] })).estado, 403)
    assert.equal((await cocina.get('/reportes/dia')).estado, 403)
    assert.equal((await cocina.post('/mesas/1/enviar', { lineas: [] })).estado, 403)
    assert.equal((await caja.get('/cocina')).estado, 403)
    assert.equal((await caja.get('/reportes/dia')).estado, 403)
    assert.equal((await caja.get('/caja')).estado, 200)
    const admin = await ingresar(api.url, 'ADMIN')
    assert.equal((await admin.get('/cocina')).estado, 200)
    assert.equal((await admin.get('/mesas')).estado, 200)
    assert.equal((await admin.get('/caja')).estado, 200)
  })

  it('el administrador trabaja en una sucursal elegida; sin elegir, solo ve reportes de todas', async () => {
    const todas = (await ingresar(api.url, 'ADMIN')).en(null)
    const sinElegir = await todas.get('/mesas')
    assert.equal(sinElegir.estado, 400)
    assert.match(sinElegir.datos.error, /Elige una sucursal/)
    assert.equal((await todas.get('/reportes/dia')).estado, 200)
    // Una sucursal que no existe es como no elegir ninguna.
    assert.equal((await todas.en(999).get('/mesas')).estado, 400)
  })

  it('la salud del servidor también revisa la base', async () => {
    const r = await new Cliente(api.url).pedir('GET', '/salud')
    assert.equal(r.estado, 200)
    assert.deepEqual(r.datos, { ok: true })
  })

  it('una ruta que no existe responde 404 en JSON', async () => {
    const r = await new Cliente(api.url).pedir('GET', '/api/no-existe')
    assert.equal(r.estado, 404)
    assert.ok(r.datos.error)
  })

  it('datos inválidos responden 400, no 500', async () => {
    const r = await conPin({ area: 'JEFE', sucursalId: 1, pin: 'abc' })
    assert.equal(r.estado, 400)
    const roto = await fetch(`${api.url}/api/auth/ingresar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"area": "MOZO", ' })
    assert.equal(roto.status, 400)
    const enorme = await fetch(`${api.url}/api/auth/ingresar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(300_000) }) })
    assert.equal(enorme.status, 413)
  })
})
