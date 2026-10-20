import { attachDatabasePool } from '@vercel/functions'
import { pool } from './db.js'
import { crearApp } from './app.js'

// Vercel suspende instancias entre peticiones: libera las conexiones inactivas.
attachDatabasePool(pool)

// Sin listen(), sockets, temporizadores de mantenimiento ni migraciones al atender.
export default crearApp({ servirWeb: false })
