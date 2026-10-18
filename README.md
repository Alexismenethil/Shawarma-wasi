# Shawarma Wasi

Sistema del local: **mozo** (mesas y nota de pedido), **cocina** (tres estaciones) y
**administración** (reportes, ventas, carta y costos). Sale de la *Nota de Pedidos* en
Excel que está en `doc/`: cada hoja de ese libro tiene su lugar aquí.

| Excel | Sistema |
|---|---|
| Hojas `M1…M25` y `L1…L10` | El libro del mozo: una hoja por mesa con sus pestañas al pie, más la hoja «Mesas» con todas a la vista |
| Nota de pedido: Cant · Producto · Adicional · Detalle · Obs · Precio · PAdic · Subtotal | La misma planilla con desplegables; Subtotal = Cant × (Precio + PAdic), en rosa mientras la fila está vacía |
| Columna «A» (agregado) | Automática: lo que se pide después del primer envío lleva la «A» en la nota y en cocina |
| Estado «Nota de Pedido / Pendiente / Atendido» | Por plato: Pendiente (menta) → Atendido (rosa) → Servido; Anulado en ámbar |
| Tipo y Monto de Pago, Vuelto / Debe | El pie de la nota; los medios de pago se editan en Administración y el efectivo da vuelto |
| Botones «Limpiar» y «Guardar» | Limpiar borra lo anotado sin guardar; Guardar manda a cocina y, si se llenó el pago, cobra |
| `Productos` | Administración → Carta y precios → Productos (167 productos, 25 familias) |
| `Adicional` | Administración → Carta y precios → Adicionales |
| `Detalle` (M:/L: Corte 2 =, 2 ≠, 3 =, Individual) | Administración → Carta y precios → Detalles; la nota los ofrece con M: y L: |
| `Pedidos` / `Entregas` («Atención al Cliente») | La cocina: la misma hoja por estación, con su desplegable de estado y «Limpiar» |
| `Arqueo` + `Resumen` | Administración → Reporte diario (e Inicio) |
| `VentasFecha` + `Tendencia` | Administración → Ventas por fecha |
| `Preferencias` | Administración → Preferencias |
| `Acumulado` | Administración → Acumulado del mes (producto × día) |
| `Consolidado` + `Filtro_Pref` | Administración → Consolidado (se descarga para Excel) |
| `Costos` + `Insumos` | Administración → Insumos y costos (insumos, recetas y márgenes) |

## Cómo correrlo

Requisitos: Node 20+ y Docker.

```bash
npm install
cp .env.example .env        # y cambia JWT_SECRET y los PIN
npm run db:up               # Postgres 17 en Docker (puerto 5434)
npm run db:migrate          # crea las tablas
npm run db:seed             # carta, adicionales, mesas, insumos y un usuario por área
npm run dev                 # API en :4310 y web en :5190
```

Abre <http://localhost:5190>. La semilla crea una persona por área con los PIN del
`.env` (`SEED_PIN_MOZO`, `SEED_PIN_COCINA`, `SEED_PIN_ADMIN`); el de administración
abre las tres. Después, el equipo se arma en **Administración → Equipo**: cada persona
tiene su propio PIN de cuatro cifras (dos personas activas no pueden compartirlo), la
nota dice quién atendió, y desactivar a alguien le cierra la sesión al instante.
Las tablets y celulares del local entran por la IP de la máquina
(`http://192.168.x.x:5190`): la web busca la API en el puerto 4310 de esa misma IP;
agrega ese origen a `ORIGEN_WEB`.

`npm run db:demo` llena la base con cinco semanas de ventas de muestra para ver los
reportes con vida. **Solo para desarrollo**: se niega a correr si ya hay pedidos.

## Pruebas

```bash
npm test            # la API completa: 46 pruebas
npm run test:e2e    # el sistema en Chrome, de punta a punta: 11 pruebas
```

Las dos usan una base aparte, `shawarma_wasi_test`, que se borra y se crea de nuevo
en cada corrida (en el mismo Postgres del `docker compose`); nunca tocan la base del
local. `npm test` cubre acceso y permisos, la nota de pedido (rondas, detalles,
agotados, producto libre, anular, mover), el cobro como el Excel (Debe, electrónico
exacto, vuelto, pago repartido, para llevar pagado antes), la hoja de cocina con
«Limpiar», todo lo editable de Administración y los reportes, incluido el consolidado
por páginas y su CSV. `npm run test:e2e` compila la versión de producción, la levanta
como en el servidor real y la usa en Chrome: entrar y salir, el servicio completo mozo
→ cocina → cobro con tiempo real entre pantallas, edición en Administración y el
celular. Usa el Chrome instalado (no baja navegadores).

