// Generador de menús semanales por reglas, 100 % local.
//
// Cómo decide, para cada día y franja:
//   1. Filtra recetas válidas: franja compatible, tiempo máximo, sin ingredientes
//      excluidos, con las etiquetas de preferencia y nunca propuestas sin revisar.
//   2. Puntúa cada candidata:
//        + cuánto se cubre con la despensa
//        + usa ingredientes "a gastar primero" o próximos a caducar
//        + favorita
//        − repetida en la semana (variedad)
//        − se sale del presupuesto por comida
//        − se aleja del objetivo calórico (solo si hay datos nutricionales)
//   3. Elige la mejor (con un pequeño azar reproducible para "otra propuesta").
//
// Nunca afirma cumplir objetivos nutricionales si faltan datos: lo informa.

import type { MealSlot, PantryItem, Product, Recipe } from './types';
import { summarizeRecipe } from './recipeCalc';
import { availableIn } from './shopping';
import { roundMoney } from './format';
import { addDays } from './dates';

export interface GeneratorOptions {
  days: string[];
  slots: MealSlot[];
  people: number;
  weeklyBudget?: number;
  maxMinutes?: number;
  useFirstProductIds: string[];
  expiringProductIds: string[];
  excludedProductIds: string[];
  requiredTags: string[];
  /** kcal por persona y día (opcional). */
  dailyKcalTarget?: number;
  /** Prioriza recetas que se puedan cocinar con lo que hay en casa. */
  preferPantry: boolean;
  seed: number;
}

export interface ProposedMeal {
  date: string;
  slot: MealSlot;
  recipeId: string;
  servings: number;
  estimatedCost: number | null;
  reasons: string[];
}

export interface GeneratorResult {
  meals: ProposedMeal[];
  unfilled: { date: string; slot: MealSlot; reason: string }[];
  estimatedTotal: number;
  costComplete: boolean;
  withinBudget: boolean | null;
  nutrition: { date: string; kcalPerPerson: number | null; complete: boolean }[];
  notes: string[];
}

const SLOT_SHARE: Record<MealSlot, number> = { desayuno: 0.2, media_manana: 0.1, comida: 0.35, merienda: 0.1, cena: 0.25 };

/** Generador pseudoaleatorio con semilla (mulberry32): mismos datos + misma semilla = mismo menú. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isEligible(recipe: Recipe, slot: MealSlot, opts: Pick<GeneratorOptions, 'maxMinutes' | 'excludedProductIds' | 'requiredTags'>): string | null {
  if (recipe.origin === 'propuesta') return 'propuesta sin revisar';
  if (recipe.mealTypes.length > 0 && !recipe.mealTypes.includes(slot)) return 'no es para esta franja';
  if (opts.maxMinutes && recipe.prepMinutes + recipe.cookMinutes > opts.maxMinutes) return 'demasiado tiempo';
  if (recipe.ingredients.some((i) => !i.optional && opts.excludedProductIds.includes(i.productId))) return 'contiene un ingrediente excluido';
  const tags = recipe.tags.map((t) => t.toLowerCase());
  if (opts.requiredTags.some((t) => !tags.includes(t.toLowerCase()))) return 'no cumple las preferencias';
  return null;
}

/** Fracción (0-1) de ingredientes cubiertos por la despensa en cantidad suficiente. */
export function pantryCoverage(recipe: Recipe, servings: number, pantry: PantryItem[], products: Map<string, Product>): number {
  const ings = recipe.ingredients.filter((i) => !i.optional);
  if (ings.length === 0) return 0;
  const f = recipe.servings > 0 ? servings / recipe.servings : 1;
  let covered = 0;
  for (const ing of ings) {
    const p = products.get(ing.productId);
    const { total } = availableIn(pantry, ing.productId, ing.unit, p);
    if (total >= ing.quantity * f - 1e-9) covered++;
  }
  return covered / ings.length;
}

