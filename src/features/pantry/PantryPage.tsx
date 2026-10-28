import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { consumeFromLot, deletePantryItem, restorePantryItem, savePantryItem } from '../../db/pantry';
import { ValidationError } from '../../db/common';
import { useProductMap, usePantry, useSettings } from '../../hooks/data';
import type { ConsumptionReason, PantryItem, Product, StorageLocation, Unit } from '../../domain/types';
import { expiryState, type ExpiryState } from '../../domain/pantry';
import { convertForProduct } from '../../domain/recipeCalc';
import { daysBetween, formatShortDate, today } from '../../domain/dates';
import { formatMoney, formatQty, parseDecimal } from '../../domain/format';
import { LOCATION_LABEL } from '../../domain/labels';
import { normalizeText, UNIT_OPTIONS } from '../../domain/units';
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, IconButton, Loading, Notice, NumberInput, PageHeader, Select, TextArea, TextInput } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';
import { ProductPicker } from '../products/ProductPicker';

const EXPIRY_TONE: Record<ExpiryState, 'danger' | 'warn' | 'neutral' | 'ok'> = { caducado: 'danger', pronto: 'warn', ok: 'ok', 'sin-fecha': 'neutral' };

function expiryText(item: PantryItem, state: ExpiryState): string {
  if (!item.expiryDate) return 'sin fecha';
  const d = daysBetween(today(), item.expiryDate);
  if (state === 'caducado') return `caducó hace ${-d} día${d === -1 ? '' : 's'}`;
  if (d === 0) return 'caduca hoy';
  if (d === 1) return 'caduca mañana';
  return `caduca ${formatShortDate(item.expiryDate)}`;
}

