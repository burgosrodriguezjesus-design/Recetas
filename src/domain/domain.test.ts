// Pruebas de los cálculos del dominio (sin base de datos ni interfaz).
import { describe, expect, it } from 'vitest';
import { convert, humanize } from './units';
import { formatMoney, parseDecimal } from './format';
import { addDays, startOfWeek, isISODate } from './dates';
import { pricePerBase, referencePrice, scaleIngredients, summarizeRecipe } from './recipeCalc';
import { aggregateRequirements, itemSubtotal, planPurchase, subtractPantry, summarizeList } from './shopping';
import { planConsumption, expiryState } from './pantry';
import { parseIngredientLine, parseRecipeText } from './importText';
import { generateMenu } from './menuGenerator';
import { shoppingListToCSV } from './csv';
import { byId, entry, item, lot, product, recipe } from '../test/factories';

describe('Unidades y conversiones', () => {
  it('convierte dentro de la misma dimensión', () => {
    expect(convert(1.5, 'kg', 'g')).toBe(1500);
    expect(convert(250, 'ml', 'l')).toBe(0.25);
    expect(convert(2, 'cda', 'ml')).toBe(30);
  });

  it('(12) evita conversiones incorrectas entre dimensiones sin equivalencia', () => {
    expect(convert(2, 'ud', 'g')).toBeNull();
    expect(convert(100, 'ml', 'g')).toBeNull();
    expect(convert(1, 'pizca', 'g')).toBeNull();
    expect(convert(1, 'paquete', 'g')).toBeNull();
  });

  it('convierte entre dimensiones solo con equivalencia del producto', () => {
    expect(convert(2, 'ud', 'g', { gramsPerUnit: 60 })).toBe(120);
    expect(convert(100, 'ml', 'g', { densityGPerMl: 0.92 })).toBeCloseTo(92);
    expect(convert(1, 'kg', 'ud', { gramsPerUnit: 250 })).toBe(4);
  });

  it('humaniza cantidades', () => {
    expect(humanize(1500, 'g')).toEqual({ quantity: 1.5, unit: 'kg' });
    expect(humanize(0.25, 'l')).toEqual({ quantity: 250, unit: 'ml' });
  });
});

describe('Formato y fechas', () => {
  it('lee números en formato español', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('3/4')).toBe(0.75);
    expect(parseDecimal('1 1/2')).toBe(1.5);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });

  it('formatea euros', () => {
    expect(formatMoney(13.5).replace(/\s/g, ' ')).toBe('13,50 €');
    expect(formatMoney(null)).toBe('—');
  });

  it('calcula semanas que empiezan en lunes', () => {
    expect(startOfWeek('2026-10-28')).toBe('2026-10-26'); // miércoles → lunes
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26'); // domingo → lunes anterior
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(isISODate('2026-02-30')).toBe(false);
  });
});

describe('Lista de la compra: subtotales y totales', () => {
  // Ejemplo del enunciado: pollo 1 kg × 7,50 €/kg, arroz 2 paquetes × 1,80 €, huevos 1 caja × 2,40 €.
  const pollo = item({ name: 'Pechuga de pollo', quantity: 1, unit: 'kg', unitPrice: 7.5, priceUnit: 'kg' });
  const arroz = item({ name: 'Arroz', quantity: 2, unit: 'paquete', unitPrice: 1.8, priceUnit: 'paquete' });
  const huevos = item({ name: 'Huevos', quantity: 1, unit: 'paquete', unitPrice: 2.4, priceUnit: 'paquete' });

  it('(1-2) calcula subtotales con precio y cantidad', () => {
    expect(itemSubtotal(pollo)).toBe(7.5);
    expect(itemSubtotal(arroz)).toBe(3.6);
    expect(itemSubtotal(huevos)).toBe(2.4);
  });

  it('(2) convierte la cantidad a la unidad del precio (500 g a 7,50 €/kg = 3,75 €)', () => {
    expect(itemSubtotal(item({ name: 'x', quantity: 500, unit: 'g', unitPrice: 7.5, priceUnit: 'kg' }))).toBe(3.75);
  });

  it('no inventa subtotal si no hay precio o las unidades son incompatibles', () => {
    expect(itemSubtotal(item({ name: 'x', quantity: 2, unit: 'ud' }))).toBeNull();
    expect(itemSubtotal(item({ name: 'x', quantity: 2, unit: 'ud', unitPrice: 3, priceUnit: 'kg' }))).toBeNull();
  });

  it('(3) calcula el total de la lista', () => {
    const s = summarizeList([pollo, arroz, huevos], 20);
    expect(s.estimatedTotal).toBe(13.5);
    expect(s.pendingAmount).toBe(13.5);
    expect(s.budgetRemaining).toBe(6.5);
    expect(s.pendingCount).toBe(3);
  });

  it('(4) actualiza totales al marcar como comprado', () => {
    const s = summarizeList([{ ...pollo, status: 'comprado' }, arroz, huevos]);
    expect(s.purchasedAmount).toBe(7.5);
    expect(s.purchasedEstimatedOnly).toBe(7.5); // aún sin precio real
    expect(s.pendingAmount).toBe(6);
    expect(s.purchasedCount).toBe(1);
    expect(s.pendingCount).toBe(2);
  });

  it('(5) modificar el precio recalcula el total; el precio real no se confunde con el estimado', () => {
    const s1 = summarizeList([{ ...pollo, unitPrice: 8 }, arroz, huevos]);
    expect(s1.estimatedTotal).toBe(14);
    const s2 = summarizeList([{ ...pollo, status: 'comprado', paidPrice: 6.9 }, arroz, huevos]);
    expect(s2.estimatedTotal).toBe(13.5); // la estimación no cambia
    expect(s2.purchasedAmount).toBe(6.9); // el gasto real sí
    expect(s2.purchasedPaidConfirmed).toBe(6.9);
  });
});