export function generateMenu(recipes: Recipe[], products: Map<string, Product>, pantry: PantryItem[], opts: GeneratorOptions): GeneratorResult {
  const rand = rng(opts.seed);
  const totalMeals = opts.days.length * opts.slots.length;
  const perMealBudget = opts.weeklyBudget && totalMeals > 0 ? opts.weeklyBudget / totalMeals : undefined;
  const useCount = new Map<string, number>();
  const meals: ProposedMeal[] = [];
  const unfilled: GeneratorResult['unfilled'] = [];
  const nutrition: GeneratorResult['nutrition'] = [];
  let total = 0;
  let costComplete = true;
  const shareSum = opts.slots.reduce((s, sl) => s + SLOT_SHARE[sl], 0) || 1;

  // Cálculos que no dependen del día se hacen una vez.
  const summaries = new Map(recipes.map((r) => [r.id, summarizeRecipe(r, products, opts.people)]));
  const coverage = new Map(recipes.map((r) => [r.id, opts.preferPantry ? pantryCoverage(r, opts.people, pantry, products) : 0]));

  for (const date of opts.days) {
    let dayKcal = 0;
    let dayComplete = true;
    for (const slot of opts.slots) {
      const candidates = recipes.filter((r) => isEligible(r, slot, opts) === null);
      if (candidates.length === 0) {
        unfilled.push({ date, slot, reason: 'No hay recetas que cumplan los filtros para esta franja.' });
        continue;
      }
      let best: { recipe: Recipe; score: number; reasons: string[] } | null = null;
      for (const r of candidates) {
        const s = summaries.get(r.id)!;
        const reasons: string[] = [];
        let score = rand() * 0.6;
        const cov = coverage.get(r.id) ?? 0;
        if (cov > 0) {
          score += cov * 3;
          if (cov === 1) reasons.push('se puede preparar con lo que tienes');
          else reasons.push(`${Math.round(cov * 100)} % de ingredientes en casa`);
        }
        const ids = r.ingredients.map((i) => i.productId);
        if (opts.useFirstProductIds.some((id) => ids.includes(id))) {
          score += 2.5;
          reasons.push('gasta ingredientes que quieres usar primero');
        }
        if (opts.expiringProductIds.some((id) => ids.includes(id))) {
          score += 2;
          reasons.push('aprovecha productos próximos a caducar');
        }
        if (r.favorite) score += 0.5;
        score -= (useCount.get(r.id) ?? 0) * 2.2;
        const cost = s.totalCost;
        if (perMealBudget !== undefined && cost !== null) {
          if (cost > perMealBudget) score -= Math.min(3, (cost - perMealBudget) / perMealBudget * 2);
          if (opts.weeklyBudget !== undefined && total + cost > opts.weeklyBudget) score -= 4;
        }
        if (opts.dailyKcalTarget && s.nutritionComplete && s.nutritionPerServing) {
          const target = (opts.dailyKcalTarget * SLOT_SHARE[slot]) / shareSum;
          score -= Math.min(2, Math.abs(s.nutritionPerServing.kcal - target) / target);
        }
        if (!best || score > best.score) best = { recipe: r, score, reasons };
      }
      const chosen = best!;
      const s = summaries.get(chosen.recipe.id)!;
      useCount.set(chosen.recipe.id, (useCount.get(chosen.recipe.id) ?? 0) + 1);
      if (s.totalCost !== null) total += s.totalCost;
      if (!s.costComplete) costComplete = false;
      if (s.nutritionComplete && s.nutritionPerServing) dayKcal += s.nutritionPerServing.kcal;
      else dayComplete = false;
      meals.push({ date, slot, recipeId: chosen.recipe.id, servings: opts.people, estimatedCost: s.totalCost, reasons: chosen.reasons });
    }
    nutrition.push({ date, kcalPerPerson: dayComplete ? Math.round(dayKcal) : null, complete: dayComplete });
  }

  const notes: string[] = [];
  if (!costComplete) notes.push('Algunas recetas tienen ingredientes sin precio: el coste total es parcial.');
  if (opts.dailyKcalTarget) {
    if (nutrition.some((n) => !n.complete)) notes.push('Faltan datos nutricionales en algunas recetas: no se puede verificar el objetivo calórico en todos los días.');
    else notes.push('Las calorías son estimaciones a partir de los datos que has introducido en tus productos.');
  }
  const estimatedTotal = roundMoney(total);
  return {
    meals,
    unfilled,
    estimatedTotal,
    costComplete,
    withinBudget: opts.weeklyBudget === undefined ? null : estimatedTotal <= opts.weeklyBudget,
    nutrition,
    notes,
  };
}

/** Productos de la despensa que caducan en `days` días o menos (y no han caducado hace mucho). */
export function expiringProductIds(pantry: PantryItem[], todayISO: string, days: number, products: Map<string, Product>): string[] {
  const lim = addDays(todayISO, days);
  const ids = new Set<string>();
  for (const p of pantry) {
    if (p.expiryDate && p.expiryDate <= lim && p.quantity > 0 && products.has(p.productId)) ids.add(p.productId);
  }
  return [...ids];
}
