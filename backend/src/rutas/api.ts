import { Router, type Request, type Response, type RequestHandler } from 'express'
import { ejecutarEscritura } from '../servicios/idempotencia.js'
import { leerCambios } from '../servicios/sincronizacion.js'
import { limpiarTemporales } from '../servicios/sincronizacion.js'
import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { env } from '../env.js'
import { z } from 'zod'
import { ESTACIONES, ROLES } from '@wasi/shared'
import { cambiarClave, exigir, ingresarConClave, ingresarConPin, sucursalDe } from '../servicios/auth.js'
import * as pedidos from '../servicios/pedidos.js'
import * as cocina from '../servicios/cocina.js'
import * as carta from '../servicios/carta.js'
import * as reportes from '../servicios/reportes.js'
import * as equipo from '../servicios/equipo.js'
import * as ajustes from '../servicios/ajustes.js'
import * as mesas from '../servicios/mesas.js'
import * as caja from '../servicios/caja.js'
import * as sucursales from '../servicios/sucursales.js'

export const api = Router()

/** Todas las escrituras autenticadas confirman datos, avisos y reintento juntos. */
function escribir(metodo: 'post' | 'patch' | 'put' | 'delete', ruta: string, permiso: RequestHandler, trabajo: (req: Request, res: Response) => unknown) {
  api[metodo](ruta, permiso, async (req, res) => ejecutarEscritura(req, res, () => trabajo(req, res)))
}

const id = (v: unknown) => z.coerce.number().int().positive().parse(v)
const centimos = z.number().int().min(0).max(10_000_00)
const texto = (max: number) => z.string().trim().min(1).max(max)
const opcional = (max: number) => z.string().trim().max(max).nullable()
const pin = z.string().regex(/^\d{4}$/)
const clave = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(72)
const usuario = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, 'El usuario va en minúsculas, sin espacios (3 a 30 letras o números).')
const ipDe = (req: Request) => {
  const vercel = req.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  return process.env.VERCEL === '1' ? (vercel && isIP(vercel) ? vercel : 'desconocida') : (req.ip ?? 'desconocida')
}
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida, se espera AAAA-MM-DD.')

/**
 * Quién entra a qué. El administrador pasa siempre; la encargada cubre
 * cualquier puesto de su sucursal; caja también anota (el mostrador).
 */
const enMozo = exigir('MOZO', 'CAJA', 'ENCARGADO')
const enCocina = exigir('COCINA', 'ENCARGADO')
const enCaja = exigir('CAJA', 'ENCARGADO')
const enPanel = exigir('ENCARGADO')
const soloAdmin = exigir('ADMIN')

// ─── Acceso ──────────────────────────────────────────────────────────────
api.post('/auth/ingresar', async (req, res) => {
  const d = z.object({ area: z.enum(['MOZO', 'COCINA', 'CAJA']), sucursalId: z.number().int().positive(), pin: z.string().regex(/^\d{4,8}$/) }).parse(req.body)
  res.json(await ingresarConPin(d.area, d.sucursalId, d.pin, ipDe(req)))
})

api.post('/auth/entrar', async (req, res) => {
  const d = z.object({ usuario: z.string().trim().min(1).max(40), clave: z.string().min(1).max(72) }).parse(req.body)
  res.json(await ingresarConClave(d.usuario, d.clave, ipDe(req)))
})

api.get('/cambios', exigir(), async (req, res) => {
  const desde = z.string().regex(/^\d{1,19}$/).optional().parse(req.query.desde)
  res.json(await leerCambios(desde, req.sucursalId ?? null))
})

api.get('/interno/limpiar', async (req, res) => {
  const recibida = Buffer.from(req.get('authorization') ?? '')
  const esperada = Buffer.from(`Bearer ${env.CRON_SECRET ?? ''}`)
  if (!env.CRON_SECRET || recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
    res.status(401).json({ error: 'Sin autorización.' })
    return
  }
  res.json(await limpiarTemporales())
})