describe('Recetas', () => {
  const arroz = product({ name: 'Arroz', unit: 'g', packageQuantity: 1, packageUnit: 'kg', packagePrice: 2 });
  const pollo = product({ name: 'Pollo', unit: 'g', price: 7.5, priceQuantity: 1, priceUnit: 'kg', nutrition: { kcal: 110, protein: 23, carbs: 0, fat: 1.5 } });
  const huevo = product({ name: 'Huevo', unit: 'ud', price: 2.4, priceQuantity: 12, priceUnit: 'ud' });
  const products = byId([arroz, pollo, huevo]);
  const r = recipe({
    name: 'Arroz con pollo',
    servings: 2,
    ingredients: [
      { productId: arroz.id, quantity: 200, unit: 'g' },
      { productId: pollo.id, quantity: 300, unit: 'g' },
      { productId: huevo.id, quantity: 2, unit: 'ud' },
    ],
  });

  it('calcula el precio por unidad base desde el envase', () => {
    expect(pricePerBase(arroz)).toBeCloseTo(0.002);
    expect(referencePrice(pollo)).toEqual({ value: 7.5, unit: 'kg' });
  });

  it('(6) crea una receta con varios ingredientes y calcula su coste', () => {
    const s = summarizeRecipe(r, products);
    // arroz 0,40 € + pollo 2,25 € + huevos 0,40 € = 3,05 €
    expect(s.totalCost).toBe(3.05);
    expect(s.costPerServing).toBe(1.53);
    expect(s.costComplete).toBe(true);
  });

  it('distingue coste de ingredientes usados del precio del paquete (arroz: 0,40 € de un paquete de 2 €)', () => {
    const s = summarizeRecipe(recipe({ name: 'x', servings: 1, ingredients: [{ productId: arroz.id, quantity: 200, unit: 'g' }] }), products);
    expect(s.totalCost).toBe(0.4);
  });

  it('(7) cambia el número de raciones y recalcula cantidades', () => {
    const scaled = scaleIngredients(r.ingredients, 2, 5);
    expect(scaled.map((i) => i.quantity)).toEqual([500, 750, 5]);
    expect(summarizeRecipe(r, products, 4).totalCost).toBe(6.1);
  });

  it('informa de nutrición incompleta en vez de inventarla', () => {
    const s = summarizeRecipe(r, products);
    expect(s.nutritionComplete).toBe(false);
    expect(s.missingNutrition).toContain(arroz.id);
    expect(s.nutritionTotal?.kcal).toBe(330); // solo el pollo, y se avisa
  });
});

