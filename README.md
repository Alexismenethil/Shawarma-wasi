# Shawarma Wasi

Sistema del negocio, para todas sus sucursales: **mozo** (mesas y nota de pedido),
**cocina** (tres estaciones), **caja** (cobro, apertura, arqueo y cierre) y
**administración** (el dueño ve todas las sucursales; la encargada, la suya). Sale de
la *Nota de Pedidos* en Excel que está en `doc/`: cada hoja de ese libro tiene su lugar aquí.

| Excel | Sistema |
|---|---|
| Hojas `M1…M25` y `L1…L10` | El libro del mozo: una hoja por mesa con sus pestañas al pie, más la hoja «Mesas» con todas a la vista. Cada sucursal tiene las suyas |
| Nota de pedido: Cant · Producto · Adicional · Detalle · Obs · Precio · PAdic · Subtotal | La misma planilla con desplegables; Subtotal = Cant × (Precio + PAdic), en rosa mientras la fila está vacía |
| Columna «A» (agregado) | Automática: lo que se pide después del primer envío lleva la «A» en la nota y en cocina |
| Estado «Nota de Pedido / Pendiente / Atendido» | Por plato: Pendiente (menta) → Atendido (rosa) → Servido; Anulado en ámbar |
| Tipo y Monto de Pago, Vuelto / Debe | El mismo pie de nota, en **Caja**: solo caja cobra. El mozo, en su lugar, pide la cuenta |
| Botones «Limpiar» y «Guardar» | Limpiar borra lo anotado sin guardar; Guardar manda a cocina (y en caja, si se llenó el pago, cobra) |
| `Productos` | Administración → Carta y precios → Productos (167 productos, 25 familias) |
| `Adicional` | Administración → Carta y precios → Adicionales |
| `Detalle` (M:/L: Corte 2 =, 2 ≠, 3 =, Individual) | Administración → Carta y precios → Detalles; la nota los ofrece con M: y L: |
| `Pedidos` / `Entregas` («Atención al Cliente») | La cocina: la misma hoja por estación, con su desplegable de estado y «Limpiar» |
| `Arqueo` + `Resumen` | Caja → Arqueo y cierre (cada turno, con el conteo billete por billete); Administración → Cajas y arqueos, Reporte diario e Inicio |
| `VentasFecha` + `Tendencia` | Administración → Ventas por fecha |
| `Preferencias` | Administración → Preferencias |
| `Acumulado` | Administración → Acumulado del mes (producto × día) |
| `Consolidado` + `Filtro_Pref` | Administración → Consolidado (se descarga para Excel) |
| `Costos` + `Insumos` | Administración → Insumos y costos (insumos, recetas y márgenes) |

## Cómo correrlo

Requisitos: Node 22 y Docker.

```bash
npm install
cp .env.example .env        # y cambia JWT_SECRET, los PIN y la contraseña
npm run db:up               # Postgres 17 en Docker (puerto 5434)
npm run db:migrate          # crea las tablas
npm run db:seed             # carta, las tres sucursales con sus mesas y sus cuentas
npm run dev                 # API en :4310 y web en :5190
```

Abre <http://localhost:5190>. En una base nueva, la semilla crea las sucursales **Plaza
More** y **Plaza San Cristóbal** (con la cocina compartida, ver abajo) y la **Sucursal 3**
apagada hasta que abra, cada una con 25 mesas y 10 para llevar, su encargado (usuario y
contraseña al azar) y un mozo, una cocina y una caja de prueba con su PIN: los de Plaza
More salen del `.env` (`SEED_PIN_MOZO`, `SEED_PIN_COCINA`, `SEED_PIN_CAJA`) y las demás
reciben otros al azar, porque ningún PIN se repite entre sucursales. El dueño entra con
`SEED_ADMIN_USUARIO` y `SEED_ADMIN_CLAVE`. Todas las cuentas quedan en
`cuentas-<base>.local.md`, en la raíz del proyecto: es privado (git y Docker lo ignoran) y
se entrega a cada quien lo suyo. Nombres, mesas y personal se cambian luego en el panel:
la lista de sucursales iniciales está al comienzo de `backend/prisma/seed.ts`.

