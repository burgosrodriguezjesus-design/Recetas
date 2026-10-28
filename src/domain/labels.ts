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

export const DEFAULT_CATEGORIES = [
  'Frutas y verduras',
  'Carne y pescado',
  'Huevos y lácteos',
  'Panadería',
  'Despensa',
  'Conservas',
  'Congelados',
  'Bebidas',
  'Especias y condimentos',
  'Limpieza',
  'Higiene',
  'Otros',
];
