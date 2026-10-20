ALTER TABLE "Idempotencia" ADD COLUMN "huella" TEXT;

CREATE TABLE "Aviso" (
  "id" BIGSERIAL PRIMARY KEY,
  "sucursalId" INTEGER,
  "soloSucursal" BOOLEAN NOT NULL DEFAULT false,
  "cambio" JSONB NOT NULL,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Aviso_creadoEn_idx" ON "Aviso"("creadoEn");
CREATE INDEX "Aviso_sucursalId_id_idx" ON "Aviso"("sucursalId", "id");

CREATE TABLE "IntentoAcceso" (
  "clave" TEXT PRIMARY KEY,
  "fallos" INTEGER NOT NULL DEFAULT 0,
  "hasta" TIMESTAMP(3),
  "ultimo" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IntentoAcceso_ultimo_idx" ON "IntentoAcceso"("ultimo");

-- Compatible con conexiones directas y PgBouncer, sin opciones de sesión.
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
  EXECUTE format('ALTER DATABASE %I SET jit TO off', current_database());
END $$;
