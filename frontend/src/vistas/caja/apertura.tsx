import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { mdiCashLockOpen, mdiCheckCircle, mdiChevronDown, mdiHistory, mdiLockOpenVariant, mdiPrinter } from '@mdi/js'
import type { Conteo, EstadoCaja } from '@wasi/shared'
import { sumarConteo } from '@wasi/shared'
import { api } from '../../lib/api'
import { useSesion } from '../../lib/sesion'
import { useSucursal } from '../../lib/sucursal'
import { diaLima, fechaHora, hoyLima, hora, soles, textoDiferencia, useAhora } from '../../lib/formato'
import { avisar } from '../../componentes/avisos'
import { Boton } from '../../componentes/boton'
import { confirmar } from '../../componentes/dialogo'
import { Icono } from '../../componentes/icono'
import { aCentimos } from '../mozo/pago'
import { CabeceraReporte, HojaArqueo, TicketCierre } from './arqueo'
import { ConteoEfectivo } from './conteo'
import { Imprimible } from './cobrar'

/**
 * Sin caja abierta: la apertura. Se cuenta el sencillo con que empieza el
 * turno (el último cierre sugiere lo que dejó) y se abre. Al lado, el último
 * cierre: su arqueo para imprimirlo y, si fue un error, el botón para
 * reabrirlo.
 */
