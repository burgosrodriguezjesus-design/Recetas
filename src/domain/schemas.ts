// Esquemas de validación (Zod). Se usan en dos sitios:
//  1. Antes de guardar cualquier dato desde un formulario.
//  2. Al importar una copia de seguridad: nada entra en la base sin validarse.
import { z } from 'zod';
import { MEAL_SLOTS } from './types';
import { isISODate } from './dates';

const id = z.string().min(1).max(100);
const isoDate = z.string().refine(isISODate, 'Fecha no válida');
const timestamp = z.string().min(10).max(40);
const text = (max: number) => z.string().max(max);
const optText = (max: number) => z.string().max(max).optional();
const nonNeg = z.number().finite().nonnegative();
const pos = z.number().finite().positive();

export const unitSchema = z.enum(['g', 'kg', 'ml', 'l', 'ud', 'cda', 'cdta', 'pizca', 'paquete']);
export const slotSchema = z.enum(MEAL_SLOTS);

export const nutritionSchema = z.object({ kcal: nonNeg, protein: nonNeg, carbs: nonNeg, fat: nonNeg });

export const productSchema = z.object({
  id,
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  category: text(60),
  unit: unitSchema,
  price: nonNeg.optional(),
  priceQuantity: pos.optional(),
  priceUnit: unitSchema.optional(),
  packageQuantity: pos.optional(),
  packageUnit: unitSchema.optional(),
  packagePrice: nonNeg.optional(),
  gramsPerUnit: pos.optional(),
  densityGPerMl: pos.optional(),
  nutrition: nutritionSchema.optional(),
  store: optText(80),
  brand: optText(80),
  frequent: z.boolean().optional(),
  notes: optText(1000),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const recipeIngredientSchema = z.object({
  productId: id,
  quantity: pos,
  unit: unitSchema,
  note: optText(200),
  optional: z.boolean().optional(),
});

// Las fotos son data URL de imagen; se limita el tamaño (≈ 1,5 MB) y el tipo.
const photo = z
  .string()
  .max(2_000_000)
  .refine((s) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s), 'Foto no válida');

export const recipeSchema = z.object({
  id,
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(150),
  description: optText(2000),
  photo: photo.optional(),
  category: text(60),
  mealTypes: z.array(slotSchema).max(5),
  servings: z.number().int().min(1, 'Mínimo 1 ración').max(100),
  prepMinutes: z.number().int().min(0).max(2000),
  cookMinutes: z.number().int().min(0).max(5000),
  difficulty: z.enum(['facil', 'media', 'dificil']),
  ingredients: z.array(recipeIngredientSchema).max(100),
  steps: z.array(text(3000)).max(100),
  utensils: z.array(text(100)).max(50),
  tags: z.array(text(40)).max(30),
  favorite: z.boolean(),
  origin: z.enum(['manual', 'importada', 'propuesta']),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const mealEntrySchema = z.object({
  id,
  date: isoDate,
  slot: slotSchema,
  recipeId: id,
  servings: z.number().min(0.5).max(100),
  order: z.number().int(),
  prepared: z.boolean(),
  preparedAt: timestamp.optional(),
  pantryDeducted: z.boolean().optional(),
  notes: optText(500),
});

export const pantryItemSchema = z.object({
  id,
  productId: id,
  quantity: nonNeg,
  unit: unitSchema,
  purchaseDate: isoDate.optional(),
  expiryDate: isoDate.optional(),
  pricePaid: nonNeg.optional(),
  location: z.enum(['despensa', 'nevera', 'congelador', 'otro']),
  notes: optText(500),
  isLeftover: z.boolean().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const shoppingListSchema = z.object({
  id,
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  kind: z.enum(['semana', 'ocasion']),
  weekStart: isoDate.optional(),
  budget: nonNeg.optional(),
  status: z.enum(['activa', 'archivada']),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const shoppingItemSchema = z.object({
  id,
  listId: id,
  productId: id.optional(),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  category: text(60),
  quantity: z.number().finite().positive('La cantidad debe ser mayor que 0'),
  unit: unitSchema,
  unitPrice: nonNeg.optional(),
  priceUnit: unitSchema.optional(),
  neededQuantity: nonNeg.optional(),
  neededUnit: unitSchema.optional(),
  packageQuantity: pos.optional(),
  packageUnit: unitSchema.optional(),
  paidPrice: nonNeg.optional(),
  store: optText(80),
  brand: optText(80),
  status: z.enum(['pendiente', 'comprado']),
  origin: z.enum(['manual', 'receta', 'despensa', 'frecuente']),
  notes: optText(500),
  purchasedAt: timestamp.optional(),
  received: z.boolean().optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const purchaseSchema = z.object({
  id,
  date: isoDate,
  listId: id.optional(),
  store: optText(80),
  lines: z.array(
    z.object({
      itemId: id,
      productId: id.optional(),
      name: text(120),
      quantity: nonNeg,
      unit: unitSchema,
      paid: nonNeg,
      estimated: nonNeg.optional(),
    }),
  ),
  total: nonNeg,
  createdAt: timestamp,
});

export const priceRecordSchema = z.object({
  id,
  productId: id,
  date: isoDate,
  pricePerBase: nonNeg.optional(),
  baseUnit: unitSchema.optional(),
  paid: nonNeg,
  quantity: nonNeg,
  unit: unitSchema,
  store: optText(80),
  source: z.enum(['compra', 'manual']),
});

export const consumptionSchema = z.object({
  id,
  date: isoDate,
  productId: id,
  quantity: nonNeg,
  unit: unitSchema,
  reason: z.enum(['cocinado', 'desperdicio', 'consumo', 'ajuste']),
  recipeId: id.optional(),
  mealEntryId: id.optional(),
  estimatedCost: nonNeg.optional(),
});

export const settingsSchema = z.object({
  id: z.literal('app'),
  weeklyBudget: nonNeg.optional(),
  monthlyBudget: nonNeg.optional(),
  people: z.number().int().min(1).max(50),
  theme: z.enum(['sistema', 'claro', 'oscuro']),
  expiryWarningDays: z.number().int().min(0).max(60),
  enabledSlots: z.array(slotSchema).min(1),
  dislikedProductIds: z.array(id),
  lastBackupAt: timestamp.optional(),
});

export const BACKUP_FORMAT = 'mi-cocina-inteligente';
export const BACKUP_VERSION = 1;

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: timestamp,
  data: z.object({
    products: z.array(productSchema),
    recipes: z.array(recipeSchema),
    mealEntries: z.array(mealEntrySchema),
    pantry: z.array(pantryItemSchema),
    shoppingLists: z.array(shoppingListSchema),
    shoppingItems: z.array(shoppingItemSchema),
    purchases: z.array(purchaseSchema),
    priceRecords: z.array(priceRecordSchema),
    consumption: z.array(consumptionSchema),
    settings: z.array(settingsSchema).max(1),
  }),
});

export type Backup = z.infer<typeof backupSchema>;

/** Traduce los errores de Zod a mensajes legibles por campo. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
