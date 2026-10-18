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
    if (error.code === 'P2025') return void res.status(404).json({ error: 'Eso ya no existe: recarga la pantalla.' })
    if (error.code === 'P2002') return void res.status(409).json({ error: 'Ya existe un registro con ese dato.' })
    if (error.code === 'P2003') return void res.status(409).json({ error: 'Está en uso y no se puede borrar.' })
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
