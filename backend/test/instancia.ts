// Solo para pruebas: procesos separados y corte real dentro de una escritura.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { crearApp } from '../src/app.js'
import { exigir, sucursalDe } from '../src/servicios/auth.js'
import { ejecutarEscritura } from '../src/servicios/idempotencia.js'
import { enviarACocina } from '../src/servicios/pedidos.js'

const app = express()
app.use(express.json())
app.post('/api/prueba/caida', exigir('MOZO'), async (req, res) => ejecutarEscritura(req, res, async () => {
  const pedido = await enviarACocina(sucursalDe(req), req.body.mesaId, req.usuario!, { lineas: req.body.lineas })
  if (process.env.PRUEBA_CAIDA === '1') {
    process.send?.({ tipo: 'sin-confirmar' })
    await new Promise(() => {})
  }
  res.json(pedido)
}))
app.use(crearApp({ servirWeb: false }))
const servidor = createServer(app)
servidor.listen(0, '127.0.0.1', () => process.send?.({ tipo: 'lista', base: new URL(process.env.DATABASE_URL!).pathname, url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}` }))
