// Estadísticas calculadas SOLO con datos guardados (compras, plan, consumos, precios).
import type { ConsumptionRecord, MealEntry, PriceRecord, Product, Purchase, Recipe, Unit } from './types';
import { summarizeRecipe, convertForProduct, productBaseUnit } from './recipeCalc';
import { roundMoney } from './format';
import { startOfWeek } from './dates';
import { roundQty } from './units';

/** Gasto real (compras registradas) agrupado por semana (lunes) o mes ('AAAA-MM'). */
export function spendBy(purchases: Purchase[], period: 'week' | 'month'): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of purchases) {
    const key = period === 'week' ? startOfWeek(p.date) : p.date.slice(0, 7);
    m.set(key, roundMoney((m.get(key) ?? 0) + p.total));
  }
  return m;
}

export interface PlannedCost {
  total: number;
  meals: number;
  servings: number;
  complete: boolean;
  perMeal: number | null;
  perServing: number | null;
}

/** Coste estimado de las comidas planificadas (ingredientes usados, no paquetes). */
export function plannedCost(entries: MealEntry[], recipes: Map<string, Recipe>, products: Map<string, Product>): PlannedCost {
  let total = 0;
  let servings = 0;
  let meals = 0;
  let complete = true;
  for (const e of entries) {
    const r = recipes.get(e.recipeId);
    if (!r) continue;
    const s = summarizeRecipe(r, products, e.servings);
    meals++;
    servings += e.servings;
    if (s.totalCost !== null) total += s.totalCost;
    if (!s.costComplete) complete = false;
  }
  total = roundMoney(total);
  return { total, meals, servings, complete, perMeal: meals ? roundMoney(total / meals) : null, perServing: servings ? roundMoney(total / servings) : null };
}

export function topRecipes(entries: MealEntry[], n = 5): { recipeId: string; count: number; prepared: number }[] {
  const m = new Map<string, { count: number; prepared: number }>();
  for (const e of entries) {
    const v = m.get(e.recipeId) ?? { count: 0, prepared: 0 };
    v.count++;
    if (e.prepared) v.prepared++;
    m.set(e.recipeId, v);
  }
  return [...m.entries()].map(([recipeId, v]) => ({ recipeId, ...v })).sort((a, b) => b.count - a.count).slice(0, n);
}

export interface ConsumedProduct {
  productId: string;
  quantity: number | null; // en unidad base del producto; null si hubo unidades no convertibles
  unit: Unit;
  cost: number;
  times: number;
}

export function consumedByProduct(records: ConsumptionRecord[], products: Map<string, Product>, reasons: ConsumptionRecord['reason'][]): ConsumedProduct[] {
  const m = new Map<string, ConsumedProduct>();
  for (const r of records) {
    if (!reasons.includes(r.reason)) continue;
    const p = products.get(r.productId);
    const base = p ? productBaseUnit(p) : r.unit;
    const cur = m.get(r.productId) ?? { productId: r.productId, quantity: 0, unit: base, cost: 0, times: 0 };
    const q = p ? convertForProduct(r.quantity, r.unit, base, p) : r.unit === base ? r.quantity : null;
    cur.quantity = cur.quantity === null || q === null ? null : roundQty(cur.quantity + q);
    cur.cost = roundMoney(cur.cost + (r.estimatedCost ?? 0));
    cur.times++;
    m.set(r.productId, cur);
  }
  return [...m.values()].sort((a, b) => b.cost - a.cost || b.times - a.times);
}

export interface PriceChange {
  productId: string;
  previous: number; // €/unidad base
  last: number;
  pct: number;
  baseUnit?: Unit;
  lastDate: string;
}

/** Orden cronológico: por fecha y, dentro del mismo día, por momento de registro. */
export function comparePriceRecords(a: PriceRecord, b: PriceRecord): number {
  return a.date.localeCompare(b.date) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
}

/** Variación entre los dos últimos precios registrados de cada producto. */
export function priceChanges(records: PriceRecord[]): PriceChange[] {
  const by = new Map<string, PriceRecord[]>();
  for (const r of records) {
    if (r.pricePerBase === undefined || r.pricePerBase <= 0) continue;
    by.set(r.productId, [...(by.get(r.productId) ?? []), r]);
  }
  const out: PriceChange[] = [];
  for (const [productId, arr] of by) {
    if (arr.length < 2) continue;
    arr.sort(comparePriceRecords);
    const prev = arr[arr.length - 2];
    const last = arr[arr.length - 1];
    const pct = ((last.pricePerBase! - prev.pricePerBase!) / prev.pricePerBase!) * 100;
    out.push({ productId, previous: prev.pricePerBase!, last: last.pricePerBase!, pct: Math.round(pct * 10) / 10, baseUnit: last.baseUnit, lastDate: last.date });
  }
  return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

/** Precio por unidad base → texto por kg/l/ud. */
export function perReferenceUnit(ppb: number, base?: Unit): { value: number; unit: Unit } {
  if (base === 'g') return { value: ppb * 1000, unit: 'kg' };
  if (base === 'ml') return { value: ppb * 1000, unit: 'l' };
  return { value: ppb, unit: base ?? 'ud' };
}
