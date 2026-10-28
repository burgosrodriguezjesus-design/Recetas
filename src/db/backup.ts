// Copias de seguridad: exportar todo a JSON e importarlo validado.
import { db, ALL_TABLES } from './db';
import { ValidationError } from './common';
import { BACKUP_FORMAT, BACKUP_VERSION, backupSchema, type Backup } from '../domain/schemas';
import { nowISO } from '../domain/dates';

export async function exportBackup(): Promise<Backup> {
  return db.transaction('r', ALL_TABLES.map((t) => db.table(t)), async () => {
    const data = {} as Backup['data'];
    for (const t of ALL_TABLES) (data as Record<string, unknown[]>)[t] = await db.table(t).toArray();
    return { format: BACKUP_FORMAT, formatVersion: BACKUP_VERSION, exportedAt: nowISO(), data };
  });
}

export async function markBackupDone(): Promise<void> {
  const s = await db.settings.get('app');
  if (s) await db.settings.update('app', { lastBackupAt: nowISO() });
}

/** Valida un JSON de copia y devuelve los recuentos (sin escribir nada). */
export function parseBackup(json: string): { backup: Backup; counts: Record<string, number> } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ValidationError('El archivo no es un JSON válido.');
  }
  const r = backupSchema.safeParse(raw);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new ValidationError(`La copia no es válida (${issue.path.join('.') || 'raíz'}: ${issue.message}). No se ha importado nada.`);
  }
  const backup = r.data;
  // Integridad referencial básica: las recetas deben apuntar a productos existentes.
  const productIds = new Set(backup.data.products.map((p) => p.id));
  const recipeIds = new Set(backup.data.recipes.map((p) => p.id));
  const badRecipe = backup.data.recipes.find((rc) => rc.ingredients.some((i) => !productIds.has(i.productId)));
  if (badRecipe) throw new ValidationError(`La receta "${badRecipe.name}" usa productos que no están en la copia. No se ha importado nada.`);
  const badMeal = backup.data.mealEntries.find((m) => !recipeIds.has(m.recipeId));
  if (badMeal) throw new ValidationError(`Hay comidas planificadas con recetas inexistentes (${badMeal.date}). No se ha importado nada.`);
  const counts = Object.fromEntries(Object.entries(backup.data).map(([k, v]) => [k, v.length]));
  return { backup, counts };
}

/** Sustituye TODOS los datos por los de la copia, en una única transacción (todo o nada). */
export async function restoreBackup(backup: Backup): Promise<void> {
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
      await db.table(t).clear();
      await db.table(t).bulkAdd((backup.data as Record<string, unknown[]>)[t]);
    }
  });
}

export async function eraseAllData(): Promise<void> {
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) await db.table(t).clear();
  });
}