Después, el personal se arma en **Administración → Equipo**: cada persona entra con su
propio PIN de cuatro cifras en la tablet de su sucursal (lo usual: los últimos 4 dígitos
de su DNI). **Un PIN es de una sola persona activa en todo el negocio, ni entre sucursales
se repite**, y la entrada lo busca solo en la sucursal elegida: con la sucursal equivocada
en la tablet nadie entra como otra persona (avisa «PIN incorrecto» y que revise la
sucursal). Si dos DNI terminan igual, al segundo se le da otro PIN. La nota dice quién
atendió y quién cobró, y desactivar a alguien le cierra la sesión al instante y libera su
PIN (al reactivarlo se escribe de nuevo; puede ser el mismo). Las tablets y celulares del local entran por la IP de la máquina
(`http://192.168.x.x:5190`): la web busca la API en el puerto 4310 de esa misma IP;
agrega ese origen a `ORIGEN_WEB`.

¿Se olvidó la contraseña del administrador? En desarrollo, `npm run clave -w backend --
admin`; en el servidor (Shell de Render o el contenedor), `node backend/dist/clave.js
admin`. La pide sin mostrarla y, si no queda ningún administrador que pueda entrar, crea
uno.

`npm run db:demo` llena la base con cinco semanas de ventas de muestra en cada sucursal,
cada día con su caja abierta y cerrada, para ver los reportes con vida. **Solo para
desarrollo**: se niega a correr si ya hay pedidos.

## Caja

Solo caja cobra: así todo el dinero queda en un arqueo. El mozo anota, envía a cocina,
sirve y **pide la cuenta**; caja la ve primero en su lista, en azul y con sonido. Caja
también anota (los pedidos para llevar del mostrador).

1. **Apertura**: al entrar, caja abre su turno con el fondo de sencillo (se puede contar
   billete por billete). El último cierre sugiere lo que dejó para este turno.
2. **Por cobrar**: las notas abiertas de la sucursal; se elige una y se cobra con el pie
   de la nota del Excel (repartido entre medios, con su vuelto). **Al cobrar, el
   comprobante sale solo** (con el pago, el vuelto y «PAGADO»); antes, se puede imprimir
   la cuenta. Lo mismo al cobrar en la nota del mostrador.
3. **Cobrados**: lo cobrado en el turno; se reimprime o se corrige el tipo de pago
   (se marcó Yape y era efectivo) mientras la caja siga abierta.
4. **Ingresos y egresos**: lo que entra o sale del cajón sin ser venta (gas, proveedor,
   sencillo). No sale más efectivo del que hay.
5. **Arqueo y cierre**: *debe haber* = fondo + cobros en efectivo (sin el vuelto) +
   ingresos − egresos. Se cuenta el cajón (billetes de S/ 200 a monedas de S/ 0.10, o
   solo el total), se ve al instante si cuadra, falta o sobra, se decide cuánto queda
   para el siguiente turno y se cierra. Se imprime el cierre para firmarlo.

Un cierre hecho por error se **reabre**: quien lo cerró, el mismo día; la encargada o el
administrador, siempre (solo el último cierre). La bitácora de cada caja guarda quién
abrió, cerró y reabrió, y con cuánto. Al **cerrar sesión con la caja abierta**, el sistema
avisa cuánto debería haber y ofrece cerrarla. Una sucursal tiene a lo más una caja abierta.

### Impresión

La nota, la cuenta, el comprobante y el cierre de caja están hechos para una **ticketera
de 80 mm** (también salen bien en una impresora común). La casilla **«Imprimir al
cobrar»**, junto al botón de cobrar, viene marcada y cada equipo recuerda la suya (en una
tablet sin impresora se desmarca). Un comprobante se reimprime desde **Cobrados**.

Para que el comprobante salga **directo, sin el cuadro de impresión**, en la PC de caja:

1. Instala la ticketera y déjala como **impresora predeterminada** (papel de 80 mm,
   márgenes mínimos).
2. Crea un acceso directo de Chrome con `--kiosk-printing` y la dirección del sistema.
   En Windows, el destino del acceso directo queda así:
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=https://tu-dominio/caja`
3. Abre la caja siempre desde ese acceso directo (cierra antes las otras ventanas de
   Chrome: la opción vale para la ventana que arranca).

En tablets Android, la impresión pasa por el cuadro del sistema; con una ticketera
Bluetooth se usa una app de impresión como RawBT.
## Sucursales

Una sola base para todas: mesas, notas, cajas y personal llevan su sucursal y cada
consulta filtra por ella. Lo de una sucursal no existe para otra (las pruebas lo
verifican ruta por ruta), cada una numera sus notas del día desde 1 y el tiempo real va
por salas: lo que pasa en una no despierta a las tablets de la otra.

- **La carta es una** para todas, y cada sucursal puede tener lo suyo: **precio propio**
  (el combo más barato del local nuevo), productos que **no ofrece**, lo que **se le agotó
  hoy** y productos **exclusivos** de ella. Los datos generales (nombre, RUC, pie de
  nota, cocinas) también son de todas; la dirección y el teléfono, de cada sucursal.
