import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  addFrequentProducts,
  clearList,
  createList,
  deleteList,
  duplicateList,
  previewFromPlan,
  restoreItems,
  resetList,
  restoreList,
  setItemStatus,
  updateList,
} from '../../db/shopping';
import type { PriceRecord, ShoppingItem, ShoppingList } from '../../domain/types';
import { itemSubtotal, quantityInPriceUnit, summarizeList } from '../../domain/shopping';
import { convertForProduct, productBaseUnit } from '../../domain/recipeCalc';
import { formatMoney, formatNumber, formatQty, parseDecimal } from '../../domain/format';
import { addDays, formatShortDate, formatWeekRange, startOfWeek, today } from '../../domain/dates';
import { sectionEmoji, sectionOrder } from '../../domain/labels';
import { normalizeText, UNITS } from '../../domain/units';
import { shoppingListToCSV } from '../../domain/csv';
import { comparePriceRecords } from '../../domain/stats';
import { useProductMap, useSettings } from '../../hooks/data';
import { Badge, Button, Card, Dialog, EmptyState, IconButton, Loading, NumberInput, PageHeader, Segmented, Select, Stat, TextInput, Notice } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { useFeedback } from '../../ui/feedback';
import { downloadFile, shareText } from '../../ui/share';
import { AddDraftDialog } from './AddDraftDialog';
import { ItemDialog } from './ItemDialog';
import { createListFromTemplate } from '../../db/templates';
import { ReceiveDialog } from './ReceiveDialog';

function qtyLabel(it: ShoppingItem): string {
  if (it.packageName) {
    if (it.unit === 'ud') return `${formatNumber(it.quantity)} ${it.quantity === 1 ? 'pieza' : 'piezas'}`;
    return it.quantity === 1 ? it.packageName : `${formatNumber(it.quantity)} × ${it.packageName}`;
  }
  if (it.unit === 'paquete') {
    const n = `${formatNumber(it.quantity)} envase${it.quantity === 1 ? '' : 's'}`;
    return it.packageQuantity && it.packageUnit ? `${n} de ${formatQty(it.packageQuantity, it.packageUnit)}` : n;
  }
  return formatQty(it.quantity, it.unit);
}

