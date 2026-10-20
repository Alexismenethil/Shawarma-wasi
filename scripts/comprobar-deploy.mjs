import { config } from 'dotenv'
config({ quiet: true })
const fallos = []
const url = (nombre) => {
  try {
    const u = new URL(process.env[nombre] ?? '')
    if (!u.hostname.endsWith('.neon.tech') || !['postgres:', 'postgresql:'].includes(u.protocol)) fallos.push(`${nombre} debe ser de PostgreSQL en Neon.`)
    if (!['require', 'verify-full', 'verify-ca'].includes(u.searchParams.get('sslmode'))) fallos.push(`${nombre} debe exigir SSL.`)
    return u
  } catch { fallos.push(`Falta ${nombre} o no es una URL válida.`); return null }
}
const pooled = url('DATABASE_URL')
const directa = url('DIRECT_URL')
if (pooled && !pooled.hostname.includes('-pooler.')) fallos.push('DATABASE_URL debe usar pooling (-pooler).')
if (directa?.hostname.includes('-pooler.')) fallos.push('DIRECT_URL debe ser directa (sin -pooler).')
if (pooled && directa && (pooled.hostname.replace('-pooler.', '.') !== directa.hostname || pooled.pathname !== directa.pathname)) fallos.push('Las dos URL deben apuntar a la misma base y rama.')
for (const nombre of ['JWT_SECRET', 'CRON_SECRET']) {
  const secreto = process.env[nombre] ?? ''
  if (secreto.length < 32 || secreto.startsWith('cambia-')) fallos.push(`${nombre} debe ser aleatorio y de al menos 32 caracteres.`)
}
if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.CRON_SECRET) fallos.push('Los dos secretos deben ser diferentes.')
if (fallos.length) { console.error(fallos.join('\n')); process.exit(1) }
console.log('Configuración válida para Vercel y Neon. No se imprimieron secretos ni se modificó la base.')
