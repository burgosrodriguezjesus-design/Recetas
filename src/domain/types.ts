// Tipos del dominio. Son la "forma" de los datos que se guardan en la base de datos.
// Las fechas de calendario se guardan como 'AAAA-MM-DD' (hora local) y las marcas
// de tiempo como ISO 8601.

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'ud' | 'cda' | 'cdta' | 'pizca' | 'paquete';
export type Dimension = 'mass' | 'volume' | 'count' | 'other';

export const MEAL_SLOTS = ['desayuno', 'media_manana', 'comida', 'merienda', 'cena'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export type Difficulty = 'facil' | 'media' | 'dificil';

export interface Nutrition {
  /** Valores por 100 g (o por 100 ml si el producto se mide en volumen). */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  /** Unidad en la que se suele medir (define la dimensión del producto). */
  unit: Unit;
  /** Precio de referencia: `price` € por `priceQuantity` `priceUnit` (p. ej. 7,50 € por 1 kg). */
  price?: number;
  priceQuantity?: number;
  priceUnit?: Unit;
  /** Envase habitual (p. ej. 1 kg) y su precio, para redondear la compra. */
  packageQuantity?: number;
  packageUnit?: Unit;
  packagePrice?: number;
  /** Equivalencias opcionales para convertir entre dimensiones. */
  gramsPerUnit?: number;
  densityGPerMl?: number;
  nutrition?: Nutrition;
  store?: string;
  brand?: string;
  frequent?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  productId: string;
  quantity: number;
  unit: Unit;
  note?: string;
  optional?: boolean;
}

export type RecipeOrigin = 'manual' | 'importada' | 'propuesta';

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  photo?: string; // data URL (JPEG redimensionado)
  category: string;
  mealTypes: MealSlot[];
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  difficulty: Difficulty;
  ingredients: RecipeIngredient[];
  steps: string[];
  utensils: string[];
  tags: string[];
  favorite: boolean;
  /** 'propuesta' = generada automáticamente y no revisada por el usuario. */
  origin: RecipeOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface MealEntry {
  id: string;
  date: string;
  slot: MealSlot;
  recipeId: string;
  servings: number;
  order: number;
  prepared: boolean;
  preparedAt?: string;
  /** true si al marcarla como preparada se descontó la despensa. */
  pantryDeducted?: boolean;
  notes?: string;
}

export type StorageLocation = 'despensa' | 'nevera' | 'congelador' | 'otro';

export interface PantryItem {
  id: string;
  productId: string;
  quantity: number;
  unit: Unit;
  purchaseDate?: string;
  expiryDate?: string;
  pricePaid?: number;
  location: StorageLocation;
  notes?: string;
  isLeftover?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ShoppingListStatus = 'activa' | 'archivada';
export type ShoppingListKind = 'semana' | 'ocasion';

export interface ShoppingList {
  id: string;
  name: string;
  kind: ShoppingListKind;
  weekStart?: string;
  budget?: number;
  status: ShoppingListStatus;
  createdAt: string;
  updatedAt: string;
}

export type ItemOrigin = 'manual' | 'receta' | 'despensa' | 'frecuente';
export type ItemStatus = 'pendiente' | 'comprado';

export interface ShoppingItem {
  id: string;
  listId: string;
  productId?: string;
  name: string;
  category: string;
  /** Cantidad a comprar en `unit` (p. ej. 2 paquete, 1 kg, 500 g). */
  quantity: number;
  unit: Unit;
  /** Precio estimado: `unitPrice` € por cada `priceUnit` (p. ej. 7,50 €/kg). */
  unitPrice?: number;
  priceUnit?: Unit;
  /** Lo que realmente se necesita según recetas (antes de redondear a envases). */
  neededQuantity?: number;
  neededUnit?: Unit;
  /** Tamaño de un envase cuando `unit === 'paquete'`, para pasarlo a la despensa. */
  packageQuantity?: number;
  packageUnit?: Unit;
  /** Importe realmente pagado por la línea completa (solo al comprar). */
  paidPrice?: number;
  store?: string;
  brand?: string;
  status: ItemStatus;
  origin: ItemOrigin;
  notes?: string;
  purchasedAt?: string;
  /** true cuando ya se registró en compras y despensa. */
  received?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseLine {
  itemId: string;
  productId?: string;
  name: string;
  quantity: number;
  unit: Unit;
  paid: number;
  estimated?: number;
}

export interface Purchase {
  id: string;
  date: string;
  listId?: string;
  store?: string;
  lines: PurchaseLine[];
  total: number;
  createdAt: string;
}

export interface PriceRecord {
  id: string;
  productId: string;
  date: string;
  /** Precio normalizado por unidad base (€/kg, €/l o €/ud). */
  pricePerBase?: number;
  baseUnit?: Unit;
  paid: number;
  quantity: number;
  unit: Unit;
  store?: string;
  source: 'compra' | 'manual';
}

export type ConsumptionReason = 'cocinado' | 'desperdicio' | 'consumo' | 'ajuste';

export interface ConsumptionRecord {
  id: string;
  date: string;
  productId: string;
  quantity: number;
  unit: Unit;
  reason: ConsumptionReason;
  recipeId?: string;
  mealEntryId?: string;
  estimatedCost?: number;
}

export type ThemePref = 'sistema' | 'claro' | 'oscuro';

export interface Settings {
  id: 'app';
  weeklyBudget?: number;
  monthlyBudget?: number;
  people: number;
  theme: ThemePref;
  expiryWarningDays: number;
  enabledSlots: MealSlot[];
  dislikedProductIds: string[];
  lastBackupAt?: string;
}
