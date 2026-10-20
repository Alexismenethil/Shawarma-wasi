// Compila la API a un solo archivo JavaScript (dist/index.js) para producción, y
// la herramienta de contraseñas (dist/clave.js) para usarla en el servidor, donde
// no está tsx. Las dependencias quedan afuera (se instalan con npm); el paquete
// @wasi/shared, que es TypeScript del mismo repositorio, va adentro.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const externas = Object.keys(pkg.dependencies).filter((d) => d !== '@wasi/shared')

await build({
  entryPoints: {
    index: new URL('../src/index.ts', import.meta.url).pathname,
    vercel: new URL('../src/vercel.ts', import.meta.url).pathname,
    clave: new URL('./clave.ts', import.meta.url).pathname,
  },
  outdir: new URL('../dist', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: externas,
  sourcemap: true,
  logLevel: 'info',
})