api.get('/auth/yo', exigir(), (req, res) => {
  res.json(req.usuario)
})

escribir('post', '/auth/clave', enPanel, async (req, res) => {
  const d = z.object({ actual: z.string().min(1).max(72), nueva: clave }).parse(req.body)
  await cambiarClave(req.usuario!.id, d.actual, d.nueva)
  res.json({ ok: true })
})

/** El nombre del negocio, sus sucursales, cocinas y medios de pago: lo ve hasta la pantalla de entrada. */
api.get('/ajustes', async (_req, res) => {
  res.json(await ajustes.leerAjustes())
})

// ─── Mozo (y caja, que también anota) ────────────────────────────────────
api.get('/carta', exigir(), async (req, res) => {
  res.json(await carta.cartaParaMozo(sucursalDe(req)))
})

api.get('/mesas', exigir(), async (req, res) => {
  res.json(await pedidos.listarMesas(sucursalDe(req)))
})

api.get('/mesas/:id/pedido', enMozo, async (req, res) => {
  res.json(await pedidos.pedidoDeMesa(sucursalDe(req), id(req.params.id)))
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

escribir('post', '/mesas/:id/enviar', enMozo, async (req, res) => {
  const datos = z
    .object({ cliente: opcional(60).optional(), lineas: z.array(linea).min(1).max(60) })
    .parse(req.body)
  res.json(await pedidos.enviarACocina(sucursalDe(req), id(req.params.id), req.usuario!, datos))
})

api.get('/pedidos/:id', exigir(), async (req, res) => {
  res.json(await pedidos.obtenerPedido(sucursalDe(req), id(req.params.id)))
})

escribir('patch', '/pedidos/:id', enMozo, async (req, res) => {
  const { cliente } = z.object({ cliente: opcional(60) }).parse(req.body)
  res.json(await pedidos.cambiarCliente(sucursalDe(req), id(req.params.id), cliente))
})

escribir('post', '/pedidos/:id/servir', enMozo, async (req, res) => {
  const { itemIds } = z.object({ itemIds: z.array(z.number().int()).optional() }).parse(req.body ?? {})
  res.json(await pedidos.servir(sucursalDe(req), id(req.params.id), itemIds))
})

escribir('post', '/pedidos/:id/cuenta', enMozo, async (req, res) => {
  res.json(await pedidos.pedirCuenta(sucursalDe(req), id(req.params.id)))
})

escribir('post', '/pedidos/:id/mover', enMozo, async (req, res) => {
  const { mesaId } = z.object({ mesaId: z.number().int().positive() }).parse(req.body)
  res.json(await pedidos.moverPedido(sucursalDe(req), id(req.params.id), mesaId))
})

escribir('post', '/pedidos/:id/anular', enMozo, async (req, res) => {
  await pedidos.anularPedido(sucursalDe(req), id(req.params.id))
  res.json({ ok: true })
})

escribir('post', '/items/:id/anular', enMozo, async (req, res) => {
  res.json(await pedidos.anularItem(sucursalDe(req), id(req.params.id), req.usuario!))
})

// ─── Caja ────────────────────────────────────────────────────────────────
const pagosNota = z.object({ pagos: z.array(z.object({ metodo: texto(40), monto: centimos })).min(1).max(6) })

/** Cobrar es solo de caja: así todo el dinero entra en un arqueo. */
escribir('post', '/pedidos/:id/cobrar', enCaja, async (req, res) => {
  const { pagos } = pagosNota.parse(req.body)
  res.json(await pedidos.cobrar(sucursalDe(req), id(req.params.id), req.usuario!, pagos))
})

escribir('post', '/pedidos/:id/corregir-pago', enCaja, async (req, res) => {
  const { pagos } = pagosNota.parse(req.body)
  res.json(await pedidos.corregirPago(sucursalDe(req), id(req.params.id), pagos))
})

api.get('/caja', enCaja, async (req, res) => {
  res.json(await caja.estadoCaja(sucursalDe(req), req.usuario!))
})

escribir('post', '/caja/abrir', enCaja, async (req, res) => {
  const { montoInicial } = z.object({ montoInicial: centimos }).parse(req.body)
  res.json(await caja.abrirCaja(sucursalDe(req), req.usuario!, montoInicial))
})

const conteo = z.record(z.string().regex(/^\d+$/), z.number().int().min(0).max(100_000))

escribir('post', '/caja/cerrar', enCaja, async (req, res) => {
  const d = z
    .object({ contado: centimos, conteo: conteo.nullable().optional(), fondoSiguiente: centimos.nullable().optional(), observacion: opcional(200).optional() })
    .parse(req.body)
  res.json(await caja.cerrarCaja(sucursalDe(req), req.usuario!, d))
})

escribir('post', '/caja/:id/reabrir', enCaja, async (req, res) => {
  res.json(await caja.reabrirCaja(sucursalDe(req), req.usuario!, id(req.params.id)))
})

escribir('post', '/caja/movimientos', enCaja, async (req, res) => {
  const d = z.object({ tipo: z.enum(['INGRESO', 'EGRESO']), monto: centimos.min(1), concepto: texto(80) }).parse(req.body)
  await caja.registrarMovimiento(sucursalDe(req), req.usuario!, d)
  res.json({ ok: true })
})

escribir('delete', '/caja/movimientos/:id', enCaja, async (req, res) => {
  await caja.quitarMovimiento(sucursalDe(req), req.usuario!, id(req.params.id))
  res.json({ ok: true })
})

api.get('/caja/:id/cobros', enCaja, async (req, res) => {
  res.json(await caja.cobrosDeCaja(sucursalDe(req), id(req.params.id)))
})

// ─── Cocina ──────────────────────────────────────────────────────────────
const estacion = (v: unknown) => (v ? z.enum(ESTACIONES).parse(v) : undefined)

/** La hoja «Atención al Cliente»: lo pendiente y lo resuelto desde la última «Limpiar». */
api.get('/cocina', enCocina, async (req, res) => {
  const desde = typeof req.query.desde === 'string' ? req.query.desde : undefined
  res.json(await cocina.hojaCocina(sucursalDe(req), estacion(req.query.estacion), desde))
})

escribir('post', '/cocina/items/:id', enCocina, async (req, res) => {
  const { listo } = z.object({ listo: z.boolean() }).parse(req.body)
  await cocina.marcarItem(sucursalDe(req), id(req.params.id), listo)
  res.json({ ok: true })
})

escribir('post', '/cocina/comandas', enCocina, async (req, res) => {
  const d = z
    .object({ pedidoId: z.number().int(), ronda: z.number().int(), estacion: z.enum(ESTACIONES), listo: z.boolean() })
    .parse(req.body)
  await cocina.marcarComanda(sucursalDe(req), d.pedidoId, d.ronda, d.estacion, d.listo)
  res.json({ ok: true })
})

// ─── Panel: reportes ─────────────────────────────────────────────────────
// La encargada ve los de su sucursal; el administrador, los de la que elija o los de todas.

api.get('/reportes/dia', enPanel, async (req, res) => {
  const { fecha: dia } = z.object({ fecha: fecha.optional() }).parse(req.query)
  res.json(await reportes.reporteDia(dia, req.sucursalId ?? null))
})

api.get('/reportes/rango', enPanel, async (req, res) => {
  const { desde, hasta } = z.object({ desde: fecha, hasta: fecha }).parse(req.query)
  res.json(await reportes.reporteRango(desde, hasta, req.sucursalId ?? null))
})

api.get('/reportes/acumulado', soloAdmin, async (req, res) => {
  const { mes } = z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/, 'Mes inválido, se espera AAAA-MM.').optional() }).parse(req.query)
  res.json(await reportes.reporteAcumulado(mes ?? reportes.hoyEnLima().slice(0, 7), req.sucursalId ?? null))
})

