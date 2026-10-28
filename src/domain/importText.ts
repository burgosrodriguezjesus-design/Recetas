// Importación de recetas desde texto pegado.
//
// Formato flexible, por ejemplo:
//
//   Lentejas con verduras
//   Raciones: 4
//   Tiempo: 15 min preparación, 40 min cocción
//   Ingredientes:
//   - 300 g de lentejas
//   - 1 cebolla
//   - 2 cdas de aceite de oliva
//   - sal al gusto
//   Preparación:
//   1. Picar la cebolla...
//   2. ...
//
// Las líneas que no se entienden no se pierden: se devuelven como avisos.

import type { Unit } from './types';
import { parseDecimal } from './format';
import { normalizeText, parseUnit } from './units';

export interface ParsedIngredient {
  raw: string;
  name: string;
  quantity: number | null;
  unit: Unit | null;
}

export interface ParsedRecipe {
  name: string;
  description: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: ParsedIngredient[];
  steps: string[];
  warnings: string[];
}

const ING_HEADER = /^(ingredientes?)\s*:?\s*$/i;
const STEP_HEADER = /^(preparaci[oó]n|elaboraci[oó]n|pasos|instrucciones|modo de preparaci[oó]n)\s*:?\s*$/i;

const QTY = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`;
const ING_RE = new RegExp(String.raw`^${QTY}\s*([a-zA-Záéíóúñ.]+)?\s*(?:de\s+)?(.*)$`, 'i');

export function parseIngredientLine(line: string): ParsedIngredient {
  const raw = line.trim();
  const clean = raw.replace(/^[-•*·]\s*/, '').replace(/^\d+[.)]\s+(?=\D)/, '').trim();
  const m = clean.match(ING_RE);
  if (!m) return { raw, name: clean, quantity: null, unit: null };
  const qty = parseDecimal(m[1]);
  const maybeUnit = m[2] ? parseUnit(m[2]) : null;
  let name: string;
  let unit: Unit | null;
  let quantity = qty;
  if (maybeUnit) {
    unit = maybeUnit.unit;
    if (quantity !== null) quantity *= maybeUnit.factor;
    name = m[3].replace(/^de\s+/i, '').trim();
  } else {
    // "2 huevos" → 2 ud de huevos
    unit = 'ud';
    name = `${m[2] ?? ''} ${m[3] ?? ''}`.trim();
  }
  return { raw, name: name || clean, quantity, unit };
}

function minutesIn(text: string, word: RegExp): number | null {
  const re = new RegExp(String.raw`(\d+)\s*(?:min|minutos?)\s*(?:de\s+)?${word.source}|${word.source}\s*:?\s*(\d+)\s*(?:min|minutos?)`, 'i');
  const m = text.match(re);
  if (!m) return null;
  return Number(m[1] ?? m[2]);
}

export function parseRecipeText(text: string): ParsedRecipe {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const result: ParsedRecipe = { name: '', description: '', servings: null, prepMinutes: null, cookMinutes: null, ingredients: [], steps: [], warnings: [] };
  let section: 'head' | 'ing' | 'steps' = 'head';
  const desc: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (ING_HEADER.test(line)) {
      section = 'ing';
      continue;
    }
    if (STEP_HEADER.test(line)) {
      section = 'steps';
      continue;
    }
    const n = normalizeText(line);
    const servings = n.match(/^(raciones|porciones|personas|comensales)\s*:?\s*(\d+)/);
    if (servings) {
      result.servings = Number(servings[2]);
      continue;
    }
    if (/^(tiempo|preparacion\s*:|coccion\s*:)/.test(n) && /\d/.test(n)) {
      const prep = minutesIn(n, /preparacion/);
      const cook = minutesIn(n, /coccion/);
      if (prep !== null) result.prepMinutes = prep;
      if (cook !== null) result.cookMinutes = cook;
      if (prep === null && cook === null) {
        const any = n.match(/(\d+)\s*(min|minutos?)/);
        if (any) result.prepMinutes = Number(any[1]);
      }
      continue;
    }
    if (section === 'head') {
      if (!result.name) result.name = line.replace(/^#+\s*/, '');
      else desc.push(line);
    } else if (section === 'ing') {
      result.ingredients.push(parseIngredientLine(line));
    } else {
      result.steps.push(line.replace(/^(\d+[.)-]|[-•*·])\s*/, ''));
    }
  }
  result.description = desc.join(' ');
  if (!result.name) result.warnings.push('No se encontró el nombre de la receta (debe ir en la primera línea).');
  if (result.ingredients.length === 0) result.warnings.push('No se encontraron ingredientes. Añade una línea "Ingredientes:" antes de la lista.');
  if (result.steps.length === 0) result.warnings.push('No se encontraron pasos. Añade una línea "Preparación:" antes de los pasos.');
  for (const ing of result.ingredients) {
    if (ing.quantity === null) result.warnings.push(`Sin cantidad: "${ing.raw}". Revísala antes de guardar.`);
  }
  return result;
}
