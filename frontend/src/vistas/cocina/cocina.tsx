import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { mdiBroom, mdiCheckAll, mdiFullscreen, mdiVolumeHigh, mdiVolumeOff } from '@mdi/js'
import type { ComandaCocina, Estacion, ItemPedido, Sucursal } from '@wasi/shared'
import { ESTACIONES, NUMERO_ESTACION, codigoMesa, juntasEnCocina } from '@wasi/shared'
import { api } from '../../lib/api'
import { useRecurso } from '../../lib/recurso'
import { useCambios } from '../../lib/tiempo-real'
import { useAjustes, nombreCocina } from '../../lib/ajustes'
import { useSucursal } from '../../lib/sucursal'
import { hora, minutosDesde, useAhora } from '../../lib/formato'
import { audioDespierto, despertarAudio, estaSilenciado, silenciar, sonarComanda } from '../../lib/sonido'
import { avisar } from '../../componentes/avisos'
import { confirmar } from '../../componentes/dialogo'
import { Barra } from '../../componentes/barra'
import { Boton, BotonIcono } from '../../componentes/boton'
import { Desplegable } from '../../componentes/desplegable'
import { Membrete } from '../../componentes/marca'
import { Pestanas } from '../../componentes/pestanas'
import { Icono } from '../../componentes/icono'
import { textoDetalle } from '../mozo/filas'

/**
 * La hoja «Atención al Cliente» del Excel, para cada cocina: Nro · Mesa ·
 * Cliente · Cant · Producto · Adicional · Detalle · Obs · Estado · Ad.
 * Lo pendiente en menta, lo atendido en rosa y lo anulado en ámbar, con el
 * mismo formato condicional que el libro. «Limpiar» saca de la vista lo ya
 * resuelto; lo pendiente se queda.
 */

type Vista = Estacion | 'TODAS'

function leerVista(): Vista {
  try {
    const v = localStorage.getItem('wasi.estacion') as Vista | null
    return v && (v === 'TODAS' || ESTACIONES.includes(v as Estacion)) ? v : 'TODAS'
  } catch {
    return 'TODAS'
  }
}

const llaveLimpiado = (v: Vista) => `wasi.limpiado.${v}`
function leerLimpiado(v: Vista) {
  try {
    return localStorage.getItem(llaveLimpiado(v)) ?? ''
  } catch {
    return ''
  }
}

const COLOR_FILA: Record<ItemPedido['estado'], string> = {
  PENDIENTE: 'bg-menta',
  LISTO: 'bg-rosa-2',
  ENTREGADO: 'bg-rosa-2',
  ANULADO: 'bg-ambar',
}
const NOMBRE_ESTADO: Record<ItemPedido['estado'], string> = { PENDIENTE: 'Pendiente', LISTO: 'Atendido', ENTREGADO: 'Atendido', ANULADO: 'Anulado' }
const FRANJA: Record<Estacion, string> = { CARTA: 'bg-naranja', SHAWARMAS: 'bg-vino', BEBIDAS: 'bg-turquesa-2' }

/** Las columnas de la hoja; la cabecera y las filas las comparten. */
const COLUMNAS = 'lg:grid lg:grid-cols-[58px_74px_minmax(0,0.9fr)_54px_minmax(0,1.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_92px_140px_44px]'
/** Con la cocina compartida, la hoja suma la columna «Local:» después del número. */
const COLUMNAS_LOCAL =
  'lg:grid lg:grid-cols-[58px_116px_74px_minmax(0,0.9fr)_54px_minmax(0,1.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_92px_140px_44px]'
const TITULOS = ['Nro:', 'Mesa:', 'Cliente:', 'Cant:', 'Producto:', 'Adicional:', 'Detalle:', 'Obs:', 'Hora:', 'Estado:', 'Ad']

/**
 * Cocina compartida: cada local con su color de celda, siempre el mismo, para
 * que el cocinero y el mozo vean de un vistazo a dónde va cada comanda.
 */
const COLOR_LOCAL = ['bg-azul-oscuro', 'bg-magenta', 'bg-oliva', 'bg-verde-3']
const colorLocal = (id: number) => COLOR_LOCAL[(id - 1) % COLOR_LOCAL.length]
type Local = { nombre: string; color: string }

