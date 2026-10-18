import {
  mdiBank,
  mdiBaguette,
  mdiBellRing,
  mdiBlender,
  mdiBottleSodaClassic,
  mdiBowl,
  mdiBowlMix,
  mdiBreadSlice,
  mdiCakeVariant,
  mdiCash,
  mdiCashRegister,
  mdiCellphone,
  mdiCheckCircle,
  mdiCheese,
  mdiChiliHot,
  mdiCoffee,
  mdiCoffeeToGo,
  mdiCreditCard,
  mdiCup,
  mdiCupWater,
  mdiEggFried,
  mdiFire,
  mdiFish,
  mdiFoodDrumstick,
  mdiFoodHotDog,
  mdiFoodSteak,
  mdiFoodTakeoutBox,
  mdiFrenchFries,
  mdiFruitCitrus,
  mdiFruitPineapple,
  mdiGlassCocktail,
  mdiGrill,
  mdiHamburger,
  mdiIceCream,
  mdiKettleSteam,
  mdiNoodles,
  mdiPasta,
  mdiPencil,
  mdiPizza,
  mdiPotSteam,
  mdiQrcode,
  mdiRice,
  mdiSilverwareForkKnife,
  mdiTableFurniture,
  mdiTaco,
  mdiTea,
} from '@mdi/js'
import type { EstadoMesa } from '@wasi/shared'

/**
 * Íconos: los de Material Design (los de Google, como Sheets), en sólido y a
 * un solo color. Se pintan con `currentColor`, así toman el color del texto.
 */
export function Icono({ d, className = 'size-5', titulo }: { d: string; className?: string; titulo?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden={titulo ? undefined : true} role={titulo ? 'img' : undefined}>
      {titulo && <title>{titulo}</title>}
      <path d={d} fill="currentColor" />
    </svg>
  )
}

/** El trompo del shawarma, dibujado en la misma retícula de 24 que el resto. */
export const mdiTrompo =
  'M11.25 1h1.5v3h-1.5zM5 4h14l-.86 4H5.86zM6.07 9h11.86l-.86 4H6.93zM7.14 14h9.72L16 18H8zM11.25 18h1.5v2h-1.5zM7 20h10v2H7z'

/**
 * Los íconos que se le pueden poner a una familia de la carta. La familia
 * guarda la clave; el panel de Administración muestra este catálogo.
 */
export const ICONOS_FAMILIA: Record<string, { nombre: string; d: string }> = {
  shawarma: { nombre: 'Shawarma', d: mdiTrompo },
  sanguche: { nombre: 'Sánguche', d: mdiBreadSlice },
  hamburguesa: { nombre: 'Hamburguesa', d: mdiHamburger },
  conito: { nombre: 'Papas', d: mdiFrenchFries },
  taco: { nombre: 'Taco', d: mdiTaco },
  hotdog: { nombre: 'Hot dog', d: mdiFoodHotDog },
  caldo: { nombre: 'Caldo', d: mdiPotSteam },
  brocheta: { nombre: 'Asado', d: mdiFoodSteak },
  parrilla: { nombre: 'Parrilla', d: mdiGrill },
  pollo: { nombre: 'Pollo', d: mdiFoodDrumstick },
  chifa: { nombre: 'Chifa', d: mdiNoodles },
  arroz: { nombre: 'Arroz', d: mdiRice },
  plato: { nombre: 'Plato', d: mdiSilverwareForkKnife },
  pescado: { nombre: 'Pescado', d: mdiFish },
  pizza: { nombre: 'Pizza', d: mdiPizza },
  pan: { nombre: 'Pan', d: mdiBaguette },
  pasta: { nombre: 'Pasta', d: mdiPasta },
  huevo: { nombre: 'Huevo', d: mdiEggFried },
  queso: { nombre: 'Queso', d: mdiCheese },
  aji: { nombre: 'Ají', d: mdiChiliHot },
  llevar: { nombre: 'Para llevar', d: mdiFoodTakeoutBox },
  emoliente: { nombre: 'Emoliente', d: mdiTea },
  jarra: { nombre: 'Calientito', d: mdiKettleSteam },
  taza: { nombre: 'Café', d: mdiCoffee },
  cafe: { nombre: 'Café para llevar', d: mdiCoffeeToGo },
  mate: { nombre: 'Mate', d: mdiCup },
  vaso: { nombre: 'Refresco', d: mdiCupWater },
  cremolada: { nombre: 'Helado', d: mdiIceCream },
  jugo: { nombre: 'Jugo', d: mdiFruitCitrus },
  batido: { nombre: 'Batido', d: mdiBlender },
  fruta: { nombre: 'Fruta', d: mdiFruitPineapple },
  coctel: { nombre: 'Cóctel', d: mdiGlassCocktail },
  botella: { nombre: 'Gaseosa', d: mdiBottleSodaClassic },
  postre: { nombre: 'Postre', d: mdiBowl },
  ensalada: { nombre: 'Ensalada', d: mdiBowlMix },
  torta: { nombre: 'Torta', d: mdiCakeVariant },
}

export const iconoFamilia = (clave: string | null | undefined) => ICONOS_FAMILIA[clave ?? '']?.d ?? mdiSilverwareForkKnife

/** Ícono de un medio de pago, por su nombre: efectivo, billetera del celular o banco. */
export function iconoMedio(medio: { clave: string; nombre: string; efectivo?: boolean }) {
  const n = `${medio.clave} ${medio.nombre}`.toLowerCase()
  if (medio.efectivo || n.includes('efectivo')) return mdiCash
  if (/yape|plin|tunki|bim|agora/.test(n)) return mdiCellphone
  if (/tarjeta|visa|master|pos/.test(n)) return mdiCreditCard
  if (/qr/.test(n)) return mdiQrcode
  if (/bcp|interbank|bbva|banco|bn|scotia|caja/.test(n)) return mdiBank
  return mdiCashRegister
}

/**
 * El estado de una mesa con los colores del formato condicional del Excel:
 * menta = Pendiente, rosa = Atendido. «Nota de pedido» es lo anotado en este
 * dispositivo que aún no se guarda.
 */
export type EstadoHoja = EstadoMesa | 'NOTA'

export const ESTADO_HOJA: Record<EstadoHoja, { nombre: string; d: string; fondo: string; texto: string; barra: string }> = {
  LIBRE: { nombre: 'Libre', d: mdiTableFurniture, fondo: 'bg-hoja', texto: 'text-tinta-3', barra: 'bg-transparent' },
  NOTA: { nombre: 'Nota de pedido', d: mdiPencil, fondo: 'bg-crema', texto: 'text-ambar-oscuro', barra: 'bg-[#f1c232]' },
  EN_COCINA: { nombre: 'Pendiente', d: mdiFire, fondo: 'bg-menta', texto: 'text-verde-3', barra: 'bg-verde-2' },
  LISTO: { nombre: 'Atendido', d: mdiBellRing, fondo: 'bg-rosa-2', texto: 'text-rojo-oscuro', barra: 'bg-salmon' },
  POR_COBRAR: { nombre: 'Por cobrar', d: mdiCashRegister, fondo: 'bg-celeste', texto: 'text-azul-oscuro', barra: 'bg-[#3c78d8]' },
}

export const ICONO_PAGADO = mdiCheckCircle
