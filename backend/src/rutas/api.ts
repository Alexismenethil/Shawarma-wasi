import { Router } from 'express'
import { z } from 'zod'
import { ESTACIONES, ROLES } from '@wasi/shared'
import { exigir, ingresar } from '../servicios/auth.js'
import * as pedidos from '../servicios/pedidos.js'
import * as cocina from '../servicios/cocina.js'
import * as carta from '../servicios/carta.js'
import * as reportes from '../servicios/reportes.js'
import * as equipo from '../servicios/equipo.js'
import * as ajustes from '../servicios/ajustes.js'
import * as mesas from '../servicios/mesas.js'

export const api = Router()

const id = (v: unknown) => z.coerce.number().int().positive().parse(v)
const centimos = z.number().int().min(0).max(10_000_00)
const texto = (max: number) => z.string().trim().min(1).max(max)
const opcional = (max: number) => z.string().trim().max(max).nullable()

// ─── Acceso ──────────────────────────────────────────────────────────────
api.post('/auth/ingresar', async (req, res) => {
  const { rol, pin } = z.object({ rol: z.enum(ROLES), pin: z.string().regex(/^\d{4,8}$/) }).parse(req.body)
  res.json(await ingresar(rol, pin, req.ip ?? 'desconocida'))
})

api.get('/auth/yo', exigir(), (req, res) => {
  res.json(req.usuario)
})

/** El nombre del local, sus cocinas y medios de pago: lo ve hasta la pantalla de entrada. */
api.get('/ajustes', async (_req, res) => {
  res.json(await ajustes.leerAjustes())
})

// ─── Mozo ────────────────────────────────────────────────────────────────
const mozo = exigir('MOZO')

api.get('/carta', exigir(), async (_req, res) => {
  res.json(await carta.cartaParaMozo())
})

api.get('/mesas', exigir(), async (_req, res) => {
  res.json(await pedidos.listarMesas())
})

api.get('/mesas/:id/pedido', mozo, async (req, res) => {
  res.json(await pedidos.pedidoDeMesa(id(req.params.id)))
})

const linea = z.object({
  productoId: z.number().int().positive().nullable(),
  libre: z.object({ nombre: texto(80), precio: centimos, estacion: z.enum(ESTACIONES) }).optional(),
  cantidad: z.number().int().min(1).max(99),
  adicionales: z.array(z.number().int().positive()).max(12),
  detalle: opcional(40),
  paraLlevar: z.boolean(),
  observacion: opcional(140),
})

api.post('/mesas/:id/enviar', mozo, async (req, res) => {
  const datos = z
    .object({ cliente: opcional(60).optional(), lineas: z.array(linea).min(1).max(60) })
    .parse(req.body)
  res.json(await pedidos.enviarACocina(id(req.params.id), req.usuario!, datos))
})

api.get('/pedidos/:id', exigir(), async (req, res) => {
  res.json(await pedidos.obtenerPedido(id(req.params.id)))
})

api.patch('/pedidos/:id', mozo, async (req, res) => {
  const { cliente } = z.object({ cliente: opcional(60) }).parse(req.body)
  res.json(await pedidos.cambiarCliente(id(req.params.id), cliente))
})

api.post('/pedidos/:id/servir', mozo, async (req, res) => {
  const { itemIds } = z.object({ itemIds: z.array(z.number().int()).optional() }).parse(req.body ?? {})
  res.json(await pedidos.servir(id(req.params.id), itemIds))
})

api.post('/pedidos/:id/cobrar', mozo, async (req, res) => {
  const { pagos } = z
    .object({ pagos: z.array(z.object({ metodo: texto(40), monto: centimos })).min(1).max(6) })
    .parse(req.body)
  res.json(await pedidos.cobrar(id(req.params.id), pagos))
})

api.post('/pedidos/:id/mover', mozo, async (req, res) => {
  const { mesaId } = z.object({ mesaId: z.number().int().positive() }).parse(req.body)
  res.json(await pedidos.moverPedido(id(req.params.id), mesaId))
})

