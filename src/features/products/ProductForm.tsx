import { useEffect, useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { saveProduct, deleteProduct, type ProductInput } from '../../db/catalog';
import { ValidationError } from '../../db/common';
import type { Product, Unit } from '../../domain/types';
import { formatMoney, formatNumber, parseDecimal } from '../../domain/format';
import { formatShortDate } from '../../domain/dates';
import { UNIT_OPTIONS, UNITS } from '../../domain/units';
import { referencePrice } from '../../domain/recipeCalc';
import { DEFAULT_CATEGORIES } from '../../domain/labels';
import { comparePriceRecords } from '../../domain/stats';
import { useCategories } from '../../hooks/data';
import { Button, Checkbox, Dialog, NumberInput, Select, TextArea, TextInput, Notice } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';

type Form = Record<
  'name' | 'category' | 'unit' | 'price' | 'priceQuantity' | 'priceUnit' | 'packageQuantity' | 'packageUnit' | 'packagePrice' | 'gramsPerUnit' | 'densityGPerMl' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'store' | 'brand' | 'notes',
  string
> & { frequent: boolean };

const s = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

function toForm(p?: Product): Form {
  return {
    name: p?.name ?? '',
    category: p?.category ?? 'Otros',
    unit: p?.unit ?? 'g',
    price: s(p?.price),
    priceQuantity: s(p?.priceQuantity ?? 1),
    priceUnit: p?.priceUnit ?? (p?.unit === 'ml' ? 'l' : p?.unit === 'ud' ? 'ud' : 'kg'),
    packageQuantity: s(p?.packageQuantity),
    packageUnit: p?.packageUnit ?? (p?.unit === 'ml' ? 'l' : p?.unit === 'ud' ? 'ud' : 'kg'),
    packagePrice: s(p?.packagePrice),
    gramsPerUnit: s(p?.gramsPerUnit),
    densityGPerMl: s(p?.densityGPerMl),
    kcal: s(p?.nutrition?.kcal),
    protein: s(p?.nutrition?.protein),
    carbs: s(p?.nutrition?.carbs),
    fat: s(p?.nutrition?.fat),
    store: p?.store ?? '',
    brand: p?.brand ?? '',
    notes: p?.notes ?? '',
    frequent: !!p?.frequent,
  };
}

/** Convierte el formulario en datos validables. Devuelve errores por campo. */
export function formToProduct(f: Form, id?: string): { input?: ProductInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const num = (key: keyof Form, opts: { positive?: boolean } = {}) => {
    const raw = f[key] as string;
    if (raw.trim() === '') return undefined;
    const n = parseDecimal(raw);
    if (n === null || n < 0 || (opts.positive && n === 0)) {
      errors[key] = opts.positive ? 'Debe ser un número mayor que 0' : 'Debe ser un número (0 o más)';
      return undefined;
    }
    return n;
  };
  if (!f.name.trim()) errors.name = 'El nombre es obligatorio';
  const price = num('price');
  const priceQuantity = num('priceQuantity', { positive: true });
  const packageQuantity = num('packageQuantity', { positive: true });
  const packagePrice = num('packagePrice');
  if (price !== undefined && priceQuantity === undefined) errors.priceQuantity = 'Indica la cantidad a la que corresponde el precio';
  if (packagePrice !== undefined && packageQuantity === undefined) errors.packageQuantity = 'Indica el tamaño del envase';
  const nutKeys = ['kcal', 'protein', 'carbs', 'fat'] as const;
  const nutVals = nutKeys.map((k) => num(k));
  const filled = nutKeys.filter((k) => f[k].trim() !== '').length;
  if (filled > 0 && filled < 4) nutKeys.forEach((k) => f[k].trim() === '' && (errors[k] = 'Completa los cuatro valores o déjalos vacíos'));
  const input: ProductInput = {
    id,
    name: f.name.trim(),
    category: f.category.trim() || 'Otros',
    unit: f.unit as Unit,
    price,
    priceQuantity: price !== undefined ? priceQuantity : undefined,
    priceUnit: price !== undefined ? (f.priceUnit as Unit) : undefined,
    packageQuantity,
    packageUnit: packageQuantity !== undefined ? (f.packageUnit as Unit) : undefined,
    packagePrice,
    gramsPerUnit: num('gramsPerUnit', { positive: true }),
    densityGPerMl: num('densityGPerMl', { positive: true }),
    nutrition: filled === 4 && nutVals.every((v) => v !== undefined) ? { kcal: nutVals[0]!, protein: nutVals[1]!, carbs: nutVals[2]!, fat: nutVals[3]! } : undefined,
    store: f.store.trim() || undefined,
    brand: f.brand.trim() || undefined,
    notes: f.notes.trim() || undefined,
    frequent: f.frequent,
  };
  return { input: Object.keys(errors).length ? undefined : input, errors };
}

export function ProductFormDialog({ open, product, onClose, onSaved }: { open: boolean; product?: Product; onClose: () => void; onSaved?: (p: Product) => void }) {
  const [form, setForm] = useState<Form>(toForm(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { toast, error, confirm } = useFeedback();
  const categories = useCategories('product');
  const listId = useId();
  useEffect(() => {
    if (open) {
      setForm(toForm(product));
      setErrors({});
    }
  }, [open, product]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const nutBase = form.unit === 'ml' || form.unit === 'l' ? '100 ml' : '100 g';

  const submit = async () => {
    const { input, errors: errs } = formToProduct(form, product?.id);
    setErrors(errs);
    if (!input) return;
    setSaving(true);
    try {
      const p = await saveProduct(input);
      toast(product ? 'Producto actualizado' : 'Producto creado');
      onSaved?.(p);
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields);
      error(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    const ok = await confirm({ title: `¿Eliminar «${product.name}»?`, message: 'Se borrarán también sus existencias en la despensa y su histórico de precios. Las líneas de listas de la compra se conservarán como texto.', confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    try {
      await deleteProduct(product.id);
      toast('Producto eliminado');
      onClose();
    } catch (e) {
      error(e);
    }
  };

  const unitOpts = UNIT_OPTIONS.filter((u) => u.value !== 'pizca' && u.value !== 'paquete');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={product ? 'Editar producto' : 'Nuevo producto'}
      wide
      footer={
        <>
          {product && (
            <Button variant="ghost" icon="trash" className="mr-auto text-danger" onClick={remove}>
              Eliminar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput label="Nombre *" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} autoFocus className="sm:col-span-3" />
          <TextInput label="Categoría" list={listId} value={form.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id={listId}>
            {[...new Set([...DEFAULT_CATEGORIES, ...categories])].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Select label="Se mide en" value={form.unit} onChange={(e) => set('unit', e.target.value)} hint="Unidad de las recetas y la despensa">
            {unitOpts.filter((u) => ['g', 'ml', 'ud'].includes(u.value)).map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </Select>
          <div className="flex items-end">
            <Checkbox label="Producto frecuente" hint="Se añade con un toque a la lista" checked={form.frequent} onChange={(v) => set('frequent', v)} />
          </div>
        </div>

        <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-3">
          <legend className="px-1 text-sm font-semibold">Precio de referencia (opcional)</legend>
          <NumberInput label="Precio" suffix="€" value={form.price} onChange={(e) => set('price', e.target.value)} error={errors.price} placeholder="7,50" />
          <NumberInput label="por cantidad" value={form.priceQuantity} onChange={(e) => set('priceQuantity', e.target.value)} error={errors.priceQuantity} />
          <Select label="unidad" value={form.priceUnit} onChange={(e) => set('priceUnit', e.target.value)}>
            {unitOpts.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </Select>
          <p className="text-xs text-muted sm:col-span-3">Ejemplo: 7,50 € por 1 kg. Se usa para estimar el coste de las recetas.</p>
        </fieldset>

        <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-3">
          <legend className="px-1 text-sm font-semibold">Envase habitual (opcional)</legend>
          <NumberInput label="Tamaño" value={form.packageQuantity} onChange={(e) => set('packageQuantity', e.target.value)} error={errors.packageQuantity} placeholder="1" />
          <Select label="unidad" value={form.packageUnit} onChange={(e) => set('packageUnit', e.target.value)}>
            {unitOpts.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </Select>
          <NumberInput label="Precio del envase" suffix="€" value={form.packagePrice} onChange={(e) => set('packagePrice', e.target.value)} error={errors.packagePrice} />
          <p className="text-xs text-muted sm:col-span-3">Permite redondear la compra a envases completos (necesito 1,3 kg → compro 2 paquetes de 1 kg).</p>
        </fieldset>

        <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">Equivalencias (opcional)</legend>
          <NumberInput label="Peso medio por unidad" suffix="g" value={form.gramsPerUnit} onChange={(e) => set('gramsPerUnit', e.target.value)} error={errors.gramsPerUnit} hint="Ej.: un huevo ≈ 60 g. Permite convertir ud ↔ g." />
          <NumberInput label="Densidad" suffix="g/ml" value={form.densityGPerMl} onChange={(e) => set('densityGPerMl', e.target.value)} error={errors.densityGPerMl} hint="Ej.: aceite ≈ 0,92. Permite convertir ml ↔ g." />
        </fieldset>

        <fieldset className="grid grid-cols-2 gap-3 rounded-xl border border-line p-3 sm:grid-cols-4">
          <legend className="px-1 text-sm font-semibold">Nutrición por {nutBase} (opcional)</legend>
          <NumberInput label="Energía" suffix="kcal" value={form.kcal} onChange={(e) => set('kcal', e.target.value)} error={errors.kcal} />
          <NumberInput label="Proteínas" suffix="g" value={form.protein} onChange={(e) => set('protein', e.target.value)} error={errors.protein} />
          <NumberInput label="Hidratos" suffix="g" value={form.carbs} onChange={(e) => set('carbs', e.target.value)} error={errors.carbs} />
          <NumberInput label="Grasas" suffix="g" value={form.fat} onChange={(e) => set('fat', e.target.value)} error={errors.fat} />
          <p className="col-span-2 text-xs text-muted sm:col-span-4">Cópialos de la etiqueta del producto. Si los dejas vacíos, la app indicará «sin datos» en lugar de estimarlos.</p>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Tienda habitual" value={form.store} onChange={(e) => set('store', e.target.value)} />
          <TextInput label="Marca" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
          <TextArea label="Notas" value={form.notes} onChange={(e) => set('notes', e.target.value)} className="sm:col-span-2" rows={2} />
        </div>
        {product && <PriceHistory product={product} />}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function PriceHistory({ product }: { product: Product }) {
  const recs = useLiveQuery(async () => (await db.priceRecords.where('productId').equals(product.id).toArray()).sort(comparePriceRecords).reverse(), [product.id]);
  const ref = referencePrice(product);
  if (!recs) return null;
  const perUnit = (ppb?: number, base?: Unit) => {
    if (ppb === undefined || !base) return '—';
    if (base === 'g') return `${formatMoney(ppb * 1000)}/kg`;
    if (base === 'ml') return `${formatMoney(ppb * 1000)}/l`;
    return `${formatMoney(ppb)}/${UNITS[base].label}`;
  };
  return (
    <section>
      <h3 className="mb-2 font-semibold">Histórico de precios</h3>
      {recs.length === 0 ? (
        <Notice tone="brand">Aún no hay precios registrados. Se guardan al editar el precio de referencia y al registrar compras.</Notice>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Fecha</th>
                <th className="py-1 pr-2 font-medium">Precio unitario</th>
                <th className="py-1 pr-2 font-medium">Pagado</th>
                <th className="py-1 pr-2 font-medium">Origen</th>
              </tr>
            </thead>
            <tbody>
              {recs.slice(0, 20).map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1.5 pr-2">{formatShortDate(r.date)}</td>
                  <td className="py-1.5 pr-2">{perUnit(r.pricePerBase, r.baseUnit)}</td>
                  <td className="py-1.5 pr-2">
                    {formatMoney(r.paid)} · {formatNumber(r.quantity)} {UNITS[r.unit].label}
                  </td>
                  <td className="py-1.5 pr-2">{r.source === 'compra' ? `Compra${r.store ? ` (${r.store})` : ''}` : 'Manual'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ref && <p className="mt-2 text-xs text-muted">Precio de referencia actual: {formatMoney(ref.value)}/{UNITS[ref.unit].label}</p>}
    </section>
  );
}
