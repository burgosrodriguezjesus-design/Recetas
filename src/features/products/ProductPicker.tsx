import { useId, useMemo, useState } from 'react';
import { useProducts } from '../../hooks/data';
import { findOrCreateProduct } from '../../db/catalog';
import { normalizeText, UNIT_OPTIONS } from '../../domain/units';
import type { Product, Unit } from '../../domain/types';
import { Button, Field } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { useFeedback } from '../../ui/feedback';
import { DEFAULT_CATEGORIES } from '../../domain/labels';

/**
 * Selector de producto del catálogo con búsqueda y creación rápida.
 * Unificar los ingredientes en un catálogo es lo que permite sumar
 * cantidades entre recetas y restarlas de la despensa.
 */
export function ProductPicker({
  value,
  onChange,
  label = 'Producto',
  error,
  autoFocus,
}: {
  value?: string;
  onChange: (p: Product | undefined) => void;
  label?: string;
  error?: string;
  autoFocus?: boolean;
}) {
  const products = useProducts();
  const { error: showError } = useFeedback();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newUnit, setNewUnit] = useState<Unit>('g');
  const [newCategory, setNewCategory] = useState('Otros');
  const id = useId();
  const selected = value ? products?.find((p) => p.id === value) : undefined;

  const matches = useMemo(() => {
    const q = normalizeText(query);
    if (!q || !products) return [];
    return products.filter((p) => normalizeText(p.name).includes(q)).slice(0, 8);
  }, [products, query]);
  const exact = matches.some((m) => normalizeText(m.name) === normalizeText(query));

  if (selected) {
    return (
      <Field label={label} error={error}>
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line bg-raised px-3">
          <span className="truncate font-medium">{selected.name}</span>
          <button type="button" className="text-sm font-medium text-brand" onClick={() => onChange(undefined)}>
            Cambiar
          </button>
        </div>
      </Field>
    );
  }

  const create = async () => {
    try {
      const p = await findOrCreateProduct(query.trim(), newUnit, newCategory);
      setQuery('');
      setCreating(false);
      onChange(p);
    } catch (e) {
      showError(e);
    }
  };

  return (
    <Field label={label} error={error} htmlFor={id}>
      <div className="relative">
        <Icon name="search" size={18} className="pointer-events-none absolute top-3.5 left-3 text-muted" />
        <input
          id={id}
          value={query}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="Busca o escribe un producto nuevo"
          onChange={(e) => {
            setQuery(e.target.value);
            setCreating(false);
          }}
          className={`min-h-11 w-full rounded-xl border bg-card pr-3 pl-9 text-base focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none ${error ? 'border-danger' : 'border-line'}`}
        />
      </div>
      {query.trim() && (
        <div className="mt-1 overflow-hidden rounded-xl border border-line bg-card">
          {matches.map((p) => (
            <button key={p.id} type="button" className="flex min-h-11 w-full items-center justify-between px-3 text-left hover:bg-raised" onClick={() => { setQuery(''); onChange(p); }}>
              <span>{p.name}</span>
              <span className="text-xs text-muted">{p.category}</span>
            </button>
          ))}
          {!exact && !creating && (
            <button type="button" className="flex min-h-11 w-full items-center gap-2 px-3 text-left font-medium text-brand hover:bg-raised" onClick={() => setCreating(true)}>
              <Icon name="plus" size={18} /> Crear «{query.trim()}»
            </button>
          )}
          {creating && (
            <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="text-xs text-muted">
                Se mide en
                <select className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-2 text-base text-ink" value={newUnit} onChange={(e) => setNewUnit(e.target.value as Unit)}>
                  {UNIT_OPTIONS.filter((u) => ['g', 'ml', 'ud'].includes(u.value)).map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Categoría
                <select className="mt-1 min-h-11 w-full rounded-xl border border-line bg-card px-2 text-base text-ink" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                  {DEFAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <Button variant="primary" onClick={create}>Crear</Button>
              <p className="text-xs text-muted sm:col-span-3">Podrás añadir precio, envase y nutrición después en «Productos y precios».</p>
            </div>
          )}
        </div>
      )}
    </Field>
  );
}