api.post('/pedidos/:id/anular', mozo, async (req, res) => {
  await pedidos.anularPedido(id(req.params.id))
  res.json({ ok: true })
})

api.post('/items/:id/anular', mozo, async (req, res) => {
  res.json(await pedidos.anularItem(id(req.params.id), req.usuario!))
})

// ─── Cocina ──────────────────────────────────────────────────────────────
const enCocina = exigir('COCINA')
const estacion = (v: unknown) => (v ? z.enum(ESTACIONES).parse(v) : undefined)

/** La hoja «Atención al Cliente»: lo pendiente y lo resuelto desde la última «Limpiar». */
api.get('/cocina', enCocina, async (req, res) => {
  const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined
  res.json(await cocina.hojaCocina(estacion(req.query.estacion), desde))
})

api.post('/cocina/items/:id', enCocina, async (req, res) => {
  const { listo } = z.object({ listo: z.boolean() }).parse(req.body)
  await cocina.marcarItem(id(req.params.id), listo)
  res.json({ ok: true })
})

api.post('/cocina/comandas', enCocina, async (req, res) => {
  const d = z
    .object({ pedidoId: z.number().int(), ronda: z.number().int(), estacion: z.enum(ESTACIONES), listo: z.boolean() })
    .parse(req.body)
  await cocina.marcarComanda(d.pedidoId, d.ronda, d.estacion, d.listo)
  res.json({ ok: true })
})

// ─── Administración: reportes ────────────────────────────────────────────
const admin = exigir('ADMIN')

api.get('/reportes/dia', admin, async (req, res) => {
  res.json(await reportes.reporteDia(req.query.fecha as string | undefined))
})

api.get('/reportes/rango', admin, async (req, res) => {
  const { desde, hasta } = z.object({ desde: z.string(), hasta: z.string() }).parse(req.query)
  res.json(await reportes.reporteRango(desde, hasta))
})

api.get('/reportes/acumulado', admin, async (req, res) => {
  const mes = (req.query.mes as string | undefined) ?? reportes.hoyEnLima().slice(0, 7)
  res.json(await reportes.reporteAcumulado(mes))
})

const filtroConsolidado = z.object({
  desde: z.string(),
  hasta: z.string(),
  q: z.string().max(60).optional(),
  metodo: z.string().max(40).optional(),
})

/** Por páginas: el resumen cuenta todo lo filtrado, pero solo viaja la página pedida. */
api.get('/reportes/consolidado', admin, async (req, res) => {
  const f = filtroConsolidado
    .extend({ pagina: z.coerce.number().int().min(1).default(1), porPagina: z.coerce.number().int().min(10).max(500).default(100) })
    .parse(req.query)
  res.json(await reportes.consolidado(f))
})

/** Todo lo filtrado, de una vez, como archivo para Excel. */
api.get('/reportes/consolidado.csv', admin, async (req, res) => {
  const f = filtroConsolidado.parse(req.query)
  res.setHeader('content-type', 'text/csv; charset=utf-8')
  res.setHeader('content-disposition', `attachment; filename="consolidado-${f.desde}-a-${f.hasta}.csv"`)
  res.send(await reportes.consolidadoCsv(f))
})

// ─── Administración: carta ───────────────────────────────────────────────
api.get('/admin/carta', admin, async (_req, res) => {
  res.json(await carta.cartaAdmin())
})

const datosProducto = z.object({
  familiaId: z.number().int().positive(),
  codigo: opcional(12),
  variante: texto(60),
  nombre: texto(90),
  descripcion: opcional(140),
  precio: centimos,
  activo: z.boolean(),
  disponible: z.boolean(),
})

api.post('/admin/productos', admin, async (req, res) => {
  const d = datosProducto
    .pick({ familiaId: true, variante: true, precio: true })
    .extend({ nombre: z.string().trim().max(90).optional(), codigo: opcional(12).optional(), descripcion: opcional(140).optional() })
    .parse(req.body)
  res.json(await carta.crearProducto(d))
})

