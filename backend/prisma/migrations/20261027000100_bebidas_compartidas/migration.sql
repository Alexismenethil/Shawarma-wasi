-- Pedido del encargado (27 de octubre de 2026): las bebidas de las dos
-- sucursales salen de la cocina de Plaza More; solo los emolientes siguen
-- independientes, cada local en la suya.

-- La familia de los emolientes va a la cocina 4. Lo ya enviado a cocina se
-- queda donde estaba; lo que se pida desde ahora, va a la nueva.
UPDATE "Familia" SET "estacion" = 'EMOLIENTES' WHERE "clave" = 'Emoliente' OR "icono" = 'emoliente';

-- Lo que se ofrecía con las bebidas (el vaso) se ofrece también con los emolientes.
UPDATE "Adicional" SET "estaciones" = array_append("estaciones", 'EMOLIENTES'::"Estacion")
WHERE 'BEBIDAS' = ANY("estaciones") AND NOT ('EMOLIENTES' = ANY("estaciones"));

-- La cocina 3 deja de llamarse «Emolientes y bebidas» si el local no le puso otro nombre.
UPDATE "Ajustes" SET "estaciones" = jsonb_set("estaciones"::jsonb, '{BEBIDAS}', '"Bebidas"')
WHERE "estaciones"::jsonb ->> 'BEBIDAS' = 'Emolientes y bebidas';

-- Las sucursales que ya comparten cocina mandan también sus bebidas.
UPDATE "Sucursal" SET "cocinasCompartidas" = array_append("cocinasCompartidas", 'BEBIDAS'::"Estacion")
WHERE "cocinaEnId" IS NOT NULL AND cardinality("cocinasCompartidas") > 0 AND NOT ('BEBIDAS' = ANY("cocinasCompartidas"));