- **El dueño (administración)** entra con usuario y contraseña y elige arriba qué mirar:
  **todas las sucursales** (Inicio las pone lado a lado, con su caja) o una sola. Crea
  sucursales (nacen con sus mesas), encargadas y todo el personal.
- **La encargada** (opcional) entra con usuario y contraseña y ve solo su sucursal:
  Inicio, Reporte diario, Cajas y arqueos, Ventas por fecha, Preferencias, sus mesas, su
  equipo (agrega mozos, cocina y caja) y los agotados del día. Cubre cualquier puesto:
  puede entrar a mozo, cocina o caja de su sucursal. Precios, carta, tipos de pago,
  costos, sucursales y consolidado son del dueño. Sin encargadas, el sistema funciona
  igual.
- Cada tablet recuerda en qué sucursal está: con más de una, la entrada pregunta la
  sucursal antes del PIN.

### Cocina compartida (temporal)

Plaza More y Plaza San Cristóbal están en la misma ciudad y, por ahora, **la carta y los
shawarmas de las dos salen de la cocina de Plaza More**; los **emolientes y bebidas**,
cada local en la suya. Así queda desde el primer deploy:

- La pantalla de cocina de Plaza More (Cocina 1 y Cocina 2) muestra las comandas de los
  dos locales en una sola hoja, con la columna **«Local»** pintada del color de cada uno,
  para que el cocinero y el mozo sepan a dónde va cada plato. La misma M5 puede estar en
  los dos locales: la etiqueta las separa. Su Cocina 3 muestra solo sus emolientes.
- La tablet de San Cristóbal (Cocina 3) ve solo sus emolientes.
- El mozo de San Cristóbal ve al guardar «Enviado a Cocina 2 (Plaza More)» y, cuando sale
  su plato, «M5: cocina atendió el pedido · recógelo en Plaza More». Los avisos de un local
  no les llegan a los mozos del otro.
- Lo que se agota en la cocina compartida se agota en los dos locales; un emoliente
  agotado, solo en el suyo.

**Para deshacerlo** no hay que tocar el código: Administración → Sucursales → columna
«Cocina» → **Cocina propia**. Las pantallas cambian al instante. Ahí mismo se vuelve a
compartir o se elige qué cocinas van a la otra sucursal. En el código, todo lo que
depende de esto vive en `backend/src/servicios/cocina-compartida.ts` y en
`cocinaQuePrepara`/`juntasEnCocina` de `shared/`.

## Pruebas

```bash
npm test            # API y recuperación entre procesos: 90 pruebas
npm run test:e2e    # flujos completos con servidor tradicional
npm run test:vercel # los mismos flujos y caídas, con dos funciones independientes
```

Las dos usan una base aparte, `shawarma_wasi_test`, que se borra y se crea de nuevo
en cada corrida (en el mismo Postgres del `docker compose`); nunca tocan la base del
local. `npm test` cubre acceso y permisos (un PIN no se repite en el negocio y entra
solo en su sucursal; contraseña con freno de intentos), la nota de pedido (rondas,
detalles, agotados, producto libre, anular, mover), la caja (no se cobra con la caja
cerrada; el arqueo con vuelto, ingresos y egresos; corregir pago; cierre por billetes;
reabrir y sus reglas), las sucursales (nada se cruza: notas, cocina, caja, numeración
y carta propia; lo que puede y no puede la encargada; desactivar una sucursal), la
cocina compartida (qué ve y marca cada cocina, a quién le llega cada aviso, los agotados
juntos, deshacerla), los reintentos (el mismo envío dos veces o a la vez no se duplica),
la hoja de cocina con «Limpiar», todo lo editable de Administración y los reportes,
incluido el consolidado por páginas y su CSV.
`npm run test:e2e` compila la versión de producción, la levanta como en el servidor real
y la usa en Chrome: entrar y salir, el servicio completo mozo → cocina → caja con tiempo
real entre pantallas (pedir la cuenta, cobrar con vuelto), la caja (egreso, cierre
contando, reapertura y el aviso al salir), la cocina compartida (San Cristóbal anota,
Plaza More cocina con el local a la vista, el mozo sabe dónde recoger, el dueño la
deshace), el panel (sucursales, cajas, edición) y el celular. Usa el Chrome instalado
(no baja navegadores).

## Despliegue de pruebas: Vercel Hobby + Neon Free

La guía completa está en [DESPLIEGUE.md](DESPLIEGUE.md). Un proyecto de Vercel
entrega la web por CDN y la API por una función Node 22; Neon guarda la base.
No necesita Render, Redis ni otro servicio de tiempo real.

