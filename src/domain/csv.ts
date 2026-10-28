// Exportación CSV compatible con Excel/Numbers en español (separador ';').
import type { ShoppingItem } from './types';
import { itemSubtotal, lineAmount } from './shopping';
import { UNITS } from './units';

function cell(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  let s = typeof value === 'number' ? String(value).replace('.', ',') : value;
  // Evita la "inyección de fórmulas" al abrir el CSV en una hoja de cálculo.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function shoppingListToCSV(items: ShoppingItem[]): string {
  const header = ['Producto', 'Categoría', 'Cantidad', 'Unidad', 'Formato', 'Dura (semanas)', 'Precio unitario (€)', 'Por', 'Subtotal estimado (€)', 'Pagado (€)', 'Estado', 'Origen', 'Tienda', 'Marca', 'Notas'];
  const rows = items.map((it) => {
    const paid = lineAmount(it);
    return [
      it.name,
      it.category,
      it.quantity,
      UNITS[it.unit].label,
      it.packageName,
      it.lastsWeeks,
      it.unitPrice,
      it.priceUnit ? UNITS[it.priceUnit].label : '',
      itemSubtotal(it),
      paid.isPaid ? paid.amount : '',
      it.status,
      it.origin,
      it.store,
      it.brand,
      it.notes,
    ].map(cell);
  });
  // BOM para que Excel reconozca UTF-8 (tildes y ñ).
  return '﻿' + [header.map(cell), ...rows].map((r) => r.join(';')).join('\r\n');
}