const filtroConsolidado = z.object({
  desde: fecha,
  hasta: fecha,
  q: z.string().max(60).optional(),
  metodo: z.string().max(40).optional(),
})

/** Por páginas: el resumen cuenta todo lo filtrado, pero solo viaja la página pedida. */
api.get('/reportes/consolidado', soloAdmin, async (req, res) => {
  const f = filtroConsolidado
    .extend({ pagina: z.coerce.number().int().min(1).default(1), porPagina: z.coerce.number().int().min(10).max(500).default(100) })
    .parse(req.query)
  res.json(await reportes.consolidado({ ...f, sucursal: req.sucursalId ?? null }))
})

/** Todo lo filtrado, de una vez, como archivo para Excel. */
api.get('/reportes/consolidado.csv', soloAdmin, async (req, res) => {
  const f = filtroConsolidado.parse(req.query)
  res.setHeader('content-type', 'text/csv; charset=utf-8')
  res.setHeader('content-disposition', `attachment; filename="consolidado-${f.desde}-a-${f.hasta}.csv"`)
  res.send(await reportes.consolidadoCsv({ ...f, sucursal: req.sucursalId ?? null }))
})

/** El historial de turnos de caja, con su arqueo. */
api.get('/reportes/cajas', enPanel, async (req, res) => {
  const { desde, hasta } = z.object({ desde: fecha, hasta: fecha }).parse(req.query)
  res.json(await caja.listarCajas(desde, hasta, req.sucursalId ?? null))
})