`vercel.json` y `api/index.js` ya preparan el despliegue. En Vercel se usa
`npm run build:vercel`, con la raíz del repositorio y salida `frontend/dist`.
La base se prepara antes desde el equipo con la conexión directa; la API usa
la conexión pooled. Las previews tienen su propia base y secretos.

La sincronización consulta avisos persistidos cada tres segundos por pestaña
visible. Operación, aviso y respuesta de reintento se confirman juntos: si una
instancia cae, otra puede devolver lo confirmado. Los límites de acceso también
se guardan en la base, y los cambios de sesión y de carta no dependen de memoria
compartida. El cron diario de Hobby limpia los registros temporales.

Los planes gratuitos tienen cuotas: esta configuración es para pruebas con pocos
dispositivos. Revisa Usage y cierra las pestañas al terminar; no agregues monitores
que mantengan Neon despierto. Hobby es de uso personal no comercial.

También se mantiene el servidor tradicional (`npm run build && npm start`) y
el Dockerfile para pasar más adelante a un servicio de Node persistente.

## Seguridad, resguardo y velocidad

**Seguridad.** Cada ruta exige sesión y rol, y filtra por sucursal; PIN y contraseñas
van con scrypt y un freno de intentos (5 fallos: un minuto de espera); un PIN no se repite
en el negocio y entra solo en su sucursal. El servidor manda cabeceras de seguridad
(CSP, HSTS…), la API responde `no-store` (nada queda guardado en un proxy), la web pide no
salir en buscadores y el CSV para Excel neutraliza fórmulas («=…») escritas en una nota.
En producción no arranca con una `JWT_SECRET` corta o de ejemplo.

**Resguardo ante caídas.**
- Si el wifi se corta justo al guardar o cobrar, la tablet **reintenta sola con la misma
  clave** y el servidor no lo repite: la cocina no recibe el pedido dos veces ni la caja
  anota dos veces un egreso. Si el mozo vuelve a pulsar «Guardar» con la misma nota,
  tampoco se duplica.
- Lo anotado y no guardado vive en el dispositivo: un corte no lo borra. Al volver la
  conexión, cada pantalla se pone al día sola.
- Las escrituras limitan la espera por bloqueos a 5 s, cada sentencia a 15 s y la
  transacción a 20 s. Los errores transitorios permiten reintentar el mismo envío.
  Una caída antes de confirmar revierte operación, avisos y respuesta juntos.
- **Respaldos**: la ventana de restauración de Neon depende del plan vigente.
  Guarda también una copia completa propia usando la conexión directa:

  ```bash
  DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require" npm run db:respaldo
  ```

  Queda en `respaldos/` (privado: git lo ignora). Para volver a ella:
  `pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" respaldos/wasi-….dump`.

**Velocidad.** Probado con una copia de 14 meses de ventas (23 700 notas, 71 000 platos):
cada pantalla responde en menos de 25 ms en el servidor, el reporte de un año en unos
65 ms y el consolidado de un año para Excel (68 000 filas) en 0,65 s. La web del mozo pesa
unos 190 KB comprimida y queda guardada en la tablet: después solo viajan los datos.

## Cómo está hecho

- `frontend/` — Vite + React 19 + Tailwind 4 + Motion. Es una app de uso continuo en
  tablets y celulares, sin SEO: por eso Vite y no Next. Cocina y administración se
  cargan aparte para que el celular del mozo baje solo lo suyo, y las librerías van en
  archivos propios que no cambian entre versiones.
- `backend/` — Express 5 + Prisma 7. En Vercel los cambios viajan mediante consultas
  a avisos persistidos; en un servidor tradicional también funciona Socket.IO. En
  ambos casos se avisa *qué* cambió y cada pantalla vuelve a pedir lo suyo; los avisos
  se filtran por sucursal. En Vercel la carta y los datos generales se leen de la base
  para que ninguna instancia conserve cambios viejos; en el servidor tradicional hay
  caché local. Los reportes filtran por rangos de tiempo
  con índice (también por sucursal), sus consultas salen en paralelo y el consolidado
  viaja por páginas (el CSV completo lo arma el servidor). Cobrar, abrir, cerrar y
  reabrir la caja traban sus filas en la base: dos tablets no cobran la misma nota ni
  cierran a la vez.
- `shared/` — tipos comunes, roles y quién entra a qué, las tres cocinas y los billetes
  y monedas del Perú (el resto de listas vive en la base).

