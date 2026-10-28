// Lista de la compra: subtotales, resumen económico y generación desde el plan.
//
// Flujo de generación:
//   1. aggregateRequirements: suma lo que piden todas las recetas planificadas
//      (200 g + 300 g de pollo = 500 g), escalado a las raciones de cada comida.
//   2. subtractPantry: resta lo que ya hay en casa (si las unidades son compatibles).
//   3. planPurchase: decide cuánto comprar (redondeando a envases si se conoce el envase).

import type { MealEntry, PantryItem, Product, Recipe, ShoppingItem, Unit } from './types';
import { baseUnitOf, convert, roundQty, humanize } from './units';
import { convertForProduct, pricePerBase, productBaseUnit, scaleIngredients } from './recipeCalc';
import { roundMoney } from './format';

// ───────────────────────── Subtotales y resumen ─────────────────────────

/** Convierte la cantidad de una línea a la unidad del precio. null si es incompatible. */
export function quantityInPriceUnit(item: Pick<ShoppingItem, 'quantity' | 'unit' | 'priceUnit' | 'packageQuantity' | 'packageUnit'>, eq?: Pick<Product, 'gramsPerUnit' | 'densityGPerMl'>): number | null {
  const priceUnit = item.priceUnit ?? item.unit;
  if (item.unit === priceUnit) return item.quantity;
  const pseudo = {
    unit: item.unit,
    packageQuantity: item.packageQuantity,
    packageUnit: item.packageUnit,
    gramsPerUnit: eq?.gramsPerUnit,
    densityGPerMl: eq?.densityGPerMl,
  } as Product;
  return convertForProduct(item.quantity, item.unit, priceUnit, pseudo);
}

/** Subtotal estimado = cantidad (en la unidad del precio) × precio unitario. */
export function itemSubtotal(item: Pick<ShoppingItem, 'quantity' | 'unit' | 'unitPrice' | 'priceUnit' | 'packageQuantity' | 'packageUnit'>, eq?: Pick<Product, 'gramsPerUnit' | 'densityGPerMl'>): number | null {
  if (item.unitPrice === undefined || item.unitPrice === null) return null;
  const q = quantityInPriceUnit(item, eq);
  if (q === null) return null;
  return roundMoney(q * item.unitPrice);
}

export interface ListSummary {
  estimatedTotal: number;
  purchasedAmount: number; // importe de lo comprado (pagado si se indicó; si no, estimado)
  purchasedPaidConfirmed: number; // parte del importe comprado con precio real introducido
  purchasedEstimatedOnly: number; // parte del importe comprado que sigue siendo estimación
  pendingAmount: number;
  budget?: number;
  budgetRemaining?: number; // presupuesto - (comprado + pendiente)
  pendingCount: number;
  purchasedCount: number;
  unknownPriceCount: number;
}

export function lineAmount(item: ShoppingItem): { amount: number | null; isPaid: boolean } {
  if (item.status === 'comprado' && item.paidPrice !== undefined && item.paidPrice !== null) {
    return { amount: roundMoney(item.paidPrice), isPaid: true };
  }
  return { amount: itemSubtotal(item), isPaid: false };
}

export function summarizeList(items: ShoppingItem[], budget?: number): ListSummary {
  let estimatedTotal = 0;
  let purchasedAmount = 0;
  let paid = 0;
  let estOnly = 0;
  let pendingAmount = 0;
  let pendingCount = 0;
  let purchasedCount = 0;
  let unknown = 0;
  for (const it of items) {
    const est = itemSubtotal(it);
    if (est === null) unknown++;
    else estimatedTotal += est;
    if (it.status === 'comprado') {
      purchasedCount++;
      const { amount, isPaid } = lineAmount(it);
      if (amount !== null) {
        purchasedAmount += amount;
        if (isPaid) paid += amount;
        else estOnly += amount;
      }
    } else {
      pendingCount++;
      if (est !== null) pendingAmount += est;
    }
  }
  const summary: ListSummary = {
    estimatedTotal: roundMoney(estimatedTotal),
    purchasedAmount: roundMoney(purchasedAmount),
    purchasedPaidConfirmed: roundMoney(paid),
    purchasedEstimatedOnly: roundMoney(estOnly),
    pendingAmount: roundMoney(pendingAmount),
    pendingCount,
    purchasedCount,
    unknownPriceCount: unknown,
  };
  if (budget !== undefined && budget !== null) {
    summary.budget = budget;
    summary.budgetRemaining = roundMoney(budget - summary.purchasedAmount - summary.pendingAmount);
  }
  return summary;
}