export function ShoppingPage() {
  const [params, setParams] = useSearchParams();
  const lists = useLiveQuery(() => db.shoppingLists.orderBy('createdAt').reverse().toArray(), []);
  const products = useProductMap();
  const settings = useSettings();
  const { toast, error, confirm } = useFeedback();

  const activeLists = (lists ?? []).filter((l) => l.status === 'activa');
  const listId = params.get('lista') ?? activeLists[0]?.id ?? lists?.[0]?.id ?? '';
  const list = lists?.find((l) => l.id === listId);
  const items = useLiveQuery(() => (listId ? db.shoppingItems.where('listId').equals(listId).toArray() : Promise.resolve([] as ShoppingItem[])), [listId]);
  const lastPaid = useLiveQuery(async () => {
    const recs = await db.priceRecords.filter((r) => r.source === 'compra').toArray();
    const m = new Map<string, PriceRecord>();
    for (const r of recs.sort(comparePriceRecords)) if (r.pricePerBase !== undefined) m.set(r.productId, r);
    return m;
  }, []);

  const [tab, setTab] = useState<'lista' | 'historial'>('lista');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'categoria' | 'nombre'>('categoria');
  const [editing, setEditing] = useState<ShoppingItem | undefined>();
  const [itemOpen, setItemOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listForm, setListForm] = useState<'new' | 'edit' | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  const selectList = (id: string) => {
    const p = new URLSearchParams(params);
    p.set('lista', id);
    setParams(p, { replace: true });
  };

  const summary = useMemo(() => summarizeList(items ?? [], list?.budget), [items, list?.budget]);
  const filtered = useMemo(() => {
    const q = normalizeText(query);
    return (items ?? []).filter((i) => !q || normalizeText(i.name).includes(q) || normalizeText(i.category).includes(q) || normalizeText(i.store ?? '').includes(q));
  }, [items, query]);
  const pending = filtered.filter((i) => i.status === 'pendiente');
  const toReceive = (items ?? []).filter((i) => i.status === 'comprado' && !i.received);

  // Como en Notion: secciones en el orden del súper y, dentro de cada una, los
  // productos en el orden en que se añadieron. Lo comprado se queda en su sitio, tachado.
  const groups = useMemo(() => {
    if (sort === 'nombre') return [['Todos', [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'es'))] as const];
    const m = new Map<string, ShoppingItem[]>();
    for (const it of [...filtered].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) m.set(it.category || 'Otros', [...(m.get(it.category || 'Otros') ?? []), it]);
    return [...m.entries()].sort((a, b) => sectionOrder(a[0]) - sectionOrder(b[0]) || a[0].localeCompare(b[0], 'es'));
  }, [filtered, sort]);
  // ⏳ Productos que duran varias semanas: total aparte, porque no se compran cada semana.
  const longLasting = useMemo(() => {
    const its = (items ?? []).filter((i) => i.lastsWeeks);
    return { count: its.length, amount: its.reduce((t, i) => t + (itemSubtotal(i) ?? 0), 0) };
  }, [items]);

  if (!lists || !items) return <Loading />;

  /** Comparación con la última compra: precio estimado por unidad base frente al último pagado. */
  const compare = (it: ShoppingItem): number | null => {
    if (!it.productId) return null;
    const last = lastPaid?.get(it.productId);
    const p = products.get(it.productId);
    const sub = itemSubtotal(it, p);
    if (!last?.pricePerBase || !p || sub === null) return null;
    const qInPrice = quantityInPriceUnit(it, p);
    if (qInPrice === null) return null;
    const base = productBaseUnit(p);
    const qBase = it.unit === 'paquete' && it.packageQuantity && it.packageUnit ? convertForProduct(it.quantity * it.packageQuantity, it.packageUnit, base, p) : convertForProduct(it.quantity, it.unit, base, p);
    if (!qBase) return null;
    return Math.round((((sub / qBase) - last.pricePerBase) / last.pricePerBase) * 1000) / 10;
  };

  const toggle = async (it: ShoppingItem) => {
    try {
      await setItemStatus(it.id, it.status === 'pendiente' ? 'comprado' : 'pendiente');
    } catch (e) {
      error(e);
    }
  };

  const textForShare = () => {
    const lines = [`${list?.name ?? 'Lista de la compra'}`, ''];
    for (const [cat, its] of groups) {
      if (sort === 'categoria') lines.push('', `${sectionEmoji(cat)} ${cat}`);
      for (const it of its) {
        const sub = itemSubtotal(it);
        lines.push(`${it.status === 'comprado' ? '☑' : '☐'} ${it.name} — ${qtyLabel(it)}${sub !== null ? ` · ${formatMoney(sub)}` : ''}${it.lastsWeeks ? ` · ⏳ ${it.lastsWeeks} semanas` : ''}${it.notes ? ` (${it.notes})` : ''}`);
      }
    }
    lines.push('', `Total pendiente estimado: ${formatMoney(summary.pendingAmount)}`);
    return lines.join('\n');
  };

  const actions = {
    csv: () => downloadFile(`${(list?.name ?? 'lista').replace(/[^\p{L}\p{N} _-]/gu, '')}.csv`, shoppingListToCSV(items), 'text/csv;charset=utf-8'),
    print: () => window.print(),
    share: async () => {
      const how = await shareText(list?.name ?? 'Lista de la compra', textForShare());
      if (how === 'clipboard') toast('Lista copiada al portapapeles');
      if (how === 'download') toast('Lista descargada como texto');
    },
    frequent: async () => {
      const n = await addFrequentProducts(listId);
      toast(n ? `${n} producto(s) frecuente(s) añadido(s)` : 'No hay productos frecuentes nuevos. Márcalos con ★ en «Productos y precios».', { type: n ? 'ok' : 'info' });
    },
    newWeek: async () => {
      const ok = await confirm({ title: 'Empezar semana nueva', message: 'Se desmarcarán todos los productos para volver a usar la lista. Lo que ya registraste como comprado sigue en el historial. Si aún te queda algo con ⏳, no lo vuelvas a marcar.', confirmLabel: 'Desmarcar todo' });
      if (!ok) return;
      const before = await resetList(listId);
      toast('Lista lista para la semana nueva', { action: { label: 'Deshacer', onClick: () => restoreItems(before) } });
    },
    template: async () => {
      const l = await createListFromTemplate();
      selectList(l.id);
      toast('Lista semanal de Mercadona creada');
    },
    duplicate: async () => {
      const copy = await duplicateList(listId);
      selectList(copy.id);
      toast('Lista duplicada');
    },
    clearBought: async () => {
      const ok = await confirm({ title: 'Quitar comprados', message: `Se quitarán ${summary.purchasedCount} producto(s) comprados de la lista. Las compras ya registradas se conservan en el historial.`, confirmLabel: 'Quitar' });
      if (!ok) return;
      const removed = await clearList(listId, 'comprados');
      toast('Comprados quitados', { action: { label: 'Deshacer', onClick: () => restoreItems(removed) } });
    },
    clearAll: async () => {
      const ok = await confirm({ title: 'Vaciar la lista', message: `Se eliminarán los ${items.length} productos de «${list?.name}».`, confirmLabel: 'Vaciar', danger: true });
      if (!ok) return;
      const removed = await clearList(listId, 'todo');
      toast('Lista vaciada', { action: { label: 'Deshacer', onClick: () => restoreItems(removed) } });
    },
    archive: async () => {
      await updateList(listId, { status: list?.status === 'archivada' ? 'activa' : 'archivada' });
      toast(list?.status === 'archivada' ? 'Lista reactivada' : 'Lista archivada');
    },
    remove: async () => {
      const ok = await confirm({ title: `¿Eliminar «${list?.name}»?`, message: 'Se eliminará la lista y sus productos. Las compras registradas se conservan en el historial.', confirmLabel: 'Eliminar', danger: true });
      if (!ok) return;
      const snap = await deleteList(listId);
      const p = new URLSearchParams(params);
      p.delete('lista');
      setParams(p, { replace: true });
      toast('Lista eliminada', { action: { label: 'Deshacer', onClick: () => restoreList(snap) } });
    },
  };

  const runAction = (fn: () => Promise<void> | void) => async () => {
    setMenuOpen(false);
    try {
      await fn();
    } catch (e) {
      error(e);
    }
  };

  const budgetTone = summary.budgetRemaining === undefined ? undefined : summary.budgetRemaining >= 0 ? 'ok' : 'danger';

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Lista de la compra"
        subtitle={list ? `${list.name}${list.status === 'archivada' ? ' (archivada)' : ''}` : undefined}
        actions={
          <>
            <Segmented label="Sección" value={tab} onChange={setTab} options={[{ value: 'lista', label: 'Lista' }, { value: 'historial', label: 'Historial' }]} />
          </>
        }
      />

      {tab === 'historial' ? (
        <PurchaseHistory />
      ) : lists.length === 0 ? (
        <EmptyState
          icon="cart"
          title="No tienes listas todavía"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon="cart" onClick={runAction(actions.template)}>Crear mi lista semanal de Mercadona</Button>
              <Button icon="plus" onClick={() => setListForm('new')}>Crear lista vacía</Button>
            </div>
          }
        >
          Crea una lista para la semana o para una ocasión. También puedes generarla desde el planificador.
        </EmptyState>
      ) : (
        <>
          <div className="no-print flex flex-wrap items-end gap-2">
            <Select label="Lista" value={listId} onChange={(e) => selectList(e.target.value)} className="min-w-48 flex-1">
              <optgroup label="Activas">{activeLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
              {lists.some((l) => l.status === 'archivada') && <optgroup label="Archivadas">{lists.filter((l) => l.status === 'archivada').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>}
            </Select>
            <IconButton icon="plus" label="Nueva lista" variant="secondary" onClick={() => setListForm('new')} />
            <IconButton icon="dots" label="Opciones de la lista" variant="secondary" onClick={() => setMenuOpen(true)} disabled={!list} />
          </div>

          {list && (
            <>
              <Card className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4">
                <Stat label="Total estimado" value={formatMoney(summary.estimatedTotal)} hint={summary.unknownPriceCount ? `${summary.unknownPriceCount} sin precio` : undefined} />
                <Stat label="Comprado" value={formatMoney(summary.purchasedAmount)} hint={summary.purchasedEstimatedOnly > 0 ? `${formatMoney(summary.purchasedEstimatedOnly)} aún estimado` : summary.purchasedCount ? 'precio real' : undefined} />
                <Stat label="Pendiente (estimado)" value={formatMoney(summary.pendingAmount)} />
                <Stat
                  label={summary.budget !== undefined ? `Presupuesto ${formatMoney(summary.budget)}` : 'Presupuesto'}
                  value={summary.budgetRemaining !== undefined ? `${summary.budgetRemaining >= 0 ? 'Quedan ' : 'Excede '}${formatMoney(Math.abs(summary.budgetRemaining))}` : '—'}
                  hint={summary.budget === undefined ? <button type="button" className="font-medium text-brand underline" onClick={() => setListForm('edit')}>Definir</button> : 'comprado + pendiente'}
                  tone={budgetTone}
                />
                <div className="tabular col-span-2 text-xs text-muted md:col-span-4">
                  {summary.pendingCount} pendiente{summary.pendingCount === 1 ? '' : 's'} · {summary.purchasedCount} comprado{summary.purchasedCount === 1 ? '' : 's'}
                  {longLasting.count > 0 && (
                    <>
                      <span className="block">⏳ {longLasting.count} productos duran varias semanas ({formatMoney(longLasting.amount)}): si aún te quedan, no los compres. Sin ellos: {formatMoney(summary.estimatedTotal - longLasting.amount)}</span>
                    </>
                  )}
                </div>
              </Card>

              <div className="no-print flex flex-wrap gap-2">
                <Button variant="primary" icon="plus" onClick={() => { setEditing(undefined); setItemOpen(true); }}>Añadir producto</Button>
                <Button icon="calendar" onClick={() => setPlanOpen(true)}>Desde el plan</Button>
                <Button icon="star" onClick={runAction(actions.frequent)}>Frecuentes</Button>
                {toReceive.length > 0 && <Button variant="soft" icon="box" onClick={() => setReceiveOpen(true)}>Registrar compra ({toReceive.length})</Button>}
              </div>

              <div className="no-print flex gap-2">
                <input type="search" aria-label="Buscar en la lista" placeholder="Buscar en la lista…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3" />
                <Segmented label="Ordenar" value={sort} onChange={setSort} options={[{ value: 'categoria', label: 'Categoría' }, { value: 'nombre', label: 'A-Z' }]} />
              </div>

              {items.length === 0 ? (
                <EmptyState icon="cart" title="Lista vacía">Añade productos a mano, desde el plan de comidas o tus productos frecuentes.</EmptyState>
              ) : (
                <div className="grid gap-3">
                  {pending.length === 0 && filtered.length > 0 && <Notice tone="ok" icon="check">¡Todo comprado! Cuando registres la compra, pulsa ··· → «Empezar semana nueva».</Notice>}
                  {groups.map(([cat, its]) => {
                    const done = its.filter((i) => i.status === 'comprado').length;
                    const total = its.reduce((t, i) => t + (itemSubtotal(i) ?? 0), 0);
                    return (
                      <section key={cat}>
                        {sort === 'categoria' && (
                          <h2 className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
                            <span className="text-lg font-bold">
                              <span aria-hidden>{sectionEmoji(cat)}</span> {cat}
                            </span>
                            <span className="tabular text-xs text-muted">
                              {done}/{its.length} · {formatMoney(total)}
                            </span>
                          </h2>
                        )}
                        <Card className="divide-y divide-line overflow-hidden">
                          {its.map((it) => (
                            <ItemRow key={it.id} it={it} pct={it.status === 'pendiente' ? compare(it) : null} onToggle={() => toggle(it)} onEdit={() => { setEditing(it); setItemOpen(true); }} />
                          ))}
                        </Card>
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      <ItemDialog open={itemOpen} listId={listId} item={editing} onClose={() => setItemOpen(false)} />
      <ReceiveDialog open={receiveOpen} listId={listId} items={toReceive} onClose={() => setReceiveOpen(false)} />
      <ListFormDialog
        mode={listForm}
        list={listForm === 'edit' ? list : undefined}
        defaultBudget={settings.weeklyBudget}
        onClose={() => setListForm(null)}
        onCreated={(l) => selectList(l.id)}
      />
      <AddDraftDialog
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        title={`Desde el plan · semana ${formatWeekRange(list?.weekStart ?? startOfWeek(today()))}`}
        mode="replace-plan"
        load={(o) => {
          const ws = list?.weekStart ?? startOfWeek(today());
          return previewFromPlan(ws, addDays(ws, 6), o);
        }}
      />
      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Opciones de la lista">
        <div className="grid gap-2">
          <Button icon="undo" onClick={runAction(actions.newWeek)} disabled={summary.purchasedCount === 0}>Empezar semana nueva (desmarcar todo)</Button>
          <Button icon="edit" onClick={() => { setMenuOpen(false); setListForm('edit'); }}>Nombre y presupuesto</Button>
          <Button icon="copy" onClick={runAction(actions.duplicate)}>Duplicar lista</Button>
          <Button icon="cart" onClick={runAction(actions.template)}>Nueva lista semanal de Mercadona</Button>
          <Button icon="share" onClick={runAction(actions.share)}>Compartir</Button>
          <Button icon="download" onClick={runAction(actions.csv)}>Exportar CSV</Button>
          <Button icon="printer" onClick={runAction(actions.print)}>Imprimir</Button>
          <Button icon="check" onClick={runAction(actions.clearBought)} disabled={summary.purchasedCount === 0}>Quitar los comprados</Button>
          <Button icon="box" onClick={runAction(actions.archive)}>{list?.status === 'archivada' ? 'Reactivar lista' : 'Archivar lista'}</Button>
          <Button icon="trash" variant="ghost" className="text-danger" onClick={runAction(actions.clearAll)} disabled={items.length === 0}>Vaciar lista</Button>
          <Button icon="trash" variant="ghost" className="text-danger" onClick={runAction(actions.remove)}>Eliminar lista</Button>
        </div>
      </Dialog>
    </div>
  );
}

function ItemRow({ it, pct, onToggle, onEdit }: { it: ShoppingItem; pct: number | null; onToggle: () => void; onEdit: () => void }) {
  const sub = itemSubtotal(it);
  const bought = it.status === 'comprado';
  const paid = bought && it.paidPrice !== undefined;
  return (
    <div className={`flex items-start gap-1 pr-3 ${bought ? 'bg-raised/60' : ''}`}>
      <label className="flex min-h-14 w-12 shrink-0 cursor-pointer items-center justify-center">
        <input type="checkbox" className="h-6 w-6" checked={bought} onChange={onToggle} disabled={it.received} aria-label={`${bought ? 'Desmarcar' : 'Marcar como comprado'}: ${it.name}`} />
      </label>
      <button type="button" onClick={onEdit} className="flex min-h-14 min-w-0 flex-1 items-start justify-between gap-3 py-2.5 text-left">
        <div className={`min-w-0 ${bought ? 'text-muted line-through decoration-1' : ''}`}>
          <div className="leading-snug font-semibold">{it.name}</div>
          <div className="tabular mt-0.5 text-sm text-muted">
            {qtyLabel(it)}
            {it.neededQuantity !== undefined && it.neededUnit && it.unit === 'paquete' && ` · necesitas ${formatQty(it.neededQuantity, it.neededUnit)}`}
            {it.notes && ` · ${it.notes}`}
          </div>
          {(it.lastsWeeks || (pct !== null && Math.abs(pct) >= 1) || it.received || it.origin === 'receta') && (
            <div className="mt-1 flex flex-wrap gap-1 no-underline">
              {it.lastsWeeks && <Badge tone="warn">⏳ {it.lastsWeeks} semanas</Badge>}
              {it.origin === 'receta' && <Badge>para tus recetas</Badge>}
              {pct !== null && Math.abs(pct) >= 1 && <Badge tone={pct > 0 ? 'danger' : 'ok'}>{pct > 0 ? '▲' : '▼'} {formatNumber(Math.abs(pct), 1)} % vs. última compra</Badge>}
              {it.received && <Badge tone="ok">en despensa</Badge>}
            </div>
          )}
        </div>
        <div className="tabular shrink-0 pt-0.5 text-right">
          <div className={`font-semibold ${bought ? 'text-muted' : ''}`}>{paid ? formatMoney(it.paidPrice) : sub === null ? <span className="text-xs font-normal text-warn">sin precio</span> : formatMoney(sub)}</div>
          {paid && <div className="text-[11px] text-muted">pagado</div>}
        </div>
      </button>
    </div>
  );
}

function ListFormDialog({ mode, list, defaultBudget, onClose, onCreated }: { mode: 'new' | 'edit' | null; list?: ShoppingList; defaultBudget?: number; onClose: () => void; onCreated: (l: ShoppingList) => void }) {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [kind, setKind] = useState<ShoppingList['kind']>('semana');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast, error } = useFeedback();
  useEffect(() => {
    if (!mode) return;
    setErrors({});
    if (mode === 'edit' && list) {
      setName(list.name);
      setBudget(list.budget !== undefined ? String(list.budget).replace('.', ',') : '');
      setKind(list.kind);
    } else {
      setName(`Compra ${formatWeekRange(startOfWeek(today()))}`);
      setBudget(defaultBudget !== undefined ? String(defaultBudget).replace('.', ',') : '');
      setKind('semana');
    }
  }, [mode, list, defaultBudget]);

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Pon un nombre a la lista';
    const b = budget.trim() ? parseDecimal(budget) : undefined;
    if (b === null || (b !== undefined && b < 0)) errs.budget = 'Importe no válido';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      if (mode === 'edit' && list) {
        await updateList(list.id, { name: name.trim(), budget: b ?? undefined, kind });
        toast('Lista actualizada');
      } else {
        const l = await createList({ name: name.trim(), budget: b ?? undefined, kind, weekStart: kind === 'semana' ? startOfWeek(today()) : undefined });
        onCreated(l);
        toast('Lista creada');
      }
      onClose();
    } catch (e) {
      error(e);
    }
  };

  return (
    <Dialog open={!!mode} onClose={onClose} title={mode === 'edit' ? 'Editar lista' : 'Nueva lista'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Guardar</Button></>}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Select label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as ShoppingList['kind'])}>
          <option value="semana">Semanal</option>
          <option value="ocasion">Ocasión especial</option>
        </Select>
        <NumberInput label="Presupuesto (opcional)" suffix="€" value={budget} onChange={(e) => setBudget(e.target.value)} error={errors.budget} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function PurchaseHistory() {
  const purchases = useLiveQuery(() => db.purchases.orderBy('date').reverse().toArray(), []);
  const [open, setOpen] = useState<string | null>(null);
  if (!purchases) return <Loading />;
  if (purchases.length === 0) {
    return (
      <EmptyState icon="list" title="Sin compras registradas">
        Cuando marques productos como comprados, pulsa «Registrar compra» para guardar lo que has pagado. Aquí verás el historial y el gasto real.
      </EmptyState>
    );
  }
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {purchases.map((p) => (
        <div key={p.id}>
          <button type="button" className="flex min-h-14 w-full items-center justify-between gap-2 px-3 text-left hover:bg-raised" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
            <span>
              <span className="font-medium">{formatShortDate(p.date)}</span>
              <span className="text-sm text-muted"> · {p.lines.length} producto{p.lines.length === 1 ? '' : 's'}{p.store ? ` · ${p.store}` : ''}</span>
            </span>
            <span className="tabular flex items-center gap-2 font-semibold">
              {formatMoney(p.total)} <Icon name={open === p.id ? 'minus' : 'plus'} size={16} />
            </span>
          </button>
          {open === p.id && (
            <ul className="tabular grid gap-1 px-4 pb-3 text-sm">
              {p.lines.map((l) => (
                <li key={l.itemId} className="flex justify-between gap-2">
                  <span>{l.name} <span className="text-muted">({formatNumber(l.quantity)} {UNITS[l.unit].label})</span></span>
                  <span>
                    {formatMoney(l.paid)}
                    {l.estimated !== undefined && l.estimated !== l.paid && <span className="text-xs text-muted"> (est. {formatMoney(l.estimated)})</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Card>
  );
}
