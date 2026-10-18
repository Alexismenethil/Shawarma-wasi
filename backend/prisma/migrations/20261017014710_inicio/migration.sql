-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('MOZO', 'COCINA', 'ADMIN');

-- CreateEnum
CREATE TYPE "Estacion" AS ENUM ('CARTA', 'SHAWARMAS', 'BEBIDAS');

-- CreateEnum
CREATE TYPE "TipoMesa" AS ENUM ('SALON', 'LLEVAR');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('ABIERTO', 'COBRADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoItem" AS ENUM ('PENDIENTE', 'LISTO', 'ENTREGADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'YAPE', 'PLIN', 'BCP', 'INTERBANK', 'BN');

-- CreateEnum
CREATE TYPE "Corte" AS ENUM ('CORTE_2_IGUAL', 'CORTE_2_DISTINTO', 'CORTE_3_IGUAL', 'INDIVIDUAL');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "pinHash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Familia" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estacion" "Estacion" NOT NULL,
    "icono" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "admiteCorte" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Familia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" SERIAL NOT NULL,
    "familiaId" INTEGER NOT NULL,
    "codigo" TEXT,
    "variante" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" INTEGER NOT NULL,
    "imagenUrl" TEXT,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "disponible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adicional" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,
    "precio" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "estaciones" "Estacion"[],
    "familia" TEXT,

    CONSTRAINT "Adicional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoMesa" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" SERIAL NOT NULL,
    "mesaId" INTEGER NOT NULL,
    "mozoId" INTEGER,
    "cliente" TEXT,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'ABIERTO',
    "total" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,
    "cobradoEn" TIMESTAMPTZ(3),
    "anuladoEn" TIMESTAMPTZ(3),

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPedido" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "productoId" INTEGER,
    "ronda" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "familia" TEXT NOT NULL,
    "estacion" "Estacion" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio" INTEGER NOT NULL,
    "adicionales" JSONB NOT NULL DEFAULT '[]',
    "precioAdicionales" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL,
    "corte" "Corte",
    "paraLlevar" BOOLEAN NOT NULL DEFAULT false,
    "observacion" TEXT,
    "estado" "EstadoItem" NOT NULL DEFAULT 'PENDIENTE',
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listoEn" TIMESTAMPTZ(3),
    "entregadoEn" TIMESTAMPTZ(3),
    "anuladoEn" TIMESTAMPTZ(3),

    CONSTRAINT "ItemPedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "monto" INTEGER NOT NULL,
    "recibido" INTEGER,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insumo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "costoCompra" INTEGER NOT NULL,
    "presentacion" TEXT NOT NULL,
    "cantidadCompra" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT NOT NULL,

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecetaItem" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "insumoId" INTEGER NOT NULL,
    "cantidad" DOUBLE PRECISION,
    "unidad" TEXT,

    CONSTRAINT "RecetaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Familia_clave_key" ON "Familia"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_familiaId_variante_key" ON "Producto"("familiaId", "variante");

-- CreateIndex
CREATE UNIQUE INDEX "Adicional_nombre_key" ON "Adicional"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_tipo_numero_key" ON "Mesa"("tipo", "numero");

-- CreateIndex
CREATE INDEX "Pedido_mesaId_estado_idx" ON "Pedido"("mesaId", "estado");

-- CreateIndex
CREATE INDEX "Pedido_estado_cobradoEn_idx" ON "Pedido"("estado", "cobradoEn");

-- CreateIndex
CREATE INDEX "ItemPedido_estacion_estado_idx" ON "ItemPedido"("estacion", "estado");

-- CreateIndex
CREATE INDEX "ItemPedido_pedidoId_idx" ON "ItemPedido"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "Insumo_nombre_key" ON "Insumo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "RecetaItem_productoId_insumoId_key" ON "RecetaItem"("productoId", "insumoId");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_familiaId_fkey" FOREIGN KEY ("familiaId") REFERENCES "Familia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_mozoId_fkey" FOREIGN KEY ("mozoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedido" ADD CONSTRAINT "ItemPedido_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaItem" ADD CONSTRAINT "RecetaItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaItem" ADD CONSTRAINT "RecetaItem_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