// ───────────────────────── Necesidades desde el plan ─────────────────────────

export interface Requirement {
  key: string; // productId|unidadBase
  productId: string;
  quantity: number; // en `unit`
  unit: Unit; // unidad base (g, ml, ud) o unidad no convertible (pizca/paquete)
  recipeIds: string[];
  /** true si hubo ingredientes de este producto en unidades que no se pudieron sumar a esta línea. */
  splitByUnits?: boolean;
}

/**
 * Suma los ingredientes de todas las comidas, escalados a sus raciones.
 * Los ingredientes del mismo producto se unifican si sus unidades son compatibles;
 * si no lo son (p. ej. "2 ud" sin peso por unidad y "200 g"), quedan en líneas separadas.
 */
export function aggregateRequirements(entries: MealEntry[], recipes: Map<string, Recipe>, products: Map<string, Product>): Requirement[] {
  const map = new Map<string, Requirement>();
  for (const entry of entries) {
    const recipe = recipes.get(entry.recipeId);
    if (!recipe) continue;
    const ings = scaleIngredients(recipe.ingredients.filter((i) => !i.optional), recipe.servings, entry.servings);
    for (const ing of ings) {
      const product = products.get(ing.productId);
      if (!product) continue;
      const target = productBaseUnit(product);
      let qty = convertForProduct(ing.quantity, ing.unit, target, product);
      let unit = target;
      if (qty === null) {
        unit = baseUnitOf(ing.unit);
        qty = convert(ing.quantity, ing.unit, unit) ?? ing.quantity;
      }
      const key = `${ing.productId}|${unit}`;
      const prev = map.get(key);
      if (prev) {
        prev.quantity = roundQty(prev.quantity + qty);
        if (!prev.recipeIds.includes(recipe.id)) prev.recipeIds.push(recipe.id);
      } else {
        map.set(key, { key, productId: ing.productId, quantity: roundQty(qty), unit, recipeIds: [recipe.id] });
      }
    }
  }
  const reqs = [...map.values()];
  const count = new Map<string, number>();
  reqs.forEach((r) => count.set(r.productId, (count.get(r.productId) ?? 0) + 1));
  reqs.forEach((r) => {
    if ((count.get(r.productId) ?? 0) > 1) r.splitByUnits = true;
  });
  return reqs;
}

export interface NetRequirement extends Requirement {
  available: number; // en `unit`
  toBuy: number; // en `unit`
  /** Hay existencias en la despensa pero en unidades no convertibles a esta línea. */
  pantryIncompatible: boolean;
}

