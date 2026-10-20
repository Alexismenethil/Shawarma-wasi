import { AsyncLocalStorage } from 'node:async_hooks'
import type { Prisma } from '@prisma/client'
import type { Cambio } from '@wasi/shared'

export interface AvisoPendiente {
  cambio: Cambio
  sucursalId?: number
  soloSucursal?: boolean
}

/** Una petición conserva su transacción incluso si otra comparte la instancia. */
export const contexto = new AsyncLocalStorage<{
  tx: Prisma.TransactionClient
  avisos: AvisoPendiente[]
}>()
