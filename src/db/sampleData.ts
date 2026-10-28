// Datos de ejemplo OPCIONALES para probar la aplicación.
// Solo se cargan si el usuario pulsa "Cargar ejemplos" en Ajustes.
// Los precios son ilustrativos (se indica en las notas) y no se incluyen
// valores nutricionales: deben introducirse desde la etiqueta de cada producto.

import { db } from './db';
import { saveProduct, saveRecipe, type ProductInput } from './catalog';
import type { MealSlot, Product, Unit } from '../domain/types';

const NOTE = 'Precio de ejemplo: sustitúyelo por el que pagues tú.';

const PRODUCTS: (Omit<ProductInput, 'notes'> & { key: string })[] = [
  { key: 'arroz', name: 'Arroz redondo', category: 'Despensa', unit: 'g', packageQuantity: 1, packageUnit: 'kg', packagePrice: 1.8 },
  { key: 'pollo', name: 'Pechuga de pollo', category: 'Carne y pescado', unit: 'g', price: 7.5, priceQuantity: 1, priceUnit: 'kg' },
  { key: 'huevo', name: 'Huevos', category: 'Huevos y lácteos', unit: 'ud', gramsPerUnit: 60, packageQuantity: 12, packageUnit: 'ud', packagePrice: 2.4 },
  { key: 'cebolla', name: 'Cebolla', category: 'Frutas y verduras', unit: 'g', gramsPerUnit: 150, price: 1.6, priceQuantity: 1, priceUnit: 'kg' },
  { key: 'tomate', name: 'Tomate', category: 'Frutas y verduras', unit: 'g', gramsPerUnit: 150, price: 2.2, priceQuantity: 1, priceUnit: 'kg' },
  { key: 'aceite', name: 'Aceite de oliva virgen extra', category: 'Despensa', unit: 'ml', densityGPerMl: 0.92, packageQuantity: 1, packageUnit: 'l', packagePrice: 8.5 },
  { key: 'lentejas', name: 'Lentejas pardinas', category: 'Despensa', unit: 'g', packageQuantity: 1, packageUnit: 'kg', packagePrice: 2.3 },
  { key: 'zanahoria', name: 'Zanahoria', category: 'Frutas y verduras', unit: 'g', gramsPerUnit: 80, price: 1.1, priceQuantity: 1, priceUnit: 'kg' },
  { key: 'patata', name: 'Patata', category: 'Frutas y verduras', unit: 'g', gramsPerUnit: 200, packageQuantity: 3, packageUnit: 'kg', packagePrice: 3.5 },
  { key: 'leche', name: 'Leche semidesnatada', category: 'Huevos y lácteos', unit: 'ml', packageQuantity: 1, packageUnit: 'l', packagePrice: 0.95 },
  { key: 'avena', name: 'Copos de avena', category: 'Despensa', unit: 'g', packageQuantity: 500, packageUnit: 'g', packagePrice: 1.3 },
  { key: 'platano', name: 'Plátano', category: 'Frutas y verduras', unit: 'ud', gramsPerUnit: 120, price: 1.9, priceQuantity: 1, priceUnit: 'kg' },
  { key: 'pasta', name: 'Macarrones', category: 'Despensa', unit: 'g', packageQuantity: 500, packageUnit: 'g', packagePrice: 0.9 },
  { key: 'atun', name: 'Atún en conserva', category: 'Conservas', unit: 'g', packageQuantity: 240, packageUnit: 'g', packagePrice: 3.2 },
  { key: 'tomatefrito', name: 'Tomate frito', category: 'Conservas', unit: 'g', packageQuantity: 400, packageUnit: 'g', packagePrice: 1.1 },
  { key: 'pan', name: 'Pan integral', category: 'Panadería', unit: 'g', packageQuantity: 500, packageUnit: 'g', packagePrice: 1.6 },
  { key: 'yogur', name: 'Yogur natural', category: 'Huevos y lácteos', unit: 'ud', gramsPerUnit: 125, packageQuantity: 4, packageUnit: 'ud', packagePrice: 1.2 },
  { key: 'merluza', name: 'Merluza (filetes)', category: 'Carne y pescado', unit: 'g', price: 11, priceQuantity: 1, priceUnit: 'kg' },
  { key: 'lechuga', name: 'Lechuga', category: 'Frutas y verduras', unit: 'ud', price: 0.9, priceQuantity: 1, priceUnit: 'ud' },
  { key: 'sal', name: 'Sal', category: 'Despensa', unit: 'g', packageQuantity: 1, packageUnit: 'kg', packagePrice: 0.5 },
];

