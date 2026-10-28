// Plantilla: la "Lista de la compra semanal — Mercadona" de tu Notion,
// copiada tal cual (productos, formatos, precios, ⏳ y notas). Los precios son
// los que anotaste en Notion; si cambian en tienda, se actualizan al registrar
// la compra con lo que pagues.

import { db } from './db';
import { findOrCreateProduct, saveProduct, saveSettings } from './catalog';
import { addItem, createList } from './shopping';
import type { ShoppingList, Unit } from '../domain/types';
import { roundMoney } from '../domain/format';

interface TemplateItem {
  name: string;
  category: string;
  /** Cuántos envases (o piezas, si `pieces`). */
  count: number;
  /** Formato del envase: "bandeja", "malla 5 kg"… */
  format: string;
  /** Contenido de un envase, si se conoce (para la despensa). */
  size?: [number, Unit];
  /** Precio total de la línea en Notion. */
  total: number;
  weeks?: number;
  notes?: string;
  /** Se compra por piezas sueltas (aguacates, bananas…), no por envases. */
  pieces?: boolean;
}

export const MERCADONA_WEEKLY: TemplateItem[] = [
  // 🥩 Carne y pescado
  { name: 'Pechugas enteras de pollo', category: 'Carne y pescado', count: 3, format: 'bandeja', size: [0.53, 'kg'], total: 11.58, notes: '≈1,6 kg en total' },
  { name: 'Gamba pelada cruda mediana Hacendado', category: 'Carne y pescado', count: 1, format: 'bolsa ≈360 g (congelada)', size: [360, 'g'], total: 4.9 },
  { name: 'Calamar patagónico pequeño Hacendado', category: 'Carne y pescado', count: 1, format: 'paquete 500 g (congelado)', size: [500, 'g'], total: 5.5 },
  { name: 'Atún claro en aceite de oliva Hacendado', category: 'Carne y pescado', count: 2, format: 'pack de 6 latas', size: [6, 'ud'], total: 9.8 },
  { name: 'Sardinillas en aceite de oliva Hacendado', category: 'Carne y pescado', count: 1, format: 'pack de 2 latas', size: [2, 'ud'], total: 2.15 },
  // 🥚 Huevos y lácteos
  { name: 'Huevos', category: 'Huevos y lácteos', count: 1, format: 'paquete de 24', size: [24, 'ud'], total: 5.25 },
  { name: 'Huevos cocidos pelados', category: 'Huevos y lácteos', count: 1, format: 'paquete de 6', size: [6, 'ud'], total: 2.2, notes: 'para las tostadas de aguacate' },
  { name: 'Leche semidesnatada Hacendado', category: 'Huevos y lácteos', count: 2, format: 'brick de 1 L', size: [1, 'l'], total: 1.66 },
  { name: 'Yogur griego natural Hacendado', category: 'Huevos y lácteos', count: 1, format: 'pack de 6', size: [6, 'ud'], total: 1.45 },
  // 🍞 Panadería
  { name: '3 barras de pan', category: 'Panadería', count: 1, format: 'bolsa', size: [3, 'ud'], total: 1.19 },
  { name: '5 barras de pan 51% integral', category: 'Panadería', count: 1, format: 'bolsa', size: [5, 'ud'], total: 1.35 },
  // 🍚 Despensa
  { name: 'Arroz redondo Hacendado', category: 'Despensa', count: 1, format: 'paquete 1 kg', size: [1, 'kg'], total: 1.15 },
  { name: 'Macarrón Hacendado', category: 'Despensa', count: 1, format: 'paquete 500 g', size: [500, 'g'], total: 0.8 },
  { name: 'Avena molida Hacendado', category: 'Despensa', count: 1, format: 'paquete 500 g', size: [500, 'g'], total: 1.15, weeks: 3 },
  { name: 'Salmorejo estilo cordobés Hacendado', category: 'Despensa', count: 1, format: 'brick 1 L', size: [1, 'l'], total: 2.2, weeks: 5, notes: 'congela en vasos de 200 ml' },
  { name: 'Nuez natural pelada Hacendado', category: 'Despensa', count: 1, format: 'bolsa 200 g', size: [200, 'g'], total: 2.4, weeks: 5 },
  { name: 'Almendra natural Hacendado', category: 'Despensa', count: 1, format: 'bolsa 200 g', size: [200, 'g'], total: 2.3, weeks: 8 },
  { name: 'Pistacho natural pelado Hacendado', category: 'Despensa', count: 1, format: 'bolsa 100 g', size: [100, 'g'], total: 2.95, weeks: 4 },
  // 🥔 Fruta y verdura
  { name: 'Patatas', category: 'Fruta y verdura', count: 1, format: 'malla 5 kg', size: [5, 'kg'], total: 5 },
  { name: 'Cebollas', category: 'Fruta y verdura', count: 1, format: 'malla 1 kg', size: [1, 'kg'], total: 1.5 },
  { name: 'Ajos morados', category: 'Fruta y verdura', count: 1, format: 'malla 250 g', size: [250, 'g'], total: 1.85, weeks: 2 },
  { name: 'Apio verde', category: 'Fruta y verdura', count: 1, format: 'paquete', total: 1.45, weeks: 2 },
  { name: 'Aguacates', category: 'Fruta y verdura', count: 2, format: 'pieza', total: 2.3, pieces: true },
  { name: 'Bananas', category: 'Fruta y verdura', count: 4, format: 'pieza', total: 0.84, pieces: true },
  { name: 'Manzanas rojas dulces', category: 'Fruta y verdura', count: 4, format: 'pieza', total: 1.6, pieces: true },
  { name: 'Naranjas', category: 'Fruta y verdura', count: 1, format: 'malla 3 kg', size: [3, 'kg'], total: 5.85, weeks: 2 },
  { name: 'Fresas', category: 'Fruta y verdura', count: 1, format: 'bandeja 400 g', size: [400, 'g'], total: 3 },
  { name: 'Cogollos de lechuga', category: 'Fruta y verdura', count: 1, format: 'paquete de 3', size: [3, 'ud'], total: 1.05 },
];

