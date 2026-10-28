// Acciones de listas de la compra.
import { db, newId } from './db';
import { clean, validate, ValidationError } from './common';
import { shoppingItemSchema, shoppingListSchema } from '../domain/schemas';
import type { MealEntry, PantryItem, PriceRecord, Product, Purchase, PurchaseLine, ShoppingItem, ShoppingList, StorageLocation, Unit } from '../domain/types';
import { nowISO, today } from '../domain/dates';
import { aggregateRequirements, itemSubtotal, planPurchase, subtractPantry, type NetRequirement, type PurchasePlan } from '../domain/shopping';
import { convertForProduct, productBaseUnit, referencePrice } from '../domain/recipeCalc';
import { roundMoney } from '../domain/format';
import { roundQty } from '../domain/units';
import { comparePriceRecords } from '../domain/stats';

// ───────────────────────── Listas ─────────────────────────

export async function createList(input: { name: string; kind: ShoppingList['kind']; weekStart?: string; budget?: number }): Promise<ShoppingList> {
  const now = nowISO();
  const list = validate(shoppingListSchema, clean({ ...input, id: newId(), status: 'activa', createdAt: now, updatedAt: now }), 'Lista');
  await db.shoppingLists.add(list);
  return list;
}

export async function updateList(id: string, patch: Partial<Pick<ShoppingList, 'name' | 'budget' | 'status' | 'kind' | 'weekStart'>>): Promise<void> {
  const l = await db.shoppingLists.get(id);
  if (!l) throw new Error('Lista no encontrada');
  const next = { ...l, ...patch, updatedAt: nowISO() };
  if (patch.budget === undefined && 'budget' in patch) delete next.budget;
  await db.shoppingLists.put(validate(shoppingListSchema, next, 'Lista'));
}

/** Duplica una lista con todos sus productos como pendientes. */
export async function duplicateList(id: string, name?: string): Promise<ShoppingList> {
  const l = await db.shoppingLists.get(id);
  if (!l) throw new Error('Lista no encontrada');
  return db.transaction('rw', db.shoppingLists, db.shoppingItems, async () => {
    const copy = await createList({ name: name ?? `${l.name} (copia)`, kind: l.kind, budget: l.budget });
    const items = await db.shoppingItems.where('listId').equals(id).toArray();
    const now = nowISO();
    await db.shoppingItems.bulkAdd(
      items.map((it) => {
        const { paidPrice: _p, purchasedAt: _a, received: _r, ...rest } = it;
        return { ...rest, id: newId(), listId: copy.id, status: 'pendiente' as const, createdAt: now, updatedAt: now };
      }),
    );
    return copy;
  });
}

export async function deleteList(id: string) {
  return db.transaction('rw', db.shoppingLists, db.shoppingItems, async () => {
    const list = await db.shoppingLists.get(id);
    const items = await db.shoppingItems.where('listId').equals(id).toArray();
    await db.shoppingItems.where('listId').equals(id).delete();
    await db.shoppingLists.delete(id);
    return { list, items };
  });
}

export async function restoreList(snapshot: Awaited<ReturnType<typeof deleteList>>) {
  await db.transaction('rw', db.shoppingLists, db.shoppingItems, async () => {
    if (snapshot.list) await db.shoppingLists.put(snapshot.list);
    await db.shoppingItems.bulkPut(snapshot.items);
  });
}

// ───────────────────────── Productos de la lista ─────────────────────────

export type ItemInput = Omit<ShoppingItem, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: ShoppingItem['status'] };

export async function addItem(input: ItemInput): Promise<ShoppingItem> {
  const now = nowISO();
  const item = validate(shoppingItemSchema, clean({ status: 'pendiente', ...input, id: newId(), createdAt: now, updatedAt: now }), 'Producto');
  if (!(await db.shoppingLists.get(item.listId))) throw new ValidationError('La lista no existe');
  await db.shoppingItems.add(item);
  return item;
}

