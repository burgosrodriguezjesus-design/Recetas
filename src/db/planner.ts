// Acciones del planificador de comidas.
import { db, newId } from './db';
import { validate, ValidationError } from './common';
import { mealEntrySchema } from '../domain/schemas';
import type { ConsumptionRecord, MealEntry, MealSlot } from '../domain/types';
import { addDays, daysBetween, nowISO, today } from '../domain/dates';
import { planConsumption, type ConsumptionLine } from '../domain/pantry';
import { ingredientCost, scaleIngredients } from '../domain/recipeCalc';
import { roundMoney } from '../domain/format';

async function nextOrder(date: string, slot: MealSlot): Promise<number> {
  const existing = await db.mealEntries.where('[date+slot]').equals([date, slot]).toArray();
  return existing.reduce((m, e) => Math.max(m, e.order + 1), 0);
}

export async function addMeal(date: string, slot: MealSlot, recipeId: string, servings: number): Promise<MealEntry> {
  if (!(await db.recipes.get(recipeId))) throw new ValidationError('La receta no existe');
  const entry = validate(
    mealEntrySchema,
    { id: newId(), date, slot, recipeId, servings, order: await nextOrder(date, slot), prepared: false },
    'Comida',
  );
  await db.mealEntries.add(entry);
  return entry;
}

export async function updateMeal(id: string, patch: Partial<Pick<MealEntry, 'servings' | 'recipeId' | 'notes'>>): Promise<void> {
  const e = await db.mealEntries.get(id);
  if (!e) throw new Error('Comida no encontrada');
  const next = validate(mealEntrySchema, { ...e, ...patch }, 'Comida');
  await db.mealEntries.put(next);
}

export async function moveMeal(id: string, date: string, slot: MealSlot): Promise<void> {
  const e = await db.mealEntries.get(id);
  if (!e) return;
  await db.mealEntries.update(id, { date, slot, order: await nextOrder(date, slot) });
}

/** Copia una comida a otro día/franja (sin el estado de "preparada"). */
export async function duplicateMeal(id: string, date: string, slot: MealSlot): Promise<MealEntry> {
  const e = await db.mealEntries.get(id);
  if (!e) throw new Error('Comida no encontrada');
  return addMeal(date, slot, e.recipeId, e.servings);
}

export async function deleteMeal(id: string): Promise<MealEntry | undefined> {
  const e = await db.mealEntries.get(id);
  await db.mealEntries.delete(id);
  return e;
}

export async function restoreMeals(entries: MealEntry[]): Promise<void> {
  await db.mealEntries.bulkPut(entries);
}

/** Intercambia todas las comidas de dos días. */
export async function swapDays(a: string, b: string): Promise<void> {
  await db.transaction('rw', db.mealEntries, async () => {
    const ea = await db.mealEntries.where('date').equals(a).toArray();
    const eb = await db.mealEntries.where('date').equals(b).toArray();
    await db.mealEntries.bulkPut([...ea.map((e) => ({ ...e, date: b })), ...eb.map((e) => ({ ...e, date: a }))]);
  });
}

/** Intercambia dos comidas concretas (día y franja). */
export async function swapMeals(idA: string, idB: string): Promise<void> {
  await db.transaction('rw', db.mealEntries, async () => {
    const a = await db.mealEntries.get(idA);
    const b = await db.mealEntries.get(idB);
    if (!a || !b) return;
    await db.mealEntries.bulkPut([
      { ...a, date: b.date, slot: b.slot, order: b.order },
      { ...b, date: a.date, slot: a.slot, order: a.order },
    ]);
  });
}

/**
 * Copia las comidas de un rango de días a otro.
 * mode 'replace' borra antes lo que hubiera en destino; 'append' lo añade.
 * Devuelve las comidas eliminadas para poder deshacer.
 */
export async function copyDays(fromStart: string, toStart: string, length: number, mode: 'replace' | 'append'): Promise<{ created: number; removed: MealEntry[] }> {
  return db.transaction('rw', db.mealEntries, async () => {
    const fromEnd = addDays(fromStart, length - 1);
    const toEnd = addDays(toStart, length - 1);
    const source = await db.mealEntries.where('date').between(fromStart, fromEnd, true, true).toArray();
    let removed: MealEntry[] = [];
    if (mode === 'replace') {
      removed = await db.mealEntries.where('date').between(toStart, toEnd, true, true).toArray();
      await db.mealEntries.bulkDelete(removed.map((e) => e.id));
    }
    const offset = daysBetween(fromStart, toStart);
    const copies = source.map((e) => ({
      id: newId(),
      date: addDays(e.date, offset),
      slot: e.slot,
      recipeId: e.recipeId,
      servings: e.servings,
      order: e.order + (mode === 'append' ? 100 : 0),
      prepared: false,
    }));
    await db.mealEntries.bulkAdd(copies);
    return { created: copies.length, removed };
  });
}

