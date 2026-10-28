// Fábricas de datos para pruebas (no se usan en la aplicación).
import type { MealEntry, PantryItem, Product, Recipe, ShoppingItem } from '../domain/types';

const T = '2026-01-01T00:00:00.000Z';
let n = 0;
const uid = (p: string) => `${p}-${++n}`;

export function product(p: Partial<Product> & { name: string }): Product {
  return { id: uid('prod'), category: 'Otros', unit: 'g', createdAt: T, updatedAt: T, ...p };
}

export function recipe(r: Partial<Recipe> & { name: string }): Recipe {
  return {
    id: uid('rec'), category: 'Principal', mealTypes: [], servings: 2, prepMinutes: 10, cookMinutes: 20,
    difficulty: 'facil', ingredients: [], steps: ['Paso'], utensils: [], tags: [], favorite: false,
    origin: 'manual', createdAt: T, updatedAt: T, ...r,
  };
}

export function entry(e: Partial<MealEntry> & { recipeId: string; date: string }): MealEntry {
  return { id: uid('meal'), slot: 'comida', servings: 2, order: 0, prepared: false, ...e };
}

export function lot(l: Partial<PantryItem> & { productId: string; quantity: number }): PantryItem {
  return { id: uid('lot'), unit: 'g', location: 'despensa', createdAt: T, updatedAt: T, ...l };
}

export function item(i: Partial<ShoppingItem> & { name: string; quantity: number }): ShoppingItem {
  return { id: uid('item'), listId: 'l1', category: 'Otros', unit: 'ud', status: 'pendiente', origin: 'manual', createdAt: T, updatedAt: T, ...i };
}

export const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
