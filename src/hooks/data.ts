// Hooks de lectura reactiva: la interfaz se actualiza sola cuando cambian los datos.
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import { DEFAULT_SETTINGS } from '../db/common';
import type { Product, Recipe, Settings } from '../domain/types';

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('app'), []);
  return s ?? DEFAULT_SETTINGS;
}

export function useProducts(): Product[] | undefined {
  return useLiveQuery(() => db.products.orderBy('name').toArray(), []);
}

export function useProductMap(): Map<string, Product> {
  const products = useProducts();
  return useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
}

export function useRecipes(): Recipe[] | undefined {
  return useLiveQuery(() => db.recipes.orderBy('name').toArray(), []);
}

export function useRecipeMap(): Map<string, Recipe> {
  const recipes = useRecipes();
  return useMemo(() => new Map((recipes ?? []).map((r) => [r.id, r])), [recipes]);
}

export function usePantry() {
  return useLiveQuery(() => db.pantry.toArray(), []);
}

/** Categorías existentes (de productos y recetas) para sugerirlas en formularios. */
export function useCategories(kind: 'product' | 'recipe'): string[] {
  return (
    useLiveQuery(async () => {
      const rows = kind === 'product' ? await db.products.toArray() : await db.recipes.toArray();
      return [...new Set(rows.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    }, [kind]) ?? []
  );
}
