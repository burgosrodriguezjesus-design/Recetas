// Formato en español (es-ES): euros, cantidades y fechas.
import type { Unit } from './types';
import { humanize, UNITS } from './units';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const num0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return eur.format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return decimals === 0 ? num0.format(value) : new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimals }).format(value);
}

export function formatQty(quantity: number, unit: Unit, opts: { humanize?: boolean } = {}): string {
  const q = opts.humanize === false ? { quantity, unit } : humanize(quantity, unit);
  return `${num.format(q.quantity)} ${UNITS[q.unit].label}`;
}

/** Redondea euros a céntimos de forma estable. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Lee un número escrito en español o inglés: "1,5", "1.5", "1.234,5", "3/4", "1 1/2".
 * Devuelve null si no es un número válido.
 */
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = input.trim().replace(/\s*€$/, '');
  if (s === '') return null;
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const d = Number(mixed[3]);
    return d === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / d;
  }
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const d = Number(frac[2]);
    return d === 0 ? null : Number(frac[1]) / d;
  }
  let normalized = s;
  if (s.includes(',') && s.includes('.')) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) normalized = s.replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