/** Precio sugerido para comprar `unit` de un producto según su ficha. */
export function suggestedPrice(product: Product, unit: Unit): { unitPrice?: number; priceUnit?: Unit; packageQuantity?: number; packageUnit?: Unit } {
  const pkg = product.packageQuantity && product.packageUnit ? { packageQuantity: product.packageQuantity, packageUnit: product.packageUnit } : {};
  if (unit === 'paquete' && product.packagePrice !== undefined) return { unitPrice: product.packagePrice, priceUnit: 'paquete', ...pkg };
  const ref = referencePrice(product);
  if (ref && convertForProduct(1, unit, ref.unit, product) !== null) return { unitPrice: roundQty(ref.value, 4), priceUnit: ref.unit, ...pkg };
  return pkg;
}

export async function updateItem(id: string, patch: Partial<ShoppingItem>): Promise<void> {
  const it = await db.shoppingItems.get(id);
  if (!it) throw new Error('Producto no encontrado');
  const merged: Record<string, unknown> = { ...it, ...patch, updatedAt: nowISO() };
  // Permite borrar campos opcionales pasando undefined.
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete merged[k];
  await db.shoppingItems.put(validate(shoppingItemSchema, clean(merged), 'Producto'));
}

export async function setItemStatus(id: string, status: ShoppingItem['status']): Promise<void> {
  const it = await db.shoppingItems.get(id);
  if (!it) return;
  if (it.received && status === 'pendiente') throw new ValidationError('Este producto ya se registró en la despensa; no se puede desmarcar.');
  await db.shoppingItems.update(id, {
    status,
    purchasedAt: status === 'comprado' ? nowISO() : undefined,
    ...(status === 'pendiente' ? { paidPrice: undefined } : {}),
    updatedAt: nowISO(),
  });
}

export async function deleteItems(ids: string[]): Promise<ShoppingItem[]> {
  const items = (await db.shoppingItems.bulkGet(ids)).filter((x): x is ShoppingItem => !!x);
  await db.shoppingItems.bulkDelete(ids);
  return items;
}

export async function restoreItems(items: ShoppingItem[]): Promise<void> {
  await db.shoppingItems.bulkPut(items);
}

/** Vacía la lista (todo o solo lo comprado). Devuelve lo borrado para deshacer. */
export async function clearList(listId: string, which: 'todo' | 'comprados'): Promise<ShoppingItem[]> {
  const items = await db.shoppingItems.where('listId').equals(listId).toArray();
  const target = which === 'todo' ? items : items.filter((i) => i.status === 'comprado');
  await db.shoppingItems.bulkDelete(target.map((i) => i.id));
  return target;
}

// ───────────────────────── Generación desde el plan ─────────────────────────

export interface DraftLine extends NetRequirement {
  product: Product;
  plan: PurchasePlan;
  estimatedSubtotal: number | null;
}

function buildDraft(entries: MealEntry[], recipes: Map<string, import('../domain/types').Recipe>, products: Map<string, Product>, pantry: PantryItem[], opts: { subtractPantry: boolean; roundToPackage: boolean }): DraftLine[] {
  const reqs = aggregateRequirements(entries, recipes, products);
  const net = opts.subtractPantry ? subtractPantry(reqs, pantry, products) : reqs.map((r) => ({ ...r, available: 0, toBuy: r.quantity, pantryIncompatible: false }));
  return net
    .filter((n) => products.has(n.productId))
    .map((n) => {
      const product = products.get(n.productId)!;
      const plan = n.toBuy > 0 ? planPurchase(n.toBuy, n.unit, product, opts.roundToPackage) : { quantity: 0, unit: n.unit, surplus: 0, roundedToPackage: false };
      return { ...n, product, plan, estimatedSubtotal: n.toBuy > 0 ? itemSubtotal(plan) : 0 };
    })
    .sort((a, b) => a.product.category.localeCompare(b.product.category) || a.product.name.localeCompare(b.product.name));
}

async function loadMaps() {
  const [recipes, products, pantry] = await Promise.all([db.recipes.toArray(), db.products.toArray(), db.pantry.toArray()]);
  return { recipes: new Map(recipes.map((r) => [r.id, r])), products: new Map(products.map((p) => [p.id, p])), pantry };
}

/** Calcula (sin guardar) lo que hay que comprar para las comidas no preparadas entre dos fechas. */
export async function previewFromPlan(from: string, to: string, opts: { subtractPantry: boolean; roundToPackage: boolean; includePrepared?: boolean }): Promise<DraftLine[]> {
  const entries = (await db.mealEntries.where('date').between(from, to, true, true).toArray()).filter((e) => opts.includePrepared || !e.prepared);
  const m = await loadMaps();
  return buildDraft(entries, m.recipes, m.products, m.pantry, opts);
}