describe('Generar lista desde varias recetas', () => {
  const pollo = product({ name: 'Pollo', unit: 'g', price: 7.5, priceQuantity: 1, priceUnit: 'kg' });
  const huevo = product({ name: 'Huevo', unit: 'ud' });
  const harina = product({ name: 'Harina', unit: 'g', packageQuantity: 1, packageUnit: 'kg', packagePrice: 0.9 });
  const products = byId([pollo, huevo, harina]);
  const r1 = recipe({ name: 'A', servings: 1, ingredients: [{ productId: pollo.id, quantity: 200, unit: 'g' }, { productId: huevo.id, quantity: 2, unit: 'ud' }] });
  const r2 = recipe({ name: 'B', servings: 1, ingredients: [{ productId: pollo.id, quantity: 0.3, unit: 'kg' }, { productId: huevo.id, quantity: 100, unit: 'g' }, { productId: harina.id, quantity: 1300, unit: 'g' }] });
  const recipes = byId([r1, r2]);
  const entries = [entry({ recipeId: r1.id, date: '2026-10-26', servings: 1 }), entry({ recipeId: r2.id, date: '2026-10-27', servings: 1 })];

  it('(9-10) unifica ingredientes repetidos: 200 g + 300 g de pollo = 500 g', () => {
    const reqs = aggregateRequirements(entries, recipes, products);
    const p = reqs.find((x) => x.productId === pollo.id)!;
    expect(p.quantity).toBe(500);
    expect(p.unit).toBe('g');
    expect(p.recipeIds).toHaveLength(2);
  });

  it('(12) no suma unidades incompatibles (huevo en ud y en g sin peso por unidad)', () => {
    const reqs = aggregateRequirements(entries, recipes, products).filter((x) => x.productId === huevo.id);
    expect(reqs).toHaveLength(2);
    expect(reqs.every((r) => r.splitByUnits)).toBe(true);
  });

  it('escala por raciones planificadas', () => {
    const reqs = aggregateRequirements([entry({ recipeId: r1.id, date: '2026-10-26', servings: 3 })], recipes, products);
    expect(reqs.find((x) => x.productId === pollo.id)!.quantity).toBe(600);
  });

  it('(11) resta la despensa: necesito 800 g, tengo 300 g → compro 500 g', () => {
    const reqs = [{ key: 'k', productId: pollo.id, quantity: 800, unit: 'g' as const, recipeIds: [] }];
    const net = subtractPantry(reqs, [lot({ productId: pollo.id, quantity: 0.3, unit: 'kg' })], products);
    expect(net[0].available).toBe(300);
    expect(net[0].toBuy).toBe(500);
  });

  it('(12) no resta despensa en unidades incompatibles y lo indica', () => {
    const reqs = [{ key: 'k', productId: huevo.id, quantity: 100, unit: 'g' as const, recipeIds: [] }];
    const net = subtractPantry(reqs, [lot({ productId: huevo.id, quantity: 6, unit: 'ud' })], products);
    expect(net[0].toBuy).toBe(100);
    expect(net[0].pantryIncompatible).toBe(true);
  });

  it('redondea al tamaño de envase y calcula el sobrante', () => {
    const plan = planPurchase(1300, 'g', harina);
    expect(plan.quantity).toBe(2);
    expect(plan.unit).toBe('paquete');
    expect(plan.unitPrice).toBe(0.9);
    expect(plan.surplus).toBe(700);
  });

  it('sin envase compra la cantidad exacta valorada por kg', () => {
    const plan = planPurchase(500, 'g', pollo);
    expect(plan).toMatchObject({ quantity: 500, unit: 'g', unitPrice: 7.5, priceUnit: 'kg' });
    expect(itemSubtotal({ quantity: plan.quantity, unit: plan.unit, unitPrice: plan.unitPrice, priceUnit: plan.priceUnit })).toBe(3.75);
  });
});

describe('Despensa', () => {
  const leche = product({ name: 'Leche', unit: 'ml' });
  const products = byId([leche]);

  it('consume primero el lote que caduca antes y avisa del faltante', () => {
    const a = lot({ productId: leche.id, quantity: 1, unit: 'l', expiryDate: '2026-11-10' });
    const b = lot({ productId: leche.id, quantity: 500, unit: 'ml', expiryDate: '2026-11-01' });
    const plan = planConsumption([{ productId: leche.id, quantity: 1800, unit: 'ml' }], [a, b], products);
    expect(plan[0].deductions[0]).toMatchObject({ lotId: b.id, quantity: 500, remainingAfter: 0 });
    expect(plan[0].deductions[1]).toMatchObject({ lotId: a.id, quantity: 1, remainingAfter: 0 });
    expect(plan[0].shortage).toBe(300);
  });

  it('clasifica caducidades', () => {
    expect(expiryState({ expiryDate: '2026-10-27' }, '2026-10-28', 3)).toBe('caducado');
    expect(expiryState({ expiryDate: '2026-10-30' }, '2026-10-28', 3)).toBe('pronto');
    expect(expiryState({}, '2026-10-28', 3)).toBe('sin-fecha');
  });
});

