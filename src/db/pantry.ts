// Acciones de la despensa.
import { db, newId } from './db';
import { clean, validate, ValidationError } from './common';
import { pantryItemSchema } from '../domain/schemas';
import type { ConsumptionReason, PantryItem, Unit } from '../domain/types';
import { nowISO, today } from '../domain/dates';
import { convertForProduct, ingredientCost } from '../domain/recipeCalc';
import { roundMoney } from '../domain/format';
import { roundQty } from '../domain/units';

export type PantryInput = Omit<PantryItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export async function savePantryItem(input: PantryInput): Promise<PantryItem> {
  const now = nowISO();
  const existing = input.id ? await db.pantry.get(input.id) : undefined;
  const item = validate(pantryItemSchema, clean({ ...input, id: input.id ?? newId(), createdAt: existing?.createdAt ?? now, updatedAt: now }), 'Producto de despensa');
  if (!(await db.products.get(item.productId))) throw new ValidationError('El producto no existe en el catálogo');
  if (item.purchaseDate && item.expiryDate && item.expiryDate < item.purchaseDate) {
    throw new ValidationError('La fecha de caducidad es anterior a la de compra', { expiryDate: 'Anterior a la fecha de compra' });
  }
  await db.pantry.put(item);
  return item;
}

export interface ConsumeResult {
  consumed: number;
  /** Lo que se pidió consumir y no había (en la unidad pedida). */
  shortage: number;
}

/**
 * Descuenta una cantidad de un lote y lo registra (consumo, desperdicio o ajuste).
 * Nunca deja cantidades negativas: si se pide más de lo que hay, solo se descuenta
 * lo disponible y se informa del exceso (la interfaz advierte antes de confirmar).
 */
export async function consumeFromLot(lotId: string, quantity: number, unit: Unit, reason: ConsumptionReason): Promise<ConsumeResult> {
  if (!(quantity > 0)) throw new ValidationError('La cantidad debe ser mayor que 0');
  return db.transaction('rw', db.pantry, db.consumption, db.products, async () => {
    const lot = await db.pantry.get(lotId);
    if (!lot) throw new ValidationError('El producto ya no está en la despensa');
    const product = await db.products.get(lot.productId);
    const inLot = product ? convertForProduct(quantity, unit, lot.unit, product) : unit === lot.unit ? quantity : null;
    if (inLot === null) throw new ValidationError(`No se puede convertir ${unit} a ${lot.unit} para este producto`);
    const consumed = Math.min(inLot, lot.quantity);
    const remaining = roundQty(lot.quantity - consumed);
    if (remaining <= 0) await db.pantry.delete(lot.id);
    else await db.pantry.update(lot.id, { quantity: remaining, updatedAt: nowISO() });
    const cost = ingredientCost({ productId: lot.productId, quantity: consumed, unit: lot.unit }, product).cost;
    await db.consumption.add(
      clean({
        id: newId(),
        date: today(),
        productId: lot.productId,
        quantity: roundQty(consumed),
        unit: lot.unit,
        reason,
        estimatedCost: cost === null ? undefined : roundMoney(cost),
      }),
    );
    const shortageInLot = Math.max(0, inLot - lot.quantity);
    const shortage = product ? convertForProduct(shortageInLot, lot.unit, unit, product) ?? 0 : shortageInLot;
    return { consumed: roundQty(consumed), shortage: roundQty(shortage) };
  });
}

export async function deletePantryItem(id: string): Promise<PantryItem | undefined> {
  const it = await db.pantry.get(id);
  await db.pantry.delete(id);
  return it;
}

export async function restorePantryItem(it: PantryItem): Promise<void> {
  await db.pantry.put(it);
}