export function Cocina() {
  const [params, setParams] = useSearchParams()
  const vista: Vista = (params.get('e') as Vista | null) ?? leerVista()
  const ajustes = useAjustes()
  const { id: sucursalId, sucursales } = useSucursal()
  const [limpiado, setLimpiado] = useState(() => leerLimpiado(vista))

  // Los locales cuyas comandas salen en esta hoja: más de uno = cocina compartida, y cada comanda lleva su local.
  const locales = useMemo<Sucursal[]>(() => {
    if (!sucursalId) return []
    const ids = new Set((vista === 'TODAS' ? ESTACIONES : [vista]).flatMap((e) => juntasEnCocina(sucursales, sucursalId, e)))
    return sucursales.filter((s) => ids.has(s.id))
  }, [sucursales, sucursalId, vista])
  const compartida = locales.length > 1
  const localDe = (id: number): Local | null =>
    compartida ? { nombre: sucursales.find((s) => s.id === id)?.nombre ?? `Sucursal ${id}`, color: colorLocal(id) } : null
  const ruta = `/cocina?${new URLSearchParams({ ...(vista !== 'TODAS' && { estacion: vista }), ...(limpiado && { desde: limpiado }) })}`
  const { datos, error, recargar } = useRecurso<ComandaCocina[]>(ruta, (c) => !!c.cocina)
  const ahora = useAhora(15_000)
  const [silencio, setSilencio] = useState(estaSilenciado())
  const [dormido, setDormido] = useState(!audioDespierto())
  const [nuevas, setNuevas] = useState<Set<string>>(new Set())
  const [vistas, setVistas] = useState<Set<string> | null>(null)

  useEffect(() => {
    setLimpiado(leerLimpiado(vista))
    try {
      localStorage.setItem('wasi.estacion', vista)
    } catch {
      /* sin almacenamiento */
    }
  }, [vista])

  useCambios((c) => {
    if (c.aviso?.tipo === 'nuevo' && (vista === 'TODAS' || c.aviso.estaciones.includes(vista))) {
      sonarComanda()
      avisar(`Nuevo pedido · ${c.aviso.mesa}`, 'info')
    }
  })

  // Las comandas recién llegadas se encienden un momento, como una fila pegada.
  useEffect(() => {
    if (!datos) return
    const claves = new Set(datos.map((c) => c.clave))
    if (vistas) {
      const llegadas = [...claves].filter((k) => !vistas.has(k))
      if (llegadas.length) {
        setNuevas((n) => new Set([...n, ...llegadas]))
        setTimeout(() => setNuevas((n) => new Set([...n].filter((k) => !llegadas.includes(k)))), 2500)
      }
    }
    setVistas(claves)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos])

  const comandas = useMemo(() => datos ?? [], [datos])
  const filas = comandas.flatMap((c) => c.items)
  const pendientes = filas.filter((i) => i.estado === 'PENDIENTE')
  const resueltas = filas.filter((i) => i.estado !== 'PENDIENTE')
  const masAntigua = pendientes.length ? Math.max(...pendientes.map((i) => minutosDesde(i.creadoEn, ahora))) : 0

  const marcar = async (item: ItemPedido, listo: boolean) => {
    try {
      await api(`/cocina/items/${item.id}`, { cuerpo: { listo } })
      void recargar()
    } catch (e) {
      avisar((e as Error).message, 'error')
    }
  }
  const atenderTodo = async (c: ComandaCocina) => {
    try {
      await api('/cocina/comandas', { cuerpo: { pedidoId: c.pedidoId, ronda: c.ronda, estacion: c.items[0].estacion, listo: true } })
      void recargar()
    } catch (e) {
      avisar((e as Error).message, 'error')
    }
  }
  const limpiar = async () => {
    if (!resueltas.length) return
    const ok = await confirmar({
      titulo: 'Limpiar',
      mensaje: 'Se quitan de la hoja las filas atendidas y anuladas. Lo pendiente se queda.',
      aceptar: 'Limpiar',
      variante: 'oscuro',
    })
    if (!ok) return
    const ahoraIso = new Date().toISOString()
    try {
      localStorage.setItem(llaveLimpiado(vista), ahoraIso)
    } catch {
      /* sin almacenamiento: dura lo que la pestaña */
    }
    setLimpiado(ahoraIso)
  }

  const pestanas = (['CARTA', 'SHAWARMAS', 'BEBIDAS'] as Estacion[]).map((e) => ({
    clave: e,
    etiqueta: nombreCocina(ajustes, e),
    corta: `Cocina ${NUMERO_ESTACION[e]}`,
    a: `/cocina?e=${e}`,
    franja: FRANJA[e],
  }))

  return (
    <div
      className="min-h-dvh pb-[calc(44px+env(safe-area-inset-bottom))]"
      // El primer toque despierta el audio. Va en «click» (no al apoyar el dedo) y el aviso
      // flota sobre la hoja: así ese mismo toque llega entero a lo que se tocó.
      onClickCapture={() => {
        if (dormido) {
          despertarAudio()
          setDormido(false)
        }
      }}
    >
      <Barra
        color="bg-turquesa"
        titulo={vista === 'TODAS' ? 'Cocina · todas' : nombreCocina(ajustes, vista)}
        derecha={
          <>
            <BotonIcono
              icono={silencio ? mdiVolumeOff : mdiVolumeHigh}
              titulo={silencio ? 'Activar sonido' : 'Silenciar'}
              className="!text-white/85 hover:!bg-white/10 hover:!text-white"
              onClick={() => {
                silenciar(!silencio)
                setSilencio(!silencio)
                despertarAudio()
              }}
            />
            <BotonIcono
              icono={mdiFullscreen}
              titulo="Pantalla completa"
              className="hidden !text-white/85 hover:!bg-white/10 hover:!text-white sm:grid"
              onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
            />
          </>
        }
      />

      {dormido && !silencio && (
        <button
          onClick={() => {
            despertarAudio()
            setDormido(false)
          }}
          className="sombra-menu fixed inset-x-0 bottom-[calc(44px+env(safe-area-inset-bottom))] z-20 flex items-center justify-center gap-2 border-t border-[#f1c232] bg-crema px-3 py-2.5 text-[13.5px] font-medium text-ambar-oscuro"
        >
          <Icono d={mdiVolumeHigh} className="size-[18px]" /> Toca la pantalla para activar el aviso sonoro de pedidos nuevos
        </button>
      )}

      <main className="mx-auto max-w-[1440px] sm:px-4 sm:pt-4">
        <section className="hoja sombra-hoja">
          <Membrete
            color="verde"
            derecha={
              <Boton
                variante="oscuro"
                icono={mdiBroom}
                onClick={() => void limpiar()}
                disabled={!resueltas.length}
                className="h-10 border-2 !border-vino-3 !bg-verde-2 px-3 sm:h-11 sm:px-5 sm:text-[15px]"
              >
                Limpiar
              </Boton>
            }
          />
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 bg-turquesa px-3 py-2 text-white">
            <span className="text-[15px]">Atención al Cliente</span>
            <span className="text-[13px] text-white/80 tabular-nums">
              {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'} · {resueltas.length} atendida{resueltas.length === 1 ? '' : 's'}
              {pendientes.length > 0 && (
                <>
                  {' · '}
                  <span className={masAntigua >= ajustes.minutosAlerta ? 'font-medium text-[#ffd0c8]' : ''}>la más antigua {masAntigua} min</span>
                </>
              )}
            </span>
          </div>
          {compartida && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-reja bg-gris-50 px-3 py-1.5 text-[13px] text-tinta-2">
              <span>Cocina compartida:</span>
              {locales.map((s) => (
                <span key={s.id} className={`px-2 py-0.5 text-[12.5px] font-bold text-white ${colorLocal(s.id)}`}>
                  {s.nombre}
                </span>
              ))}
              <span className="text-tinta-3">cada comanda dice a qué local va</span>
            </div>
          )}

          <div className={`cabecera hidden bg-verde-2 ${compartida ? COLUMNAS_LOCAL : COLUMNAS}`}>
            {(compartida ? [TITULOS[0], 'Local:', ...TITULOS.slice(1)] : TITULOS).map((t) => (
              <span key={t} className="flex h-9 items-center justify-center border-r border-white/15 px-1 text-[13px] last:border-r-0">
                {t}
              </span>
            ))}
          </div>

          {error && !datos && <p className="px-4 py-6 text-rojo">{error}</p>}

          {comandas.map((c) => (
            <Fragment key={c.clave}>
              <GrupoComanda
                comanda={c}
                ahora={ahora}
                alerta={ajustes.minutosAlerta}
                nueva={nuevas.has(c.clave)}
                cocina={vista === 'TODAS' ? `Cocina ${NUMERO_ESTACION[c.items[0].estacion]}` : null}
                local={localDe(c.sucursalId)}
                alMarcar={marcar}
                alAtenderTodo={() => void atenderTodo(c)}
              />
            </Fragment>
          ))}

          {datos && comandas.length === 0 && (
            <div className="bg-menta/40 px-4 py-14 text-center">
              <p className="text-[17px] font-medium text-verde-3">Sin pedidos pendientes</p>
              <p className="mt-1 text-[14px] text-tinta-2">Los pedidos nuevos aparecen aquí con un aviso sonoro.</p>
            </div>
          )}
          {/* Filas vacías al pie, como la hoja del Excel esperando el siguiente pedido */}
          {Array.from({ length: Math.max(2, 6 - filas.length) }, (_, i) => (
            <div key={i} className="hidden h-10 border-b border-reja bg-menta/35 lg:block" />
          ))}
        </section>
      </main>

      <Pestanas
        grupos={[pestanas, [{ clave: 'TODAS', etiqueta: 'Todas', a: '/cocina?e=TODAS' }]]}
        activa={vista}
      />
    </div>
  )
}