api.patch('/admin/productos/:id', admin, async (req, res) => {
  res.json(await carta.actualizarProducto(id(req.params.id), datosProducto.partial().parse(req.body)))
})

api.delete('/admin/productos/:id', admin, async (req, res) => {
  await carta.borrarProducto(id(req.params.id))
  res.json({ ok: true })
})

api.put('/admin/productos/:id/receta', admin, async (req, res) => {
  const { lineas } = z
    .object({
      lineas: z
        .array(z.object({ insumoId: z.number().int().positive(), cantidad: z.number().positive().nullable(), unidad: z.string().trim().max(10).nullable().optional() }))
        .max(40),
    })
    .parse(req.body)
  await carta.guardarReceta(id(req.params.id), lineas)
  res.json({ ok: true })
})

const datosFamilia = z.object({
  nombre: texto(40),
  estacion: z.enum(ESTACIONES),
  icono: texto(30),
  activa: z.boolean(),
  admiteCorte: z.boolean(),
})

api.post('/admin/familias', admin, async (req, res) => {
  res.json(await carta.crearFamilia(datosFamilia.omit({ activa: true }).parse(req.body)))
})

api.patch('/admin/familias/:id', admin, async (req, res) => {
  res.json(await carta.actualizarFamilia(id(req.params.id), datosFamilia.partial().parse(req.body)))
})

api.delete('/admin/familias/:id', admin, async (req, res) => {
  await carta.borrarFamilia(id(req.params.id))
  res.json({ ok: true })
})

const datosAdicional = z.object({
  codigo: opcional(12),
  nombre: texto(40),
  precio: centimos,
  activo: z.boolean(),
  estaciones: z.array(z.enum(ESTACIONES)).max(3),
  familia: opcional(40),
})

api.post('/admin/adicionales', admin, async (req, res) => {
  const d = datosAdicional.pick({ nombre: true, precio: true }).extend({
    codigo: opcional(12).optional(),
    estaciones: z.array(z.enum(ESTACIONES)).max(3).optional(),
  })
  res.json(await carta.crearAdicional(d.parse(req.body)))
})

api.patch('/admin/adicionales/:id', admin, async (req, res) => {
  res.json(await carta.actualizarAdicional(id(req.params.id), datosAdicional.partial().parse(req.body)))
})

api.delete('/admin/adicionales/:id', admin, async (req, res) => {
  await carta.borrarAdicional(id(req.params.id))
  res.json({ ok: true })
})

api.get('/admin/detalles', admin, async (_req, res) => {
  res.json(await ajustes.listarDetalles())
})

api.post('/admin/detalles', admin, async (req, res) => {
  const { nombre } = z.object({ nombre: texto(40) }).parse(req.body)
  res.json(await ajustes.crearDetalle(nombre))
})

api.patch('/admin/detalles/:id', admin, async (req, res) => {
  const d = z.object({ nombre: texto(40), activo: z.boolean() }).partial().parse(req.body)
  res.json(await ajustes.actualizarDetalle(id(req.params.id), d))
})

api.delete('/admin/detalles/:id', admin, async (req, res) => {
  await ajustes.borrarDetalle(id(req.params.id))
  res.json({ ok: true })
})

/** Guarda el orden de una lista (familias, productos, adicionales, medios, detalles). */
api.put('/admin/orden', admin, async (req, res) => {
  const { que, ids } = z
    .object({
      que: z.enum(['familia', 'producto', 'adicional', 'medioPago', 'detalle']),
      ids: z.array(z.number().int().positive()).min(1).max(500),
    })
    .parse(req.body)
  await ajustes.ordenar(que, ids)
  res.json({ ok: true })
})

