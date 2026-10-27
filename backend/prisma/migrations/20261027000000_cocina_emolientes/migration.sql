-- Los emolientes pasan a su propia cocina (estación 4), aparte de las bebidas.
-- El valor nuevo va solo en esta migración: Postgres no deja usarlo en la misma
-- transacción en que se agrega (lo usa la siguiente).

-- AlterEnum
ALTER TYPE "Estacion" ADD VALUE 'EMOLIENTES';
