import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Cliente, PIN, conApi, ingresar } from './ayuda.js'

const api = conApi()

describe('acceso', () => {
  it('cada área entra con su PIN y recibe su usuario', async () => {
    for (const rol of ['MOZO', 'COCINA', 'ADMIN'] as const) {
      const c = await ingresar(api.url, rol)
      const yo = await c.get('/auth/yo')
      assert.equal(yo.estado, 200)
      assert.equal(yo.datos.rol, rol)
    }
  })

  it('un PIN equivocado no entra', async () => {
    const r = await new Cliente(api.url).pedir('POST', '/api/auth/ingresar', { rol: 'MOZO', pin: '0000' }, { 'x-forwarded-for': '10.9.9.1' })
    assert.equal(r.estado, 401)
    assert.match(r.datos.error, /PIN incorrecto/)
  })

  it('cinco intentos fallidos frenan esa área desde esa IP', async () => {
    const anonimo = new Cliente(api.url)
    for (let i = 0; i < 5; i++) {
      await anonimo.pedir('POST', '/api/auth/ingresar', { rol: 'COCINA', pin: '0001' }, { 'x-forwarded-for': '10.9.9.2' })
    }
    const r = await anonimo.pedir('POST', '/api/auth/ingresar', { rol: 'COCINA', pin: PIN.COCINA }, { 'x-forwarded-for': '10.9.9.2' })
    assert.equal(r.estado, 429)
    // Desde otra IP sí puede entrar.
    const otra = await anonimo.pedir('POST', '/api/auth/ingresar', { rol: 'COCINA', pin: PIN.COCINA }, { 'x-forwarded-for': '10.9.9.3' })
    assert.equal(otra.estado, 200)
  })

  it('el administrador entra a cualquier área con su PIN', async () => {
    const r = await new Cliente(api.url).pedir('POST', '/api/auth/ingresar', { rol: 'COCINA', pin: PIN.ADMIN }, { 'x-forwarded-for': '10.9.9.4' })
    assert.equal(r.estado, 200)
    assert.equal(r.datos.usuario.rol, 'ADMIN')
  })

  it('sin sesión no se ve nada privado; los datos del local sí son públicos', async () => {
    const anonimo = new Cliente(api.url)
    assert.equal((await anonimo.get('/mesas')).estado, 401)
    assert.equal((await anonimo.get('/carta')).estado, 401)
    assert.equal((await new Cliente(api.url, 'token-falso').get('/mesas')).estado, 401)
    const ajustes = await anonimo.get('/ajustes')
    assert.equal(ajustes.estado, 200)
    assert.equal(ajustes.datos.nombre, 'Shawarma Wasi')
    assert.ok(ajustes.datos.medios.length >= 6)
  })

  it('cada área solo ve lo suyo', async () => {
    const mozo = await ingresar(api.url, 'MOZO')
    const cocina = await ingresar(api.url, 'COCINA')
    assert.equal((await mozo.get('/admin/carta')).estado, 403)
    assert.equal((await mozo.get('/cocina')).estado, 403)
    assert.equal((await cocina.get('/reportes/dia')).estado, 403)
    assert.equal((await cocina.post('/mesas/1/enviar', { lineas: [] })).estado, 403)
    const admin = await ingresar(api.url, 'ADMIN')
    assert.equal((await admin.get('/cocina')).estado, 200)
    assert.equal((await admin.get('/mesas')).estado, 200)
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
    const r = await new Cliente(api.url).pedir('POST', '/api/auth/ingresar', { rol: 'JEFE', pin: 'abc' })
    assert.equal(r.estado, 400)
    const roto = await fetch(`${api.url}/api/auth/ingresar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"rol": "MOZO", ' })
    assert.equal(roto.status, 400)
    const enorme = await fetch(`${api.url}/api/auth/ingresar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(300_000) }) })
    assert.equal(enorme.status, 413)
  })
})
