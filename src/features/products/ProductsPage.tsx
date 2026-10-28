import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { saveProduct } from '../../db/catalog';
import { useProducts } from '../../hooks/data';
import type { Product } from '../../domain/types';
import { referencePrice } from '../../domain/recipeCalc';
import { priceChanges } from '../../domain/stats';
import { formatMoney, formatNumber } from '../../domain/format';
import { normalizeText, UNITS } from '../../domain/units';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, Select } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { useFeedback } from '../../ui/feedback';
import { ProductFormDialog } from './ProductForm';

export function ProductsPage() {
  const products = useProducts();
  const records = useLiveQuery(() => db.priceRecords.toArray(), []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState<'todos' | 'sin-precio' | 'sin-nutricion' | 'frecuentes'>('todos');
  const [editing, setEditing] = useState<Product | undefined>();
  const [open, setOpen] = useState(false);
  const { error } = useFeedback();

  const changes = useMemo(() => new Map(priceChanges(records ?? []).map((c) => [c.productId, c])), [records]);
  const categories = useMemo(() => [...new Set((products ?? []).map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const visible = useMemo(() => {
    const q = normalizeText(query);
    return (products ?? []).filter(
      (p) =>
        (!q || normalizeText(p.name).includes(q) || normalizeText(p.brand ?? '').includes(q)) &&
        (!category || p.category === category) &&
        (filter === 'todos' ||
          (filter === 'sin-precio' && !referencePrice(p)) ||
          (filter === 'sin-nutricion' && !p.nutrition) ||
          (filter === 'frecuentes' && p.frequent)),
    );
  }, [products, query, category, filter]);

  if (!products) return <Loading />;

  const toggleFrequent = async (p: Product) => {
    try {
      await saveProduct({ ...p, frequent: !p.frequent });
    } catch (e) {
      error(e);
    }
  };

  return (
    <div>
      <PageHeader
        title="Productos y precios"
        subtitle="Catálogo común para recetas, despensa y compra"
        actions={
          <Button variant="primary" icon="plus" onClick={() => { setEditing(undefined); setOpen(true); }}>
            Nuevo producto
          </Button>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="search"
          aria-label="Buscar productos"
          placeholder="Buscar producto o marca…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 rounded-xl border border-line bg-card px-3"
        />
        <Select label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} className="[&_label]:sr-only">
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select label="Filtro" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="[&_label]:sr-only">
          <option value="todos">Todos</option>
          <option value="sin-precio">Sin precio</option>
          <option value="sin-nutricion">Sin datos nutricionales</option>
          <option value="frecuentes">Frecuentes</option>
        </Select>
      </div>

      {products.length === 0 ? (
        <EmptyState icon="tag" title="Aún no hay productos" action={<Button variant="primary" icon="plus" onClick={() => setOpen(true)}>Crear el primero</Button>}>
          Los productos se crean aquí o al escribir ingredientes en una receta. También puedes cargar datos de ejemplo en Ajustes.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon="search" title="Sin resultados">Prueba con otro nombre o quita los filtros.</EmptyState>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {visible.map((p) => {
            const ref = referencePrice(p);
            const ch = changes.get(p.id);
            return (
              <div key={p.id} className="flex items-center gap-2 px-2 py-1 sm:px-3">
                <button type="button" aria-label={p.frequent ? 'Quitar de frecuentes' : 'Marcar como frecuente'} aria-pressed={!!p.frequent} onClick={() => toggleFrequent(p)} className={`flex h-11 w-11 items-center justify-center rounded-xl ${p.frequent ? 'text-accent' : 'text-line'}`}>
                  <Icon name="star" />
                </button>
                <button type="button" onClick={() => { setEditing(p); setOpen(true); }} className="flex min-h-14 min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-left">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.category}
                      {p.packageQuantity && p.packageUnit && ` · envase ${formatNumber(p.packageQuantity)} ${UNITS[p.packageUnit].label}${p.packagePrice !== undefined ? ` a ${formatMoney(p.packagePrice)}` : ''}`}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!p.nutrition && <Badge>sin nutrición</Badge>}
                    {ch && Math.abs(ch.pct) >= 0.5 && <Badge tone={ch.pct > 0 ? 'danger' : 'ok'}>{ch.pct > 0 ? '▲' : '▼'} {formatNumber(Math.abs(ch.pct), 1)} %</Badge>}
                    {ref ? <span className="tabular font-semibold">{formatMoney(ref.value)}/{UNITS[ref.unit].label}</span> : <Badge tone="warn">sin precio</Badge>}
                  </div>
                </button>
              </div>
            );
          })}
        </Card>
      )}
      <ProductFormDialog open={open} product={editing} onClose={() => setOpen(false)} />
    </div>
  );
}
