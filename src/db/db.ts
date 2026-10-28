// Base de datos local (IndexedDB) gestionada con Dexie.
//
// Migraciones: cada cambio de esquema añade un `this.version(n)` nuevo con
// `.stores()` y, si hace falta transformar datos, `.upgrade(tx => ...)`.
// Dexie aplica automáticamente las versiones pendientes al abrir la base,
// por orden, sin perder datos. Nunca se modifica una versión ya publicada.

import Dexie, { type EntityTable } from 'dexie';
import type {
  ConsumptionRecord,
  MealEntry,
  PantryItem,
  PriceRecord,
  Product,
  Purchase,
  Recipe,
  Settings,
  ShoppingItem,
  ShoppingList,
} from '../domain/types';

export const DB_NAME = 'mi-cocina-inteligente';

export class CocinaDB extends Dexie {
  products!: EntityTable<Product, 'id'>;
  recipes!: EntityTable<Recipe, 'id'>;
  mealEntries!: EntityTable<MealEntry, 'id'>;
  pantry!: EntityTable<PantryItem, 'id'>;
  shoppingLists!: EntityTable<ShoppingList, 'id'>;
  shoppingItems!: EntityTable<ShoppingItem, 'id'>;
  purchases!: EntityTable<Purchase, 'id'>;
  priceRecords!: EntityTable<PriceRecord, 'id'>;
  consumption!: EntityTable<ConsumptionRecord, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor(name = DB_NAME) {
    super(name);
    // Versión 1 del esquema. Solo se listan los campos indexados; el resto
    // de propiedades se guardan igualmente.
    this.version(1).stores({
      products: 'id, name, category, frequent',
      recipes: 'id, name, category, favorite, updatedAt, *tags',
      mealEntries: 'id, date, [date+slot], recipeId',
      pantry: 'id, productId, expiryDate, location',
      shoppingLists: 'id, createdAt, status',
      shoppingItems: 'id, listId, productId, status',
      purchases: 'id, date, listId',
      priceRecords: 'id, productId, date',
      consumption: 'id, date, productId, reason, recipeId',
      settings: 'id',
    });
    // Ejemplo de cómo sería una migración futura:
    // this.version(2).stores({ recipes: 'id, name, category, favorite, updatedAt, *tags, rating' })
    //   .upgrade(tx => tx.table('recipes').toCollection().modify(r => { r.rating ??= 0; }));
  }
}

export const db = new CocinaDB();

export const ALL_TABLES = [
  'products',
  'recipes',
  'mealEntries',
  'pantry',
  'shoppingLists',
  'shoppingItems',
  'purchases',
  'priceRecords',
  'consumption',
  'settings',
] as const;
export type TableName = (typeof ALL_TABLES)[number];

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Pide al navegador que no borre los datos aunque falte espacio. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
