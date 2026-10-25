# Verificación de pagos compartidos — 25 de octubre de 2026

Validación sobre una base local exclusiva de pruebas, sin escribir ventas ni cobros
en la base de producción. Node 22.23.3 y el mismo `api/index.js` que usa Vercel.

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | Frontend y backend correctos |
| `SINCRONIZACION=consulta DB_CONEXIONES=2 npm test` | **97 pruebas correctas**, 0 fallos |
| `npm run test:vercel` | **22 pruebas correctas**, escritorio y celular, con dos instancias independientes |
| Build de Vercel | Incluido en `test:vercel`, correcto |
| Migraciones necesarias para este cambio | **Ninguna**; se reutilizan `Pago.monto` y `Pago.recibido` |

Casos comprobados:

- S/15 con S/200 y S/26 con S/30 guardan dos efectivos distintos y vueltos S/185 y S/4.
- Una mesa de S/85 se paga con aportes de S/48, S/22 y S/15, mezclando efectivo y Yape.
- El efectivo sobrante de una persona no cubre la parte que falta asignar a otra.
- Se rechazan importes que superan el total, dinero recibido insuficiente, pagos electrónicos
  con vuelto, medios desconocidos y datos incompletos, sin guardar un cobro parcial.
- Se admiten 30 aportes, incluso repitiendo el medio. El arqueo suma lo aplicado a la cuenta.
- Corrección y comprobante conservan el importe, lo recibido y el vuelto de cada pago.
- Tres cobros simultáneos con la misma clave no duplican las ventas ni sus pagos.
- En escritorio y celular se pierde la primera respuesta después del COMMIT: el reintento
  recupera el cobro y conserva exactamente sus tres pagos, sin duplicarlos.
- Las pestañas de la versión anterior pueden terminar un cobro con su formato anterior.
- Continúan pasando los casos existentes de cocina compartida, caja, reportes, permisos,
  sincronización, pérdida de conexión y caída de todas las funciones.

## Verificación anterior — 20 de octubre de 2026

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

## Comprobación en la nube

Estas pruebas usan un emulador local con dos procesos y el mismo `api/index.js`
que se empaqueta para Vercel. El primer despliegue se publicó y verificó el 20 de
octubre en `https://shawarma-wasi.vercel.app`, con 26 comprobaciones en la nube.
Cada actualización debe volver a comprobar `/salud`, las rutas y el despliegue activo.
Las simulaciones de pagos de esta actualización se ejecutan en la base local de pruebas.
Los límites y la disponibilidad de los planes gratuitos dependen de los proveedores.

Pasos y variables: [DESPLIEGUE.md](DESPLIEGUE.md).
