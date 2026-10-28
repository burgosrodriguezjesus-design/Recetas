import { useEffect, useId, useState } from 'react';
import { addItem, suggestedPrice, updateItem } from '../../db/shopping';
import { ValidationError } from '../../db/common';
import type { Product, ShoppingItem, Unit } from '../../domain/types';
import { formatMoney, formatQty, parseDecimal } from '../../domain/format';
import { itemSubtotal } from '../../domain/shopping';
import { UNIT_OPTIONS } from '../../domain/units';
import { DEFAULT_CATEGORIES, ORIGIN_LABEL } from '../../domain/labels';
import { useProductMap } from '../../hooks/data';
import { Button, Dialog, NumberInput, Select, TextArea, TextInput, Notice } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';
import { ProductPicker } from '../products/ProductPicker';

interface Form {
  productId?: string;
  name: string;
  category: string;
  quantity: string;
  unit: Unit;
  unitPrice: string;
  priceUnit: Unit;
  packageQuantity: string;
  packageUnit: Unit;
  paidPrice: string;
  store: string;
  brand: string;
  notes: string;
}

const s = (n?: number) => (n === undefined ? '' : String(n).replace('.', ','));

function toForm(it?: ShoppingItem): Form {
  return {
    productId: it?.productId,
    name: it?.name ?? '',
    category: it?.category ?? 'Otros',
    quantity: s(it?.quantity ?? 1),
    unit: it?.unit ?? 'ud',
    unitPrice: s(it?.unitPrice),
    priceUnit: it?.priceUnit ?? it?.unit ?? 'ud',
    packageQuantity: s(it?.packageQuantity),
    packageUnit: it?.packageUnit ?? 'kg',
    paidPrice: s(it?.paidPrice),
    store: it?.store ?? '',
    brand: it?.brand ?? '',
    notes: it?.notes ?? '',
  };
}

