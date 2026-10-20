import { createServer } from 'node:http'
import handler from '../api/index.js'

const servidor = createServer(handler)
servidor.listen(0, '127.0.0.1', () => process.send?.({ puerto: servidor.address().port }))
