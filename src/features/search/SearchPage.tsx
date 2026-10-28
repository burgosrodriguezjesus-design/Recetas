import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { normalizeText } from '../../domain/units';
import { formatQty } from '../../domain/format';
import { Badge, Card, PageHeader } from '../../ui/kit';

export function SearchPage() {
  const [q, setQ] = useState('');
  const data = useLiveQuery(async () => {
    const [recipes, products, pantry, items, lists] = await Promise.all([db.recipes.toArray(), db.products.toArray(), db.pantry.toArray(), db.shoppingItems.toArray(), db.shoppingLists.toArray()]);
    return { recipes, products, pantry, items, lists };
  }, []);

  const results = useMemo(() => {
    const n = normalizeText(q);
    if (!data || n.length < 2) return null;
    const pname = new Map(data.products.map((p) => [p.id, p.name]));
    const has = (s?: string) => !!s && normalizeText(s).includes(n);
    return {
      recipes: data.recipes.filter((r) => has(r.name) || r.tags.some(has) || has(r.category) || r.ingredients.some((i) => has(pname.get(i.productId)))).slice(0, 15),
      products: data.products.filter((p) => has(p.name) || has(p.brand) || has(p.category)).slice(0, 15),
      pantry: data.pantry.filter((p) => has(pname.get(p.productId))).slice(0, 15),
      items: data.items.filter((i) => has(i.name)).slice(0, 15),
      pname,
      listName: new Map(data.lists.map((l) => [l.id, l.name])),
    };
  }, [data, q]);

  const total = results ? results.recipes.length + results.products.length + results.pantry.length + results.items.length : 0;

  return (
    <div className="grid gap-4">
      <PageHeader title="Buscar" />
      <input type="search" autoFocus aria-label="Buscar en toda la aplicación" placeholder="Recetas, ingredientes, productos, listas…" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-12 rounded-xl border border-line bg-card px-4 text-lg" />
      {!results ? (
        <p className="text-sm text-muted">Escribe al menos 2 letras.</p>
      ) : total === 0 ? (
        <p className="text-sm text-muted">Sin resultados para «{q}».</p>
      ) : (
        <div className="grid gap-4">
          {results.recipes.length > 0 && (
            <Section title="Recetas">
              {results.recipes.map((r) => <Row key={r.id} to={`/recetas/${r.id}`} title={r.name} meta={r.category} />)}
            </Section>
          )}
          {results.products.length > 0 && (
            <Section title="Productos">
              {results.products.map((p) => <Row key={p.id} to="/productos" title={p.name} meta={p.category} />)}
            </Section>
          )}
          {results.pantry.length > 0 && (
            <Section title="En la despensa">
              {results.pantry.map((p) => <Row key={p.id} to="/despensa" title={results.pname.get(p.productId) ?? '?'} meta={formatQty(p.quantity, p.unit)} />)}
            </Section>
          )}
          {results.items.length > 0 && (
            <Section title="En listas de la compra">
              {results.items.map((i) => <Row key={i.id} to={`/compra?lista=${i.listId}`} title={i.name} meta={results.listName.get(i.listId)} badge={i.status === 'comprado' ? 'comprado' : undefined} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <Card className="divide-y divide-line overflow-hidden">{children}</Card>
    </section>
  );
}

function Row({ to, title, meta, badge }: { to: string; title: string; meta?: string; badge?: string }) {
  return (
    <Link to={to} className="flex min-h-12 items-center justify-between gap-2 px-3 hover:bg-raised">
      <span className="font-medium">{title}</span>
      <span className="flex items-center gap-2 text-xs text-muted">{badge && <Badge>{badge}</Badge>}{meta}</span>
    </Link>
  );
}