describe('Importar recetas desde texto', () => {
  it('interpreta líneas de ingredientes', () => {
    expect(parseIngredientLine('- 300 g de lentejas')).toMatchObject({ name: 'lentejas', quantity: 300, unit: 'g' });
    expect(parseIngredientLine('2 huevos')).toMatchObject({ name: 'huevos', quantity: 2, unit: 'ud' });
    expect(parseIngredientLine('1,5 kg patatas')).toMatchObject({ name: 'patatas', quantity: 1.5, unit: 'kg' });
    expect(parseIngredientLine('2 cucharadas de aceite')).toMatchObject({ name: 'aceite', quantity: 2, unit: 'cda' });
    expect(parseIngredientLine('25 cl de nata')).toMatchObject({ name: 'nata', quantity: 250, unit: 'ml' });
    expect(parseIngredientLine('sal al gusto')).toMatchObject({ name: 'sal al gusto', quantity: null });
  });

  it('interpreta una receta completa y avisa de lo dudoso', () => {
    const r = parseRecipeText(`Lentejas
Un clásico.
Raciones: 4
Tiempo: 15 min de preparación, 40 min de cocción
Ingredientes:
- 300 g de lentejas
- sal
Preparación:
1. Cocer.
2. Servir.`);
    expect(r.name).toBe('Lentejas');
    expect(r.servings).toBe(4);
    expect(r.prepMinutes).toBe(15);
    expect(r.cookMinutes).toBe(40);
    expect(r.ingredients).toHaveLength(2);
    expect(r.steps).toEqual(['Cocer.', 'Servir.']);
    expect(r.warnings.some((w) => w.includes('sal'))).toBe(true);
  });
});

describe('Generador de menús', () => {
  const pasta = product({ name: 'Pasta', unit: 'g', price: 1.2, priceQuantity: 500, priceUnit: 'g' });
  const atun = product({ name: 'Atún', unit: 'g', price: 12, priceQuantity: 1, priceUnit: 'kg' });
  const products = byId([pasta, atun]);
  const r1 = recipe({ name: 'Pasta', mealTypes: ['comida', 'cena'], ingredients: [{ productId: pasta.id, quantity: 200, unit: 'g' }] });
  const r2 = recipe({ name: 'Ensalada atún', mealTypes: ['cena'], tags: ['ligera'], ingredients: [{ productId: atun.id, quantity: 100, unit: 'g' }] });
  const r3 = recipe({ name: 'Propuesta', origin: 'propuesta', mealTypes: ['comida'] });
  const days = ['2026-10-26', '2026-10-27'];
  const base = { days, slots: ['comida', 'cena'] as const, people: 2, useFirstProductIds: [], expiringProductIds: [], excludedProductIds: [], requiredTags: [], preferPantry: true, seed: 1 };

  it('rellena franjas solo con recetas verificadas y compatibles', () => {
    const res = generateMenu([r1, r2, r3], products, [], { ...base, slots: [...base.slots] });
    expect(res.meals).toHaveLength(4);
    expect(res.meals.some((m) => m.recipeId === r3.id)).toBe(false);
  });

  it('respeta exclusiones y avisa de franjas sin recetas', () => {
    const res = generateMenu([r1, r2], products, [], { ...base, slots: [...base.slots], excludedProductIds: [pasta.id] });
    expect(res.meals.every((m) => m.recipeId === r2.id)).toBe(true);
    expect(res.unfilled.filter((u) => u.slot === 'comida')).toHaveLength(2);
  });

  it('es reproducible con la misma semilla y no promete nutrición sin datos', () => {
    const a = generateMenu([r1, r2], products, [], { ...base, slots: [...base.slots], dailyKcalTarget: 2000 });
    const b = generateMenu([r1, r2], products, [], { ...base, slots: [...base.slots], dailyKcalTarget: 2000 });
    expect(a.meals).toEqual(b.meals);
    expect(a.nutrition.every((n) => n.kcalPerPerson === null)).toBe(true);
    expect(a.notes.join(' ')).toMatch(/no se puede verificar/);
  });

  it('prioriza ingredientes a gastar primero', () => {
    const res = generateMenu([r1, r2], products, [], { ...base, slots: ['cena'], useFirstProductIds: [atun.id] });
    expect(res.meals.every((m) => m.recipeId === r2.id || m.date === days[1])).toBe(true);
    expect(res.meals[0].recipeId).toBe(r2.id);
  });
});

describe('CSV', () => {
  it('exporta con separador ; y protege contra fórmulas', () => {
    const csv = shoppingListToCSV([item({ name: '=HYPERLINK("x")', quantity: 1.5, unit: 'kg', unitPrice: 2, priceUnit: 'kg' })]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(';1,5;kg;;;2;kg;3;');
  });
});
