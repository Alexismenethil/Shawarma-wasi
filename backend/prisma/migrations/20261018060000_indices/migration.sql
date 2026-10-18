-- Índices para que reportes, cocina y conteos no recorran tablas enteras
-- a medida que el local acumula meses de ventas.
-- CreateIndex
CREATE INDEX "ItemPedido_listoEn_idx" ON "ItemPedido"("listoEn");

-- CreateIndex
CREATE INDEX "ItemPedido_anuladoEn_idx" ON "ItemPedido"("anuladoEn");

-- CreateIndex
CREATE INDEX "ItemPedido_productoId_idx" ON "ItemPedido"("productoId");

-- CreateIndex
CREATE INDEX "Pago_pedidoId_idx" ON "Pago"("pedidoId");

-- CreateIndex
CREATE INDEX "Pago_metodo_idx" ON "Pago"("metodo");

-- CreateIndex
CREATE INDEX "Pedido_cobradoEn_idx" ON "Pedido"("cobradoEn");

-- CreateIndex
CREATE INDEX "Pedido_creadoEn_idx" ON "Pedido"("creadoEn");

-- CreateIndex
CREATE INDEX "Pedido_mozoId_idx" ON "Pedido"("mozoId");

-- CreateIndex
CREATE INDEX "RecetaItem_insumoId_idx" ON "RecetaItem"("insumoId");

