-- Reintentos sin duplicar: la respuesta a cada envío con su clave (dos días).
-- CreateTable
CREATE TABLE "Idempotencia" (
    "clave" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "estado" INTEGER,
    "respuesta" JSONB,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idempotencia_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE INDEX "Idempotencia_creadoEn_idx" ON "Idempotencia"("creadoEn");
