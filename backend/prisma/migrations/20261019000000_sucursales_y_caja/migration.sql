-- Sucursales y caja.
--
-- Todo lo que ya existía (mesas, notas, personal, agotados, la dirección y el
-- teléfono del local) pasa a la primera sucursal, «Principal», que después se
-- renombra en Administración → Sucursales. El administrador deja de tener PIN:
-- entra con usuario y contraseña (la pone la semilla con SEED_ADMIN_CLAVE, o
-- `npm run clave -w backend`).

-- CreateEnum
CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "TipoEventoCaja" AS ENUM ('APERTURA', 'CIERRE', 'REAPERTURA');

-- AlterEnum (los valores nuevos no se usan en esta migración: Postgres no lo permite en la misma transacción)
ALTER TYPE "Rol" ADD VALUE 'CAJA';
ALTER TYPE "Rol" ADD VALUE 'ENCARGADO';

-- CreateTable
CREATE TABLE "Sucursal" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL DEFAULT '',
    "telefono" TEXT NOT NULL DEFAULT '',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sucursal_nombre_key" ON "Sucursal"("nombre");

-- La primera sucursal, con la dirección y el teléfono que tenía el local.
INSERT INTO "Sucursal" ("nombre", "direccion", "telefono")
SELECT 'Principal', COALESCE(a."direccion", ''), COALESCE(a."telefono", '')
FROM (SELECT 1) AS uno LEFT JOIN "Ajustes" a ON a."id" = 1;

-- AlterTable
ALTER TABLE "Ajustes" DROP COLUMN "direccion",
DROP COLUMN "telefono";

-- AlterTable: el personal es de una sucursal; el administrador, de todas.
ALTER TABLE "Usuario" ADD COLUMN     "claveHash" TEXT,
ADD COLUMN     "sucursalId" INTEGER,
ADD COLUMN     "usuario" TEXT,
ALTER COLUMN "pinHash" DROP NOT NULL;

UPDATE "Usuario" SET "sucursalId" = (SELECT MIN("id") FROM "Sucursal") WHERE "rol" <> 'ADMIN';

UPDATE "Usuario" u
SET "pinHash" = NULL,
    "usuario" = CASE WHEN u."id" = (SELECT MIN("id") FROM "Usuario" WHERE "rol" = 'ADMIN') THEN 'admin' ELSE 'admin' || u."id" END
WHERE u."rol" = 'ADMIN';

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");

-- CreateIndex
CREATE INDEX "Usuario_sucursalId_idx" ON "Usuario"("sucursalId");

-- AlterTable: cada sucursal tiene su M1 y su L1.
DROP INDEX "Mesa_tipo_numero_key";

ALTER TABLE "Mesa" ADD COLUMN     "sucursalId" INTEGER;

UPDATE "Mesa" SET "sucursalId" = (SELECT MIN("id") FROM "Sucursal");

ALTER TABLE "Mesa" ALTER COLUMN "sucursalId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_sucursalId_tipo_numero_key" ON "Mesa"("sucursalId", "tipo", "numero");

-- AlterTable: la nota lleva la sucursal de su mesa.
ALTER TABLE "Pedido" ADD COLUMN     "cobradoPorId" INTEGER,
ADD COLUMN     "cuentaPedidaEn" TIMESTAMPTZ(3),
ADD COLUMN     "sucursalId" INTEGER;

UPDATE "Pedido" p SET "sucursalId" = m."sucursalId" FROM "Mesa" m WHERE m."id" = p."mesaId";

ALTER TABLE "Pedido" ALTER COLUMN "sucursalId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Pedido_sucursalId_cobradoEn_idx" ON "Pedido"("sucursalId", "cobradoEn");

-- CreateIndex
CREATE INDEX "Pedido_sucursalId_creadoEn_idx" ON "Pedido"("sucursalId", "creadoEn");

-- CreateTable: lo propio de cada producto en cada sucursal.
CREATE TABLE "ProductoSucursal" (
    "productoId" INTEGER NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "precio" INTEGER,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "agotado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductoSucursal_pkey" PRIMARY KEY ("productoId","sucursalId")
);

-- CreateIndex
CREATE INDEX "ProductoSucursal_sucursalId_idx" ON "ProductoSucursal"("sucursalId");

-- Lo que estaba agotado sigue agotado, en la primera sucursal.
INSERT INTO "ProductoSucursal" ("productoId", "sucursalId", "agotado")
SELECT p."id", (SELECT MIN("id") FROM "Sucursal"), true FROM "Producto" p WHERE NOT p."disponible";

-- AlterTable
ALTER TABLE "Producto" DROP COLUMN "disponible",
ADD COLUMN     "sucursalId" INTEGER;

-- CreateTable
CREATE TABLE "Caja" (
    "id" SERIAL NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "estado" "EstadoCaja" NOT NULL DEFAULT 'ABIERTA',
    "abiertaPorId" INTEGER NOT NULL,
    "abiertaEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montoInicial" INTEGER NOT NULL,
    "cerradaPorId" INTEGER,
    "cerradaEn" TIMESTAMPTZ(3),
    "esperado" INTEGER,
    "contado" INTEGER,
    "conteo" JSONB,
    "fondoSiguiente" INTEGER,
    "observacion" TEXT,

    CONSTRAINT "Caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" SERIAL NOT NULL,
    "cajaId" INTEGER NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "monto" INTEGER NOT NULL,
    "concepto" TEXT NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoCaja" (
    "id" SERIAL NOT NULL,
    "cajaId" INTEGER NOT NULL,
    "tipo" "TipoEventoCaja" NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" INTEGER,
    "diferencia" INTEGER,

    CONSTRAINT "EventoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Caja_sucursalId_estado_idx" ON "Caja"("sucursalId", "estado");

-- CreateIndex
CREATE INDEX "Caja_sucursalId_abiertaEn_idx" ON "Caja"("sucursalId", "abiertaEn");

-- CreateIndex
CREATE INDEX "Caja_abiertaEn_idx" ON "Caja"("abiertaEn");

-- CreateIndex
CREATE INDEX "MovimientoCaja_cajaId_idx" ON "MovimientoCaja"("cajaId");

-- CreateIndex
CREATE INDEX "EventoCaja_cajaId_idx" ON "EventoCaja"("cajaId");

-- AlterTable: cada pago queda en el turno de caja que lo cobró (los anteriores a la caja, sin turno).
ALTER TABLE "Pago" ADD COLUMN     "cajaId" INTEGER;

-- CreateIndex
CREATE INDEX "Pago_cajaId_idx" ON "Pago"("cajaId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoSucursal" ADD CONSTRAINT "ProductoSucursal_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoSucursal" ADD CONSTRAINT "ProductoSucursal_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_cobradoPorId_fkey" FOREIGN KEY ("cobradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_abiertaPorId_fkey" FOREIGN KEY ("abiertaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Caja" ADD CONSTRAINT "Caja_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoCaja" ADD CONSTRAINT "EventoCaja_cajaId_fkey" FOREIGN KEY ("cajaId") REFERENCES "Caja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoCaja" ADD CONSTRAINT "EventoCaja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
