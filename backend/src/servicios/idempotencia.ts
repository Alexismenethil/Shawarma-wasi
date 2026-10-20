import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { enTransaccion, prisma } from '../db.js'
import { ErrorNegocio } from '../errores.js'
import { guardarAvisos } from './sincronizacion.js'
import { emitirConfirmados } from '../tiempo-real.js'

const FORMATO = /^[A-Za-z0-9:_-]{8,120}$/

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar)
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordenar(v)]))
  return valor
}

/**
 * El dato de negocio y la respuesta de reintento se confirman juntos, antes
 * de enviar un byte. Un corte antes del COMMIT revierte todo; después, otra
 * instancia recupera exactamente la misma respuesta. Sin trabajo en segundo plano.
 */
export async function ejecutarEscritura(req: Request, res: Response, trabajo: () => unknown) {
  const enviada = req.get('idempotency-key')
  if (enviada && !FORMATO.test(enviada)) throw new ErrorNegocio('La clave del envío no es válida.')
  const clave = enviada ? `${req.usuario!.id}:${enviada}` : null
  const ruta = `${req.method} ${req.originalUrl}`.slice(0, 200)
  const huella = createHash('sha256').update(JSON.stringify(ordenar({ ruta, cuerpo: req.body ?? null, sucursal: req.sucursalId ?? null }))).digest('hex')
  const json = res.json.bind(res)
  try {
    const resultado = await enTransaccion(async () => {
      if (clave) {
        await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`
        const previa = await prisma.idempotencia.findUnique({ where: { clave } })
        if (previa) {
          if (previa.ruta !== ruta || (previa.huella && previa.huella !== huella)) throw new ErrorNegocio('Esa clave de envío ya se usó para otra cosa.', 422)
          if (previa.estado === null) throw new ErrorNegocio('Ese envío está pendiente de revisión. No lo repitas con otra clave.', 409)
          return { estado: previa.estado, cuerpo: previa.respuesta, avisos: [] }
        }
      }
      let respondio = false
      let cuerpo: unknown
      res.json = (datos?: unknown) => {
        respondio = true
        // Captura exactamente lo que recibirá la tablet, incluidas las fechas.
        cuerpo = datos === undefined ? null : JSON.parse(JSON.stringify(datos))
        return res
      }
      await trabajo()
      if (!respondio) throw new Error('La operación terminó sin respuesta JSON.')
      const estado = res.statusCode
      if (estado >= 400) throw new ErrorNegocio((cuerpo as { error?: string })?.error ?? 'No se pudo guardar.', estado)
      const avisos = await guardarAvisos()
      if (clave) await prisma.idempotencia.create({ data: {
        clave, ruta, huella, estado,
        respuesta: cuerpo === null ? Prisma.JsonNull : cuerpo as Prisma.InputJsonValue,
      } })
      return { estado, cuerpo, avisos }
    })
    res.json = json
    emitirConfirmados(resultado.avisos)
    res.status(resultado.estado).json(resultado.cuerpo)
  } finally {
    res.json = json
  }
}

export async function limpiarIdempotencia() {
  await prisma.idempotencia.deleteMany({ where: { creadoEn: { lt: new Date(Date.now() - 2 * 86_400_000) } } })
}