type Ing = [string, number, Unit];
interface SampleRecipe {
  name: string;
  description: string;
  category: string;
  mealTypes: MealSlot[];
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  difficulty: 'facil' | 'media' | 'dificil';
  ingredients: Ing[];
  steps: string[];
  utensils: string[];
  tags: string[];
}

const RECIPES: SampleRecipe[] = [
  {
    name: 'Arroz con pollo', description: 'Plato único sencillo y económico.', category: 'Arroces', mealTypes: ['comida', 'cena'],
    servings: 4, prepMinutes: 15, cookMinutes: 30, difficulty: 'facil',
    ingredients: [['arroz', 320, 'g'], ['pollo', 500, 'g'], ['cebolla', 1, 'ud'], ['tomate', 2, 'ud'], ['aceite', 3, 'cda'], ['sal', 5, 'g']],
    steps: ['Trocea el pollo y sálalo.', 'Dóralo en una cazuela con el aceite y resérvalo.', 'Sofríe la cebolla y el tomate picados.', 'Añade el arroz, el pollo y el doble de agua. Cuece 18 minutos.', 'Deja reposar 5 minutos antes de servir.'],
    utensils: ['Cazuela'], tags: ['ejemplo', 'plato único'],
  },
  {
    name: 'Lentejas con verduras', description: 'Legumbre de cuchara.', category: 'Legumbres', mealTypes: ['comida'],
    servings: 4, prepMinutes: 15, cookMinutes: 40, difficulty: 'facil',
    ingredients: [['lentejas', 300, 'g'], ['zanahoria', 2, 'ud'], ['patata', 2, 'ud'], ['cebolla', 1, 'ud'], ['aceite', 2, 'cda'], ['sal', 5, 'g']],
    steps: ['Pica las verduras.', 'Rehógalas con el aceite 5 minutos.', 'Añade las lentejas y cubre con agua.', 'Cuece a fuego medio 35-40 minutos y sala al final.'],
    utensils: ['Olla'], tags: ['ejemplo', 'vegetariana'],
  },
  {
    name: 'Tortilla de patatas', description: 'Clásica, con cebolla.', category: 'Huevos', mealTypes: ['comida', 'cena'],
    servings: 4, prepMinutes: 15, cookMinutes: 25, difficulty: 'media',
    ingredients: [['patata', 600, 'g'], ['huevo', 6, 'ud'], ['cebolla', 1, 'ud'], ['aceite', 150, 'ml'], ['sal', 4, 'g']],
    steps: ['Pela y corta las patatas y la cebolla.', 'Póchalas en el aceite a fuego suave 20 minutos.', 'Escúrrelas y mézclalas con los huevos batidos y la sal.', 'Cuaja la tortilla por ambos lados.'],
    utensils: ['Sartén'], tags: ['ejemplo', 'vegetariana'],
  },
  {
    name: 'Gachas de avena con plátano', description: 'Desayuno rápido.', category: 'Desayunos', mealTypes: ['desayuno', 'merienda'],
    servings: 1, prepMinutes: 2, cookMinutes: 5, difficulty: 'facil',
    ingredients: [['avena', 50, 'g'], ['leche', 250, 'ml'], ['platano', 1, 'ud']],
    steps: ['Calienta la leche con la avena removiendo 4-5 minutos.', 'Sirve con el plátano en rodajas.'],
    utensils: ['Cazo'], tags: ['ejemplo', 'vegetariana', 'rápida'],
  },
  {
    name: 'Macarrones con tomate y atún', description: 'Rápida y socorrida.', category: 'Pasta', mealTypes: ['comida', 'cena'],
    servings: 2, prepMinutes: 5, cookMinutes: 12, difficulty: 'facil',
    ingredients: [['pasta', 200, 'g'], ['tomatefrito', 200, 'g'], ['atun', 120, 'g'], ['sal', 5, 'g']],
    steps: ['Cuece la pasta en agua con sal.', 'Escúrrela y mézclala con el tomate y el atún.'],
    utensils: ['Olla', 'Escurridor'], tags: ['ejemplo', 'rápida'],
  },
  {
    name: 'Merluza al horno con patatas', description: 'Pescado blanco con guarnición.', category: 'Pescados', mealTypes: ['cena', 'comida'],
    servings: 2, prepMinutes: 10, cookMinutes: 30, difficulty: 'facil',
    ingredients: [['merluza', 400, 'g'], ['patata', 400, 'g'], ['cebolla', 0.5, 'ud'], ['aceite', 2, 'cda'], ['sal', 3, 'g']],
    steps: ['Corta las patatas y la cebolla en láminas y hornéalas 20 minutos a 200 °C con aceite.', 'Coloca la merluza encima, sala y hornea 10 minutos más.'],
    utensils: ['Horno', 'Bandeja de horno'], tags: ['ejemplo', 'ligera'],
  },
  {
    name: 'Tostada con tomate y aceite', description: 'Desayuno mediterráneo.', category: 'Desayunos', mealTypes: ['desayuno', 'media_manana', 'merienda'],
    servings: 1, prepMinutes: 5, cookMinutes: 2, difficulty: 'facil',
    ingredients: [['pan', 60, 'g'], ['tomate', 0.5, 'ud'], ['aceite', 1, 'cda']],
    steps: ['Tuesta el pan.', 'Ralla el tomate por encima y añade el aceite.'],
    utensils: ['Tostadora'], tags: ['ejemplo', 'vegetariana', 'rápida'],
  },
  {
    name: 'Yogur con plátano', description: 'Tentempié.', category: 'Desayunos', mealTypes: ['media_manana', 'merienda'],
    servings: 1, prepMinutes: 2, cookMinutes: 0, difficulty: 'facil',
    ingredients: [['yogur', 1, 'ud'], ['platano', 1, 'ud']],
    steps: ['Trocea el plátano y mézclalo con el yogur.'],
    utensils: [], tags: ['ejemplo', 'vegetariana', 'rápida'],
  },
  {
    name: 'Ensalada con huevo', description: 'Cena ligera.', category: 'Ensaladas', mealTypes: ['cena'],
    servings: 2, prepMinutes: 10, cookMinutes: 10, difficulty: 'facil',
    ingredients: [['lechuga', 1, 'ud'], ['tomate', 2, 'ud'], ['huevo', 2, 'ud'], ['aceite', 2, 'cda'], ['sal', 2, 'g']],
    steps: ['Cuece los huevos 10 minutos.', 'Lava y corta la lechuga y el tomate.', 'Añade los huevos en cuartos y aliña.'],
    utensils: ['Cazo', 'Ensaladera'], tags: ['ejemplo', 'vegetariana', 'ligera'],
  },
];

/** Carga los ejemplos sin duplicar productos que ya existan con el mismo nombre. */
export async function loadSampleData(): Promise<{ products: number; recipes: number }> {
  const existing = await db.products.toArray();
  const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));
  const keyToProduct = new Map<string, Product>();
  let createdProducts = 0;
  for (const { key, ...p } of PRODUCTS) {
    const found = byName.get(p.name.toLowerCase());
    if (found) keyToProduct.set(key, found);
    else {
      keyToProduct.set(key, await saveProduct({ ...p, notes: NOTE }));
      createdProducts++;
    }
  }
  const existingRecipes = new Set((await db.recipes.toArray()).map((r) => r.name.toLowerCase()));
  let createdRecipes = 0;
  for (const r of RECIPES) {
    if (existingRecipes.has(r.name.toLowerCase())) continue;
    await saveRecipe({
      ...r,
      ingredients: r.ingredients.map(([key, quantity, unit]) => ({ productId: keyToProduct.get(key)!.id, quantity, unit })),
      favorite: false,
      origin: 'manual',
    });
    createdRecipes++;
  }
  return { products: createdProducts, recipes: createdRecipes };
}
