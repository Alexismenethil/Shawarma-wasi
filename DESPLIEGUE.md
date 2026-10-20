# Pruebas en Vercel Hobby + Neon Free

Un proyecto de Vercel entrega el frontend por CDN y la API por una función Node 22.
Una base PostgreSQL de Neon guarda pedidos, cobros, avisos y reintentos. No necesita
Render, Redis, otro servidor ni un servicio de WebSocket.

La sincronización en este despliegue usa una consulta cada 3 segundos por pestaña
visible y con sesión. Al ocultarla se pausa; al volver, recupera los cambios. Los
avisos se conservan 24 horas; después de ese plazo se recarga el estado completo.
Una desconexión no confirma un cobro: solo se muestra como guardado tras confirmarse
la transacción. Operación, avisos y respuesta del reintento se guardan juntos.

## 1. Crear la base de pruebas

En Neon, crea un proyecto **Free** en **AWS US East (N. Virginia)**. Conserva el ajuste
de suspensión por inactividad. Usa una base o rama exclusiva para estas pruebas;
no compartas datos de producción con los despliegues de preview.

En **Connect** copia dos cadenas de conexión, conservando sus parámetros SSL:

- **DATABASE_URL**: conexión con pooling (el host contiene `-pooler`). La usa la API.
- **DIRECT_URL**: conexión directa, sin `-pooler`. La usa Prisma para migraciones.

Ambas deben apuntar a la misma base y rama. Las migraciones configuran UTC en esa
base; no agregues `options=-c...` a la URL del pooler.

## 2. Preparar tablas y cuentas desde tu equipo

Usa Node 22. Instala las dependencias con `npm ci --include=dev`. Copia `.env.example`
a un archivo local privado, por ejemplo `.env.local`, y completa ambas URL, un
`JWT_SECRET` aleatorio, un `CRON_SECRET` diferente y las credenciales iniciales.
Genera cada secreto por separado:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

El archivo privado se carga explícitamente con `--env-file` (estas variables tienen
prioridad sobre el `.env` de desarrollo). No pegues claves reales en esta guía,
GitHub ni variables que empiecen por `VITE_`.

```bash
node --env-file=.env.local scripts/comprobar-deploy.mjs
node --env-file=.env.local backend/scripts/preparar-deploy.mjs
```

El segundo comando ejecuta **migraciones y semilla**, sin borrar la base. La semilla
es conservadora: no reemplaza una carta ni cuentas ya existentes. Escribe las
credenciales iniciales en `cuentas-<base>.local.md`, excluido de Git y de los paquetes
de despliegue. Conserva ese archivo privado. No cargues la demo sobre datos reales.

Para despliegues posteriores que traigan migraciones:

```bash
node --env-file=.env.local backend/scripts/preparar-deploy.mjs --solo-migraciones
```

Las migraciones se ejecutan una vez antes de publicar el código que las usa. No se
aplican al atender una petición ni automáticamente en builds de preview. Si una
migración falla, no publiques esa versión.

## 3. Crear el proyecto de Vercel

Importa el repositorio de GitHub en tu cuenta personal **Hobby**. Configura:

| Campo | Valor |
|---|---|
| Root Directory | Raíz del repositorio, sin elegir frontend ni backend |
| Framework Preset | Other |
| Node.js | 22.x |
| Install Command | `npm ci --include=dev` |
| Build Command | `npm run build:vercel` |
| Output Directory | `frontend/dist` |
| Región de funciones | Washington, D.C. (`iad1`) |
| Fluid Compute | Activado |

`vercel.json` ya declara estos comandos, las rutas, las cabeceras y la limpieza
diaria. El frontend llama al mismo dominio; deja `VITE_API_EXTERNA` sin configurar.

Añade estas variables **del servidor** al entorno **Production** de Vercel:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | URL pooled de la base de pruebas de Neon |
| `JWT_SECRET` | El secreto aleatorio creado antes (mínimo 32 caracteres) |
| `CRON_SECRET` | Otro secreto aleatorio (mínimo 32 caracteres) |
| `SINCRONIZACION` | `consulta` |
| `DB_CONEXIONES` | `2` |

`DIRECT_URL` y las credenciales `SEED_*` son necesarias en tu equipo para preparar
la base; no hace falta subirlas a la función. Vercel proporciona `VERCEL=1` y el
sistema rechaza el modo socket en ese entorno. Los previews solo deben habilitarse
con otra base/rama y otro `JWT_SECRET`, o no tendrán acceso a la API. No reutilices
secretos de producción en previews de código que no hayas revisado.

Pulsa **Deploy**. Abre `/salud`: debe responder `{"ok":true}`. Comprueba entrada de
administración, sucursal, mozo, cocina y caja usando dos dispositivos/pestañas.
No consideres validado el servicio en la nube hasta completar estas comprobaciones.

## Pruebas antes de publicar

```bash
npm run typecheck
npm test                 # API, sucursales, caja y procesos independientes
npm run test:vercel      # navegador con dos instancias de la función real
npm run test:e2e         # compatibilidad con servidor Node tradicional
npm audit
```

Las pruebas usan una base local terminada en `_test`, que se reconstruye. Nunca se
les da la URL real de Neon: el preparador rechaza bases remotas sin una autorización
explícita mediante TEST_DATABASE_URL y un nombre terminado en `_test`.

`test:vercel` emula localmente CDN + dos procesos separados usando el mismo
`api/index.js` que Vercel empaqueta. Comprueba los flujos completos y la recuperación
sin depender de una única memoria. No sustituye una comprobación posterior en Vercel.

## Caídas, espacio y costos

- Una respuesta perdida se reintenta con la misma clave. La operación y su respuesta
  se confirman en la misma transacción. Una caída antes del COMMIT revierte ambas;
  una caída después permite repetir la respuesta desde otra instancia. Las claves
  se conservan dos días. No uses pruebas de desconexión de varios días para simular
  la garantía de un reintento inmediato.
- Los borradores no enviados quedan en el dispositivo. Las pantallas vuelven a pedir
  datos después de una reconexión y realizan una reconciliación periódica.
- Los bloqueos de acceso se comparten en la base. Las escrituras tienen límites de
  espera y las sesiones desactivadas se comprueban en cada petición en Vercel.
- El cron de Hobby corre una vez al día y elimina avisos viejos, intentos antiguos y
  respuestas de reintento vencidas. Vercel envía `Authorization: Bearer CRON_SECRET`.
- No añadas monitores que llamen a `/salud` cada minuto: cada llamada consulta Neon y
  puede mantener la base despierta, consumiendo su cuota gratuita.
- Una pestaña visible consulta cambios unas 1 200 veces por hora. Úsalo para pruebas
  con pocos dispositivos, cierra pestañas al terminar y revisa **Usage** en Vercel y
  Neon. Free no significa recursos ilimitados ni disponibilidad garantizada.
- Vercel Hobby es para uso personal no comercial. Antes de entregar para operar el
  restaurante, revisa el plan y el proveedor. Esta preparación no crea cuentas ni
  contrata servicios de pago.
- Revisa los límites vigentes de Neon y su ventana de restauración; guarda copias
  propias con `npm run db:respaldo` usando la conexión directa.

Referencias oficiales: [Vercel Hobby](https://vercel.com/docs/plans/hobby),
[Neon Free](https://neon.com/pricing),
[conexiones pooled](https://neon.com/docs/connect/connection-pooling),
[cron y secreto](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