api.get('/reportes/cajas/:id', enPanel, async (req, res) => {
  res.json(await caja.detalleCaja(req.sucursalId ?? null, id(req.params.id)))
})

// ─── Panel: carta ────────────────────────────────────────────────────────
// La carta es del administrador; la encargada solo marca lo agotado en su sucursal.

api.get('/admin/carta', enPanel, async (req, res) => {
  res.json(await carta.cartaAdmin(req.sucursalId ?? null))
})

const datosProducto = z.object({
  familiaId: z.number().int().positive(),
  codigo: opcional(12),
  variante: texto(60),
  nombre: texto(90),
  descripcion: opcional(140),
  precio: centimos,
  activo: z.boolean(),
  sucursalId: z.number().int().positive().nullable(),
})

escribir('post', '/admin/productos', soloAdmin, async (req, res) => {
  const d = datosProducto
    .pick({ familiaId: true, variante: true, precio: true })
    .extend({
      nombre: z.string().trim().max(90).optional(),
      codigo: opcional(12).optional(),
      descripcion: opcional(140).optional(),
      sucursalId: z.number().int().positive().nullable().optional(),
    })
    .parse(req.body)
  res.json(await carta.crearProducto(d))
})

escribir('patch', '/admin/productos/:id', soloAdmin, async (req, res) => {
  res.json(await carta.actualizarProducto(id(req.params.id), datosProducto.partial().parse(req.body)))
})

/** Lo propio de un producto en la sucursal elegida: precio y si se ofrece (administrador), agotado (también la encargada). */
escribir('put', '/admin/productos/:id/sucursal', enPanel, async (req, res) => {
  const esAdmin = req.usuario!.rol === 'ADMIN'
  const d = (esAdmin ? z.object({ precio: centimos.nullable(), oculto: z.boolean(), agotado: z.boolean() }).partial() : z.object({ agotado: z.boolean() }))
    .strict()
    .parse(req.body)
  res.json(await carta.ajustarEnSucursal(id(req.params.id), sucursalDe(req), d))
})

escribir('delete', '/admin/productos/:id', soloAdmin, async (req, res) => {
  await carta.borrarProducto(id(req.params.id))
  res.json({ ok: true })
})

