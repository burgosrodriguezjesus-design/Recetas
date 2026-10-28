// Fechas de calendario como 'AAAA-MM-DD' en hora local.
// Trabajar con texto evita que "el lunes" se convierta en "domingo" por la zona horaria.

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

export function today(): string {
  return toISODate(new Date());
}

export function addDays(date: string, days: number): string {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Lunes de la semana (en España la semana empieza en lunes). */
export function startOfWeek(date: string): string {
  const d = parseISODate(date);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const d = parseISODate(startOfMonth(date));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toISODate(d);
}

/** Días entre dos fechas (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

const longFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
const weekdayShort = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
const dayMonth = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Lunes, 3 de marzo" */
export function formatLongDate(date: string): string {
  return cap(longFmt.format(parseISODate(date)));
}

/** "03/03/2026" */
export function formatShortDate(date: string | undefined): string {
  if (!date) return '—';
  return shortFmt.format(parseISODate(date.slice(0, 10)));
}

/** "Lun" */
export function formatWeekdayShort(date: string): string {
  return cap(weekdayShort.format(parseISODate(date)).replace('.', ''));
}

/** "3 mar" */
export function formatDayMonth(date: string): string {
  return dayMonth.format(parseISODate(date)).replace('.', '');
}

export function formatWeekRange(weekStart: string): string {
  return `${formatDayMonth(weekStart)} – ${formatDayMonth(addDays(weekStart, 6))}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
