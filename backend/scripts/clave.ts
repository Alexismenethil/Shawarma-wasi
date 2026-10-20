// Pone (o recupera) la contraseña de quien entra al panel, desde la consola
// del servidor: para el primer ingreso o cuando el dueño la olvidó.
//
//   npm run clave -w backend -- admin
//
// Si ese usuario no existe y no queda ningún administrador que pueda entrar,
// lo crea como administrador. Pide la contraseña sin mostrarla.
import { createInterface } from 'node:readline'
import { prisma } from '../src/db.js'
import { cifrar } from '../src/servicios/auth.js'

function preguntar(texto: string, oculta = false): Promise<string> {
  return new Promise((resolver) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (oculta) {
      // Lo que se escribe no se repite en pantalla.
      ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.startsWith(texto)) process.stdout.write(texto)
      }
    }
    rl.question(texto, (r) => {
      rl.close()
      if (oculta) process.stdout.write('\n')
      resolver(r)
    })
  })
}

const usuario = (process.argv[2] ?? (await preguntar('Usuario: '))).trim().toLowerCase()
if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) {
  console.error('El usuario va en minúsculas, sin espacios (3 a 30 letras o números).')
  process.exit(1)
}

const existente = await prisma.usuario.findUnique({ where: { usuario } })
const puedenEntrar = await prisma.usuario.count({ where: { rol: 'ADMIN', activo: true, claveHash: { not: null } } })
if (!existente && puedenEntrar > 0) {
  console.error(`No existe el usuario «${usuario}». Créalo desde Administración → Equipo.`)
  process.exit(1)
}

const clave = await preguntar('Contraseña nueva (mínimo 8): ', true)
if (clave.length < 8) {
  console.error('Muy corta: al menos 8 caracteres.')
  process.exit(1)
}
if ((await preguntar('Repítela: ', true)) !== clave) {
  console.error('No coinciden.')
  process.exit(1)
}

if (existente) {
  await prisma.usuario.update({ where: { id: existente.id }, data: { claveHash: cifrar(clave), activo: true } })
  console.log(`Listo: «${usuario}» ya entra con su contraseña nueva.`)
} else {
  // Sin nadie que pueda entrar al panel: el primer administrador sin contraseña la recibe, o se crea uno.
  const sinClave = await prisma.usuario.findFirst({ where: { rol: 'ADMIN', claveHash: null }, orderBy: { id: 'asc' } })
  if (sinClave) await prisma.usuario.update({ where: { id: sinClave.id }, data: { usuario, claveHash: cifrar(clave), activo: true } })
  else await prisma.usuario.create({ data: { nombre: 'Administración', rol: 'ADMIN', usuario, claveHash: cifrar(clave) } })
  console.log(`Listo: el administrador entra con el usuario «${usuario}».`)
}
await prisma.$disconnect()
