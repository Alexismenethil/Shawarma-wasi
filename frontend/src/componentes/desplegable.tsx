import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { mdiCheck, mdiCheckboxBlankOutline, mdiCheckboxMarked, mdiMagnify, mdiMenuDown } from '@mdi/js'
import { Flotante, esCelular } from './flotante'
import { Icono } from './icono'

/**
 * El desplegable de la hoja: la celda con su flecha que abre una lista, como
 * la validación de datos del Excel del local. Se maneja con el dedo o con el
 * teclado (flechas, Enter, Escape y escribir para buscar).
 */

export interface Opcion<T> {
  valor: T
  etiqueta: string
  /** A la derecha y en gris: el precio, una cantidad. */
  detalle?: string
  icono?: string
  /** Más texto donde buscar: el código, la familia. */
  buscar?: string
  deshabilitada?: boolean
  /** Título de grupo que se pinta antes de esta opción. */
  grupo?: string
}

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function filtrar<T>(opciones: Opcion<T>[], texto: string) {
  const q = normal(texto.trim())
  if (!q) return opciones
  return opciones.filter((o) => normal(`${o.etiqueta} ${o.buscar ?? ''}`).includes(q))
}

interface Comun {
  titulo: string
  vacio?: string
  deshabilitado?: boolean
  /** 'chip' es la celda gris del Excel; 'campo' el campo blanco de un formulario. */
  estilo?: 'chip' | 'campo'
  className?: string
  ancho?: number
  /** Para abrirlo desde afuera (al elegir la familia se abre la variante). */
  abierto?: boolean
  alAbrir?: (abierto: boolean) => void
  /** Lo que se ve en la celda, si no basta el nombre de la opción. */
  mostrar?: ReactNode
}