export function PantryPage() {
  const pantry = usePantry();
  const products = useProductMap();
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const { toast, confirm } = useFeedback();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<'' | StorageLocation>('');
  const [category, setCategory] = useState('');
  const expiryFilter = (params.get('caducidad') ?? '') as '' | 'pronto' | 'caducado' | 'sin-fecha';
  const [editing, setEditing] = useState<PantryItem | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [consuming, setConsuming] = useState<PantryItem | null>(null);

  const rows = useMemo(() => {
    const q = normalizeText(query);
    return (pantry ?? [])
      .map((item) => ({ item, product: products.get(item.productId), state: expiryState(item, today(), settings.expiryWarningDays) }))
      .filter(({ item, product, state }) => {
        if (q && !normalizeText(product?.name ?? '').includes(q)) return false;
        if (location && item.location !== location) return false;
        if (category && product?.category !== category) return false;
        if (expiryFilter === 'pronto' && state !== 'pronto' && state !== 'caducado') return false;
        if (expiryFilter === 'caducado' && state !== 'caducado') return false;
        if (expiryFilter === 'sin-fecha' && state !== 'sin-fecha') return false;
        return true;
      })
      .sort((a, b) => (a.item.expiryDate ?? '9999').localeCompare(b.item.expiryDate ?? '9999') || (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'es'));
  }, [pantry, products, query, location, category, expiryFilter, settings.expiryWarningDays]);

  const categories = useMemo(() => [...new Set((pantry ?? []).map((p) => products.get(p.productId)?.category).filter(Boolean) as string[])].sort(), [pantry, products]);

  if (!pantry) return <Loading />;
  const soon = pantry.filter((p) => ['pronto', 'caducado'].includes(expiryState(p, today(), settings.expiryWarningDays))).length;

  const setExpiry = (v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set('caducidad', v);
    else p.delete('caducidad');
    setParams(p, { replace: true });
  };

  const remove = async (item: PantryItem) => {
    const name = products.get(item.productId)?.name ?? 'producto';
    const ok = await confirm({ title: `¿Quitar «${name}» de la despensa?`, message: 'No se registra como consumo ni desperdicio. Para eso usa «Consumir».', confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    const removed = await deletePantryItem(item.id);
    toast('Quitado de la despensa', { action: removed ? { label: 'Deshacer', onClick: () => restorePantryItem(removed) } : undefined });
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Despensa"
        subtitle={`${pantry.length} producto${pantry.length === 1 ? '' : 's'} en casa`}
        actions={
          <>
            <Link to="/recetas/sugerencias" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 font-medium">¿Qué cocino?</Link>
            <Button variant="primary" icon="plus" onClick={() => { setEditing(undefined); setFormOpen(true); }}>Añadir</Button>
          </>
        }
      />
      {soon > 0 && expiryFilter === '' && (
        <button type="button" onClick={() => setExpiry('pronto')} className="text-left">
          <Notice icon="alert">{soon} producto{soon === 1 ? '' : 's'} caduca{soon === 1 ? '' : 'n'} en {settings.expiryWarningDays} días o menos (o ya ha{soon === 1 ? '' : 'n'} caducado). <span className="font-semibold underline">Ver</span></Notice>
        </button>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <input type="search" aria-label="Buscar en la despensa" placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} className="col-span-2 min-h-11 rounded-xl border border-line bg-card px-3 md:col-span-1" />
        <select aria-label="Ubicación" value={location} onChange={(e) => setLocation(e.target.value as StorageLocation | '')} className="min-h-11 rounded-xl border border-line bg-card px-2">
          <option value="">Todas las ubicaciones</option>
          {Object.entries(LOCATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} className="min-h-11 rounded-xl border border-line bg-card px-2">
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select aria-label="Caducidad" value={expiryFilter} onChange={(e) => setExpiry(e.target.value)} className="col-span-2 min-h-11 rounded-xl border border-line bg-card px-2 md:col-span-1">
          <option value="">Cualquier caducidad</option>
          <option value="pronto">Caduca pronto o caducado</option>
          <option value="caducado">Caducado</option>
          <option value="sin-fecha">Sin fecha</option>
        </select>
      </div>

      {pantry.length === 0 ? (
        <EmptyState icon="box" title="La despensa está vacía" action={<Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>Añadir producto</Button>}>
          Añade lo que tienes en casa, o registra una compra desde la lista para que se añada automáticamente.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon="search" title="Nada coincide con los filtros" />
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {rows.map(({ item, product, state }) => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2">
              <button type="button" className="min-h-12 min-w-0 flex-1 text-left" onClick={() => { setEditing(item); setFormOpen(true); }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{product?.name ?? 'Producto eliminado'}</span>
                  {item.isLeftover && <Badge tone="accent">sobras</Badge>}
                </div>
                <div className="tabular mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className="font-semibold text-ink">{formatQty(item.quantity, item.unit)}</span>
                  <span>{LOCATION_LABEL[item.location]}</span>
                  <Badge tone={EXPIRY_TONE[state]}>{expiryText(item, state)}</Badge>
                  {item.pricePaid !== undefined && <span>pagado {formatMoney(item.pricePaid)}</span>}
                  {item.notes && <span className="truncate">{item.notes}</span>}
                </div>
              </button>
              <Button size="sm" onClick={() => setConsuming(item)}>Consumir</Button>
              <IconButton icon="trash" label={`Quitar ${product?.name ?? ''}`} className="text-muted" onClick={() => remove(item)} />
            </div>
          ))}
        </Card>
      )}
      <PantryFormDialog open={formOpen} item={editing} onClose={() => setFormOpen(false)} />
      <ConsumeDialog item={consuming} product={consuming ? products.get(consuming.productId) : undefined} onClose={() => setConsuming(null)} />
    </div>
  );
}

function PantryFormDialog({ open, item, onClose }: { open: boolean; item?: PantryItem; onClose: () => void }) {
  const products = useProductMap();
  const { toast, error } = useFeedback();
  const [productId, setProductId] = useState<string | undefined>();
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [pricePaid, setPricePaid] = useState('');
  const [location, setLocation] = useState<StorageLocation>('despensa');
  const [notes, setNotes] = useState('');
  const [isLeftover, setIsLeftover] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setProductId(item?.productId);
    setQuantity(item ? String(item.quantity).replace('.', ',') : '');
    setUnit(item?.unit ?? 'g');
    setPurchaseDate(item?.purchaseDate ?? today());
    setExpiryDate(item?.expiryDate ?? '');
    setPricePaid(item?.pricePaid !== undefined ? String(item.pricePaid).replace('.', ',') : '');
    setLocation(item?.location ?? 'despensa');
    setNotes(item?.notes ?? '');
    setIsLeftover(!!item?.isLeftover);
  }, [open, item]);

  const product = productId ? products.get(productId) : undefined;
  const unitWarning = product && convertForProduct(1, unit, product.unit, product) === null ? `La unidad elegida no se puede convertir a ${product.unit} para este producto: no se podrá restar de las recetas que lo usen en ${product.unit}.` : null;

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!productId) errs.productId = 'Elige un producto';
    const q = parseDecimal(quantity);
    if (q === null || q <= 0) errs.quantity = 'Cantidad mayor que 0';
    const price = pricePaid.trim() ? parseDecimal(pricePaid) : undefined;
    if (price === null || (price !== undefined && price < 0)) errs.pricePaid = 'Importe no válido';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await savePantryItem({ id: item?.id, productId: productId!, quantity: q!, unit, purchaseDate: purchaseDate || undefined, expiryDate: expiryDate || undefined, pricePaid: price ?? undefined, location, notes: notes.trim() || undefined, isLeftover: isLeftover || undefined });
      toast(item ? 'Despensa actualizada' : 'Añadido a la despensa');
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields);
      error(e);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={item ? 'Editar existencias' : 'Añadir a la despensa'} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Guardar</Button></>}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <ProductPicker value={productId} onChange={(p: Product | undefined) => { setProductId(p?.id); if (p && !item) setUnit(p.unit); }} error={errors.productId} autoFocus={!item} />
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Cantidad *" value={quantity} onChange={(e) => setQuantity(e.target.value)} error={errors.quantity} />
          <Select label="Unidad" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {UNIT_OPTIONS.filter((u) => u.value !== 'pizca').map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </Select>
        </div>
        {unitWarning && <Notice>{unitWarning}</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Fecha de compra" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          <TextInput label="Caducidad / consumo pref." type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} error={errors.expiryDate} />
          <NumberInput label="Precio pagado" suffix="€" value={pricePaid} onChange={(e) => setPricePaid(e.target.value)} error={errors.pricePaid} />
          <Select label="Ubicación" value={location} onChange={(e) => setLocation(e.target.value as StorageLocation)}>
            {Object.entries(LOCATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <Checkbox label="Son sobras de un plato cocinado" checked={isLeftover} onChange={setIsLeftover} />
        <TextArea label="Notas" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function ConsumeDialog({ item, product, onClose }: { item: PantryItem | null; product?: Product; onClose: () => void }) {
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const [reason, setReason] = useState<ConsumptionReason>('consumo');
  const { toast, error } = useFeedback();
  useEffect(() => {
    if (item) {
      setQuantity(String(item.quantity).replace('.', ','));
      setUnit(item.unit);
      setReason('consumo');
    }
  }, [item]);
  if (!item) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>;
  const q = parseDecimal(quantity);
  const inLot = q !== null && product ? convertForProduct(q, unit, item.unit, product) : q;
  const exceeds = inLot !== null && inLot > item.quantity + 1e-9;
  const incompatible = q !== null && inLot === null;

  const submit = async () => {
    if (q === null || q <= 0) return error(new ValidationError('Indica una cantidad mayor que 0'));
    try {
      const r = await consumeFromLot(item.id, q, unit, reason);
      toast(r.shortage > 0 ? `Registrado. Solo había ${formatQty(r.consumed, item.unit)}; la despensa queda a 0.` : reason === 'desperdicio' ? 'Desperdicio registrado' : 'Consumo registrado');
      onClose();
    } catch (e) {
      error(e);
    }
  };

  return (
    <Dialog open={!!item} onClose={onClose} title={`Consumir · ${product?.name ?? ''}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant={reason === 'desperdicio' ? 'danger' : 'primary'} onClick={submit} disabled={incompatible}>Registrar</Button></>}>
      <div className="grid gap-3">
        <p className="text-sm text-muted">Disponible: <strong className="text-ink">{formatQty(item.quantity, item.unit)}</strong></p>
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Cantidad" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          <Select label="Unidad" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </Select>
        </div>
        <Select label="Motivo" value={reason} onChange={(e) => setReason(e.target.value as ConsumptionReason)}>
          <option value="consumo">Consumido</option>
          <option value="desperdicio">Desperdiciado / tirado</option>
          <option value="ajuste">Ajuste de inventario</option>
        </Select>
        {exceeds && <Notice icon="alert">Es más de lo que hay. Solo se descontará lo disponible y la despensa quedará a 0 (no se permiten cantidades negativas).</Notice>}
        {incompatible && <Notice tone="danger">No se puede convertir esta unidad a {item.unit} para este producto.</Notice>}
      </div>
    </Dialog>
  );
}