export function Apertura({ estado, alCambiar }: { estado: EstadoCaja; alCambiar: () => void }) {
  const sesion = useSesion()
  const { sucursal } = useSucursal()
  const ahora = useAhora(30_000)
  const sugerido = estado.fondoSugerido ? estado.fondoSugerido : null
  const [monto, setMonto] = useState(() => (sugerido ? (sugerido / 100).toFixed(2) : ''))
  const [contar, setContar] = useState(false)
  const [conteo, setConteo] = useState<Conteo>({})
  const [abriendo, setAbriendo] = useState(false)
  // Recién cerrada, se muestra su arqueo para revisarlo e imprimirlo. El aviso del socket
  // puede llegar antes que la respuesta del cierre: la marca se mira también después.
  const [params, setParams] = useSearchParams()
  const recienCerrada = params.get('cerrada') === '1'
  const [verArqueo, setVerArqueo] = useState(recienCerrada)
  useEffect(() => {
    if (recienCerrada) setVerArqueo(true)
  }, [recienCerrada])
  const ultima = estado.ultima
  const montoInicial = contar ? sumarConteo(conteo) : aCentimos(monto)
  const dia = new Date(ahora).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })
  const fecha = dia.charAt(0).toUpperCase() + dia.slice(1)

  const abrir = async () => {
    setAbriendo(true)
    try {
      await api('/caja/abrir', { cuerpo: { montoInicial } })
      avisar(`Caja abierta con S/ ${soles(montoInicial)}`, 'ok')
      setParams({}, { replace: true })
      alCambiar()
    } catch (e) {
      avisar((e as Error).message, 'error')
    } finally {
      setAbriendo(false)
    }
  }

  const reabrir = async () => {
    if (!ultima) return
    const ok = await confirmar({
      titulo: 'Reabrir caja',
      aceptar: 'Reabrir caja',
      variante: 'oscuro',
      mensaje: (
        <div className="space-y-2">
          <p>
            La caja cerrada a las {hora(ultima.cerradaEn!)} vuelve a abrirse con todo lo que ya cobró. Lo contado (S/ {soles(ultima.contado ?? 0)}) queda en la bitácora.
          </p>
          <p>Úsalo si cerraste antes de tiempo; al terminar, ciérrala y cuenta otra vez.</p>
        </div>
      ),
    })
    if (!ok) return
    try {
      await api(`/caja/${ultima.id}/reabrir`, { cuerpo: {} })
      avisar('Caja reabierta', 'ok')
      setParams({}, { replace: true })
      alCambiar()
    } catch (e) {
      avisar((e as Error).message, 'error')
    }
  }

  return (
    <div className={`mx-auto grid items-start gap-4 sm:px-4 sm:py-5 ${ultima ? 'max-w-[1200px] lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]' : 'max-w-[500px]'}`}>
      <section className="hoja sombra-hoja">
        <CabeceraReporte color="#1c4587">
          <Icono d={mdiCashLockOpen} className="size-[18px]" /> Apertura de caja
        </CabeceraReporte>
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] border-b border-reja text-[14px]">
          <dt className="rotulo-negro h-10 border-b border-white/20">Sucursal</dt>
          <dd className="flex h-10 items-center border-b border-reja bg-campo px-3 font-medium">{sucursal?.nombre ?? '…'}</dd>
          <dt className="rotulo-negro h-10 border-b border-white/20">Fecha</dt>
          <dd className="flex h-10 items-center border-b border-reja bg-campo px-3">{fecha}</dd>
          <dt className="rotulo-negro h-10">Cajero(a)</dt>
          <dd className="flex h-10 items-center bg-campo px-3">{sesion?.usuario.nombre}</dd>
        </dl>

        <div className="grid gap-4 p-4">
          <label className="grid gap-1.5">
            <span className="text-[14px] font-medium">Fondo inicial: el sencillo para dar vuelto</span>
            <span className="flex items-stretch">
              <span className="flex items-center border border-r-0 border-reja-2 bg-gris-100 px-3 text-[15px] text-tinta-2">S/</span>
              <input
                value={contar ? (montoInicial / 100).toFixed(2) : monto}
                readOnly={contar}
                onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))}
                onFocus={(e) => e.target.select()}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Fondo inicial"
                className="campo h-14 text-right text-[26px] font-bold tabular-nums read-only:bg-gris-50"
              />
            </span>
          </label>
          {sugerido && !contar && (
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-tinta-2">
              El último cierre dejó <b className="font-medium text-tinta">S/ {soles(sugerido)}</b> para este turno.
              {aCentimos(monto) !== sugerido && (
                <button onClick={() => setMonto((sugerido / 100).toFixed(2))} className="text-azul underline">
                  Usar ese monto
                </button>
              )}
            </p>
          )}

          <button onClick={() => setContar(!contar)} aria-expanded={contar} className="flex items-center gap-1.5 self-start text-[13.5px] text-azul hover:underline">
            <Icono d={mdiChevronDown} className={`size-5 transition-transform ${contar ? 'rotate-180' : ''}`} />
            {contar ? 'Escribir solo el total' : 'Contar billete por billete'}
          </button>
          {contar && <ConteoEfectivo conteo={conteo} alCambiar={setConteo} />}

          {estado.porCobrar.notas > 0 && (
            <p className="border border-reja bg-gris-50 px-3 py-2 text-[13px] text-tinta-2">
              Hay {estado.porCobrar.notas} nota{estado.porCobrar.notas === 1 ? '' : 's'} esperando cobro (S/ {soles(estado.porCobrar.total)}). Se cobran apenas abras la caja.
            </p>
          )}

          <Boton variante="cobrar" icono={mdiCashLockOpen} cargando={abriendo} onClick={() => void abrir()} className="h-12 text-[15px]">
            Abrir caja con S/ {soles(montoInicial)}
          </Boton>
        </div>
      </section>

      {ultima && (
        <section className="grid gap-3">
          <div className="hoja sombra-hoja">
            <CabeceraReporte color="#434343">
              <Icono d={mdiHistory} className="size-[18px]" /> Último cierre
            </CabeceraReporte>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[14px]">
              <span>
                {diaLima(ultima.cerradaEn!) === hoyLima() ? 'Hoy' : fechaHora(ultima.cerradaEn!).split(' ')[0]} a las <b className="font-medium">{hora(ultima.cerradaEn!)}</b> · {ultima.cerradaPor}
              </span>
              <span className="tabular-nums">
                Vendió <b className="font-medium">S/ {soles(ultima.ventas)}</b>
              </span>
              {ultima.diferencia !== null && (
                <span className={`flex items-center gap-1 font-medium ${ultima.diferencia === 0 ? 'text-verde-2' : ultima.diferencia < 0 ? 'text-rojo' : 'text-azul-oscuro'}`}>
                  {ultima.diferencia === 0 && <Icono d={mdiCheckCircle} className="size-4" />}
                  {textoDiferencia(ultima.diferencia)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-reja bg-gris-50 px-4 py-3">
              <Boton onClick={() => setVerArqueo(!verArqueo)} className="h-10">
                {verArqueo ? 'Ocultar arqueo' : 'Ver arqueo'}
              </Boton>
              <Boton icono={mdiPrinter} onClick={() => window.print()} className="h-10">
                Imprimir cierre
              </Boton>
              {estado.puedeReabrir && (
                <Boton variante="oscuro" icono={mdiLockOpenVariant} onClick={() => void reabrir()} className="h-10">
                  Reabrir caja
                </Boton>
              )}
            </div>
            {!estado.puedeReabrir && (
              <p className="border-t border-reja px-4 py-2 text-[12.5px] text-tinta-3">¿Se cerró por error? Quien la cerró puede reabrirla el mismo día; si no, la encargada.</p>
            )}
          </div>
          {verArqueo && <HojaArqueo arqueo={ultima} />}
          <Imprimible>
            <TicketCierre arqueo={ultima} sucursal={sucursal?.nombre} />
          </Imprimible>
        </section>
      )}
    </div>
  )
}