escribir('put', '/admin/productos/:id/receta', soloAdmin, async (req, res) => {
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

escribir('post', '/admin/familias', soloAdmin, async (req, res) => {
  res.json(await carta.crearFamilia(datosFamilia.omit({ activa: true }).parse(req.body)))
})

escribir('patch', '/admin/familias/:id', soloAdmin, async (req, res) => {
  res.json(await carta.actualizarFamilia(id(req.params.id), datosFamilia.partial().parse(req.body)))
})

escribir('delete', '/admin/familias/:id', soloAdmin, async (req, res) => {
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

escribir('post', '/admin/adicionales', soloAdmin, async (req, res) => {
  const d = datosAdicional.pick({ nombre: true, precio: true }).extend({
    codigo: opcional(12).optional(),
    estaciones: z.array(z.enum(ESTACIONES)).max(3).optional(),
  })
  res.json(await carta.crearAdicional(d.parse(req.body)))
})

escribir('patch', '/admin/adicionales/:id', soloAdmin, async (req, res) => {
  res.json(await carta.actualizarAdicional(id(req.params.id), datosAdicional.partial().parse(req.body)))
})

escribir('delete', '/admin/adicionales/:id', soloAdmin, async (req, res) => {
  await carta.borrarAdicional(id(req.params.id))
  res.json({ ok: true })
})

api.get('/admin/detalles', soloAdmin, async (_req, res) => {
  res.json(await ajustes.listarDetalles())
})

escribir('post', '/admin/detalles', soloAdmin, async (req, res) => {
  const { nombre } = z.object({ nombre: texto(40) }).parse(req.body)
  res.json(await ajustes.crearDetalle(nombre))
})

escribir('patch', '/admin/detalles/:id', soloAdmin, async (req, res) => {
  const d = z.object({ nombre: texto(40), activo: z.boolean() }).partial().parse(req.body)
  res.json(await ajustes.actualizarDetalle(id(req.params.id), d))
})

escribir('delete', '/admin/detalles/:id', soloAdmin, async (req, res) => {
  await ajustes.borrarDetalle(id(req.params.id))
  res.json({ ok: true })
})

/** Guarda el orden de una lista (familias, productos, adicionales, medios, detalles). */
escribir('put', '/admin/orden', soloAdmin, async (req, res) => {
  const { que, ids } = z
    .object({
      que: z.enum(['familia', 'producto', 'adicional', 'medioPago', 'detalle']),
      ids: z.array(z.number().int().positive()).min(1).max(500),
    })
    .parse(req.body)
  await ajustes.ordenar(que, ids)
  res.json({ ok: true })
})

// ─── Panel: el negocio, las sucursales y los pagos ───────────────────────
escribir('patch', '/admin/ajustes', soloAdmin, async (req, res) => {
  const d = z
    .object({
      nombre: texto(40),
      subtitulo: z.string().trim().max(60),
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

api.get('/admin/sucursales', soloAdmin, async (_req, res) => {
  res.json(await sucursales.listarSucursales())
})

escribir('post', '/admin/sucursales', soloAdmin, async (req, res) => {
  const d = z
    .object({
      nombre: texto(40),
      direccion: z.string().trim().max(120).default(''),
      telefono: z.string().trim().max(30).default(''),
      mesas: z.number().int().min(0).max(80).default(10),
      llevar: z.number().int().min(0).max(40).default(5),
    })
    .parse(req.body)
  res.json(await sucursales.crearSucursal(d))
})

escribir('patch', '/admin/sucursales/:id', soloAdmin, async (req, res) => {
  const d = z
    .object({
      nombre: texto(40),
      direccion: z.string().trim().max(120),
      telefono: z.string().trim().max(30),
      activa: z.boolean(),
      // Temporal: qué cocinas manda a la de otra sucursal (null = cocina propia).
      cocinaCompartida: z
        .object({ en: z.number().int().positive(), estaciones: z.array(z.enum(ESTACIONES)).max(ESTACIONES.length).transform((e) => [...new Set(e)]) })
        .nullable(),
    })
    .partial()
    .parse(req.body)
  res.json(await sucursales.actualizarSucursal(id(req.params.id), d))
})

// Las mesas son de cada sucursal: la encargada maneja las suyas.
api.get('/admin/mesas', enPanel, async (req, res) => {
  res.json(await mesas.listarMesasAdmin(sucursalDe(req)))
})

/** Una mesa con su número, o varias de una vez (las siguientes libres) en una sola transacción. */
escribir('post', '/admin/mesas', enPanel, async (req, res) => {
  const d = z
    .object({ tipo: z.enum(['SALON', 'LLEVAR']), numero: z.number().int().min(1).max(999).optional(), cantidad: z.number().int().min(1).max(50).optional() })
    .parse(req.body)
  const s = sucursalDe(req)
  res.json(d.numero ? await mesas.crearMesa(s, d.tipo, d.numero) : await mesas.crearMesas(s, d.tipo, d.cantidad ?? 1))
})

escribir('patch', '/admin/mesas/:id', enPanel, async (req, res) => {
  const d = z.object({ numero: z.number().int().min(1).max(999), activa: z.boolean() }).partial().parse(req.body)
  res.json(await mesas.actualizarMesa(sucursalDe(req), id(req.params.id), d))
})

escribir('delete', '/admin/mesas/:id', enPanel, async (req, res) => {
  await mesas.borrarMesa(sucursalDe(req), id(req.params.id))
  res.json({ ok: true })
})

api.get('/admin/medios', soloAdmin, async (_req, res) => {
  res.json(await ajustes.listarMedios())
})

escribir('post', '/admin/medios', soloAdmin, async (req, res) => {
  res.json(await ajustes.crearMedio(z.object({ nombre: texto(40), efectivo: z.boolean() }).parse(req.body)))
})

escribir('patch', '/admin/medios/:id', soloAdmin, async (req, res) => {
  const d = z.object({ nombre: texto(40), efectivo: z.boolean(), activo: z.boolean() }).partial().parse(req.body)
  res.json(await ajustes.actualizarMedio(id(req.params.id), d))
})

escribir('delete', '/admin/medios/:id', soloAdmin, async (req, res) => {
  await ajustes.borrarMedio(id(req.params.id))
  res.json({ ok: true })
})

// ─── Panel: equipo ───────────────────────────────────────────────────────
// La encargada agrega y edita a mozos, cocina y caja de su sucursal; el administrador, a todos.

const datosMiembro = z.object({
  nombre: z.string().trim().min(2).max(40),
  rol: z.enum(ROLES),
  sucursalId: z.number().int().positive().nullable(),
  // El teclado del local es de cuatro cifras.
  pin,
  usuario,
  clave,
  activo: z.boolean(),
})

api.get('/admin/equipo', enPanel, async (req, res) => {
  res.json(await equipo.listarEquipo(req.usuario!, req.sucursalId ?? null))
})

escribir('post', '/admin/equipo', enPanel, async (req, res) => {
  const d = datosMiembro.omit({ activo: true }).partial({ sucursalId: true, pin: true, usuario: true, clave: true }).parse(req.body)
  res.json(await equipo.crearMiembro(req.usuario!, d))
})

escribir('patch', '/admin/equipo/:id', enPanel, async (req, res) => {
  res.json(await equipo.actualizarMiembro(req.usuario!, id(req.params.id), datosMiembro.partial().parse(req.body)))
})

// ─── Panel: insumos y costos ─────────────────────────────────────────────
api.get('/admin/costos', soloAdmin, async (_req, res) => {
  res.json(await carta.costos())
})

const datosInsumo = z.object({
  nombre: texto(60),
  costoCompra: centimos,
  presentacion: texto(40),
  cantidadCompra: z.number().positive().max(1_000_000),
  unidad: texto(10),
})

escribir('post', '/admin/insumos', soloAdmin, async (req, res) => {
  res.json(await carta.crearInsumo(datosInsumo.parse(req.body)))
})

escribir('patch', '/admin/insumos/:id', soloAdmin, async (req, res) => {
  res.json(await carta.actualizarInsumo(id(req.params.id), datosInsumo.partial().parse(req.body)))
})

escribir('delete', '/admin/insumos/:id', soloAdmin, async (req, res) => {
  await carta.borrarInsumo(id(req.params.id))
  res.json({ ok: true })
})