Reglas del modelo: el dinero son céntimos enteros; cada plato vendido guarda copia
del nombre y precio del momento; la sesión de Postgres va en UTC y los reportes se
cuentan en hora de Lima; todo lo de una sucursal lleva su sucursal y cada consulta
filtra por ella; cada pago queda en el turno de caja que lo cobró.

Lo que el mozo anota vive en su dispositivo hasta que pulsa **Guardar**: anotar es
instantáneo aunque el wifi tiemble. Cada guardado es una *ronda* (lo agregado después
lleva la «A»), y cada cocina ve una comanda por ronda. La nota se cierra cuando está
pagada **y** todo llegó a la mesa (un pedido para llevar suele pagarse antes de salir de
cocina). La cocina guarda lo atendido a la vista hasta que pulsa **Limpiar**, como en la
hoja «Atención al Cliente».

## Todo se edita

Nada del local vive fijo en el código. Desde **Administración**:

- **Carta y precios**: productos (código, familia, variante, nombre, precio, en carta,
  en qué sucursal se vende), familias (ícono, cocina que la prepara, si admite detalle,
  orden), adicionales (precio, en qué cocinas y para qué familia), detalles y, por
  sucursal, el precio propio, lo que no ofrece y lo agotado hoy.
- **Mesas**: agregar, renumerar, retirar o volver a usar mesas y turnos para llevar de
  cada sucursal.
- **Equipo**: personas, sucursal, área (mozo, cocina, caja, encargada, administración)
  y su PIN o su usuario y contraseña.
- **Sucursales**: nombre, dirección y teléfono (salen en la nota impresa), crear con sus
  mesas, desactivar.
- **Tipos de pago**: agregar, renombrar, ordenar, desactivar; cuáles dan vuelto.
- **Insumos y costos**: insumos con su costo de compra, recetas y márgenes.
- **Datos generales**: nombre y subtítulo (encabezan cada hoja), RUC, pie de la nota
  impresa, nombre de cada cocina, observaciones rápidas de «Obs:» y minutos para marcar
  un pedido como demorado.

Cada cambio llega al instante a las pantallas abiertas (mozos y cocina). Lo que ya tiene
ventas no se borra: se desactiva o se retira, y los reportes lo siguen mostrando.

## Diseño

Sistema «Hoja». El local trabajaba en un libro de Google Sheets y el sistema es ese
libro hecho aplicación, con el aire de un programa de escritorio: celdas, cabeceras de
color, pestañas al pie, esquinas rectas y botones sólidos.

- **Mozo**: la «Nota de Pedido» tal como era: membrete con el logo, «SHAWARMA WASI /
  Peruvian Cuisine» en vino y la caja «Mesa: 1»; Cliente, Fecha y Estado; la planilla
  Cant · Producto · Adicional · Detalle · Obs · Precio · PAdic · Subtotal con
  desplegables; el pie de pago y los botones Limpiar (oliva) y Guardar (verde). En el
  celular cada fila se acomoda en tres renglones y los desplegables suben desde abajo.
- **Cocina**: «Atención al Cliente» con Nro · Mesa · Cliente · Cant · Producto ·
  Adicional · Detalle · Obs · Hora · Estado · Ad y el mismo formato condicional.
- **Caja**: barra azul oscuro (el color de «Cobrar»), una fila de celdas con quién abrió,
  el fondo, lo vendido y el efectivo que debe haber, y sus hojas al pie: Por cobrar ·
  Cobrados · Ingresos y egresos · Arqueo y cierre. El arqueo tiene las cabeceras rojas de
  las hojas de reporte y el conteo es una planilla de billetes y monedas.
- **Administración**: menú lateral de color con íconos, tarjetas de cifras con
  degradado y gráficos como los de Sheets; las tablas llevan la cabecera de su hoja
  (rojo los reportes, verde la gestión, naranja Detalle).
- **Color**: los del libro, tal cual: verde oscuro `#274E13` y `#38761D` (cabeceras),
  vino `#85200C` (el nombre del local), turquesa `#134F5C` (cocina), menta `#B7E1CD`
  (Pendiente), rosa `#F4C7C3` (Atendido), ámbar `#FCE8B2` (Anulado), oliva `#8B6902`
  (Limpiar), verde `#3D9019` (Guardar), rojo `#A61C00` (reportes).
- **Letra**: Roboto (la de Sheets), con cifras tabulares y un ancho angosto para las
  columnas apretadas. Servida localmente.
- **Íconos**: Material Design Icons (`@mdi/js`), sólidos y a un color; el trompo del
  shawarma está dibujado en la misma retícula. Cada familia elige el suyo en
  Administración.

El logotipo es propio del sistema: el que trae el Excel dice «Fusion Shawarma», no
Shawarma Wasi.