const baseOf = (u: Unit): Unit => (u === 'kg' ? 'g' : u === 'l' ? 'ml' : u);

/**
 * Crea la lista semanal con los productos de la plantilla, y da de alta cada
 * producto en el catálogo (con su envase y precio) para que la despensa, las
 * recetas y el histórico de precios queden conectados.
 */
export async function createListFromTemplate(name = 'Compra semanal — Mercadona', items = MERCADONA_WEEKLY): Promise<ShoppingList> {
  const list = await createList({ name, kind: 'semana' });
  for (const t of items) {
    const unitPrice = roundMoney(t.total / t.count);
    let product = await findOrCreateProduct(t.name, t.pieces ? 'ud' : t.size ? baseOf(t.size[1]) : 'ud', t.category);
    // Completa el envase y el precio del producto solo si aún no los tenía.
    if (product.packagePrice === undefined && product.price === undefined) {
      product = await saveProduct(
        t.pieces
          ? { ...product, category: t.category, price: unitPrice, priceQuantity: 1, priceUnit: 'ud' }
          : t.size
            ? { ...product, category: t.category, packageQuantity: t.size[0], packageUnit: t.size[1], packagePrice: unitPrice }
            : { ...product, category: t.category },
      );
    }
    await addItem({
      listId: list.id,
      productId: product.id,
      name: t.name,
      category: t.category,
      quantity: t.count,
      unit: t.pieces ? 'ud' : 'paquete',
      unitPrice,
      priceUnit: t.pieces ? 'ud' : 'paquete',
      packageQuantity: t.pieces ? undefined : t.size?.[0],
      packageUnit: t.pieces ? undefined : t.size?.[1],
      packageName: t.format,
      lastsWeeks: t.weeks,
      notes: t.notes,
      origin: 'frecuente',
    });
  }
  return list;
}

let seeding: Promise<ShoppingList | null> | null = null;

/**
 * La primera vez que se abre la app sin listas, crea la lista semanal
 * automáticamente. Se protege contra llamadas simultáneas (React puede
 * ejecutar los efectos dos veces al arrancar).
 */
export function seedTemplateOnce(): Promise<ShoppingList | null> {
  seeding ??= (async () => {
    const settings = await db.settings.get('app');
    if (settings?.shoppingTemplateSeeded) return null;
    await saveSettings({ shoppingTemplateSeeded: true });
    if ((await db.shoppingLists.count()) > 0) return null;
    return createListFromTemplate();
  })();
  return seeding;
}
