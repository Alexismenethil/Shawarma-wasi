-- Cocina recibe el nombre del producto: tiene que ser el mismo que el mozo ve
-- en la carta. Algunos venían del Excel con otro nombre («Shawarma Carne y
-- Pollo» para la Mixta). Solo se cambia si todavía tiene el nombre de origen:
-- si la encargada ya lo editó, se respeta.
-- Las líneas ya pedidas también se renombran: cocina las ve al instante y los
-- reportes (que agrupan por nombre) no parten el mismo plato en dos.
CREATE TEMP TABLE "_renombre" ("codigo" TEXT, "antes" TEXT, "ahora" TEXT);
INSERT INTO "_renombre" VALUES
  ('SM', 'Shawarma Carne y Pollo', 'Shawarma Mixta'),
  ('RC', 'Rachi con Anticuchos', 'Rachi Mixto'),
  ('PP', 'Brochetas de Pollo y Anticucho', 'Brocheta Mixta'),
  ('CR', 'Conito con Salchipapa y Pollo Nuget', 'Conito Salchipollo');

UPDATE "ItemPedido" AS i SET "nombre" = r."ahora"
FROM "Producto" AS p, "_renombre" AS r
WHERE i."productoId" = p."id" AND p."codigo" = r."codigo" AND p."nombre" = r."antes" AND i."nombre" = r."antes";

UPDATE "Producto" AS p SET "nombre" = r."ahora"
FROM "_renombre" AS r
WHERE p."codigo" = r."codigo" AND p."nombre" = r."antes";

DROP TABLE "_renombre";