/** Vista previa para una sola receta con N raciones. */
export async function previewFromRecipe(recipeId: string, servings: number, opts: { subtractPantry: boolean; roundToPackage: boolean }): Promise<DraftLine[]> {
  const m = await loadMaps();
  const pseudo: MealEntry = { id: 'tmp', date: today(), slot: 'comida', recipeId, servings, order: 0, prepared: false };
  return buildDraft([pseudo], m.recipes, m.products, m.pantry, opts);
}

function draftToItem(listId: string, d: DraftLine): ItemInput {
  return {
    listId,
    productId: d.product.id,
    name: d.product.name,
    category: d.product.category || 'Otros',
    quantity: d.plan.quantity,
    unit: d.plan.unit,
    unitPrice: d.plan.unitPrice,
    priceUnit: d.plan.priceUnit,
    neededQuantity: d.toBuy,
    neededUnit: d.unit,
    packageQuantity: d.plan.packageQuantity,
    packageUnit: d.plan.packageUnit,
    store: d.product.store,
    brand: d.product.brand,
    origin: 'receta',
  };
}

/**
 * Aplica una generación desde el plan a una lista: sustituye los productos
 * pendientes que venían de recetas y conserva los añadidos a mano y los comprados.
 */
export async function applyPlanToList(listId: string, lines: DraftLine[]): Promise<{ removed: ShoppingItem[]; added: number }> {
  return db.transaction('rw', db.shoppingItems, db.shoppingLists, async () => {
    const removed = await db.shoppingItems.where('listId').equals(listId).filter((i) => i.origin === 'receta' && i.status === 'pendiente').toArray();
    await db.shoppingItems.bulkDelete(removed.map((i) => i.id));
    let added = 0;
    for (const d of lines) {
      if (d.toBuy <= 0) continue;
      await addItem(draftToItem(listId, d));
      added++;
    }
    return { removed, added };
  });
}

/** Añade a la lista lo que falta para una receta, sumando a líneas pendientes compatibles. */
export async function addDraftToList(listId: string, lines: DraftLine[]): Promise<number> {
  return db.transaction('rw', db.shoppingItems, db.shoppingLists, async () => {
    let n = 0;
    for (const d of lines) {
      if (d.toBuy <= 0) continue;
      const input = draftToItem(listId, d);
      const existing = await db.shoppingItems
        .where('listId')
        .equals(listId)
        .filter((i) => i.productId === d.product.id && i.status === 'pendiente' && i.unit === input.unit)
        .first();
      if (existing) {
        await updateItem(existing.id, {
          quantity: roundQty(existing.quantity + input.quantity),
          neededQuantity: existing.neededUnit === input.neededUnit ? roundQty((existing.neededQuantity ?? 0) + (input.neededQuantity ?? 0)) : existing.neededQuantity,
        });
      } else await addItem(input);
      n++;
    }
    return n;
  });
}

/** Añade los productos marcados como frecuentes que no estén ya pendientes. */
export async function addFrequentProducts(listId: string): Promise<number> {
  const freq = await db.products.filter((p) => !!p.frequent).toArray();
  const items = await db.shoppingItems.where('listId').equals(listId).toArray();
  let n = 0;
  for (const p of freq) {
    if (items.some((i) => i.productId === p.id && i.status === 'pendiente')) continue;
    const unit: Unit = p.packageQuantity ? 'paquete' : p.unit === 'g' ? 'kg' : p.unit === 'ml' ? 'l' : p.unit;
    await addItem({ listId, productId: p.id, name: p.name, category: p.category || 'Otros', quantity: 1, unit, ...suggestedPrice(p, unit), store: p.store, brand: p.brand, origin: 'frecuente' });
    n++;
  }
  return n;
}

// ───────────────────────── Recepción de la compra ─────────────────────────

export interface ReceiveLine {
  itemId: string;
  paid: number;
  addToPantry: boolean;
  location: StorageLocation;
  expiryDate?: string;
}

