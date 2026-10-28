// Cálculos de recetas: escalado de raciones, coste y nutrición.
// Todo es "estimado" y se informa de qué datos faltan en lugar de inventarlos.

import type { Nutrition, Product, Recipe, RecipeIngredient, Unit } from './types';
import { baseUnitOf, convert, dimensionOf, roundQty } from './units';
import { roundMoney } from './format';

/** Unidad base en la que se valora y almacena un producto (g, ml, ud, o su propia unidad). */
export function productBaseUnit(product: Pick<Product, 'unit'>): Unit {
  return baseUnitOf(product.unit);
}

/**
 * Convierte una cantidad a otra unidad para un producto concreto, entendiendo
 * 'paquete' gracias al tamaño de envase del producto.
 */
export function convertForProduct(qty: number, from: Unit, to: Unit, product: Product): number | null {
  if (from === to) return qty;
  const hasPkg = product.packageQuantity && product.packageQuantity > 0 && product.packageUnit && product.packageUnit !== 'paquete';
  if (from === 'paquete') {
    if (!hasPkg) return null;
    return convert(qty * product.packageQuantity!, product.packageUnit!, to, product);
  }
  if (to === 'paquete') {
    if (!hasPkg) return null;
    const inPkgUnit = convert(qty, from, product.packageUnit!, product);
    return inPkgUnit === null ? null : inPkgUnit / product.packageQuantity!;
  }
  return convert(qty, from, to, product);
}

/** Precio estimado por unidad base del producto (€/g, €/ml o €/ud). null si no se conoce. */
export function pricePerBase(product: Product): number | null {
  const base = productBaseUnit(product);
  if (product.price !== undefined && product.price >= 0 && product.priceQuantity && product.priceUnit) {
    const q = convertForProduct(product.priceQuantity, product.priceUnit, base, product);
    if (q && q > 0) return product.price / q;
  }
  if (product.packagePrice !== undefined && product.packagePrice >= 0 && product.packageQuantity && product.packageUnit) {
    const q = convertForProduct(product.packageQuantity, product.packageUnit, base, product);
    if (q && q > 0) return product.packagePrice / q;
  }
  return null;
}

/** Precio legible por kg, l o ud (lo que se muestra en etiquetas: "7,50 €/kg"). */
export function referencePrice(product: Product): { value: number; unit: Unit } | null {
  const ppb = pricePerBase(product);
  if (ppb === null) return null;
  const base = productBaseUnit(product);
  if (base === 'g') return { value: ppb * 1000, unit: 'kg' };
  if (base === 'ml') return { value: ppb * 1000, unit: 'l' };
  return { value: ppb, unit: base };
}

export function scaleIngredients(ingredients: RecipeIngredient[], fromServings: number, toServings: number): RecipeIngredient[] {
  if (fromServings <= 0) return ingredients;
  const f = toServings / fromServings;
  return ingredients.map((i) => ({ ...i, quantity: roundQty(i.quantity * f) }));
}

export interface IngredientCost {
  productId: string;
  cost: number | null;
  reason?: 'sin-producto' | 'sin-precio' | 'unidad-incompatible';
}

export function ingredientCost(ing: RecipeIngredient, product: Product | undefined): IngredientCost {
  if (!product) return { productId: ing.productId, cost: null, reason: 'sin-producto' };
  const ppb = pricePerBase(product);
  if (ppb === null) return { productId: ing.productId, cost: null, reason: 'sin-precio' };
  const q = convertForProduct(ing.quantity, ing.unit, productBaseUnit(product), product);
  if (q === null) return { productId: ing.productId, cost: null, reason: 'unidad-incompatible' };
  return { productId: ing.productId, cost: q * ppb };
}

export interface NutritionTotals extends Nutrition {}

const ZERO: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Nutrición de un ingrediente. null si no hay datos o no se puede pasar a g/ml. */
export function ingredientNutrition(ing: RecipeIngredient, product: Product | undefined): Nutrition | null {
  if (!product?.nutrition) return null;
  const ref: Unit = dimensionOf(product.unit) === 'volume' ? 'ml' : 'g';
  const amount = convertForProduct(ing.quantity, ing.unit, ref, product);
  if (amount === null) return null;
  const f = amount / 100;
  const n = product.nutrition;
  return { kcal: n.kcal * f, protein: n.protein * f, carbs: n.carbs * f, fat: n.fat * f };
}

export interface RecipeSummary {
  servings: number;
  totalCost: number | null; // null si no se conoce ningún precio
  costPerServing: number | null;
  costComplete: boolean;
  missingPrice: string[]; // productIds sin precio o no convertibles
  nutritionTotal: Nutrition | null;
  nutritionPerServing: Nutrition | null;
  nutritionComplete: boolean;
  missingNutrition: string[];
  totalMinutes: number;
}

/**
 * Resume coste y nutrición de una receta para `servings` raciones
 * (por defecto, sus raciones originales). Los ingredientes opcionales no cuentan.
 */
export function summarizeRecipe(recipe: Recipe, products: Map<string, Product>, servings = recipe.servings): RecipeSummary {
  const ings = scaleIngredients(recipe.ingredients.filter((i) => !i.optional), recipe.servings, servings);
  let cost = 0;
  let anyCost = false;
  const missingPrice: string[] = [];
  const nut = { ...ZERO };
  let anyNut = false;
  const missingNutrition: string[] = [];
  for (const ing of ings) {
    const p = products.get(ing.productId);
    const c = ingredientCost(ing, p);
    if (c.cost === null) missingPrice.push(ing.productId);
    else {
      cost += c.cost;
      anyCost = true;
    }
    const n = ingredientNutrition(ing, p);
    if (n === null) missingNutrition.push(ing.productId);
    else {
      anyNut = true;
      nut.kcal += n.kcal;
      nut.protein += n.protein;
      nut.carbs += n.carbs;
      nut.fat += n.fat;
    }
  }
  const totalCost = anyCost ? roundMoney(cost) : null;
  const nutritionTotal = anyNut ? roundNutrition(nut) : null;
  return {
    servings,
    totalCost,
    costPerServing: totalCost !== null && servings > 0 ? roundMoney(cost / servings) : null,
    costComplete: missingPrice.length === 0,
    missingPrice,
    nutritionTotal,
    nutritionPerServing: nutritionTotal && servings > 0 ? roundNutrition(divNutrition(nut, servings)) : null,
    nutritionComplete: missingNutrition.length === 0 && ings.length > 0,
    missingNutrition,
    totalMinutes: (recipe.prepMinutes || 0) + (recipe.cookMinutes || 0),
  };
}

function divNutrition(n: Nutrition, d: number): Nutrition {
  return { kcal: n.kcal / d, protein: n.protein / d, carbs: n.carbs / d, fat: n.fat / d };
}

export function roundNutrition(n: Nutrition): Nutrition {
  return { kcal: Math.round(n.kcal), protein: roundQty(n.protein, 1), carbs: roundQty(n.carbs, 1), fat: roundQty(n.fat, 1) };
}

export function addNutrition(a: Nutrition, b: Nutrition): Nutrition {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

export const EMPTY_NUTRITION = ZERO;
