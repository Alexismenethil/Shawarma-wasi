import { useMemo, useState, type ReactNode } from 'react'
import { mdiCancel, mdiCheck, mdiClose, mdiDotsVertical, mdiPlusBox } from '@mdi/js'
import type { Carta, FamiliaCarta, ItemPedido, ProductoCarta } from '@wasi/shared'
import { adicionalesPara, precioLinea, type IndiceCarta, type LineaBorrador } from '../../lib/borrador'
import { soles, varianteLegible } from '../../lib/formato'
import { Desplegable, DesplegableMultiple, Menu, type Opcion } from '../../componentes/desplegable'
import { Icono, iconoFamilia } from '../../componentes/icono'

/**
 * Las filas de la nota, columna por columna como en el Excel:
 * Cant: · Producto: (familia y variante) · Adicional: · Detalle: · Obs: ·
 * Precio: · PAdic: · Subtotal:, y al final el estado de la fila.
 *
 * En pantalla grande cada fila es una línea de la planilla. En el celular la
 * misma fila se acomoda en tres renglones; los grupos usan `lg:contents` para
 * que en pantalla grande sus celdas caigan directo en la grilla de la tabla.
 */

/** Las columnas de la nota; la cabecera, las filas y los totales las comparten. */
export const COLUMNAS = 'lg:grid lg:grid-cols-[60px_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_74px_66px_90px_124px]'