/** Cantidad que entra en la despensa por una línea comprada. */
export function pantryQuantityFor(item: ShoppingItem): { quantity: number; unit: Unit } {
  if (item.unit === 'paquete' && item.packageQuantity && item.packageUnit) {
    return { quantity: roundQty(item.quantity * item.packageQuantity), unit: item.packageUnit };
  }
  return { quantity: item.quantity, unit: item.unit };
}

/**
 * Registra la compra: crea el gasto real (purchase), guarda el histórico de
 * precios, añade los productos a la despensa (si se indica) y marca las
 * líneas como recibidas. Todo en una sola transacción.
 */
export async function receivePurchase(listId: string, lines: ReceiveLine[], opts: { date?: string; store?: string; updateReferencePrices: boolean }): Promise<Purchase> {
  if (lines.length === 0) throw new ValidationError('No hay productos comprados para registrar.');
  if (lines.some((l) => !Number.isFinite(l.paid) || l.paid < 0)) throw new ValidationError('Revisa los importes pagados: deben ser 0 o más.');
  const date = opts.date ?? today();
  return db.transaction('rw', [db.shoppingItems, db.purchases, db.priceRecords, db.pantry, db.products], async () => {
    const now = nowISO();
    const pLines: PurchaseLine[] = [];
    for (const l of lines) {
      const item = await db.shoppingItems.get(l.itemId);
      if (!item || item.listId !== listId) throw new ValidationError('Producto de la lista no encontrado');
      if (item.received) continue;
      const product = item.productId ? await db.products.get(item.productId) : undefined;
      const paid = roundMoney(l.paid);
      pLines.push({ itemId: item.id, productId: item.productId, name: item.name, quantity: item.quantity, unit: item.unit, paid, estimated: itemSubtotal(item) ?? undefined });

      const inPantry = pantryQuantityFor(item);
      if (product) {
        const base = productBaseUnit(product);
        const qBase = convertForProduct(inPantry.quantity, inPantry.unit, base, product);
        const rec: PriceRecord = {
          id: newId(),
          productId: product.id,
          date,
          paid,
          quantity: inPantry.quantity,
          unit: inPantry.unit,
          store: opts.store || item.store,
          source: 'compra',
          createdAt: now,
          ...(qBase && qBase > 0 ? { pricePerBase: paid / qBase, baseUnit: base } : {}),
        };
        await db.priceRecords.add(rec);
        if (opts.updateReferencePrices && paid > 0) {
          const patch: Partial<Product> = { updatedAt: now };
          if (item.unit === 'paquete' && item.packageQuantity && item.packageUnit) {
            patch.packagePrice = roundMoney(paid / item.quantity);
            patch.packageQuantity = item.packageQuantity;
            patch.packageUnit = item.packageUnit;
            patch.price = undefined;
            patch.priceQuantity = undefined;
            patch.priceUnit = undefined;
          } else if (qBase && qBase > 0) {
            patch.price = paid;
            patch.priceQuantity = inPantry.quantity;
            patch.priceUnit = inPantry.unit;
          }
          await db.products.update(product.id, patch);
        }
        if (l.addToPantry) {
          const lot: PantryItem = {
            id: newId(),
            productId: product.id,
            quantity: inPantry.quantity,
            unit: inPantry.unit,
            purchaseDate: date,
            expiryDate: l.expiryDate || undefined,
            pricePaid: paid,
            location: l.location,
            createdAt: now,
            updatedAt: now,
          };
          await db.pantry.add(clean(lot));
        }
      }
      await db.shoppingItems.update(item.id, { paidPrice: paid, status: 'comprado', received: true, purchasedAt: item.purchasedAt ?? now, updatedAt: now });
    }
    const purchase: Purchase = {
      id: newId(),
      date,
      listId,
      store: opts.store || undefined,
      lines: pLines,
      total: roundMoney(pLines.reduce((s, l) => s + l.paid, 0)),
      createdAt: now,
    };
    await db.purchases.add(clean(purchase));
    return purchase;
  });
}

/** Último precio pagado (por unidad base) de un producto antes de hoy, para comparar. */
export async function lastPaidPrice(productId: string): Promise<PriceRecord | undefined> {
  const recs = await db.priceRecords.where('productId').equals(productId).filter((r) => r.source === 'compra' && r.pricePerBase !== undefined).toArray();
  return recs.sort(comparePriceRecords).at(-1);
}