function GrupoComanda({
  comanda,
  ahora,
  alerta,
  nueva,
  cocina,
  local,
  alMarcar,
  alAtenderTodo,
}: {
  comanda: ComandaCocina
  ahora: number
  alerta: number
  nueva: boolean
  cocina: string | null
  /** Cocina compartida: el local al que va la comanda. */
  local: Local | null
  alMarcar: (item: ItemPedido, listo: boolean) => void
  alAtenderTodo: () => void
}) {
  const pendientes = comanda.items.filter((i) => i.estado === 'PENDIENTE')
  const espera = minutosDesde(comanda.enviadoEn, ahora)
  const demorada = pendientes.length > 0 && espera >= alerta
  const agregado = comanda.ronda > 1
  const columnas = local ? COLUMNAS_LOCAL : COLUMNAS

  return (
    <div className={`border-t-2 border-tinta-3/60 first-of-type:border-t-0 ${nueva ? 'animate-destello' : ''}`}>
      {/* Celular: un renglón con el pedido y debajo sus platos */}
      <div className="flex items-center gap-2 border-b border-reja bg-gris-50 px-3 py-2 text-[14px] lg:hidden">
        <span className="font-bold tabular-nums">N° {comanda.numero}</span>
        <span className="font-medium">{codigoMesa(comanda.mesa)}</span>
        {local && <span className={`shrink-0 px-1.5 py-0.5 text-[12px] leading-tight font-bold text-white ${local.color}`}>{local.nombre}</span>}
        {comanda.cliente && <span className="truncate text-tinta-2">{comanda.cliente}</span>}
        {agregado && <Ad />}
        <span className={`ml-auto shrink-0 tabular-nums ${demorada ? 'font-medium text-rojo' : 'text-tinta-2'}`}>
          {hora(comanda.enviadoEn)}
          {pendientes.length > 0 && ` · ${espera} min`}
        </span>
        {pendientes.length > 1 && (
          <button onClick={alAtenderTodo} title="Marcar todo atendido" aria-label="Marcar todo atendido" className="grid size-9 place-items-center bg-verde-2 text-white">
            <Icono d={mdiCheckAll} className="size-5" />
          </button>
        )}
      </div>

      {comanda.items.map((item, i) => {
        const primera = i === 0
        const anulado = item.estado === 'ANULADO'
        const tachado = anulado ? 'line-through decoration-tinta-2/60' : ''
        const adicionales = item.adicionales.map((a) => a.nombre).join(' + ')
        const detalle = textoDetalle(item.paraLlevar, item.detalle)
        return (
          <div key={item.id} className={`border-b border-reja ${COLOR_FILA[item.estado]} ${columnas}`}>
            {/* Pantalla grande: celdas de la planilla */}
            <span className="hidden min-h-11 items-center justify-center gap-0.5 border-r border-black/10 text-[15px] font-bold tabular-nums lg:flex">
              {primera && comanda.numero}
            </span>
            {/* La celda del local se pinta en todas las filas de la comanda, como una celda combinada */}
            {local && (
              <span
                className={`hidden min-h-11 items-center justify-center border-r border-black/10 px-1.5 text-center text-[13px] leading-tight font-bold text-white lg:flex ${local.color}`}
              >
                {primera && local.nombre}
              </span>
            )}
            <span className="hidden min-h-11 flex-col items-center justify-center border-r border-black/10 text-[14px] leading-tight font-medium lg:flex">
              {primera && (
                <>
                  {codigoMesa(comanda.mesa)}
                  {cocina && <span className="text-[11px] font-normal text-tinta-2">{cocina}</span>}
                </>
              )}
            </span>
            <span className="hidden min-h-11 items-center border-r border-black/10 px-2 py-1 text-[14px] leading-tight lg:flex">{primera && comanda.cliente}</span>

            {/* Lo que se prepara: en el celular, el renglón entero */}
            <div className="flex items-start gap-2 px-3 py-2 lg:contents">
              <span className={`w-7 shrink-0 text-[17px] font-bold tabular-nums lg:flex lg:min-h-11 lg:w-auto lg:items-center lg:justify-center lg:border-r lg:border-black/10 lg:text-[15px] ${tachado}`}>
                {item.cantidad}
              </span>
              <span className={`min-w-0 flex-1 text-[16px] leading-snug font-medium lg:flex lg:min-h-11 lg:items-center lg:border-r lg:border-black/10 lg:px-2 lg:py-1 lg:text-[14.5px] lg:leading-tight ${tachado}`}>
                <span>{item.nombre}</span>
                <span className="mt-0.5 block text-[13.5px] font-normal text-tinta-2 lg:hidden">
                  {[adicionales && `+ ${adicionales}`, detalle, item.observacion].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`hidden min-h-11 items-center border-r border-black/10 px-2 py-1 text-[14px] leading-tight lg:flex ${tachado}`}>
                {adicionales}
              </span>
              <span className={`hidden min-h-11 items-center border-r border-black/10 px-2 py-1 text-[14px] leading-tight font-medium lg:flex ${tachado}`}>{detalle}</span>
              <span className={`hidden min-h-11 items-center border-r border-black/10 px-2 py-1 text-[14px] leading-tight lg:flex ${tachado}`}>
                {item.observacion}
              </span>
              <span className={`hidden min-h-11 flex-col items-center justify-center border-r border-black/10 text-[13px] leading-tight tabular-nums lg:flex ${demorada && item.estado === 'PENDIENTE' ? 'font-medium text-rojo' : 'text-tinta-2'}`}>
                {primera && hora(comanda.enviadoEn)}
                {primera && pendientes.length > 0 && <span>{espera} min</span>}
              </span>
              <span className="flex w-[132px] shrink-0 items-center gap-1 lg:min-h-11 lg:w-auto lg:border-r lg:border-black/10 lg:px-1.5">
                {anulado ? (
                  <span className="flex h-[30px] w-full items-center justify-center text-[13.5px] font-medium text-ambar-oscuro">Anulado</span>
                ) : (
                  <Desplegable
                    titulo={`Estado · ${item.cantidad} ${item.nombre}`}
                    valor={item.estado === 'PENDIENTE' ? 'PENDIENTE' : 'LISTO'}
                    opciones={[
                      { valor: 'PENDIENTE', etiqueta: 'Pendiente' },
                      { valor: 'LISTO', etiqueta: item.estado === 'ENTREGADO' ? 'Atendido (servido)' : 'Atendido' },
                    ]}
                    deshabilitado={item.estado === 'ENTREGADO'}
                    alCambiar={(v) => v !== (item.estado === 'PENDIENTE' ? 'PENDIENTE' : 'LISTO') && alMarcar(item, v === 'LISTO')}
                    mostrar={<span className="truncate font-medium">{NOMBRE_ESTADO[item.estado]}</span>}
                    buscador={false}
                    className="!h-[34px] !bg-white/70 hover:!bg-white"
                    ancho={170}
                  />
                )}
              </span>
              <span className="hidden min-h-11 items-center justify-center lg:flex">{agregado && primera && <Ad />}</span>
            </div>
          </div>
        )
      })}
      {pendientes.length > 1 && (
        <div className="hidden justify-end border-b border-reja bg-hoja px-2 py-1 lg:flex">
          <button onClick={alAtenderTodo} className="flex h-8 items-center gap-1.5 px-3 text-[13px] font-medium text-verde-2 hover:bg-menta-suave">
            <Icono d={mdiCheckAll} className="size-[18px]" /> Marcar todo N° {comanda.numero} como atendido
          </button>
        </div>
      )}
    </div>
  )
}

/** La columna «Ad»: el pedido se agregó después del primer envío. */
function Ad() {
  return (
    <span title="Agregado después del primer pedido" className="inline-grid size-6 place-items-center bg-turquesa text-[12px] font-bold text-white">
      A
    </span>
  )
}
