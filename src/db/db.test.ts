// Pruebas de integración con una IndexedDB simulada (fake-indexeddb).
import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { CocinaDB, db, DB_NAME } from './db';
import { saveProduct, saveRecipe, deleteProduct, saveSettings } from './catalog';
import { addMeal, copyDays, markPrepared, previewCooking, swapDays } from './planner';
import { addItem, applyPlanToList, createList, previewFromPlan, receivePurchase, setItemStatus, clearList, restoreItems } from './shopping';
import { consumeFromLot, savePantryItem } from './pantry';
import { eraseAllData, exportBackup, parseBackup, restoreBackup } from './backup';
import { loadSampleData } from './sampleData';
import { ValidationError } from './common';
import { summarizeList } from '../domain/shopping';
import { comparePriceRecords, priceChanges } from '../domain/stats';

beforeEach(async () => {
  await eraseAllData();
});

async function setup() {
  const pollo = await saveProduct({ name: 'Pechuga de pollo', category: 'Carne', unit: 'g', price: 7.5, priceQuantity: 1, priceUnit: 'kg' });
  const arroz = await saveProduct({ name: 'Arroz', category: 'Despensa', unit: 'g', packageQuantity: 1, packageUnit: 'kg', packagePrice: 1.8 });
  const r1 = await saveRecipe({
    name: 'Arroz con pollo', category: 'Arroces', mealTypes: ['comida'], servings: 2, prepMinutes: 10, cookMinutes: 20, difficulty: 'facil',
    ingredients: [{ productId: pollo.id, quantity: 200, unit: 'g' }, { productId: arroz.id, quantity: 150, unit: 'g' }],
    steps: ['Cocinar'], utensils: [], tags: [], favorite: false, origin: 'manual',
  });
  const r2 = await saveRecipe({
    name: 'Pollo a la plancha', category: 'Carnes', mealTypes: ['cena'], servings: 2, prepMinutes: 5, cookMinutes: 10, difficulty: 'facil',
    ingredients: [{ productId: pollo.id, quantity: 300, unit: 'g' }],
    steps: ['Plancha'], utensils: [], tags: [], favorite: false, origin: 'manual',
  });
  return { pollo, arroz, r1, r2 };
}

describe('Productos y recetas', () => {
  it('(17) rechaza formularios incompletos con mensajes claros', async () => {
    await expect(saveProduct({ name: '', category: '', unit: 'g' })).rejects.toThrow(ValidationError);
    await expect(
      saveRecipe({ name: 'Sin ingredientes', category: '', mealTypes: [], servings: 2, prepMinutes: 0, cookMinutes: 0, difficulty: 'facil', ingredients: [], steps: [], utensils: [], tags: [], favorite: false, origin: 'manual' }),
    ).rejects.toThrow(/al menos un ingrediente/);
    const list = await createList({ name: 'Semana', kind: 'semana' });
    await expect(addItem({ listId: list.id, name: 'Leche', category: 'Lácteos', quantity: 0, unit: 'l', origin: 'manual' })).rejects.toThrow(/mayor que 0/);
  });

  it('no permite nombres de producto duplicados ni borrar productos en uso', async () => {
    const { pollo } = await setup();
    await expect(saveProduct({ name: 'pechuga de POLLO', category: '', unit: 'g' })).rejects.toThrow(/Ya existe/);
    await expect(deleteProduct(pollo.id)).rejects.toThrow(/lo usan 2 receta/);
  });

  it('guarda el histórico cuando cambia el precio de referencia', async () => {
    const { pollo } = await setup();
    await saveProduct({ ...pollo, price: 8 });
    const recs = (await db.priceRecords.where('productId').equals(pollo.id).toArray()).sort(comparePriceRecords);
    expect(recs.map((r) => Math.round(r.pricePerBase! * 1000 * 100) / 100)).toEqual([7.5, 8]);
  });
});