export async function mealsInRange(from: string, to: string): Promise<MealEntry[]> {
  return db.mealEntries.where('date').between(from, to, true, true).toArray();
}

/** Aplica un menú generado. Si `replace`, borra antes las comidas de esos días. */
export async function applyMenu(meals: { date: string; slot: MealSlot; recipeId: string; servings: number }[], days: string[], replace: boolean): Promise<MealEntry[]> {
  return db.transaction('rw', db.mealEntries, async () => {
    let removed: MealEntry[] = [];
    if (replace) {
      removed = await db.mealEntries.where('date').anyOf(days).toArray();
      await db.mealEntries.bulkDelete(removed.map((e) => e.id));
    }
    const entries: MealEntry[] = meals.map((m, i) => ({ id: newId(), ...m, order: 200 + i, prepared: false }));
    entries.forEach((e) => validate(mealEntrySchema, e, 'Comida'));
    await db.mealEntries.bulkAdd(entries);
    return removed;
  });
}

// ───────────────────────── Cocinar ─────────────────────────

/** Vista previa de lo que se descontaría de la despensa al preparar una comida. */
export async function previewCooking(entryId: string): Promise<ConsumptionLine[]> {
  const entry = await db.mealEntries.get(entryId);
  if (!entry) throw new Error('Comida no encontrada');
  const recipe = await db.recipes.get(entry.recipeId);
  if (!recipe) throw new Error('Receta no encontrada');
  const ings = scaleIngredients(recipe.ingredients.filter((i) => !i.optional), recipe.servings, entry.servings);
  const [pantry, products] = await Promise.all([db.pantry.toArray(), db.products.toArray()]);
  return planConsumption(ings, pantry, new Map(products.map((p) => [p.id, p])));
}

/**
 * Marca una comida como preparada. Si `deduct`, descuenta de la despensa
 * (solo lo disponible; nunca deja cantidades negativas) y registra el consumo.
 */
export async function markPrepared(entryId: string, deduct: boolean): Promise<{ shortages: ConsumptionLine[] }> {
  return db.transaction('rw', [db.mealEntries, db.pantry, db.consumption, db.products, db.recipes], async () => {
    const entry = await db.mealEntries.get(entryId);
    if (!entry) throw new Error('Comida no encontrada');
    if (entry.prepared) return { shortages: [] };
    // El plan se calcula dentro de la transacción para que nadie cambie la despensa entre medias.
    const plan = deduct ? await previewCooking(entryId) : [];
    const products = new Map((await db.products.toArray()).map((p) => [p.id, p]));
    const now = nowISO();
    const records: ConsumptionRecord[] = [];
    for (const line of plan) {
      for (const d of line.deductions) {
        const lot = await db.pantry.get(d.lotId);
        if (!lot) continue;
        const remaining = Math.max(0, lot.quantity - d.quantity);
        if (remaining <= 1e-9) await db.pantry.delete(lot.id);
        else await db.pantry.update(lot.id, { quantity: remaining, updatedAt: now });
        const cost = ingredientCost({ productId: lot.productId, quantity: d.quantity, unit: d.unit }, products.get(lot.productId)).cost;
        records.push({
          id: newId(),
          date: today(),
          productId: lot.productId,
          quantity: d.quantity,
          unit: d.unit,
          reason: 'cocinado',
          recipeId: entry.recipeId,
          mealEntryId: entry.id,
          estimatedCost: cost === null ? undefined : roundMoney(cost),
        });
      }
    }
    await db.consumption.bulkAdd(records);
    await db.mealEntries.update(entryId, { prepared: true, preparedAt: now, pantryDeducted: deduct });
    return { shortages: plan.filter((l) => l.shortage > 0 || l.incompatibleLots) };
  });
}

/** Desmarca una comida. No devuelve ingredientes a la despensa (se avisa en la interfaz). */
export async function unmarkPrepared(entryId: string): Promise<void> {
  await db.mealEntries.update(entryId, { prepared: false, preparedAt: undefined, pantryDeducted: false });
}
