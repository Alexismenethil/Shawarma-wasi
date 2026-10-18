import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Ajustes, Carta, Pedido } from '@wasi/shared'
import { Cliente, type Respuesta, conApi, enCarta, ingresar, linea, mesa } from './ayuda.js'

const api = conApi()

const ok = (r: Respuesta, mensaje?: string) => assert.ok(r.estado >= 200 && r.estado < 300, mensaje ?? `${r.estado} ${r.texto}`)

describe('administración: todo se edita', () => {
  let admin: Cliente, mozo: Cliente

  before(async () => {
    admin = await ingresar(api.url, 'ADMIN')
    mozo = await ingresar(api.url, 'MOZO')
  })

  describe('carta', () => {
    it('un precio cambiado llega al instante a la carta del mozo', async () => {
      const antes = enCarta((await mozo.get<Carta>('/carta')).datos).producto('Shawarma', 'Suprema')
      ok(await admin.patch(`/admin/productos/${antes.id}`, { precio: antes.precio + 150 }))
      const despues = enCarta((await mozo.get<Carta>('/carta')).datos).producto('Shawarma', 'Suprema')
      assert.equal(despues.precio, antes.precio + 150)
      ok(await admin.patch(`/admin/productos/${antes.id}`, { precio: antes.precio }))
    })

    it('familias: crear, renombrar, cambiar de cocina e ícono, ordenar y borrar si está vacía', async () => {
      const f = await admin.post('/admin/familias', { nombre: 'Salchipapas', estacion: 'SHAWARMAS', icono: 'conito', admiteCorte: false })
      ok(f)
      ok(await admin.patch(`/admin/familias/${f.datos.id}`, { nombre: 'Salchipapas especiales', estacion: 'CARTA', icono: 'hotdog' }))
      const carta = (await admin.get('/admin/carta')).datos
      const ids: number[] = carta.familias.map((x: { id: number }) => x.id)
      // La nueva al principio.
      ok(await admin.put('/admin/orden', { que: 'familia', ids: [f.datos.id, ...ids.filter((i) => i !== f.datos.id)] }))
      const reordenada = (await admin.get('/admin/carta')).datos
      assert.equal(reordenada.familias[0].nombre, 'Salchipapas especiales')
      assert.equal(reordenada.familias[0].estacion, 'CARTA')
      // Vacía no aparece en la carta del mozo; con un producto sí.
      const p = await admin.post('/admin/productos', { familiaId: f.datos.id, variante: 'Clásica', precio: 900, codigo: 'SC' })
      ok(p)
      assert.equal(p.datos.nombre, 'Salchipapas Clásica')
      assert.ok((await mozo.get<Carta>('/carta')).datos.familias.some((x) => x.id === f.datos.id))
      // Con productos no se borra; vacía, sí.
      assert.equal((await admin.delete(`/admin/familias/${f.datos.id}`)).estado, 400)
      ok(await admin.delete(`/admin/productos/${p.datos.id}`))
      ok(await admin.delete(`/admin/familias/${f.datos.id}`))
      // Reordenar o editar lo que ya se borró (otra pantalla abierta) responde 404, no 500.
      assert.equal((await admin.put('/admin/orden', { que: 'familia', ids })).estado, 404)
      assert.equal((await admin.patch(`/admin/familias/${f.datos.id}`, { nombre: 'Ya no está' })).estado, 404)
      ok(await admin.put('/admin/orden', { que: 'familia', ids: ids.filter((i) => i !== f.datos.id) }))
    })

    it('productos: variante repetida no; mover de familia; lo vendido no se borra, se saca de la carta', async () => {
      const carta = enCarta((await mozo.get<Carta>('/carta')).datos)
      const sh = carta.familia('Shawarma')
      assert.equal((await admin.post('/admin/productos', { familiaId: sh.id, variante: 'Clásica', precio: 1000 })).estado, 400)
      const nuevo = await admin.post('/admin/productos', { familiaId: sh.id, variante: 'De prueba', precio: 1234 })
      ok(nuevo)
      // Se vende una vez…
      const r = await mozo.post<Pedido>(`/mesas/${await mesa(mozo, 'M15')}/enviar`, { lineas: [linea(nuevo.datos.id)] })
      ok(r)
      await mozo.post(`/pedidos/${r.datos.id}/anular`)
      // …y ya no se puede borrar.
      assert.equal((await admin.delete(`/admin/productos/${nuevo.datos.id}`)).estado, 400)
      ok(await admin.patch(`/admin/productos/${nuevo.datos.id}`, { activo: false }))
      const visible = (await mozo.get<Carta>('/carta')).datos.familias.flatMap((f) => f.productos).some((p) => p.id === nuevo.datos.id)
      assert.equal(visible, false)
      // Cambiarle la variante a una que ya existe en la familia, no.
      assert.equal((await admin.patch(`/admin/productos/${nuevo.datos.id}`, { variante: 'Clásica' })).estado, 400)
    })

    it('adicionales: crear con cocinas, limitar a una familia, renombrar sin repetir, borrar', async () => {
      const a = await admin.post('/admin/adicionales', { nombre: 'Palta', precio: 250, codigo: 'pa', estaciones: ['SHAWARMAS'] })
      ok(a)
      ok(await admin.patch(`/admin/adicionales/${a.datos.id}`, { familia: 'Shawarma', precio: 300 }))
      const enLaCarta = (await mozo.get<Carta>('/carta')).datos.adicionales.find((x) => x.id === a.datos.id)!
      assert.equal(enLaCarta.precio, 300)
      assert.equal(enLaCarta.familia, 'Shawarma')
      assert.deepEqual(enLaCarta.estaciones, ['SHAWARMAS'])
      assert.equal((await admin.patch(`/admin/adicionales/${a.datos.id}`, { nombre: 'Huevo' })).estado, 400)
      assert.equal((await admin.post('/admin/adicionales', { nombre: 'Queso', precio: 100 })).estado, 400)
      ok(await admin.delete(`/admin/adicionales/${a.datos.id}`))
    })

    it('detalles: agregar, renombrar sin repetir, desactivar y borrar', async () => {
      const d = await admin.post('/admin/detalles', { nombre: 'Corte 4 =' })
      ok(d)
      assert.ok((await mozo.get<Carta>('/carta')).datos.detalles.includes('Corte 4 ='))
      assert.equal((await admin.post('/admin/detalles', { nombre: 'Individual' })).estado, 400)
      assert.equal((await admin.patch(`/admin/detalles/${d.datos.id}`, { nombre: 'Individual' })).estado, 400)
      ok(await admin.patch(`/admin/detalles/${d.datos.id}`, { activo: false }))
      assert.ok(!(await mozo.get<Carta>('/carta')).datos.detalles.includes('Corte 4 ='))
      ok(await admin.delete(`/admin/detalles/${d.datos.id}`))
    })
  })

  describe('mesas', () => {
    it('agregar varias de una vez, renumerar sin chocar, retirar y volver a usar', async () => {
      const antes = (await admin.get('/admin/mesas')).datos as { id: number; numero: number; tipo: string }[]
      const tope = Math.max(...antes.filter((m) => m.tipo === 'LLEVAR').map((m) => m.numero))
      const creadas = await admin.post('/admin/mesas', { tipo: 'LLEVAR', cantidad: 3 })
      ok(creadas)
      assert.deepEqual(
        creadas.datos.map((m: { numero: number }) => m.numero),
        [tope + 1, tope + 2, tope + 3],
      )
      const [a, b] = creadas.datos
      assert.equal((await admin.patch(`/admin/mesas/${a.id}`, { numero: b.numero })).estado, 400)
      ok(await admin.patch(`/admin/mesas/${a.id}`, { numero: 90 }))
      ok(await admin.patch(`/admin/mesas/${b.id}`, { activa: false }))
      assert.ok(!(await mozo.get('/mesas')).datos.some((m: { id: number }) => m.id === b.id))
      ok(await admin.patch(`/admin/mesas/${b.id}`, { activa: true }))
      for (const m of creadas.datos) ok(await admin.delete(`/admin/mesas/${m.id}`))
      assert.equal((await admin.post('/admin/mesas', { tipo: 'SALON', numero: 1 })).estado, 400)
    })

    it('una mesa con nota abierta no se retira; con ventas no se borra', async () => {
      const id = await mesa(mozo, 'M16')
      const p = (await mozo.post<Pedido>(`/mesas/${id}/enviar`, { lineas: [linea(enCarta((await mozo.get<Carta>('/carta')).datos).producto('Shawarma', 'Clásica').id)] })).datos
      assert.equal((await admin.patch(`/admin/mesas/${id}`, { activa: false })).estado, 400)
      await mozo.post(`/pedidos/${p.id}/anular`)
      assert.equal((await admin.delete(`/admin/mesas/${id}`)).estado, 400)
    })
  })

  describe('tipos de pago', () => {
    it('agregar uno nuevo: aparece en la nota con una clave estable', async () => {
      const m = await admin.post('/admin/medios', { nombre: 'Tarjeta Visa', efectivo: false })
      ok(m)
      assert.equal(m.datos.clave, 'TARJETA_VISA')
      const ajustes = (await new Cliente(api.url).get<Ajustes>('/ajustes')).datos
      assert.ok(ajustes.medios.some((x) => x.clave === 'TARJETA_VISA'))
      assert.equal((await admin.post('/admin/medios', { nombre: 'tarjeta visa', efectivo: false })).estado, 400)
      ok(await admin.delete(`/admin/medios/${m.datos.id}`))
    })

    it('uno con cobros no se borra, y siempre queda al menos uno activo', async () => {
      const p = (await mozo.post<Pedido>(`/mesas/${await mesa(mozo, 'M17')}/enviar`, { lineas: [linea(enCarta((await mozo.get<Carta>('/carta')).datos).producto('Shawarma', 'Clásica').id)] })).datos
      ok(await mozo.post(`/pedidos/${p.id}/cobrar`, { pagos: [{ metodo: 'EFECTIVO', monto: p.total }] }))
      const medios = (await admin.get('/admin/medios')).datos as { id: number; clave: string; pagos: number; activo: boolean }[]
      const efectivo = medios.find((x) => x.clave === 'EFECTIVO')!
      assert.ok(efectivo.pagos > 0)
      assert.equal((await admin.delete(`/admin/medios/${efectivo.id}`)).estado, 400)
      const otros = medios.filter((x) => x.id !== efectivo.id)
      for (const o of otros) await admin.patch(`/admin/medios/${o.id}`, { activo: false })
      assert.equal((await admin.patch(`/admin/medios/${efectivo.id}`, { activo: false })).estado, 400)
      for (const o of otros) await admin.patch(`/admin/medios/${o.id}`, { activo: true })
    })
  })

  describe('datos del local', () => {
    it('nombre, cocinas, observaciones y alerta se guardan y los ve todo el mundo', async () => {
      const r = await admin.patch<Ajustes>('/admin/ajustes', {
        subtitulo: 'Comida peruana',
        direccion: 'Jr. Asamblea 123, Huamanga',
        estaciones: { BEBIDAS: 'Bebidas calientes' },
        observaciones: ['Sin ají', 'Sin ají', '  ', 'Extra cremas'],
        minutosAlerta: 20,
      })
      ok(r)
      const publicos = (await new Cliente(api.url).get<Ajustes>('/ajustes')).datos
      assert.equal(publicos.subtitulo, 'Comida peruana')
      assert.equal(publicos.estaciones.BEBIDAS, 'Bebidas calientes')
      assert.equal(publicos.estaciones.CARTA, 'Carta')
      assert.deepEqual(publicos.observaciones, ['Sin ají', 'Extra cremas'])
      assert.equal(publicos.minutosAlerta, 20)
      assert.equal((await admin.patch('/admin/ajustes', { nombre: '' })).estado, 400)
      ok(await admin.patch('/admin/ajustes', { subtitulo: 'Peruvian Cuisine', direccion: '', estaciones: { BEBIDAS: 'Emolientes y bebidas' }, minutosAlerta: 15 }))
    })
  })

  describe('equipo', () => {
    it('agregar personas con PIN propio, sin repetir PIN', async () => {
      const m = await admin.post('/admin/equipo', { nombre: 'María Quispe', rol: 'MOZO', pin: '3141' })
      ok(m)
      assert.equal((await admin.post('/admin/equipo', { nombre: 'Otra', rol: 'COCINA', pin: '3141' })).estado, 409)
      const r = await new Cliente(api.url).pedir('POST', '/api/auth/ingresar', { rol: 'MOZO', pin: '3141' }, { 'x-forwarded-for': '10.8.0.1' })
      assert.equal(r.datos.usuario.nombre, 'María Quispe')
    })

    it('desactivar cierra la sesión al instante; volver exige PIN nuevo', async () => {
      const lista = (await admin.get('/admin/equipo')).datos as { id: number; nombre: string }[]
      const maria = lista.find((x) => x.nombre === 'María Quispe')!
      const sesion = await ingresar(api.url, 'MOZO', '3141')
      assert.equal((await sesion.get('/mesas')).estado, 200)
      ok(await admin.patch(`/admin/equipo/${maria.id}`, { activo: false }))
      assert.equal((await sesion.get('/mesas')).estado, 401)
      assert.equal((await admin.patch(`/admin/equipo/${maria.id}`, { activo: true })).estado, 400)
      ok(await admin.patch(`/admin/equipo/${maria.id}`, { activo: true, pin: '2718' }))
    })

    it('nadie se desactiva a sí mismo y siempre queda un administrador', async () => {
      const yo = (await admin.get('/auth/yo')).datos
      assert.equal((await admin.patch(`/admin/equipo/${yo.id}`, { activo: false })).estado, 409)
      assert.equal((await admin.patch(`/admin/equipo/${yo.id}`, { rol: 'MOZO' })).estado, 409)
    })
  })

  describe('insumos y recetas', () => {
    it('crear un insumo, usarlo en una receta (con su unidad) y no poder borrarlo mientras se use', async () => {
      const i = await admin.post('/admin/insumos', { nombre: 'Palta Hass', costoCompra: 1200, presentacion: '1 kg', cantidadCompra: 1000, unidad: 'g' })
      ok(i)
      const costos = (await admin.get('/admin/costos')).datos
      const lechuga = costos.insumos.find((x: { nombre: string }) => x.nombre === 'Lechuga')
      const producto = costos.productos.find((x: { nombre: string }) => x.nombre === 'Shawarma Napolitana')
      ok(
        await admin.put(`/admin/productos/${producto.id}/receta`, {
          lineas: [
            { insumoId: i.datos.id, cantidad: 50 },
            // La lechuga se compra por unidad; esta receta la mide en gramos.
            { insumoId: lechuga.id, cantidad: 15, unidad: 'g' },
          ],
        }),
      )
      const receta = (await admin.get('/admin/costos')).datos.recetas.find((r: { productoId: number }) => r.productoId === producto.id)
      assert.equal(receta.lineas.find((l: { insumo: string }) => l.insumo === 'Palta Hass').costo, 60) // 50 g × S/ 0.012
      const lineaLechuga = receta.lineas.find((l: { insumo: string }) => l.insumo === 'Lechuga')
      assert.equal(lineaLechuga.unidad, 'g')
      assert.equal(lineaLechuga.costo, null)
      assert.equal(receta.completa, false)
      assert.equal((await admin.delete(`/admin/insumos/${i.datos.id}`)).estado, 400)
      assert.equal((await admin.put(`/admin/productos/${producto.id}/receta`, { lineas: [{ insumoId: i.datos.id, cantidad: 1 }, { insumoId: i.datos.id, cantidad: 2 }] })).estado, 400)
      ok(await admin.put(`/admin/productos/${producto.id}/receta`, { lineas: [] }))
      ok(await admin.delete(`/admin/insumos/${i.datos.id}`))
    })
  })
})