/** Una celda de la planilla: en pantalla grande lleva su línea a la derecha. */
export function Celda({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <div className={`flex min-w-0 items-center lg:h-11 lg:border-r lg:border-reja lg:px-1.5 ${className}`}>{children}</div>
}

/** Subtotal: rosa con letra roja cuando la fila está vacía, como el formato condicional del Excel. */
export function CeldaSubtotal({ valor, className = '' }: { valor: number; className?: string }) {
  const vacio = valor <= 0
  return (
    <Celda
      className={`justify-end px-2 text-[15px] tabular-nums lg:text-[14px] ${vacio ? 'bg-rosa text-rojo-oscuro' : 'font-medium text-tinta'} ${className}`}
    >
      {soles(valor)}
    </Celda>
  )
}

export function CabeceraNota() {
  const h = 'flex h-9 items-center justify-center border-r border-white/15 px-1 text-[13px]'
  return (
    <div className={`cabecera hidden ${COLUMNAS}`}>
      <span className={h}>Cant:</span>
      <span className={`${h} col-span-2`}>Producto:</span>
      <span className={h}>Adicional:</span>
      <span className={h}>Detalle:</span>
      <span className={h}>Obs:</span>
      <span className={h}>Precio:</span>
      <span className={h}>PAdic:</span>
      <span className={`${h} bg-verde-2`}>Subtotal:</span>
      <span className={`${h} border-r-0`}>Estado:</span>
    </div>
  )
}

/* ── Las opciones de los desplegables ──────────────────────────────────── */

const CANTIDADES: Opcion<number>[] = Array.from({ length: 30 }, (_, i) => ({ valor: i + 1, etiqueta: String(i + 1) }))

/** El valor del detalle en la lista: «M|Corte 2 =» o «L|» (para llevar, sin corte). */
const claveDetalle = (paraLlevar: boolean, detalle: string | null) => `${paraLlevar ? 'L' : 'M'}|${detalle ?? ''}`

export function textoDetalle(paraLlevar: boolean, detalle: string | null) {
  if (paraLlevar) return `L: ${detalle ?? 'Para llevar'}`
  return detalle ? `M: ${detalle}` : ''
}

function opcionesDetalle(carta: Carta | null, familia: FamiliaCarta | null | undefined): Opcion<string>[] {
  const cortes = familia?.admiteCorte ? (carta?.detalles ?? []) : []
  return [
    ...cortes.map((d, i) => ({ valor: claveDetalle(false, d), etiqueta: `M: ${d}`, grupo: i === 0 ? 'En mesa' : undefined })),
    { valor: claveDetalle(true, null), etiqueta: 'L: Para llevar', grupo: cortes.length ? 'Para llevar' : undefined },
    ...cortes.map((d) => ({ valor: claveDetalle(true, d), etiqueta: `L: ${d}` })),
  ]
}

export function opcionesFamilia(carta: Carta | null): Opcion<number>[] {
  return [
    ...(carta?.familias ?? []).map((f) => ({
      valor: f.id,
      etiqueta: f.nombre,
      icono: iconoFamilia(f.icono),
      detalle: String(f.productos.length),
      // Se puede buscar por el producto o su código: «huaman» encuentra Shawarmas.
      buscar: f.productos.map((p) => `${p.nombre} ${p.codigo ?? ''}`).join(' '),
    })),
    { valor: -1, etiqueta: 'Otros (producto libre)', icono: mdiPlusBox },
  ]
}

function opcionesVariante(familia: FamiliaCarta | null | undefined): Opcion<number>[] {
  return (familia?.productos ?? []).map((p) => ({
    valor: p.id,
    etiqueta: varianteLegible(p.variante),
    detalle: p.disponible ? soles(p.precio) : 'Agotado',
    deshabilitada: !p.disponible,
    buscar: p.codigo ?? '',
  }))
}

/* ── Fila del borrador: todo se edita con desplegables ─────────────────── */

export function FilaBorrador({
  linea,
  carta,
  indice,
  alCambiar,
  alQuitar,
  alLibre,
}: {
  linea: LineaBorrador
  carta: Carta | null
  indice: IndiceCarta
  alCambiar: (parcial: Partial<LineaBorrador>) => void
  alQuitar: () => void
  alLibre: () => void
}) {
  const producto = linea.productoId ? indice.productos.get(linea.productoId) : undefined
  const familia = producto?.familia
  const [otraFamilia, setOtraFamilia] = useState<FamiliaCarta | null>(null)
  const [abrirVariante, setAbrirVariante] = useState(false)
  const familiaVista = otraFamilia ?? familia
  const { base, extra, subtotal } = precioLinea(linea, indice)
  const adicionales = useMemo(() => adicionalesPara(carta, familia), [carta, familia])

  const cambiarProducto = (p: ProductoCarta, f: FamiliaCarta) => {
    // Lo que no aplica a la nueva familia se cae: adicionales de otra cocina, cortes que no admite.
    const validos = new Set(adicionalesPara(carta, f).map((a) => a.id))
    alCambiar({
      productoId: p.id,
      libre: undefined,
      adicionales: linea.adicionales.filter((a) => validos.has(a)),
      detalle: f.admiteCorte ? linea.detalle : null,
    })
    setOtraFamilia(null)
  }

  return (
    <div className={`border-b border-reja bg-hoja px-2 py-2 lg:px-0 lg:py-0 ${COLUMNAS}`}>
      <div className="flex gap-1.5 lg:contents">
        <Celda className="w-[60px] shrink-0 lg:w-auto">
          <Desplegable
            titulo="Cantidad"
            valor={linea.cantidad}
            opciones={CANTIDADES}
            alCambiar={(cantidad) => alCambiar({ cantidad })}
            buscador={false}
            className="justify-center !pr-0.5 !pl-2 font-medium"
            ancho={90}
          />
        </Celda>
        {linea.libre ? (
          <Celda className="min-w-0 flex-[2] lg:col-span-2">
            <button onClick={alLibre} className="chip" title="Producto libre: cambiar nombre o precio">
              <Icono d={mdiPlusBox} className="size-[17px] text-tinta-2" />
              <span className="truncate">{linea.libre.nombre}</span>
            </button>
          </Celda>
        ) : (
          <>
            <Celda className="min-w-0 flex-1">
              <Desplegable
                titulo="Producto"
                valor={familiaVista?.id ?? null}
                opciones={opcionesFamilia(carta)}
                alCambiar={(id) => {
                  if (id === -1) return alLibre()
                  const f = carta?.familias.find((x) => x.id === id) ?? null
                  setOtraFamilia(f && f.id !== familia?.id ? f : null)
                  setAbrirVariante(true)
                }}
                ancho={260}
              />
            </Celda>
            <Celda className="min-w-0 flex-1">
              <Desplegable
                titulo={familiaVista?.nombre ?? 'Variante'}
                valor={otraFamilia ? null : (linea.productoId ?? null)}
                opciones={opcionesVariante(familiaVista)}
                vacio="Elegir…"
                abierto={abrirVariante}
                alAbrir={(v) => {
                  setAbrirVariante(v)
                  if (!v) setOtraFamilia(null)
                }}
                alCambiar={(id) => {
                  const p = familiaVista?.productos.find((x) => x.id === id)
                  if (p && familiaVista) cambiarProducto(p, familiaVista)
                }}
                ancho={240}
              />
            </Celda>
          </>
        )}
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1.5 lg:contents">
        <Celda>
          <DesplegableMultiple
            titulo="Adicional"
            valores={linea.adicionales}
            opciones={adicionales.map((a) => ({ valor: a.id, etiqueta: a.nombre, detalle: `+${soles(a.precio)}`, buscar: a.codigo ?? '' }))}
            alCambiar={(ids) => alCambiar({ adicionales: ids })}
            vacio="Adicional"
            deshabilitado={!adicionales.length}
            ancho={230}
            className="lg:[&_.text-tinta-3]:text-transparent"
          />
        </Celda>
        <Celda>
          <Desplegable
            titulo="Detalle"
            valor={claveDetalle(linea.paraLlevar, linea.detalle)}
            opciones={opcionesDetalle(carta, familia ?? null)}
            alCambiar={(v) => {
              const [lado, d] = v.split('|')
              alCambiar({ paraLlevar: lado === 'L', detalle: d || null })
            }}
            limpiar={{ etiqueta: '— (en mesa, sin detalle)', alElegir: () => alCambiar({ paraLlevar: false, detalle: null }) }}
            vacio="Detalle"
            buscador={false}
            ancho={200}
            className="lg:[&_.text-tinta-3]:text-transparent"
          />
        </Celda>
        <Celda>
          <CampoObs valor={linea.observacion ?? ''} alCambiar={(observacion) => alCambiar({ observacion: observacion || null })} />
        </Celda>
      </div>

      <div className="mt-1.5 flex items-center gap-2 lg:contents">
        <Celda className="justify-end text-[12.5px] text-tinta-3 tabular-nums lg:px-2 lg:text-[14px] lg:text-tinta">
          <span className="lg:hidden">Precio&nbsp;</span>
          {soles(base)}
        </Celda>
        <Celda className="justify-end text-[12.5px] text-tinta-3 tabular-nums lg:px-2 lg:text-[14px] lg:text-tinta">
          {extra > 0 ? (
            <>
              <span className="lg:hidden">+ PAdic&nbsp;</span>
              {soles(extra)}
            </>
          ) : (
            ''
          )}
        </Celda>
        <CeldaSubtotal valor={subtotal} className="ml-auto h-8 min-w-[92px] lg:ml-0 lg:h-11 lg:min-w-0" />
        <Celda className="justify-between gap-1 border-r-0 lg:pl-1.5">
          <span className="hidden h-7 flex-1 items-center justify-center bg-crema text-[12.5px] font-medium text-ambar-oscuro lg:flex">Sin guardar</span>
          <button onClick={alQuitar} title="Quitar fila" aria-label="Quitar fila" className="grid size-9 shrink-0 place-items-center text-tinta-3 hover:bg-rosa hover:text-rojo">
            <Icono d={mdiClose} className="size-5" />
          </button>
        </Celda>
      </div>
    </div>
  )
}

/**
 * La celda «Obs:»: texto libre, con las observaciones rápidas del local como
 * sugerencias. Se guarda en el borrador con cada letra (sin recortar mientras
 * se escribe), así nada se pierde si el mozo pulsa «Guardar» sin salir de ella.
 */
function CampoObs({ valor, alCambiar, deshabilitado = false }: { valor: string; alCambiar: (v: string) => void; deshabilitado?: boolean }) {
  return (
    <input
      value={valor}
      disabled={deshabilitado}
      list="observaciones-rapidas"
      onChange={(e) => alCambiar(e.target.value.slice(0, 140))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder="Obs."
      aria-label="Observación"
      className="h-[30px] w-full min-w-0 border border-transparent bg-gris-150 px-2 text-[14px] outline-none placeholder:text-tinta-3 hover:bg-[#dfe3e7] focus:border-azul focus:bg-hoja disabled:bg-transparent lg:placeholder:text-transparent"
    />
  )
}

/* ── Fila nueva: la primera fila vacía de la hoja ──────────────────────── */

export function FilaNueva({
  carta,
  deshabilitada,
  alElegir,
  alLibre,
}: {
  carta: Carta | null
  deshabilitada: boolean
  alElegir: (p: ProductoCarta) => void
  alLibre: () => void
}) {
  const [familia, setFamilia] = useState<FamiliaCarta | null>(null)
  const [abrirVariante, setAbrirVariante] = useState(false)
  const vacia = <Celda className="hidden lg:flex" />
  return (
    <div className={`border-b border-reja bg-hoja px-2 py-2 lg:px-0 lg:py-0 ${COLUMNAS}`}>
      <div className="flex gap-1.5 lg:contents">
        <Celda className="w-[60px] shrink-0 justify-center text-tinta-3 lg:w-auto">
          <span className="chip justify-center !bg-transparent text-tinta-4">1</span>
        </Celda>
        <Celda className="min-w-0 flex-1">
          <Desplegable
            titulo="Producto"
            valor={familia?.id ?? null}
            opciones={opcionesFamilia(carta)}
            alCambiar={(id) => {
              if (id === -1) return alLibre()
              setFamilia(carta?.familias.find((f) => f.id === id) ?? null)
              setAbrirVariante(true)
            }}
            vacio={deshabilitada ? 'Nota pagada' : 'Producto…'}
            deshabilitado={deshabilitada || !carta}
            ancho={260}
          />
        </Celda>
        <Celda className="min-w-0 flex-1">
          <Desplegable
            titulo={familia?.nombre ?? 'Variante'}
            valor={null}
            opciones={opcionesVariante(familia)}
            vacio={familia ? 'Elegir…' : ''}
            deshabilitado={!familia}
            abierto={abrirVariante}
            alAbrir={setAbrirVariante}
            alCambiar={(id) => {
              const p = familia?.productos.find((x) => x.id === id)
              if (p) alElegir(p)
              setFamilia(null)
            }}
            ancho={240}
          />
        </Celda>
      </div>
      <div className="hidden lg:contents">
        {vacia}
        {vacia}
        {vacia}
        {vacia}
        {vacia}
        <CeldaSubtotal valor={0} />
        <Celda className="border-r-0" />
      </div>
    </div>
  )
}

/* ── Fila ya guardada: se lee, no se edita ─────────────────────────────── */

export const ESTADO_FILA: Record<ItemPedido['estado'], { nombre: string; clase: string }> = {
  PENDIENTE: { nombre: 'Pendiente', clase: 'bg-menta text-verde-3' },
  LISTO: { nombre: 'Atendido', clase: 'bg-rosa-2 text-rojo-oscuro' },
  ENTREGADO: { nombre: 'Servido', clase: 'bg-gris-150 text-tinta-2' },
  ANULADO: { nombre: 'Anulado', clase: 'bg-ambar text-ambar-oscuro' },
}

export function FilaGuardada({
  item,
  indice,
  puedeAnular,
  alServir,
  alAnular,
}: {
  item: ItemPedido
  indice: IndiceCarta
  puedeAnular: boolean
  alServir: () => void
  alAnular: () => void
}) {
  const anulado = item.estado === 'ANULADO'
  const producto = item.productoId ? indice.productos.get(item.productoId) : undefined
  const variante = producto ? varianteLegible(producto.variante) : item.familia === 'Otros' ? '' : item.nombre
  const familia = producto?.familia.nombre ?? item.familia
  const estado = ESTADO_FILA[item.estado]
  const acciones = [
    ...(item.estado === 'LISTO' || item.estado === 'PENDIENTE' ? [{ etiqueta: 'Marcar como servido', icono: mdiCheck, alElegir: alServir }] : []),
    ...(!anulado && puedeAnular ? [{ etiqueta: 'Anular esta fila', icono: mdiCancel, peligro: true, alElegir: alAnular }] : []),
  ]
  const texto = anulado ? 'text-tinta-3 line-through decoration-tinta-3/60' : ''
  const adicionales = item.adicionales.map((a) => a.nombre).join(' + ')
  const detalle = textoDetalle(item.paraLlevar, item.detalle)

  return (
    <div className={`border-b border-reja px-3 py-2 lg:px-0 lg:py-0 ${anulado ? 'bg-ambar/60' : 'bg-hoja'} ${COLUMNAS}`}>
      {/* Celular: dos renglones de texto, como una comanda */}
      <div className="flex items-start gap-2 lg:hidden">
        <span className={`w-7 shrink-0 pt-px text-[15px] font-medium tabular-nums ${texto}`}>{item.cantidad}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-[15px] leading-snug ${texto}`}>
            {item.nombre}
            {item.ronda > 1 && <Agregado ronda={item.ronda} />}
          </p>
          {(adicionales || detalle || item.observacion) && (
            <p className={`mt-0.5 text-[13px] leading-snug text-tinta-2 ${texto}`}>
              {[adicionales && `+ ${adicionales}`, detalle, item.observacion].filter(Boolean).join(' · ')}
            </p>
          )}
          <span className={`mt-1 inline-block px-1.5 py-px text-[12px] font-medium ${estado.clase}`}>{estado.nombre}</span>
        </div>
        <span className={`pt-px text-[15px] font-medium tabular-nums ${texto}`}>{soles(item.subtotal)}</span>
        <AccionesFila acciones={acciones} />
      </div>

      {/* Pantalla grande: las celdas de la planilla */}
      <div className={`hidden lg:contents ${texto}`}>
        <Celda className="justify-center gap-1 text-[14px] font-medium tabular-nums">
          {item.cantidad}
          {item.ronda > 1 && <Agregado ronda={item.ronda} />}
        </Celda>
        <Celda className="gap-1.5 px-2 text-[14px]">
          <span className="truncate">{familia}</span>
        </Celda>
        <Celda className="px-2 text-[14px]">
          <span className="truncate">{variante}</span>
        </Celda>
        <Celda className="px-2 text-[14px]">
          <span className="truncate" title={adicionales}>
            {adicionales}
          </span>
        </Celda>
        <Celda className="px-2 text-[14px]">
          <span className="truncate">{detalle}</span>
        </Celda>
        <Celda className="px-2 text-[14px]">
          <span className="truncate" title={item.observacion ?? ''}>
            {item.observacion}
          </span>
        </Celda>
        <Celda className="justify-end px-2 text-[14px] tabular-nums">{soles(item.precio)}</Celda>
        <Celda className="justify-end px-2 text-[14px] tabular-nums">{item.precioAdicionales ? soles(item.precioAdicionales) : ''}</Celda>
        <Celda className="justify-end px-2 text-[14px] font-medium tabular-nums">{soles(item.subtotal)}</Celda>
      </div>
      <Celda className="hidden justify-between gap-1 border-r-0 pl-1.5 lg:flex">
        <span className={`flex h-7 flex-1 items-center justify-center text-[12.5px] font-medium no-underline ${estado.clase}`}>{estado.nombre}</span>
        <AccionesFila acciones={acciones} />
      </Celda>
    </div>
  )
}

/** La «A» de la columna K del Excel: la fila se agregó después del primer envío. */
function Agregado({ ronda }: { ronda: number }) {
  return (
    <span title={`Agregado después (envío ${ronda})`} className="ml-1 inline-grid size-[18px] place-items-center bg-turquesa align-[1px] text-[11px] font-bold text-white no-underline">
      A
    </span>
  )
}

function AccionesFila({ acciones }: { acciones: { etiqueta: string; icono?: string; peligro?: boolean; alElegir: () => void }[] }) {
  if (!acciones.length) return <span className="size-9 shrink-0" />
  return (
    <Menu
      titulo="Acciones de la fila"
      acciones={acciones}
      disparador={<Icono d={mdiDotsVertical} className="size-5" />}
      className="grid size-9 shrink-0 place-items-center text-tinta-2 hover:bg-gris-100 hover:text-tinta"
    />
  )
}
