// Textos en español para valores internos.
import type { Difficulty, ItemOrigin, MealSlot, StorageLocation, ConsumptionReason } from './types';

export const SLOT_LABEL: Record<MealSlot, string> = {
  desayuno: 'Desayuno',
  media_manana: 'Media mañana',
  comida: 'Comida',
  merienda: 'Merienda',
  cena: 'Cena',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };

export const LOCATION_LABEL: Record<StorageLocation, string> = { despensa: 'Despensa', nevera: 'Nevera', congelador: 'Congelador', otro: 'Otro' };

export const ORIGIN_LABEL: Record<ItemOrigin, string> = { manual: 'Manual', receta: 'Receta', despensa: 'Despensa', frecuente: 'Frecuente' };

export const REASON_LABEL: Record<ConsumptionReason, string> = { cocinado: 'Cocinado', desperdicio: 'Desperdicio', consumo: 'Consumo', ajuste: 'Ajuste' };

/**
 * Secciones de la compra en el orden del súper (el mismo que tu lista de Notion).
 * Las categorías que no estén aquí aparecen al final, por orden alfabético.
 */
export const SHOPPING_SECTIONS: { name: string; emoji: string }[] = [
  { name: 'Carne y pescado', emoji: '🥩' },
  { name: 'Huevos y lácteos', emoji: '🥚' },
  { name: 'Panadería', emoji: '🍞' },
  { name: 'Despensa', emoji: '🍚' },
  { name: 'Fruta y verdura', emoji: '🥔' },
  { name: 'Congelados', emoji: '🧊' },
  { name: 'Bebidas', emoji: '🥤' },
  { name: 'Especias y condimentos', emoji: '🧂' },
  { name: 'Limpieza', emoji: '🧽' },
  { name: 'Higiene', emoji: '🧴' },
  { name: 'Otros', emoji: '🛒' },
];

export const DEFAULT_CATEGORIES = SHOPPING_SECTIONS.map((s) => s.name);

export function sectionEmoji(category: string): string {
  return SHOPPING_SECTIONS.find((s) => s.name === category)?.emoji ?? '🛒';
}

/** Orden de una categoría en el recorrido del súper. */
export function sectionOrder(category: string): number {
  const i = SHOPPING_SECTIONS.findIndex((s) => s.name === category);
  return i === -1 ? SHOPPING_SECTIONS.length : i;
}
