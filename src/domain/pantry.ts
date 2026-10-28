// Despensa: consumo por lotes (primero lo que caduca antes) y avisos de caducidad.
import type { PantryItem, Product, RecipeIngredient, Unit } from './types';
import { convert, roundQty } from './units';
import { convertForProduct } from './recipeCalc';
import { daysBetween } from './dates';

export type ExpiryState = 'caducado' | 'pronto' | 'ok' | 'sin-fecha';

export function expiryState(item: Pick<PantryItem, 'expiryDate'>, todayISO: string, warnDays: number): ExpiryState {
  if (!item.expiryDate) return 'sin-fecha';
  const d = daysBetween(todayISO, item.expiryDate);
  if (d < 0) return 'caducado';
  if (d <= warnDays) return 'pronto';
  return 'ok';
}

export interface LotDeduction {
  lotId: string;
  /** Cantidad a descontar en la unidad del lote. */
  quantity: number;
  unit: Unit;
  remainingAfter: number;
}

export interface ConsumptionLine {
  productId: string;
  needed: number;
  unit: Unit;
  deductions: LotDeduction[];
  /** Lo que falta (en `unit`) si la despensa no alcanza. */
  shortage: number;
  /** Hay lotes del producto con unidades no convertibles. */
  incompatibleLots: boolean;
}

/** Ordena lotes: primero los que caducan antes; los que no tienen fecha, al final. */
export function sortLotsFifo(lots: PantryItem[]): PantryItem[] {
  return [...lots].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
    if (a.expiryDate) return -1;
    if (b.expiryDate) return 1;
    return (a.purchaseDate ?? a.createdAt).localeCompare(b.purchaseDate ?? b.createdAt);
  });
}

/**
 * Calcula qué descontar de la despensa para unos ingredientes.
 * No modifica nada: devuelve un plan que el usuario confirma.
 */
export function planConsumption(ingredients: RecipeIngredient[], pantry: PantryItem[], products: Map<string, Product>): ConsumptionLine[] {
  const remaining = new Map(pantry.map((p) => [p.id, p.quantity]));
  const lines: ConsumptionLine[] = [];
  for (const ing of ingredients) {
    const product = products.get(ing.productId);
    const conv = (q: number, from: Unit, to: Unit) => (product ? convertForProduct(q, from, to, product) : convert(q, from, to));
    let need = ing.quantity;
    const deductions: LotDeduction[] = [];
    let incompatible = false;
    for (const lot of sortLotsFifo(pantry.filter((p) => p.productId === ing.productId))) {
      if (need <= 1e-9) break;
      const left = remaining.get(lot.id) ?? 0;
      if (left <= 0) continue;
      const leftInIng = conv(left, lot.unit, ing.unit);
      if (leftInIng === null) {
        incompatible = true;
        continue;
      }
      const take = Math.min(leftInIng, need);
      const takeInLot = conv(take, ing.unit, lot.unit) ?? 0;
      const after = roundQty(Math.max(0, left - takeInLot));
      remaining.set(lot.id, after);
      deductions.push({ lotId: lot.id, quantity: roundQty(takeInLot), unit: lot.unit, remainingAfter: after });
      need -= take;
    }
    lines.push({
      productId: ing.productId,
      needed: ing.quantity,
      unit: ing.unit,
      deductions,
      shortage: roundQty(Math.max(0, need)),
      incompatibleLots: incompatible,
    });
  }
  return lines;
}