describe('Planificador', () => {
  it('(8) planifica una receta en un día concreto', async () => {
    const { r1 } = await setup();
    const e = await addMeal('2026-10-26', 'comida', r1.id, 3);
    const stored = await db.mealEntries.where('date').equals('2026-10-26').toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: e.id, slot: 'comida', servings: 3, prepared: false });
  });

  it('copia una semana y permite intercambiar días', async () => {
    const { r1, r2 } = await setup();
    await addMeal('2026-10-26', 'comida', r1.id, 2);
    await addMeal('2026-10-27', 'cena', r2.id, 2);
    const res = await copyDays('2026-10-26', '2026-11-02', 7, 'replace');
    expect(res.created).toBe(2);
    expect(await db.mealEntries.where('date').equals('2026-11-03').count()).toBe(1);
    await swapDays('2026-11-02', '2026-11-03');
    const mon = await db.mealEntries.where('date').equals('2026-11-02').toArray();
    expect(mon[0].recipeId).toBe(r2.id);
  });

  it('no descuenta la despensa al planificar, solo al confirmar que se ha cocinado', async () => {
    const { pollo, r2 } = await setup();
    const lot = await savePantryItem({ productId: pollo.id, quantity: 250, unit: 'g', location: 'nevera' });
    const e = await addMeal('2026-10-26', 'cena', r2.id, 2);
    expect((await db.pantry.get(lot.id))!.quantity).toBe(250);
    const preview = await previewCooking(e.id);
    expect(preview[0].shortage).toBe(50);
    const { shortages } = await markPrepared(e.id, true);
    expect(shortages).toHaveLength(1);
    expect(await db.pantry.get(lot.id)).toBeUndefined(); // se consumió entero, sin negativos
    const cons = await db.consumption.toArray();
    expect(cons[0]).toMatchObject({ reason: 'cocinado', quantity: 250, estimatedCost: 1.88 });
    expect((await db.mealEntries.get(e.id))!.prepared).toBe(true);
  });
});

describe('Lista de la compra conectada', () => {
  it('(9-11) genera la lista desde varias recetas, unifica y resta la despensa', async () => {
    const { pollo, arroz, r1, r2 } = await setup();
    await addMeal('2026-10-26', 'comida', r1.id, 2); // 200 g pollo, 150 g arroz
    await addMeal('2026-10-26', 'cena', r2.id, 4); // 600 g pollo
    await savePantryItem({ productId: pollo.id, quantity: 300, unit: 'g', location: 'nevera' });
    const lines = await previewFromPlan('2026-10-26', '2026-11-01', { subtractPantry: true, roundToPackage: true });
    const p = lines.find((l) => l.productId === pollo.id)!;
    expect(p.quantity).toBe(800);
    expect(p.available).toBe(300);
    expect(p.toBuy).toBe(500);
    expect(p.estimatedSubtotal).toBe(3.75);
    const a = lines.find((l) => l.productId === arroz.id)!;
    expect(a.plan).toMatchObject({ quantity: 1, unit: 'paquete', unitPrice: 1.8, surplus: 850 });

    const list = await createList({ name: 'Semana 44', kind: 'semana', budget: 30 });
    await addItem({ listId: list.id, name: 'Detergente', category: 'Limpieza', quantity: 1, unit: 'ud', unitPrice: 4, priceUnit: 'ud', origin: 'manual' });
    await applyPlanToList(list.id, lines);
    // regenerar no duplica: sustituye las líneas de receta y conserva las manuales
    const again = await applyPlanToList(list.id, lines);
    expect(again.removed).toHaveLength(2);
    const items = await db.shoppingItems.where('listId').equals(list.id).toArray();
    expect(items).toHaveLength(3);
    expect(summarizeList(items, 30).estimatedTotal).toBe(9.55);
  });

  it('(4) marcar como comprado y (13) registrar la compra actualiza despensa, gasto real y precios', async () => {
    const { arroz } = await setup();
    const list = await createList({ name: 'Compra', kind: 'ocasion' });
    const it = await addItem({ listId: list.id, productId: arroz.id, name: 'Arroz', category: 'Despensa', quantity: 2, unit: 'paquete', unitPrice: 1.8, priceUnit: 'paquete', packageQuantity: 1, packageUnit: 'kg', origin: 'manual' });
    await setItemStatus(it.id, 'comprado');
    const purchase = await receivePurchase(list.id, [{ itemId: it.id, paid: 3.4, addToPantry: true, location: 'despensa', expiryDate: '2027-06-01' }], { date: '2026-10-28', updateReferencePrices: true });
    expect(purchase.total).toBe(3.4);
    const lots = await db.pantry.where('productId').equals(arroz.id).toArray();
    expect(lots[0]).toMatchObject({ quantity: 2, unit: 'kg', pricePaid: 3.4, expiryDate: '2027-06-01' });
    const updated = await db.products.get(arroz.id);
    expect(updated!.packagePrice).toBe(1.7);
    const item = await db.shoppingItems.get(it.id);
    expect(item).toMatchObject({ received: true, paidPrice: 3.4, status: 'comprado' });
    await expect(setItemStatus(it.id, 'pendiente')).rejects.toThrow(/ya se registró/);
    // recibir dos veces no duplica
    const second = await receivePurchase(list.id, [{ itemId: it.id, paid: 3.4, addToPantry: true, location: 'despensa' }], { updateReferencePrices: false });
    expect(second.total).toBe(0);
    expect(await db.pantry.where('productId').equals(arroz.id).count()).toBe(1);
  });

  it('vaciar la lista se puede deshacer', async () => {
    const list = await createList({ name: 'L', kind: 'ocasion' });
    await addItem({ listId: list.id, name: 'Pan', category: 'Panadería', quantity: 1, unit: 'ud', origin: 'manual' });
    const removed = await clearList(list.id, 'todo');
    expect(await db.shoppingItems.count()).toBe(0);
    await restoreItems(removed);
    expect(await db.shoppingItems.count()).toBe(1);
  });
});

