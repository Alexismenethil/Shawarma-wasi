import type { ErrorRequestHandler, RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'

/** Un error que se le puede mostrar tal cual a quien está en el local. */
export class ErrorNegocio extends Error {
  constructor(
    message: string,
    public estado = 400,
  ) {
    super(message)
  }
}

export const noEncontrado: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'No existe esa ruta.' })
}

export const manejarErrores: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ErrorNegocio) {
    res.status(error.estado).json({ error: error.message })
    return
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Datos incompletos o inválidos.', detalle: error.issues })
    return
  }
  // Dos pantallas a la vez: alguien edita o reordena lo que otro acaba de borrar.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const codigoSql = (error.meta as { code?: string } | undefined)?.code
    if (codigoSql && ['55P03', '57014', '40001', '40P01'].includes(codigoSql)) {
      return void res.status(503).json({ error: 'La operación está ocupada. Reintenta el mismo envío.' })
    }
    if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2034'].includes(error.code)) {
      return void res.status(503).json({ error: 'El servidor está recuperando la conexión. Vuelve a intentar con el mismo envío.' })
    }
    if (error.code === 'P2025') return void res.status(404).json({ error: 'Eso ya no existe: recarga la pantalla.' })
    if (error.code === 'P2002') return void res.status(409).json({ error: 'Ya existe un registro con ese dato.' })
    if (error.code === 'P2003') return void res.status(409).json({ error: 'Está en uso y no se puede borrar.' })
  }
  if (error instanceof Prisma.PrismaClientInitializationError || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes((error as { code?: string }).code ?? '')) {
    res.status(503).json({ error: 'No se pudo conectar con la base. Se puede reintentar el mismo envío.' })
    return
  }
  // JSON mal formado, cuerpo demasiado grande… (los errores del propio Express traen su estado).
  const estado = (error as { status?: number }).status
  if (typeof estado === 'number' && estado >= 400 && estado < 500) {
    res.status(estado).json({ error: estado === 413 ? 'Lo enviado es demasiado grande.' : 'La petición no es válida.' })
    return
  }
  console.error(error)
  res.status(500).json({ error: 'Algo falló en el servidor. Vuelve a intentar.' })
}
