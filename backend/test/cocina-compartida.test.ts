import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Ajustes, Carta, ComandaCocina, Pedido } from '@wasi/shared'
import { Cliente, PIN, conApi, enCarta, escuchar, ingresar, linea, mesa, otraIp, pinesDe } from './ayuda.js'

const api = conApi()

/**
 * Cocina compartida (temporal): Plaza More y Plaza San Cristóbal están en la
 * misma ciudad y la carta y los shawarmas de las dos salen de la cocina de
 * Plaza More; los emolientes, cada local en la suya. Así queda desde la
 * semilla (el primer deploy) y se deshace desde el panel.
 */
describe('cocina compartida', () => {
  let todas: Cliente
  let mozo1: Cliente, cocina1: Cliente, mozo2: Cliente, cocina2: Cliente
  let c: ReturnType<typeof enCarta>
  let nota1: Pedido, nota2: Pedido

  const hoja = async (cocina: Cliente, consulta = '') => (await cocina.get<ComandaCocina[]>(`/cocina${consulta}`)).datos
  const estacionesDe = (comandas: ComandaCocina[], nota: Pedido) =>
    comandas
      .filter((x) => x.pedidoId === nota.id)
      .map((x) => x.items[0].estacion)
      .sort()

  before(async () => {
    todas = (await ingresar(api.url, 'ADMIN')).en(null)
    mozo1 = await ingresar(api.url, 'MOZO')
    cocina1 = await ingresar(api.url, 'COCINA')
    mozo2 = await ingresar(api.url, 'MOZO', undefined, 2)
    cocina2 = await ingresar(api.url, 'COCINA', undefined, 2)
    c = enCarta((await mozo1.get<Carta>('/carta')).datos)
  })

  after(async () => {
    // Las notas de prueba se anulan: San Cristóbal queda limpia para las demás pruebas.
    for (const [mozo, nota] of [
      [mozo1, nota1],
      [mozo2, nota2],
    ] as const) {
      if (nota) await mozo.post(`/pedidos/${nota.id}/anular`)
    }
  })

  it('desde la semilla: San Cristóbal manda carta y shawarmas a la cocina de Plaza More; la 3.ª queda lista pero apagada', async () => {
    const publicos = (await new Cliente(api.url).get<Ajustes>('/ajustes')).datos
    assert.deepEqual(
      publicos.sucursales.map((s) => [s.id, s.nombre, s.cocinaCompartida]),
      [
        [1, 'Plaza More', null],
        [2, 'Plaza San Cristóbal', { en: 1, estaciones: ['CARTA', 'SHAWARMAS'] }],
      ],
    )
    const lista = (await todas.get<{ id: number; nombre: string; activa: boolean; mesas: number; cocinaPara: number[] }[]>('/admin/sucursales')).datos
    assert.deepEqual(
      lista.map((s) => [s.nombre, s.activa, s.mesas]),
      [
        ['Plaza More', true, 25],
        ['Plaza San Cristóbal', true, 25],
        ['Sucursal 3', false, 25],
      ],
    )
    assert.deepEqual(lista[0].cocinaPara, [2])

    // Cada sucursal nace con su encargado y su mozo, cocina y caja.
    const equipo = (await todas.get<{ sucursalId: number; rol: string; usuario: string | null }[]>('/admin/equipo')).datos
    for (const [id, usuario] of [
      [1, 'more'],
      [2, 'sancristobal'],
      [3, 'sucursal3'],
    ] as const) {
      for (const rol of ['MOZO', 'COCINA', 'CAJA']) assert.ok(equipo.some((m) => m.sucursalId === id && m.rol === rol), `${rol} en la sucursal ${id}`)
      assert.ok(equipo.some((m) => m.sucursalId === id && m.rol === 'ENCARGADO' && m.usuario === usuario))
    }
    // Cada sucursal con sus PIN: ninguno se repite, así que con el de Plaza More no se entra a San Cristóbal.
    const entrarCon = (sucursalId: number, pin: string) =>
      new Cliente(api.url).pedir('POST', '/api/auth/ingresar', { area: 'MOZO', sucursalId, pin }, { 'x-forwarded-for': otraIp() })
    assert.equal((await entrarCon(2, PIN.MOZO)).estado, 401)
    assert.equal((await entrarCon(1, pinesDe(2).MOZO)).estado, 401)
    // Mientras está apagada, su personal no entra ni con su propio PIN.
    assert.equal((await entrarCon(3, pinesDe(3).MOZO)).estado, 401)
  })

  it('una sola pantalla para carta y shawarmas, cada comanda con su local; los emolientes, cada local en la suya', async () => {
    const oido1 = await escuchar(cocina1)
    const oido2 = await escuchar(cocina2)
    const lineas = [linea(c.producto('Shawarma', 'Clásica').id), linea(c.producto('Emoliente', 'Clásico').id)]
    // La misma M14 en los dos locales: por eso cada comanda dice de dónde es.
    const r2 = await mozo2.post<Pedido>(`/mesas/${await mesa(mozo2, 'M14')}/enviar`, { cliente: 'Rocío', lineas })
    const r1 = await mozo1.post<Pedido>(`/mesas/${await mesa(mozo1, 'M14')}/enviar`, { cliente: 'Jhon', lineas })
    assert.equal(r2.estado, 200, r2.texto)
    assert.equal(r1.estado, 200, r1.texto)
    nota2 = r2.datos
    nota1 = r1.datos
    assert.deepEqual([nota1.sucursalId, nota2.sucursalId], [1, 2])

    // Plaza More: los shawarmas de las dos, con su local; sus emolientes, solo los suyos.
    const shawarmas = await hoja(cocina1, '?estacion=SHAWARMAS')
    assert.equal(shawarmas.find((x) => x.pedidoId === nota2.id)?.sucursalId, 2)
    assert.equal(shawarmas.find((x) => x.pedidoId === nota1.id)?.sucursalId, 1)
    assert.ok(!(await hoja(cocina1, '?estacion=BEBIDAS')).some((x) => x.pedidoId === nota2.id))
    assert.deepEqual(estacionesDe(await hoja(cocina1), nota2), ['SHAWARMAS'])
    assert.deepEqual(estacionesDe(await hoja(cocina1), nota1), ['BEBIDAS', 'SHAWARMAS'])

    // San Cristóbal: sus emolientes, no los de Plaza More; la cocina compartida la ve igual (es la misma).
    const emolientes = await hoja(cocina2, '?estacion=BEBIDAS')
    assert.ok(emolientes.some((x) => x.pedidoId === nota2.id))
    assert.ok(!emolientes.some((x) => x.pedidoId === nota1.id))
    assert.deepEqual(estacionesDe(await hoja(cocina2), nota1), ['SHAWARMAS'])

    // El aviso de pedido nuevo suena en la cocina que lo prepara, con el local; el emoliente, solo en la suya.
    const nuevo = await oido1.esperar((x) => x.aviso?.tipo === 'nuevo' && x.aviso.mesa === 'M14 · Plaza San Cristóbal')
    assert.deepEqual(nuevo.aviso?.tipo === 'nuevo' && nuevo.aviso.estaciones, ['SHAWARMAS'])
    assert.equal(nuevo.mesas, undefined)
    const propio = await oido2.esperar((x) => x.aviso?.tipo === 'nuevo' && x.aviso.mesa === 'M14')
    assert.deepEqual(propio.aviso?.tipo === 'nuevo' && [...propio.aviso.estaciones].sort(), ['BEBIDAS', 'SHAWARMAS'])
    const deMore = await oido2.esperar((x) => x.aviso?.tipo === 'nuevo' && x.aviso.mesa === 'M14 · Plaza More')
    assert.deepEqual(deMore.aviso?.tipo === 'nuevo' && deMore.aviso.estaciones, ['SHAWARMAS'])
    oido1.cerrar()
    oido2.cerrar()
  })

  it('Plaza More marca lo de San Cristóbal y a su mozo le avisa dónde recogerlo; los emolientes de San Cristóbal son de su cocina', async () => {
    const salon1 = await escuchar(mozo1)
    const salon2 = await escuchar(mozo2)
    const shawarma = nota2.items.find((i) => i.estacion === 'SHAWARMAS')!
    const emoliente = nota2.items.find((i) => i.estacion === 'BEBIDAS')!

    assert.equal((await cocina1.post(`/cocina/items/${emoliente.id}`, { listo: true })).estado, 404)
    assert.equal((await cocina1.post('/cocina/comandas', { pedidoId: nota2.id, ronda: 1, estacion: 'BEBIDAS', listo: true })).estado, 404)
    assert.equal((await cocina1.post(`/cocina/items/${shawarma.id}`, { listo: true })).estado, 200)
    const listo = await salon2.esperar((x) => x.aviso?.tipo === 'listo')
    assert.deepEqual(listo.aviso, { tipo: 'listo', mesa: 'M14', estacion: 'SHAWARMAS', en: 'Plaza More' })
    assert.equal(listo.mesas, true)

    // El emoliente lo marca San Cristóbal: se recoge ahí mismo.
    salon2.olvidar()
    assert.equal((await cocina2.post('/cocina/comandas', { pedidoId: nota2.id, ronda: 1, estacion: 'BEBIDAS', listo: true })).estado, 200)
    assert.deepEqual((await salon2.esperar((x) => x.aviso?.tipo === 'listo')).aviso, { tipo: 'listo', mesa: 'M14', estacion: 'BEBIDAS' })

    // Desde San Cristóbal también se marca lo de Plaza More en la cocina compartida; el aviso va a los mozos de Plaza More.
    assert.equal((await cocina2.post('/cocina/comandas', { pedidoId: nota1.id, ronda: 1, estacion: 'SHAWARMAS', listo: true })).estado, 200)
    assert.deepEqual((await salon1.esperar((x) => x.aviso?.tipo === 'listo')).aviso, { tipo: 'listo', mesa: 'M14', estacion: 'SHAWARMAS' })
    // Los mozos de un local no reciben el «listo» del otro (la M14 de allá no es la de aquí).
    await new Promise((r) => setTimeout(r, 150))
    assert.equal(salon1.cambios.filter((x) => x.aviso?.tipo === 'listo').length, 1)
    assert.equal(salon2.cambios.filter((x) => x.aviso?.tipo === 'listo').length, 1)
    salon1.cerrar()
    salon2.cerrar()
  })

  it('lo que se agota en la cocina compartida se agota en los dos locales; los emolientes, solo en el suyo', async () => {
    const clasica = c.producto('Shawarma', 'Clásica')
    const emoliente = c.producto('Emoliente', 'Clásico')
    const enLa2 = todas.en(2)
    const disponible = async (mozo: Cliente, clave: string, variante: string) => enCarta((await mozo.get<Carta>('/carta')).datos).producto(clave, variante).disponible

    const r = await enLa2.put(`/admin/productos/${clasica.id}/sucursal`, { agotado: true })
    assert.equal(r.estado, 200, r.texto)
    assert.deepEqual(r.datos.tambienEn, ['Plaza More'])
    assert.equal(await disponible(mozo1, 'Shawarma', 'Clásica'), false)
    assert.equal(await disponible(mozo2, 'Shawarma', 'Clásica'), false)

    const e = await enLa2.put(`/admin/productos/${emoliente.id}/sucursal`, { agotado: true })
    assert.deepEqual(e.datos.tambienEn, [])
    assert.equal(await disponible(mozo2, 'Emoliente', 'Clásico'), false)
    assert.equal(await disponible(mozo1, 'Emoliente', 'Clásico'), true)

    // Volver a tenerlo también vale para los dos.
    assert.deepEqual((await todas.en(1).put(`/admin/productos/${clasica.id}/sucursal`, { agotado: false })).datos.tambienEn, ['Plaza San Cristóbal'])
    assert.equal(await disponible(mozo2, 'Shawarma', 'Clásica'), true)
    await enLa2.put(`/admin/productos/${emoliente.id}/sucursal`, { agotado: false })
  })

  it('el dueño la deshace con un clic: cada local vuelve a su cocina, sin cadenas ni cocinas huérfanas', async () => {
    const separar = await todas.patch('/admin/sucursales/2', { cocinaCompartida: null })
    assert.equal(separar.estado, 200, separar.texto)
    assert.equal((await new Cliente(api.url).get<Ajustes>('/ajustes')).datos.sucursales[1].cocinaCompartida, null)
    // Lo de San Cristóbal sale ahora solo en su cocina, y la de Plaza More ya no lo ve ni lo marca.
    assert.ok(!(await hoja(cocina1)).some((x) => x.pedidoId === nota2.id))
    assert.deepEqual(estacionesDe(await hoja(cocina2), nota2), ['BEBIDAS', 'SHAWARMAS'])
    assert.ok(!(await hoja(cocina2)).some((x) => x.pedidoId === nota1.id))
    assert.equal((await cocina1.post('/cocina/comandas', { pedidoId: nota2.id, ronda: 1, estacion: 'SHAWARMAS', listo: false })).estado, 404)

    // Lo que no se puede: consigo misma, sin cocinas, con una sucursal apagada, ni en cadena.
    const compartir = (id: number, en: number, estaciones: string[]) => todas.patch(`/admin/sucursales/${id}`, { cocinaCompartida: { en, estaciones } })
    assert.equal((await compartir(2, 2, ['CARTA'])).estado, 400)
    assert.equal((await compartir(2, 1, [])).estado, 400)
    assert.equal((await compartir(2, 3, ['CARTA'])).estado, 409)
    assert.equal((await compartir(2, 1, ['CARTA', 'SHAWARMAS'])).estado, 200)
    assert.match((await compartir(1, 2, ['CARTA'])).datos.error, /manda sus pedidos a otra cocina/)
    assert.match((await compartir(3, 2, ['CARTA'])).datos.error, /manda sus pedidos a otra cocina/)

    // Plaza More no se apaga mientras San Cristóbal use su cocina.
    const apagar = await todas.patch('/admin/sucursales/1', { activa: false })
    assert.equal(apagar.estado, 409)
    assert.match(apagar.datos.error, /Plaza San Cristóbal usa la cocina de Plaza More/)

    // Quedó como la deja la semilla.
    assert.deepEqual((await new Cliente(api.url).get<Ajustes>('/ajustes')).datos.sucursales[1].cocinaCompartida, { en: 1, estaciones: ['CARTA', 'SHAWARMAS'] })
  })
})
