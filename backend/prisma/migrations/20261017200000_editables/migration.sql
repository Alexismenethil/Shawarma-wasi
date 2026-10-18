-- Lo que antes vivía fijo en el código pasa a la base, editable desde
-- Administración: medios de pago, detalles (cortes) y los datos del local.
-- Las ventas ya guardadas conservan su valor: se convierten, no se borran.

-- Medios de pago ------------------------------------------------------------
CREATE TABLE "MedioPago" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "efectivo" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MedioPago_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MedioPago_clave_key" ON "MedioPago"("clave");

-- Los mismos del desplegable «Tipo y Monto de Pago» del Excel.
INSERT INTO "MedioPago" ("clave", "nombre", "efectivo", "orden") VALUES
    ('EFECTIVO', 'Efectivo', true, 1),
    ('YAPE', 'Yape', false, 2),
    ('PLIN', 'Plin', false, 3),
    ('BCP', 'BCP', false, 4),
    ('INTERBANK', 'Interbank', false, 5),
    ('BN', 'Banco de la Nación', false, 6);

ALTER TABLE "Pago" ALTER COLUMN "metodo" TYPE TEXT USING "metodo"::text;
DROP TYPE "MetodoPago";

-- Detalles -------------------------------------------------------------------
CREATE TABLE "Detalle" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Detalle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Detalle_nombre_key" ON "Detalle"("nombre");

-- La hoja «Detalle» del Excel, sin el M: / L: (eso lo dice paraLlevar).
INSERT INTO "Detalle" ("nombre", "orden") VALUES
    ('Corte 2 =', 1),
    ('Corte 2 ≠', 2),
    ('Corte 3 =', 3),
    ('Individual', 4);

ALTER TABLE "ItemPedido" ALTER COLUMN "corte" TYPE TEXT USING (
    CASE "corte"::text
        WHEN 'CORTE_2_IGUAL' THEN 'Corte 2 ='
        WHEN 'CORTE_2_DISTINTO' THEN 'Corte 2 ≠'
        WHEN 'CORTE_3_IGUAL' THEN 'Corte 3 ='
        WHEN 'INDIVIDUAL' THEN 'Individual'
    END
);
ALTER TABLE "ItemPedido" RENAME COLUMN "corte" TO "detalle";
DROP TYPE "Corte";

-- Datos del local ------------------------------------------------------------
CREATE TABLE "Ajustes" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "nombre" TEXT NOT NULL DEFAULT 'Shawarma Wasi',
    "subtitulo" TEXT NOT NULL DEFAULT 'Peruvian Cuisine',
    "direccion" TEXT NOT NULL DEFAULT '',
    "telefono" TEXT NOT NULL DEFAULT '',
    "ruc" TEXT NOT NULL DEFAULT '',
    "pieNota" TEXT NOT NULL DEFAULT '¡Gracias por su visita!',
    "estaciones" JSONB NOT NULL DEFAULT '{}',
    "observaciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minutosAlerta" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "Ajustes_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Ajustes" ("id", "estaciones", "observaciones") VALUES (
    1,
    '{"CARTA": "Carta", "SHAWARMAS": "Shawarmas", "BEBIDAS": "Emolientes y bebidas"}',
    ARRAY['Sin ají', 'Poco ají', 'Sin cebolla', 'Sin cremas', 'Cremas aparte', 'Sin ensalada', 'Sin azúcar', 'Poca azúcar', 'Con hielo', 'Sin hielo', 'Bien caliente']
);