export function ItemDialog({ open, listId, item, onClose }: { open: boolean; listId: string; item?: ShoppingItem; onClose: () => void }) {
  const [form, setForm] = useState<Form>(toForm(item));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const products = useProductMap();
  const { toast, error } = useFeedback();
  const catId = useId();
  useEffect(() => {
    if (open) {
      setForm(toForm(item));
      setErrors({});
    }
  }, [open, item]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pickProduct = (p?: Product) => {
    if (!p) return set('productId', undefined);
    const unit: Unit = p.packageQuantity ? 'paquete' : p.unit === 'g' ? 'kg' : p.unit === 'ml' ? 'l' : p.unit;
    const sp = suggestedPrice(p, unit);
    setForm((f) => ({
      ...f,
      productId: p.id,
      name: p.name,
      category: p.category || 'Otros',
      unit,
      unitPrice: s(sp.unitPrice),
      priceUnit: sp.priceUnit ?? unit,
      packageQuantity: s(sp.packageQuantity),
      packageUnit: sp.packageUnit ?? f.packageUnit,
      store: p.store ?? f.store,
      brand: p.brand ?? f.brand,
    }));
  };

  const qty = parseDecimal(form.quantity);
  const price = form.unitPrice.trim() ? parseDecimal(form.unitPrice) : undefined;
  const pkgQ = form.packageQuantity.trim() ? parseDecimal(form.packageQuantity) : undefined;
  const preview =
    qty && qty > 0 && price !== null && price !== undefined
      ? itemSubtotal(
          { quantity: qty, unit: form.unit, unitPrice: price, priceUnit: form.priceUnit, packageQuantity: pkgQ ?? undefined, packageUnit: pkgQ ? form.packageUnit : undefined },
          form.productId ? products.get(form.productId) : undefined,
        )
      : null;

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Escribe el nombre del producto';
    if (qty === null || qty <= 0) errs.quantity = 'La cantidad debe ser mayor que 0';
    if (price === null || (price !== undefined && price < 0)) errs.unitPrice = 'Precio no válido';
    if (pkgQ === null || (pkgQ !== undefined && pkgQ <= 0)) errs.packageQuantity = 'Tamaño no válido';
    if (form.unit === 'paquete' && form.priceUnit !== 'paquete' && !pkgQ) errs.packageQuantity = 'Indica el tamaño del envase para poder calcular el precio';
    const paid = form.paidPrice.trim() ? parseDecimal(form.paidPrice) : undefined;
    if (paid === null || (paid !== undefined && paid < 0)) errs.paidPrice = 'Importe no válido';
    if (price !== undefined && price !== null && preview === null && qty) errs.priceUnit = 'La unidad del precio no es compatible con la cantidad';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const data = {
      productId: form.productId,
      name: form.name.trim(),
      category: form.category.trim() || 'Otros',
      quantity: qty!,
      unit: form.unit,
      unitPrice: price ?? undefined,
      priceUnit: price !== undefined ? form.priceUnit : undefined,
      packageQuantity: pkgQ ?? undefined,
      packageUnit: pkgQ ? form.packageUnit : undefined,
      store: form.store.trim() || undefined,
      brand: form.brand.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      if (item) {
        await updateItem(item.id, { ...data, paidPrice: item.status === 'comprado' ? paid ?? undefined : undefined });
        toast('Producto actualizado');
      } else {
        await addItem({ ...data, listId, origin: 'manual' });
        toast('Producto añadido');
      }
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields);
      error(e);
    }
  };

  const units = UNIT_OPTIONS.filter((u) => u.value !== 'pizca' && u.value !== 'cda' && u.value !== 'cdta');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item ? 'Editar producto' : 'Añadir producto'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit}>{item ? 'Guardar' : 'Añadir'}</Button>
        </>
      }
    >
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        {!item && <ProductPicker label="Del catálogo (opcional)" value={form.productId} onChange={pickProduct} autoFocus />}
        <TextInput label="Nombre *" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Cantidad *" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} error={errors.quantity} />
          <Select label="Unidad" value={form.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
            {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </Select>
          <NumberInput label="Precio estimado" suffix="€" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} error={errors.unitPrice} />
          <Select label="por" value={form.priceUnit} onChange={(e) => set('priceUnit', e.target.value as Unit)} error={errors.priceUnit}>
            {units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </Select>
          {(form.unit === 'paquete' || form.priceUnit === 'paquete' || form.packageQuantity) && (
            <>
              <NumberInput label="Contenido del envase" value={form.packageQuantity} onChange={(e) => set('packageQuantity', e.target.value)} error={errors.packageQuantity} hint="Para pasar a la despensa y comparar precios" />
              <Select label="unidad del envase" value={form.packageUnit} onChange={(e) => set('packageUnit', e.target.value as Unit)}>
                {units.filter((u) => u.value !== 'paquete').map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </Select>
            </>
          )}
        </div>
        <p className="tabular text-sm">
          Subtotal estimado: <strong>{preview !== null ? formatMoney(preview) : '—'}</strong>
          {preview !== null && qty && price !== undefined && price !== null && <span className="text-muted"> ({formatQty(qty, form.unit, { humanize: false })} × {formatMoney(price)}/{form.priceUnit})</span>}
        </p>
        {item?.neededQuantity !== undefined && item.neededUnit && (
          <Notice tone="brand">Necesario según recetas: {formatQty(item.neededQuantity, item.neededUnit)}. Origen: {ORIGIN_LABEL[item.origin]}.</Notice>
        )}
        {item?.status === 'comprado' && (
          <NumberInput label="Importe real pagado (línea completa)" suffix="€" value={form.paidPrice} onChange={(e) => set('paidPrice', e.target.value)} error={errors.paidPrice} hint="Déjalo vacío si aún no lo sabes: se mostrará como estimado." disabled={item.received} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Categoría" list={catId} value={form.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id={catId}>{DEFAULT_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          <TextInput label="Tienda" value={form.store} onChange={(e) => set('store', e.target.value)} />
          <TextInput label="Marca" value={form.brand} onChange={(e) => set('brand', e.target.value)} className="col-span-2" />
        </div>
        <TextArea label="Notas" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