/** Resta la despensa a las necesidades. Nunca devuelve cantidades negativas. */
export function subtractPantry(reqs: Requirement[], pantry: PantryItem[], products: Map<string, Product>): NetRequirement[] {
  // La despensa se reparte entre líneas: lo que se usa en una línea no vuelve a contar en otra.
  const remaining = new Map(pantry.map((p) => [p.id, p.quantity]));
  return reqs.map((r) => {
    const product = products.get(r.productId);
    let available = 0;
    let incompatible = false;
    let need = r.quantity;
    for (const lot of pantry.filter((p) => p.productId === r.productId)) {
      const left = remaining.get(lot.id) ?? 0;
      if (left <= 0) continue;
      const conv = product ? convertForProduct(left, lot.unit, r.unit, product) : convert(left, lot.unit, r.unit);
      if (conv === null) {
        incompatible = true;
        continue;
      }
      const used = Math.min(conv, need);
      available += conv;
      need -= used;
      // devolver al lote lo no usado, en su unidad
      const usedInLot = product ? convertForProduct(used, r.unit, lot.unit, product) : convert(used, r.unit, lot.unit);
      remaining.set(lot.id, left - (usedInLot ?? 0));
    }
    return {
      ...r,
      available: roundQty(available),
      toBuy: roundQty(Math.max(0, r.quantity - available)),
      pantryIncompatible: incompatible,
    };
  });
}

export interface PurchasePlan {
  quantity: number;
  unit: Unit;
  unitPrice?: number;
  priceUnit?: Unit;
  packageQuantity?: number;
  packageUnit?: Unit;
  /** Cantidad que sobrará tras usar lo necesario (en la unidad de la necesidad). */
  surplus: number;
  roundedToPackage: boolean;
}

/**
 * Decide qué comprar para cubrir `toBuy` (en `unit`).
 * Con envase conocido y compatible: nº de envases = techo(necesario / envase).
 * Sin envase: la cantidad exacta, valorada al precio de referencia.
 */
export function planPurchase(toBuy: number, unit: Unit, product: Product | undefined, roundToPackage = true): PurchasePlan {
  if (product && roundToPackage && product.packageQuantity && product.packageUnit && product.packageUnit !== 'paquete') {
    const pkgInUnit = convertForProduct(product.packageQuantity, product.packageUnit, unit, product);
    if (pkgInUnit && pkgInUnit > 0) {
      const packages = Math.max(1, Math.ceil(toBuy / pkgInUnit - 1e-9));
      const ppb = pricePerBase(product);
      const pkgBase = convertForProduct(product.packageQuantity, product.packageUnit, productBaseUnit(product), product);
      const pkgPrice = product.packagePrice ?? (ppb !== null && pkgBase !== null ? roundMoney(ppb * pkgBase) : undefined);
      return {
        quantity: packages,
        unit: 'paquete',
        unitPrice: pkgPrice,
        priceUnit: 'paquete',
        packageQuantity: product.packageQuantity,
        packageUnit: product.packageUnit,
        surplus: roundQty(packages * pkgInUnit - toBuy),
        roundedToPackage: true,
      };
    }
  }
  const h = humanize(toBuy, unit);
  const ppb = product ? pricePerBase(product) : null;
  if (product && ppb !== null) {
    const base = productBaseUnit(product);
    const priceUnit: Unit = base === 'g' ? 'kg' : base === 'ml' ? 'l' : base;
    const perPriceUnit = convertForProduct(1, priceUnit, base, product);
    // Solo se asigna precio si la cantidad se puede expresar en la unidad del precio.
    if (perPriceUnit !== null && convertForProduct(1, h.unit, priceUnit, product) !== null) {
      return { quantity: h.quantity, unit: h.unit, unitPrice: roundQty(ppb * perPriceUnit, 4), priceUnit, surplus: 0, roundedToPackage: false };
    }
  }
  return { quantity: h.quantity, unit: h.unit, surplus: 0, roundedToPackage: false };
}

/** Comprueba si una cantidad necesaria cabe en otra (útil para avisos de stock). */
export function availableIn(pantry: PantryItem[], productId: string, unit: Unit, product?: Product): { total: number; incompatible: boolean } {
  let total = 0;
  let incompatible = false;
  for (const lot of pantry) {
    if (lot.productId !== productId) continue;
    const q = product ? convertForProduct(lot.quantity, lot.unit, unit, product) : convert(lot.quantity, lot.unit, unit);
    if (q === null) incompatible = true;
    else total += q;
  }
  return { total: roundQty(total), incompatible };
}