function Disparador({
  abierto,
  setAbierto,
  refBoton,
  idLista,
  comun,
  contenido,
  alTeclear,
}: {
  abierto: boolean
  setAbierto: (v: boolean) => void
  refBoton: React.RefObject<HTMLButtonElement | null>
  idLista: string
  comun: Comun
  contenido: ReactNode
  alTeclear: (e: KeyboardEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      ref={refBoton}
      type="button"
      disabled={comun.deshabilitado}
      aria-haspopup="listbox"
      aria-expanded={abierto}
      aria-controls={abierto ? idLista : undefined}
      aria-label={comun.titulo}
      onClick={() => setAbierto(!abierto)}
      onKeyDown={alTeclear}
      className={`${comun.estilo === 'campo' ? 'campo flex items-center gap-1.5 pr-1 text-left' : 'chip'} ${comun.className ?? ''}`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">{contenido}</span>
      {!comun.deshabilitado && <Icono d={mdiMenuDown} className="size-5 text-tinta-2" />}
    </button>
  )
}

function Buscador({ valor, alCambiar, alTeclear, enfocar }: { valor: string; alCambiar: (v: string) => void; alTeclear: (e: KeyboardEvent<HTMLInputElement>) => void; enfocar: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (enfocar) ref.current?.focus()
  }, [enfocar])
  return (
    <label className="flex shrink-0 items-center gap-2 border-b border-reja px-3">
      <Icono d={mdiMagnify} className="size-[18px] text-tinta-3" />
      <input
        ref={ref}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        onKeyDown={alTeclear}
        placeholder="Buscar…"
        className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-tinta-4"
      />
    </label>
  )
}

function useLista<T>(opciones: Opcion<T>[], abierto: boolean, conBuscador: boolean) {
  const [texto, setTexto] = useState('')
  const [activo, setActivo] = useState(0)
  const visibles = useMemo(() => filtrar(opciones, texto), [opciones, texto])
  useEffect(() => {
    if (!abierto) setTexto('')
  }, [abierto])
  useEffect(() => setActivo(0), [texto])

  const mover = (paso: number) => {
    if (!visibles.length) return
    let i = activo
    for (let n = 0; n < visibles.length; n++) {
      i = (i + paso + visibles.length) % visibles.length
      if (!visibles[i].deshabilitada) break
    }
    setActivo(i)
  }
  return { texto, setTexto, activo, setActivo, visibles, mover, conBuscador }
}

function Fila<T>({
  op,
  activa,
  elegida,
  multiple,
  alElegir,
  alPasar,
  id,
}: {
  op: Opcion<T>
  activa: boolean
  elegida: boolean
  multiple?: boolean
  alElegir: () => void
  alPasar: () => void
  id: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (activa) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [activa])
  return (
    <>
      {op.grupo && <div className="sticky top-0 z-[1] bg-gris-100 px-3 py-1 text-[11.5px] font-medium tracking-wide text-tinta-2 uppercase">{op.grupo}</div>}
      <button
        ref={ref}
        id={id}
        type="button"
        role="option"
        aria-selected={elegida}
        disabled={op.deshabilitada}
        onClick={alElegir}
        onPointerMove={alPasar}
        className={`flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-[15px] sm:min-h-9 sm:text-[14px] ${
          activa ? 'bg-azul-suave' : ''
        } ${elegida && !multiple ? 'font-medium text-azul-oscuro' : ''} disabled:text-tinta-4`}
      >
        {multiple && <Icono d={elegida ? mdiCheckboxMarked : mdiCheckboxBlankOutline} className={`size-5 ${elegida ? 'text-verde-2' : 'text-tinta-3'}`} />}
        {op.icono && <Icono d={op.icono} className={`size-[18px] ${op.deshabilitada ? 'text-tinta-4' : 'text-tinta-2'}`} />}
        <span className="min-w-0 flex-1 truncate">{op.etiqueta}</span>
        {op.detalle && <span className="shrink-0 pl-3 text-[13px] text-tinta-3 tabular-nums">{op.detalle}</span>}
        {!multiple && <Icono d={mdiCheck} className={`size-[18px] ${elegida ? 'text-azul' : 'invisible'}`} />}
      </button>
    </>
  )
}

export function Desplegable<T>({
  valor,
  opciones,
  alCambiar,
  limpiar,
  buscador,
  ...comun
}: Comun & {
  valor: T | null
  opciones: Opcion<T>[]
  alCambiar: (v: T) => void
  /** Agrega arriba la opción que deja la celda vacía, con este nombre («—», «Sin detalle»). */
  limpiar?: { etiqueta: string; alElegir: () => void }
  buscador?: boolean
}) {
  const [abiertoPropio, setAbiertoPropio] = useState(false)
  const abierto = comun.abierto ?? abiertoPropio
  const setAbierto = (v: boolean) => {
    setAbiertoPropio(v)
    comun.alAbrir?.(v)
  }
  const boton = useRef<HTMLButtonElement>(null)
  const idLista = useId()
  const conBuscador = buscador ?? opciones.length > 12
  const lista = useLista(opciones, abierto, conBuscador)
  const elegida = opciones.find((o) => o.valor === valor)

  // Al abrir, la lista se para en lo elegido.
  useEffect(() => {
    if (abierto) lista.setActivo(Math.max(0, opciones.findIndex((o) => o.valor === valor)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  const elegir = (op: Opcion<T>) => {
    if (op.deshabilitada) return
    alCambiar(op.valor)
    setAbierto(false)
    boton.current?.focus({ preventScroll: true })
  }

  const teclas = (e: KeyboardEvent<HTMLElement>) => {
    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        setAbierto(true)
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      lista.mover(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const op = lista.visibles[lista.activo]
      if (op) elegir(op)
    } else if (e.key === 'Tab') {
      setAbierto(false)
    } else if (!conBuscador && e.key.length === 1 && /\S/.test(e.key)) {
      // Sin buscador, una letra salta a la primera opción que empieza con ella.
      const i = lista.visibles.findIndex((o) => normal(o.etiqueta).startsWith(normal(e.key)))
      if (i >= 0) lista.setActivo(i)
    }
  }

  return (
    <>
      <Disparador
        abierto={abierto}
        setAbierto={setAbierto}
        refBoton={boton}
        idLista={idLista}
        comun={comun}
        alTeclear={teclas}
        contenido={
          comun.mostrar ??
          (elegida ? (
            <>
              {elegida.icono && <Icono d={elegida.icono} className="size-[17px] text-tinta-2" />}
              <span className="truncate">{elegida.etiqueta}</span>
            </>
          ) : (
            <span className="truncate text-tinta-3">{comun.vacio ?? ''}</span>
          ))
        }
      />
      <Flotante abierto={abierto} alCerrar={() => setAbierto(false)} ancla={boton} titulo={comun.titulo} ancho={comun.ancho}>
        {conBuscador && <Buscador valor={lista.texto} alCambiar={lista.setTexto} alTeclear={teclas} enfocar={!esCelular()} />}
        <div id={idLista} role="listbox" aria-label={comun.titulo} className="barra-fina min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          {limpiar && !lista.texto && (
            <button
              type="button"
              onClick={() => {
                limpiar.alElegir()
                setAbierto(false)
              }}
              className="flex min-h-11 w-full items-center px-3 text-left text-[15px] text-tinta-3 hover:bg-gris-100 sm:min-h-9 sm:text-[14px]"
            >
              {limpiar.etiqueta}
            </button>
          )}
          {lista.visibles.map((op, i) => (
            <Fila
              key={String(op.valor)}
              id={`${idLista}-${i}`}
              op={op}
              activa={i === lista.activo}
              elegida={op.valor === valor}
              alElegir={() => elegir(op)}
              alPasar={() => lista.setActivo(i)}
            />
          ))}
          {lista.visibles.length === 0 && <p className="px-3 py-3 text-[14px] text-tinta-3">Nada coincide con «{lista.texto}».</p>}
        </div>
      </Flotante>
    </>
  )
}

/** Desplegable que deja marcar varias opciones (los adicionales de una línea). */
export function DesplegableMultiple<T>({
  valores,
  opciones,
  alCambiar,
  buscador,
  ...comun
}: Comun & { valores: T[]; opciones: Opcion<T>[]; alCambiar: (v: T[]) => void; buscador?: boolean }) {
  const [abiertoPropio, setAbiertoPropio] = useState(false)
  const abierto = comun.abierto ?? abiertoPropio
  const setAbierto = (v: boolean) => {
    setAbiertoPropio(v)
    comun.alAbrir?.(v)
  }
  const boton = useRef<HTMLButtonElement>(null)
  const idLista = useId()
  const conBuscador = buscador ?? opciones.length > 12
  const lista = useLista(opciones, abierto, conBuscador)
  const elegidas = opciones.filter((o) => valores.includes(o.valor))

  const alternar = (op: Opcion<T>) => {
    if (op.deshabilitada) return
    alCambiar(valores.includes(op.valor) ? valores.filter((v) => v !== op.valor) : [...valores, op.valor])
  }

  const teclas = (e: KeyboardEvent<HTMLElement>) => {
    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        setAbierto(true)
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      lista.mover(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter' || (e.key === ' ' && !conBuscador)) {
      e.preventDefault()
      const op = lista.visibles[lista.activo]
      if (op) alternar(op)
    } else if (e.key === 'Tab') {
      setAbierto(false)
    }
  }

  return (
    <>
      <Disparador
        abierto={abierto}
        setAbierto={setAbierto}
        refBoton={boton}
        idLista={idLista}
        comun={comun}
        alTeclear={teclas}
        contenido={
          comun.mostrar ??
          (elegidas.length ? (
            <span className="truncate">{elegidas.map((o) => o.etiqueta).join(' + ')}</span>
          ) : (
            <span className="truncate text-tinta-3">{comun.vacio ?? ''}</span>
          ))
        }
      />
      <Flotante
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        ancla={boton}
        titulo={comun.titulo}
        ancho={comun.ancho}
        pie={
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-reja bg-gris-50 px-2 py-2">
            <button type="button" onClick={() => alCambiar([])} disabled={!valores.length} className="boton boton-plano h-9 px-3 text-[13px]">
              Quitar todos
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="boton boton-oscuro h-9 px-5 text-[13px]">
              Listo
            </button>
          </div>
        }
      >
        {conBuscador && <Buscador valor={lista.texto} alCambiar={lista.setTexto} alTeclear={teclas} enfocar={!esCelular()} />}
        <div id={idLista} role="listbox" aria-multiselectable aria-label={comun.titulo} className="barra-fina min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          {lista.visibles.map((op, i) => (
            <Fila
              key={String(op.valor)}
              id={`${idLista}-${i}`}
              op={op}
              multiple
              activa={i === lista.activo}
              elegida={valores.includes(op.valor)}
              alElegir={() => alternar(op)}
              alPasar={() => lista.setActivo(i)}
            />
          ))}
          {lista.visibles.length === 0 && <p className="px-3 py-3 text-[14px] text-tinta-3">Nada coincide con «{lista.texto}».</p>}
        </div>
      </Flotante>
    </>
  )
}

