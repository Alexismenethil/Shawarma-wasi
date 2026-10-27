-- Los emolientes ya pedidos también pasan a la cocina 4. Si no, los que estaban
-- pendientes en San Cristóbal al desplegar saltarían a la cocina 3 de Plaza More
-- (las bebidas ahora se comparten), y los reportes por cocina mezclarían
-- emolientes de antes con bebidas.
UPDATE "ItemPedido" AS i SET "estacion" = 'EMOLIENTES'
FROM "Producto" AS p
JOIN "Familia" AS f ON f."id" = p."familiaId"
WHERE i."productoId" = p."id" AND f."estacion" = 'EMOLIENTES' AND i."estacion" = 'BEBIDAS';