describe('Despensa', () => {
  it('evita cantidades negativas e informa del exceso', async () => {
    const { pollo } = await setup();
    const lot = await savePantryItem({ productId: pollo.id, quantity: 0.2, unit: 'kg', location: 'nevera' });
    const res = await consumeFromLot(lot.id, 300, 'g', 'desperdicio');
    expect(res).toEqual({ consumed: 0.2, shortage: 100 });
    expect(await db.pantry.get(lot.id)).toBeUndefined();
    const rec = (await db.consumption.toArray())[0];
    expect(rec).toMatchObject({ reason: 'desperdicio', estimatedCost: 1.5 });
  });

  it('valida fechas incoherentes', async () => {
    const { pollo } = await setup();
    await expect(savePantryItem({ productId: pollo.id, quantity: 1, unit: 'g', location: 'nevera', purchaseDate: '2026-10-10', expiryDate: '2026-10-01' })).rejects.toThrow(/anterior/);
  });
});

describe('Migraciones', () => {
  it('migra una base de datos de la versión 1 sin perder datos', async () => {
    const name = 'migracion-v1';
    const old = new Dexie(name);
    old.version(1).stores({ priceRecords: 'id, productId, date' });
    await old.open();
    await old.table('priceRecords').add({ id: 'p1', productId: 'x', date: '2026-01-05', paid: 2, quantity: 1, unit: 'kg', source: 'manual', pricePerBase: 0.002 });
    old.close();
    const upgraded = new CocinaDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(2);
    expect(await upgraded.priceRecords.get('p1')).toMatchObject({ paid: 2, createdAt: '2026-01-05T00:00:00.000Z' });
    upgraded.close();
    await Dexie.delete(name);
  });

  it('ordena varios precios del mismo día por su momento de registro', () => {
    const base = { productId: 'x', date: '2026-01-05', paid: 1, quantity: 1, unit: 'kg' as const, source: 'manual' as const };
    const changes = priceChanges([
      { ...base, id: 'zzz', pricePerBase: 0.008, createdAt: '2026-01-05T10:00:00.002Z' },
      { ...base, id: 'aaa', pricePerBase: 0.0075, createdAt: '2026-01-05T10:00:00.001Z' },
    ]);
    expect(changes[0]).toMatchObject({ previous: 0.0075, last: 0.008 });
  });
});