/** Un menú de acciones (el «⋮» de una fila, el menú del usuario). */
export function Menu({
  titulo,
  disparador,
  acciones,
  className = '',
}: {
  titulo: string
  disparador: ReactNode
  acciones: { etiqueta: string; icono?: string; peligro?: boolean; deshabilitada?: boolean; alElegir: () => void }[]
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={titulo}
        title={titulo}
        onClick={() => setAbierto((v) => !v)}
        className={className}
      >
        {disparador}
      </button>
      <Flotante abierto={abierto} alCerrar={() => setAbierto(false)} ancla={boton} titulo={titulo} ancho={200}>
        <div role="menu" className="py-1">
          {acciones.map((a) => (
            <button
              key={a.etiqueta}
              type="button"
              role="menuitem"
              disabled={a.deshabilitada}
              onClick={() => {
                setAbierto(false)
                a.alElegir()
              }}
              className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px] hover:bg-gris-100 disabled:opacity-40 sm:min-h-10 sm:text-[14px] ${
                a.peligro ? 'text-rojo' : 'text-tinta'
              }`}
            >
              {a.icono && <Icono d={a.icono} className={`size-5 ${a.peligro ? 'text-rojo' : 'text-tinta-2'}`} />}
              {a.etiqueta}
            </button>
          ))}
        </div>
      </Flotante>
    </>
  )
}
