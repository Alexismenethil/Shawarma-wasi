// Compila la API a un solo archivo JavaScript (dist/index.js) para producción.
// Las dependencias quedan afuera (se instalan con npm); el paquete @wasi/shared,
// que es TypeScript del mismo repositorio, va adentro.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const externas = Object.keys(pkg.dependencies).filter((d) => d !== '@wasi/shared')

await build({
  entryPoints: [new URL('../src/index.ts', import.meta.url).pathname],
  outfile: new URL('../dist/index.js', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: externas,
  sourcemap: true,
  logLevel: 'info',
})
