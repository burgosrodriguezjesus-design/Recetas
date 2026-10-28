// "Recibir la compra": confirma importes reales, fechas de caducidad y
// ubicación, y pasa los productos comprados a la despensa.
import { useEffect, useState } from 'react';
import { receivePurchase, pantryQuantityFor } from '../../db/shopping';
import type { ShoppingItem, StorageLocation } from '../../domain/types';
import { itemSubtotal } from '../../domain/shopping';
import { formatMoney, formatQty, parseDecimal, roundMoney } from '../../domain/format';
import { today } from '../../domain/dates';
import { LOCATION_LABEL } from '../../domain/labels';
import { Button, Checkbox, Dialog, Notice, TextInput } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';

interface Row {
  paid: string;
  addToPantry: boolean;
  location: StorageLocation;
  expiryDate: string;
}

export function ReceiveDialog({ open, listId, items, onClose }: { open: boolean; listId: string; items: ShoppingItem[]; onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [date, setDate] = useState(today());
  const [store, setStore] = useState('');
  const [updatePrices, setUpdatePrices] = useState(true);
  const [busy, setBusy] = useState(false);
  const { toast, error } = useFeedback();
  // Se reinicia al abrir o si cambian los productos (no en cada render del padre).
  const ids = items.map((i) => i.id).join(',');

  useEffect(() => {
    if (!open) return;
    setRows(
      Object.fromEntries(
        items.map((it) => {
          const v = it.paidPrice ?? itemSubtotal(it);
          return [it.id, { paid: v === null || v === undefined ? '' : String(v).replace('.', ','), addToPantry: !!it.productId, location: 'despensa' as StorageLocation, expiryDate: '' }];
        }),
      ),
    );
    setDate(today());
  }, [open, ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = roundMoney(items.reduce((s, it) => s + (parseDecimal(rows[it.id]?.paid ?? '') ?? 0), 0));
  const missingPaid = items.filter((it) => parseDecimal(rows[it.id]?.paid ?? '') === null);

  const submit = async () => {
    if (missingPaid.length) return error(new Error(`Indica el importe pagado de: ${missingPaid.map((i) => i.name).join(', ')}`));
    setBusy(true);
    try {
      const p = await receivePurchase(
        listId,
        items.map((it) => ({ itemId: it.id, paid: parseDecimal(rows[it.id].paid)!, addToPantry: rows[it.id].addToPantry, location: rows[it.id].location, expiryDate: rows[it.id].expiryDate || undefined })),
        { date, store: store.trim() || undefined, updateReferencePrices: updatePrices },
      );
      toast(`Compra registrada: ${formatMoney(p.total)}`);
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  const upd = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Registrar compra"
      wide
      footer={
        <>
          <span className="tabular mr-auto self-center font-semibold">Total pagado: {formatMoney(total)}</span>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" onClick={submit} disabled={busy || items.length === 0}>Registrar</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Notice tone="brand">Revisa lo que has pagado realmente por cada producto. Esto se guarda como gasto real, alimenta el histórico de precios y añade los productos a tu despensa.</Notice>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Fecha de la compra" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <TextInput label="Tienda (opcional)" value={store} onChange={(e) => setStore(e.target.value)} />
        </div>
        <Checkbox label="Actualizar el precio de referencia de los productos con lo pagado" checked={updatePrices} onChange={setUpdatePrices} />
        <ul className="grid gap-2">
          {items.map((it) => {
            const r = rows[it.id];
            if (!r) return null;
            const inPantry = pantryQuantityFor(it);
            const est = itemSubtotal(it);
            return (
              <li key={it.id} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[2fr_1fr] sm:items-start">
                <div>
                  <div className="font-medium">{it.name}</div>
                  <div className="tabular text-xs text-muted">
                    {formatQty(it.quantity, it.unit, { humanize: false })}
                    {it.unit === 'paquete' && it.packageQuantity && it.packageUnit ? ` (${formatQty(inPantry.quantity, inPantry.unit)})` : ''} · estimado {est === null ? '—' : formatMoney(est)}
                  </div>
                  {it.productId ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-3 sm:items-center">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={r.addToPantry} onChange={(e) => upd(it.id, { addToPantry: e.target.checked })} /> A la despensa</label>
                      <select aria-label="Ubicación" disabled={!r.addToPantry} className="min-h-11 rounded-xl border border-line bg-card px-2 text-sm" value={r.location} onChange={(e) => upd(it.id, { location: e.target.value as StorageLocation })}>
                        {Object.entries(LOCATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input aria-label="Caducidad" type="date" disabled={!r.addToPantry} className="min-h-11 rounded-xl border border-line bg-card px-2 text-sm" value={r.expiryDate} onChange={(e) => upd(it.id, { expiryDate: e.target.value })} />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Producto libre (sin ficha en el catálogo): se registra el gasto pero no pasa a la despensa.</p>
                  )}
                </div>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Pagado (€)
                  <input inputMode="decimal" className={`tabular min-h-11 rounded-xl border bg-card px-3 ${parseDecimal(r.paid) === null ? 'border-danger' : 'border-line'}`} value={r.paid} onChange={(e) => upd(it.id, { paid: e.target.value })} />
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