## Producción

Un solo servidor Node entrega la web, la API y el tiempo real (mismo dominio: sin
CORS, y el WebSocket va por el mismo lado). La base es cualquier Postgres 15+.

```bash
npm ci --include=dev && npm run build   # compila la web y la API
npm start                               # aplica migraciones pendientes y arranca
```

Variables: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (64 caracteres al azar:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) y, si el
hosting no lo pone solo, `PORT`. `/salud` responde 200 solo si la base también
responde: úsalo como chequeo de salud. La primera vez, siembra la carta y los tres
usuarios iniciales desde tu máquina contra la base de producción:

```bash
DATABASE_URL="postgresql://…" SEED_PIN_MOZO=… SEED_PIN_COCINA=… SEED_PIN_ADMIN=… npm run db:seed
```

También hay un `Dockerfile` (web + API en un contenedor) para Railway, Fly.io o una
mini PC en el local.

**Recomendado: Render + Neon.**

- **Neon** (Postgres): crea el proyecto en la región **AWS US East (N. Virginia)** y usa
  la cadena de conexión **directa** (sin `-pooler`) con `sslmode=require`: el pooler no
  acepta el parámetro de zona horaria con que conecta la API, y las migraciones también
  piden la directa. La API ya limita sus conexiones a 10. El plan gratis alcanza para empezar; tiene restauración a
  un punto en el tiempo.
- **Render** (web service, Node): región **Virginia** (la misma que la base: cada
  pantalla hace varias consultas y conviene que la base esté al lado).
  Build: `npm ci --include=dev && npm run build` · Start: `npm start` ·
  Health check: `/salud`. Usa un plan pagado (Starter): el gratis se duerme a los 15
  minutos y la primera pantalla tarda en despertar.
- **Vercel o Cloudflare no sirven para la API**: el tiempo real necesita un servidor que
  quede encendido con WebSocket. Separar la web en Vercel solo agrega un segundo
  despliegue y CORS; si igual se quisiera, compila la web con
  `VITE_API_EXTERNA=https://tu-api` y pon el dominio de la web en `ORIGEN_WEB`.

## Cómo está hecho

- `frontend/` — Vite + React 19 + Tailwind 4 + Motion. Es una app de uso continuo en
  tablets y celulares, sin SEO: por eso Vite y no Next. Cocina y administración se
  cargan aparte para que el celular del mozo baje solo lo suyo, y las librerías van en
  archivos propios que no cambian entre versiones.
- `backend/` — Express 5 + Prisma 7 + Socket.IO. El socket solo avisa *qué* cambió y
  cada pantalla vuelve a pedir lo suyo: ninguna tablet queda con un estado viejo. La
  carta y los datos del local se guardan en memoria hasta que Administración los cambia.
  Los reportes filtran por rangos de tiempo con índice, sus consultas salen en paralelo
  y el consolidado viaja por páginas (el CSV completo lo arma el servidor).
- `shared/` — tipos comunes y las tres cocinas (el resto de listas vive en la base).

Reglas del modelo: el dinero son céntimos enteros; cada plato vendido guarda copia
del nombre y precio del momento; la sesión de Postgres va en UTC y los reportes se
cuentan en hora de Lima.

Lo que el mozo anota vive en su dispositivo hasta que pulsa **Guardar**: anotar es
instantáneo aunque el wifi tiemble. Cada guardado es una *ronda* (lo agregado después
lleva la «A»), y cada cocina ve una comanda por ronda. La nota se cierra cuando está
pagada **y** todo llegó a la mesa (un pedido para llevar suele pagarse antes de salir de
cocina). La cocina guarda lo atendido a la vista hasta que pulsa **Limpiar**, como en la
hoja «Atención al Cliente».

## Todo se edita

Nada del local vive fijo en el código. Desde **Administración**:

- **Carta y precios**: productos (código, familia, variante, nombre, precio, agotado
  por hoy, en carta), familias (ícono, cocina que la prepara, si admite detalle,
  orden), adicionales (precio, en qué cocinas y para qué familia) y detalles.
- **Mesas**: agregar, renumerar, retirar o volver a usar mesas y turnos para llevar.
- **Tipos de pago**: agregar, renombrar, ordenar, desactivar; cuáles dan vuelto.
- **Equipo**: personas, área y PIN.
- **Insumos y costos**: insumos con su costo de compra, recetas y márgenes.
- **Datos del local**: nombre y subtítulo (encabezan cada hoja), dirección, teléfono,
  RUC, pie de la nota impresa, nombre de cada cocina, observaciones rápidas de «Obs:» y
  minutos para marcar un pedido como demorado.

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
