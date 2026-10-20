-- Cocina compartida (temporal): una sucursal puede mandar algunas de sus
-- cocinas (estaciones) a la de otra sucursal. Sin datos que mover: la semilla
-- de una base nueva la deja configurada, y después se maneja en el panel.

-- AlterTable
ALTER TABLE "Sucursal" ADD COLUMN     "cocinaEnId" INTEGER,
ADD COLUMN     "cocinasCompartidas" "Estacion"[] DEFAULT ARRAY[]::"Estacion"[];

-- AddForeignKey
ALTER TABLE "Sucursal" ADD CONSTRAINT "Sucursal_cocinaEnId_fkey" FOREIGN KEY ("cocinaEnId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
