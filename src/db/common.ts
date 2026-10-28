import type { z } from 'zod';
import { fieldErrors } from '../domain/schemas';
import type { MealSlot, Settings } from '../domain/types';
import { db } from './db';

/** Error de validación con mensajes por campo, para mostrarlos en el formulario. */
export class ValidationError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Valida con Zod y lanza ValidationError legible si algo falla. */
export function validate<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const fields = fieldErrors(r.error);
    const first = Object.values(fields)[0];
    throw new ValidationError(`${what}: ${first ?? 'datos no válidos'}`, fields);
  }
  return r.data;
}

/** Quita propiedades `undefined` y cadenas vacías opcionales (IndexedDB y Zod lo agradecen). */
export function clean<T extends object>(obj: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '' && !['name', 'category'].includes(k)) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export const DEFAULT_SLOTS: MealSlot[] = ['desayuno', 'comida', 'cena'];

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  people: 2,
  theme: 'sistema',
  expiryWarningDays: 3,
  enabledSlots: ['desayuno', 'media_manana', 'comida', 'merienda', 'cena'],
  dislikedProductIds: [],
};

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS;
}