describe('Persistencia y copias de seguridad', () => {
  it('(14) conserva los datos tras cerrar y volver a abrir la base de datos', async () => {
    const { r1 } = await setup();
    await saveSettings({ weeklyBudget: 60, people: 3 });
    db.close();
    const reopened = new CocinaDB(DB_NAME);
    await reopened.open();
    expect((await reopened.recipes.get(r1.id))!.name).toBe('Arroz con pollo');
    expect((await reopened.settings.get('app'))!.weeklyBudget).toBe(60);
    reopened.close();
    await db.open();
  });

  it('(15) exporta e importa sin pérdidas', async () => {
    const { r1 } = await setup();
    await loadSampleData();
    await addMeal('2026-10-26', 'comida', r1.id, 2);
    const list = await createList({ name: 'L', kind: 'semana', budget: 50 });
    await addItem({ listId: list.id, name: 'Café', category: 'Despensa', quantity: 1, unit: 'paquete', unitPrice: 3.2, priceUnit: 'paquete', origin: 'manual' });
    const before = await exportBackup();
    const json = JSON.stringify(before);
    await eraseAllData();
    expect(await db.recipes.count()).toBe(0);
    const { backup, counts } = parseBackup(json);
    expect(counts.recipes).toBe(before.data.recipes.length);
    await restoreBackup(backup);
    const after = await exportBackup();
    expect(after.data).toEqual(before.data);
  });

  it('rechaza copias corruptas sin tocar los datos existentes', async () => {
    await setup();
    expect(() => parseBackup('{no es json')).toThrow(/JSON válido/);
    const bad = await exportBackup();
    (bad.data.recipes[0] as { servings: unknown }).servings = 'muchas';
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/No se ha importado nada/);
    expect(await db.recipes.count()).toBe(2);
  });
});

describe('Lista semanal de Notion (plantilla)', () => {
  it('reproduce la lista con sus 28 productos, secciones y el total de Notion (84,42 €)', async () => {
    const { createListFromTemplate, MERCADONA_WEEKLY } = await import('./templates');
    const list = await createListFromTemplate();
    const items = await db.shoppingItems.where('listId').equals(list.id).toArray();
    expect(items).toHaveLength(MERCADONA_WEEKLY.length);
    expect(summarizeList(items).estimatedTotal).toBe(84.42);
    const pollo = items.find((i) => i.name === 'Pechugas enteras de pollo')!;
    expect(pollo).toMatchObject({ quantity: 3, unit: 'paquete', unitPrice: 3.86, packageName: 'bandeja', category: 'Carne y pescado' });
    expect(items.find((i) => i.name === 'Avena molida Hacendado')!.lastsWeeks).toBe(3);
    expect(new Set(items.map((i) => i.category))).toEqual(new Set(['Carne y pescado', 'Huevos y lácteos', 'Panadería', 'Despensa', 'Fruta y verdura']));
  });

  it('solo se crea automáticamente una vez, aunque se llame a la vez', async () => {
    const { seedTemplateOnce } = await import('./templates');
    await Promise.all([seedTemplateOnce(), seedTemplateOnce()]);
    expect(await db.shoppingLists.count()).toBe(1);
  });

  it('«Empezar semana nueva» desmarca todo y conserva el historial', async () => {
    const { createListFromTemplate } = await import('./templates');
    const { resetList } = await import('./shopping');
    const list = await createListFromTemplate();
    const [first] = await db.shoppingItems.where('listId').equals(list.id).toArray();
    await setItemStatus(first.id, 'comprado');
    await receivePurchase(list.id, [{ itemId: first.id, paid: 11, addToPantry: true, location: 'nevera' }], { updateReferencePrices: false });
    await resetList(list.id);
    expect(await db.shoppingItems.where('status').equals('comprado').count()).toBe(0);
    expect(await db.purchases.count()).toBe(1);
  });
});