// ─── Administración: local, mesas y pagos ────────────────────────────────
api.patch('/admin/ajustes', admin, async (req, res) => {
  const d = z
    .object({
      nombre: texto(40),
      subtitulo: z.string().trim().max(60),
      direccion: z.string().trim().max(120),
      telefono: z.string().trim().max(30),
      ruc: z.string().trim().max(20),
      pieNota: z.string().trim().max(140),
      estaciones: z.object({ CARTA: texto(30), SHAWARMAS: texto(30), BEBIDAS: texto(30) }).partial(),
      observaciones: z.array(z.string().max(40)).max(40),
      minutosAlerta: z.number().int().min(3).max(120),
    })
    .partial()
    .parse(req.body)
  res.json(await ajustes.actualizarAjustes(d))
})

api.get('/admin/mesas', admin, async (_req, res) => {
  res.json(await mesas.listarMesasAdmin())
})

/** Una mesa con su número, o varias de una vez (las siguientes libres) en una sola transacción. */
api.post('/admin/mesas', admin, async (req, res) => {
  const d = z
    .object({ tipo: z.enum(['SALON', 'LLEVAR']), numero: z.number().int().min(1).max(999).optional(), cantidad: z.number().int().min(1).max(50).optional() })
    .parse(req.body)
  res.json(d.numero ? await mesas.crearMesa(d.tipo, d.numero) : await mesas.crearMesas(d.tipo, d.cantidad ?? 1))
})

api.patch('/admin/mesas/:id', admin, async (req, res) => {
  const d = z.object({ numero: z.number().int().min(1).max(999), activa: z.boolean() }).partial().parse(req.body)
  res.json(await mesas.actualizarMesa(id(req.params.id), d))
})

api.delete('/admin/mesas/:id', admin, async (req, res) => {
  await mesas.borrarMesa(id(req.params.id))
  res.json({ ok: true })
})

api.get('/admin/medios', admin, async (_req, res) => {
  res.json(await ajustes.listarMedios())
})

api.post('/admin/medios', admin, async (req, res) => {
  res.json(await ajustes.crearMedio(z.object({ nombre: texto(40), efectivo: z.boolean() }).parse(req.body)))
})

api.patch('/admin/medios/:id', admin, async (req, res) => {
  const d = z.object({ nombre: texto(40), efectivo: z.boolean(), activo: z.boolean() }).partial().parse(req.body)
  res.json(await ajustes.actualizarMedio(id(req.params.id), d))
})

api.delete('/admin/medios/:id', admin, async (req, res) => {
  await ajustes.borrarMedio(id(req.params.id))
  res.json({ ok: true })
})

// ─── Administración: equipo ──────────────────────────────────────────────
const datosMiembro = z.object({
  nombre: z.string().trim().min(2).max(40),
  rol: z.enum(ROLES),
  // El teclado del local es de cuatro cifras.
  pin: z.string().regex(/^\d{4}$/),
  activo: z.boolean(),
})

api.get('/admin/equipo', admin, async (_req, res) => {
  res.json(await equipo.listarEquipo())
})

api.post('/admin/equipo', admin, async (req, res) => {
  const d = datosMiembro.omit({ activo: true }).parse(req.body)
  res.json(await equipo.crearMiembro(d))
})

api.patch('/admin/equipo/:id', admin, async (req, res) => {
  const d = datosMiembro.partial().parse(req.body)
  res.json(await equipo.actualizarMiembro(id(req.params.id), d, req.usuario!))
})

// ─── Administración: insumos y costos ────────────────────────────────────
api.get('/admin/costos', admin, async (_req, res) => {
  res.json(await carta.costos())
})

const datosInsumo = z.object({
  nombre: texto(60),
  costoCompra: centimos,
  presentacion: texto(40),
  cantidadCompra: z.number().positive().max(1_000_000),
  unidad: texto(10),
})

api.post('/admin/insumos', admin, async (req, res) => {
  res.json(await carta.crearInsumo(datosInsumo.parse(req.body)))
})

api.patch('/admin/insumos/:id', admin, async (req, res) => {
  res.json(await carta.actualizarInsumo(id(req.params.id), datosInsumo.partial().parse(req.body)))
})

api.delete('/admin/insumos/:id', admin, async (req, res) => {
  await carta.borrarInsumo(id(req.params.id))
  res.json({ ok: true })
})
