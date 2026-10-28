// Unidades y conversiones.
//
// Regla de oro: solo se convierte cuando existe una equivalencia válida.
//  - g ↔ kg y ml ↔ l ↔ cda ↔ cdta siempre (misma dimensión).
//  - ud ↔ g solo si el producto tiene `gramsPerUnit`.
//  - ml ↔ g solo si el producto tiene `densityGPerMl`.
//  - 'pizca' y 'paquete' no se convierten nunca de forma genérica
//    (un paquete se resuelve con el tamaño de envase del producto, fuera de aquí).

import type { Dimension, Product, Unit } from './types';

interface UnitInfo {
  label: string;
  dimension: Dimension;
  /** Factor para pasar a la unidad base de su dimensión (g, ml, ud). */
  toBase: number;
}

export const UNITS: Record<Unit, UnitInfo> = {
  g: { label: 'g', dimension: 'mass', toBase: 1 },
  kg: { label: 'kg', dimension: 'mass', toBase: 1000 },
  ml: { label: 'ml', dimension: 'volume', toBase: 1 },
  l: { label: 'l', dimension: 'volume', toBase: 1000 },
  cda: { label: 'cda', dimension: 'volume', toBase: 15 },
  cdta: { label: 'cdta', dimension: 'volume', toBase: 5 },
  ud: { label: 'ud', dimension: 'count', toBase: 1 },
  pizca: { label: 'pizca', dimension: 'other', toBase: 1 },
  paquete: { label: 'paquete', dimension: 'other', toBase: 1 },
};

export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'g', label: 'gramos (g)' },
  { value: 'kg', label: 'kilogramos (kg)' },
  { value: 'ml', label: 'mililitros (ml)' },
  { value: 'l', label: 'litros (l)' },
  { value: 'ud', label: 'unidades (ud)' },
  { value: 'cda', label: 'cucharadas (15 ml)' },
  { value: 'cdta', label: 'cucharaditas (5 ml)' },
  { value: 'pizca', label: 'pizca' },
  { value: 'paquete', label: 'paquete / envase' },
];

const BASE_UNIT: Record<Dimension, Unit> = { mass: 'g', volume: 'ml', count: 'ud', other: 'pizca' };

export function dimensionOf(unit: Unit): Dimension {
  return UNITS[unit].dimension;
}

export function baseUnitOf(unit: Unit): Unit {
  const d = dimensionOf(unit);
  return d === 'other' ? unit : BASE_UNIT[d];
}

/** Equivalencias propias de un producto (las que permiten cruzar dimensiones). */
export type ProductEquivalences = Pick<Product, 'gramsPerUnit' | 'densityGPerMl'>;

/** Gramos por unidad base de la dimensión (para cruzar dimensiones), o null. */
function gramsPerBase(dim: Dimension, eq?: ProductEquivalences): number | null {
  if (dim === 'mass') return 1;
  if (dim === 'count') return eq?.gramsPerUnit && eq.gramsPerUnit > 0 ? eq.gramsPerUnit : null;
  if (dim === 'volume') return eq?.densityGPerMl && eq.densityGPerMl > 0 ? eq.densityGPerMl : null;
  return null;
}

/**
 * Convierte `qty` de `from` a `to`. Devuelve null si no hay equivalencia válida.
 * Nunca "adivina": 2 ud de huevo no se pasan a gramos sin `gramsPerUnit`.
 */
export function convert(qty: number, from: Unit, to: Unit, eq?: ProductEquivalences): number | null {
  if (from === to) return qty;
  const df = dimensionOf(from);
  const dt = dimensionOf(to);
  if (df === 'other' || dt === 'other') return null;
  if (df === dt) return (qty * UNITS[from].toBase) / UNITS[to].toBase;
  const gf = gramsPerBase(df, eq);
  const gt = gramsPerBase(dt, eq);
  if (gf === null || gt === null) return null;
  const grams = qty * UNITS[from].toBase * gf;
  return grams / gt / UNITS[to].toBase;
}

export function canConvert(from: Unit, to: Unit, eq?: ProductEquivalences): boolean {
  return convert(1, from, to, eq) !== null;
}

/** Redondea para mostrar/guardar evitando 0,30000000000000004. */
export function roundQty(qty: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round((qty + Number.EPSILON) * f) / f;
}

/**
 * Elige una unidad cómoda de leer: 1500 g → 1,5 kg; 250 ml → 250 ml.
 * Solo cambia entre g/kg y ml/l.
 */
export function humanize(qty: number, unit: Unit): { quantity: number; unit: Unit } {
  if (unit === 'g' && Math.abs(qty) >= 1000) return { quantity: roundQty(qty / 1000), unit: 'kg' };
  if (unit === 'ml' && Math.abs(qty) >= 1000) return { quantity: roundQty(qty / 1000), unit: 'l' };
  if (unit === 'kg' && Math.abs(qty) < 1) return { quantity: roundQty(qty * 1000), unit: 'g' };
  if (unit === 'l' && Math.abs(qty) < 1) return { quantity: roundQty(qty * 1000), unit: 'ml' };
  return { quantity: roundQty(qty), unit };
}

/** Suma cantidades si son compatibles; devuelve null si no lo son. */
export function addQuantities(
  a: { quantity: number; unit: Unit },
  b: { quantity: number; unit: Unit },
  eq?: ProductEquivalences,
): { quantity: number; unit: Unit } | null {
  const converted = convert(b.quantity, b.unit, a.unit, eq);
  if (converted === null) return null;
  return { quantity: a.quantity + converted, unit: a.unit };
}

/** Normaliza texto para búsquedas: minúsculas y sin tildes. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

const UNIT_ALIASES: Record<string, Unit> = {
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml',
  cl: 'ml', // se trata aparte (×10) en parseUnit
  l: 'l', lt: 'l', litro: 'l', litros: 'l',
  ud: 'ud', uds: 'ud', u: 'ud', unidad: 'ud', unidades: 'ud', pieza: 'ud', piezas: 'ud',
  cda: 'cda', cdas: 'cda', cucharada: 'cda', cucharadas: 'cda',
  cdta: 'cdta', cdtas: 'cdta', cucharadita: 'cdta', cucharaditas: 'cdta',
  pizca: 'pizca', pizcas: 'pizca',
  paquete: 'paquete', paquetes: 'paquete', envase: 'paquete', envases: 'paquete',
  bote: 'paquete', botes: 'paquete', lata: 'paquete', latas: 'paquete',
};

/** Interpreta un texto de unidad ("gramos", "cdas"...). Devuelve factor extra para cl. */
export function parseUnit(text: string): { unit: Unit; factor: number } | null {
  const t = normalizeText(text).replace(/\.$/, '');
  if (t === 'cl') return { unit: 'ml', factor: 10 };
  const u = UNIT_ALIASES[t];
  return u ? { unit: u, factor: 1 } : null;
}
