# Verificación para Vercel y Neon — 20 de octubre de 2026

Validación local con Node **22.23.3**, PostgreSQL local y Google Chrome.

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | Correcto en frontend y backend |
| API en modo consulta con pool de 2 conexiones | **90 pruebas correctas**, 0 fallos |
| `npm run test:vercel` | **20 pruebas de navegador correctas**, escritorio y celular |
| `npm run test:e2e` | **17 correctas** en servidor tradicional; las 3 exclusivas de Vercel se omiten en este modo |
| `npm run build:vercel` | Compilación de frontend, API y entrada de Vercel correcta |
| Prisma | Esquema válido; las 7 migraciones se aplicaron sobre la base de pruebas |
| `npm audit` | **0 vulnerabilidades reportadas** |
| Configuración de Vercel | Esquema y transformación de rutas comprobados con las herramientas oficiales |
| Empaquetado con `@vercel/node` | 728 archivos, cliente generado de Prisma incluido, 0 archivos privados detectados |

## Pruebas de recuperación y concurrencia

- Dos procesos independientes leen y escriben en la misma base, sin compartir memoria.
- Doce envíos simultáneos con la misma clave guardan un único pedido y devuelven la misma respuesta.
- Una respuesta perdida después del COMMIT se recupera con un reintento automático en el navegador.
- Se mata una instancia con SIGKILL en medio de una escritura: la transacción se revierte y la misma clave puede completar la operación desde otra instancia.
- Los avisos y las respuestas confirmadas sobreviven a un reinicio.
- La caída de ambas instancias muestra desconexión; al arrancar otras, la pantalla vuelve a sincronizar sin recargarse.
- Un corte de internet conserva el borrador y permite guardarlo después de reconectar, incluso tras recargar la página.
- Ocho egresos simultáneos no gastan el mismo saldo; no se puede quitar un ingreso cuyo efectivo ya se usó.
- Cobrar y anular simultáneamente una nota produce una única resolución coherente.
- Dos altas simultáneas no pueden asignar el mismo PIN a distintas personas o sucursales.
- Los intentos fallidos de acceso se comparten entre procesos y sobreviven a un reinicio.
- Una sesión desactivada y una carta editada se ven inmediatamente desde la otra instancia.
- El endpoint de sincronización exige sesión y respeta la sucursal; la limpieza requiere el secreto del cron.
- El comprobador de despliegue rechaza URL de otra rama, conexiones sin SSL y secretos cortos, sin imprimir valores privados.

También se verificaron los flujos completos de mozo, cocina compartida, caja,
impresión, administración, reportes, permisos, sucursales y pantalla de celular.

## Comprobación pendiente en la nube

Estas pruebas usan un emulador local con dos procesos y el mismo `api/index.js`
que se empaqueta para Vercel. Todavía falta enlazar las cuentas, preparar la base
real de Neon y publicar en Vercel. Después se debe comprobar `/salud`, la conexión
SSL, la reactivación de Neon y los flujos con dos dispositivos en la URL real.
Los límites y la disponibilidad de los planes gratuitos dependen de los proveedores.

Pasos y variables: [DESPLIEGUE.md](DESPLIEGUE.md).
