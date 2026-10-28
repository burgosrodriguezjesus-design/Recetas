// Diálogo que muestra lo que falta comprar (desde una receta o desde el plan)
// y lo añade a una lista. Es la conexión receta/plan → despensa → compra.
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { addDraftToList, applyPlanToList, createList, type DraftLine } from '../../db/shopping';
import { formatMoney, formatQty, roundMoney } from '../../domain/format';
import { startOfWeek, today, formatWeekRange } from '../../domain/dates';
import { Badge, Button, Checkbox, Dialog, Loading, Notice, Select } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';

export function useActiveLists() {
  return useLiveQuery(() => db.shoppingLists.where('status').equals('activa').reverse().sortBy('createdAt'), []);
}

export function DraftTable({ lines }: { lines: DraftLine[] }) {
  const toBuy = lines.filter((l) => l.toBuy > 0);
  const covered = lines.filter((l) => l.toBuy <= 0);
  const total = roundMoney(toBuy.reduce((s, l) => s + (l.estimatedSubtotal ?? 0), 0));
  const unknown = toBuy.filter((l) => l.estimatedSubtotal === null).length;
  return (
    <div className="grid gap-3">
      {toBuy.length === 0 ? (
        <Notice tone="ok" icon="check">Tienes todo lo necesario en la despensa.</Notice>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {toBuy.map((l) => (
            <li key={l.key} className="grid gap-1 px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{l.product.name}</span>
                <span className="tabular font-semibold">{l.estimatedSubtotal === null ? <span className="text-muted">sin precio</span> : formatMoney(l.estimatedSubtotal)}</span>
              </div>
              <div className="tabular text-xs text-muted">
                Necesitas {formatQty(l.quantity, l.unit)}
                {l.available > 0 && ` · tienes ${formatQty(l.available, l.unit)}`} · faltan <strong className="text-ink">{formatQty(l.toBuy, l.unit)}</strong>
                {' → '}comprar {l.plan.unit === 'paquete' ? `${l.plan.quantity} envase${l.plan.quantity === 1 ? '' : 's'} de ${formatQty(l.plan.packageQuantity!, l.plan.packageUnit!)}` : formatQty(l.plan.quantity, l.plan.unit)}
                {l.plan.surplus > 0 && ` (sobrarán ${formatQty(l.plan.surplus, l.unit)})`}
              </div>
              {(l.splitByUnits || l.pantryIncompatible) && (
                <div className="flex flex-wrap gap-1">
                  {l.splitByUnits && <Badge tone="warn">unidades distintas sin equivalencia: línea separada</Badge>}
                  {l.pantryIncompatible && <Badge tone="warn">hay existencias en otra unidad que no se han restado</Badge>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {covered.length > 0 && <p className="text-xs text-muted">Cubierto por la despensa: {covered.map((l) => l.product.name).join(', ')}.</p>}
      {toBuy.length > 0 && (
        <p className="tabular text-right text-sm">
          Total estimado: <strong>{formatMoney(total)}</strong>
          {unknown > 0 && <span className="text-muted"> (+ {unknown} sin precio)</span>}
        </p>
      )}
    </div>
  );
}

/**
 * `load` calcula las líneas; `mode` indica si se suman a la lista ('add', desde una
 * receta) o si sustituyen las líneas generadas antes ('replace-plan', desde el plan).
 */
export function AddDraftDialog({
  open,
  onClose,
  title,
  load,
  mode,
  defaultListName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  load: (opts: { subtractPantry: boolean; roundToPackage: boolean }) => Promise<DraftLine[]>;
  mode: 'add' | 'replace-plan';
  defaultListName?: string;
}) {
  const lists = useActiveLists();
  const { toast, error, confirm } = useFeedback();
  const [subtract, setSubtract] = useState(true);
  const [round, setRound] = useState(true);
  const [lines, setLines] = useState<DraftLine[] | null>(null);
  const [listId, setListId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLines(null);
    load({ subtractPantry: subtract, roundToPackage: round })
      .then((l) => !cancelled && setLines(l))
      .catch((e) => {
        error(e);
        onClose();
      });
    return () => {
      cancelled = true;
    };
    // `load` cambia en cada render del padre; solo se recalcula al abrir o cambiar opciones.
  }, [open, subtract, round]);

  useEffect(() => {
    if (lists && !listId) setListId(lists[0]?.id ?? 'nueva');
  }, [lists, listId]);

  const apply = async () => {
    if (!lines) return;
    setBusy(true);
    try {
      let id = listId;
      if (!id || id === 'nueva') {
        const l = await createList({ name: defaultListName ?? `Compra ${formatWeekRange(startOfWeek(today()))}`, kind: 'semana', weekStart: startOfWeek(today()) });
        id = l.id;
      }
      if (mode === 'add') {
        const n = await addDraftToList(id, lines);
        toast(n ? `${n} producto${n === 1 ? '' : 's'} añadido${n === 1 ? '' : 's'} a la lista` : 'No faltaba nada');
      } else {
        const existing = await db.shoppingItems.where('listId').equals(id).filter((i) => i.origin === 'receta' && i.status === 'pendiente').count();
        if (existing > 0) {
          const ok = await confirm({ title: 'Actualizar la lista', message: `La lista ya tiene ${existing} producto(s) pendientes generados desde recetas. Se sustituirán por el nuevo cálculo. Lo añadido a mano y lo ya comprado se conserva.`, confirmLabel: 'Actualizar' });
          if (!ok) return;
        }
        const r = await applyPlanToList(id, lines);
        toast(`Lista actualizada: ${r.added} producto${r.added === 1 ? '' : 's'}`);
      }
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  const hasToBuy = !!lines?.some((l) => l.toBuy > 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="cart" onClick={apply} disabled={!hasToBuy || busy}>
            {mode === 'add' ? 'Añadir a la lista' : 'Guardar en la lista'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-1 sm:grid-cols-2">
          <Checkbox label="Restar lo que tengo en la despensa" checked={subtract} onChange={setSubtract} />
          <Checkbox label="Redondear a envases completos" hint="Si el producto tiene envase definido" checked={round} onChange={setRound} />
        </div>
        <Select label="Lista de destino" value={listId} onChange={(e) => setListId(e.target.value)}>
          {(lists ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          <option value="nueva">+ Crear lista nueva</option>
        </Select>
        {lines === null ? <Loading label="Calculando…" /> : lines.length === 0 ? <Notice tone="brand">No hay ingredientes que calcular (no hay comidas pendientes en esas fechas).</Notice> : <DraftTable lines={lines} />}
      </div>
    </Dialog>
  );
}
