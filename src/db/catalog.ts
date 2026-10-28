// Acciones sobre productos, recetas y ajustes.
import { db, newId } from './db';
import { clean, DEFAULT_SETTINGS, validate, ValidationError } from './common';
import { productSchema, recipeSchema, settingsSchema } from '../domain/schemas';
import type { PriceRecord, Product, Recipe, Settings } from '../domain/types';
import { nowISO, today } from '../domain/dates';
import { normalizeText } from '../domain/units';
import { pricePerBase, productBaseUnit } from '../domain/recipeCalc';

// ───────────────────────── Ajustes ─────────────────────────

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = (await db.settings.get('app')) ?? DEFAULT_SETTINGS;
  const next = validate(settingsSchema, clean({ ...current, ...patch, id: 'app' }), 'Ajustes');
  await db.settings.put(next);
  return next;
}

// ───────────────────────── Productos ─────────────────────────

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export async function saveProduct(input: ProductInput): Promise<Product> {
  const now = nowISO();
  const existing = input.id ? await db.products.get(input.id) : undefined;
  const product = validate(
    productSchema,
    clean({ ...input, id: input.id ?? newId(), createdAt: existing?.createdAt ?? now, updatedAt: now }),
    'Producto',
  );
  const dup = await findProductByName(product.name);
  if (dup && dup.id !== product.id) throw new ValidationError(`Ya existe un producto llamado "${dup.name}"`, { name: 'Ya existe un producto con este nombre' });

  await db.transaction('rw', db.products, db.priceRecords, async () => {
    await db.products.put(product);
    // Si el precio de referencia cambia, se guarda en el histórico.
    const before = existing ? pricePerBase(existing) : null;
    const after = pricePerBase(product);
    if (after !== null && (before === null || Math.abs(after - before) > 1e-9)) {
      await db.priceRecords.add(manualPriceRecord(product, after));
    }
  });
  return product;
}

function manualPriceRecord(product: Product, ppb: number): PriceRecord {
  const usePackage = product.price === undefined && product.packagePrice !== undefined;
  return {
    id: newId(),
    productId: product.id,
    date: today(),
    pricePerBase: ppb,
    baseUnit: productBaseUnit(product),
    paid: (usePackage ? product.packagePrice : product.price) ?? 0,
    quantity: (usePackage ? product.packageQuantity : product.priceQuantity) ?? 1,
    unit: (usePackage ? product.packageUnit : product.priceUnit) ?? product.unit,
    store: product.store,
    source: 'manual',
    createdAt: nowISO(),
  };
}

export async function findProductByName(name: string): Promise<Product | undefined> {
  const n = normalizeText(name);
  const all = await db.products.toArray();
  return all.find((p) => normalizeText(p.name) === n);
}

/** Busca un producto por nombre o lo crea con datos mínimos (sin precio ni nutrición inventados). */
export async function findOrCreateProduct(name: string, unit: Product['unit'], category = 'Otros'): Promise<Product> {
  const found = await findProductByName(name);
  if (found) return found;
  const baseUnit = unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit === 'cda' || unit === 'cdta' ? 'ml' : unit;
  return saveProduct({ name: name.trim(), unit: baseUnit, category });
}

/** Dónde se usa un producto (para avisar antes de borrarlo). */
export async function productUsage(productId: string) {
  const [recipes, pantry, items] = await Promise.all([
    db.recipes.filter((r) => r.ingredients.some((i) => i.productId === productId)).toArray(),
    db.pantry.where('productId').equals(productId).count(),
    db.shoppingItems.where('productId').equals(productId).count(),
  ]);
  return { recipes, pantry, items };
}

export async function deleteProduct(productId: string): Promise<void> {
  const usage = await productUsage(productId);
  if (usage.recipes.length > 0) {
    throw new ValidationError(`No se puede eliminar: lo usan ${usage.recipes.length} receta(s) (${usage.recipes.slice(0, 3).map((r) => r.name).join(', ')}).`);
  }
  await db.transaction('rw', db.products, db.pantry, db.shoppingItems, db.priceRecords, async () => {
    await db.pantry.where('productId').equals(productId).delete();
    await db.priceRecords.where('productId').equals(productId).delete();
    // Las líneas de compra se conservan como texto libre.
    await db.shoppingItems.where('productId').equals(productId).modify((it) => {
      delete it.productId;
    });
    await db.products.delete(productId);
  });
}

// ───────────────────────── Recetas ─────────────────────────

export type RecipeInput = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export async function saveRecipe(input: RecipeInput): Promise<Recipe> {
  const now = nowISO();
  const existing = input.id ? await db.recipes.get(input.id) : undefined;
  const recipe = validate(
    recipeSchema,
    clean({
      ...input,
      id: input.id ?? newId(),
      name: input.name?.trim(),
      steps: (input.steps ?? []).map((s) => s.trim()).filter(Boolean),
      utensils: (input.utensils ?? []).map((s) => s.trim()).filter(Boolean),
      tags: [...new Set((input.tags ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean))],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }),
    'Receta',
  );
  if (recipe.ingredients.length === 0) throw new ValidationError('Receta: añade al menos un ingrediente', { ingredients: 'Añade al menos un ingrediente' });
  const ids = new Set(recipe.ingredients.map((i) => i.productId));
  const found = await db.products.bulkGet([...ids]);
  if (found.some((p) => !p)) throw new ValidationError('Receta: algún ingrediente no existe en el catálogo');
  await db.recipes.put(recipe);
  return recipe;
}

export async function duplicateRecipe(id: string): Promise<Recipe> {
  const r = await db.recipes.get(id);
  if (!r) throw new Error('Receta no encontrada');
  const { id: _old, createdAt: _c, updatedAt: _u, ...rest } = r;
  return saveRecipe({ ...rest, name: `${r.name} (copia)`, favorite: false });
}

export async function toggleFavorite(id: string): Promise<void> {
  const r = await db.recipes.get(id);
  if (r) await db.recipes.update(id, { favorite: !r.favorite, updatedAt: nowISO() });
}

/** Elimina una receta y sus comidas planificadas. Devuelve lo borrado para poder deshacer. */
export async function deleteRecipe(id: string) {
  return db.transaction('rw', db.recipes, db.mealEntries, async () => {
    const recipe = await db.recipes.get(id);
    const meals = await db.mealEntries.where('recipeId').equals(id).toArray();
    await db.mealEntries.where('recipeId').equals(id).delete();
    await db.recipes.delete(id);
    return { recipe, meals };
  });
}

export async function restoreRecipe(snapshot: Awaited<ReturnType<typeof deleteRecipe>>) {
  await db.transaction('rw', db.recipes, db.mealEntries, async () => {
    if (snapshot.recipe) await db.recipes.put(snapshot.recipe);
    await db.mealEntries.bulkPut(snapshot.meals);
  });
}
