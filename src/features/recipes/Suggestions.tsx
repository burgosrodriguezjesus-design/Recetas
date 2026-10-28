// Sugerencias: recetas verificadas ordenadas por lo que tienes en casa y lo que
// caduca, y propuestas automáticas (marcadas como tales) a partir de la despensa.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProductMap, usePantry, useRecipes, useSettings } from '../../hooks/data';
import { pantryCoverage, expiringProductIds } from '../../domain/menuGenerator';
import { summarizeRecipe } from '../../domain/recipeCalc';
import { today } from '../../domain/dates';
import { Badge, Button, Card, EmptyState, Loading, PageHeader } from '../../ui/kit';
import { RecipeCard } from './RecipeBits';

export function SuggestionsPage() {
  const recipes = useRecipes();
  const products = useProductMap();
  const pantry = usePantry();
  const settings = useSettings();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);

  const expiring = useMemo(() => (pantry ? expiringProductIds(pantry, today(), settings.expiryWarningDays, products) : []), [pantry, settings.expiryWarningDays, products]);

  const ranked = useMemo(() => {
    if (!recipes || !pantry) return [];
    return recipes
      .filter((r) => r.origin !== 'propuesta')
      .map((r) => {
        const coverage = pantryCoverage(r, r.servings, pantry, products);
        const usesExpiring = r.ingredients.filter((i) => expiring.includes(i.productId)).map((i) => products.get(i.productId)?.name ?? '');
        return { recipe: r, coverage, usesExpiring, summary: summarizeRecipe(r, products) };
      })
      .filter((x) => x.coverage > 0 || x.usesExpiring.length > 0)
      .sort((a, b) => b.usesExpiring.length - a.usesExpiring.length || b.coverage - a.coverage);
  }, [recipes, pantry, products, expiring]);

  const inPantry = useMemo(() => {
    const ids = [...new Set((pantry ?? []).filter((p) => p.quantity > 0).map((p) => p.productId))];
    return ids.map((id) => products.get(id)).filter((p): p is NonNullable<typeof p> => !!p).sort((a, b) => Number(expiring.includes(b.id)) - Number(expiring.includes(a.id)) || a.name.localeCompare(b.name, 'es'));
  }, [pantry, products, expiring]);

  if (!recipes || !pantry) return <Loading />;

  return (
    <div className="grid gap-6">
      <PageHeader title="Con lo que tengo" subtitle="Recetas de tu biblioteca ordenadas por lo que hay en tu despensa y lo que caduca antes." />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recetas de tu biblioteca</h2>
        {pantry.length === 0 ? (
          <EmptyState icon="box" title="Tu despensa está vacía" action={<Link className="font-semibold text-brand underline" to="/despensa">Ir a la despensa</Link>}>
            Añade lo que tienes en casa para recibir sugerencias.
          </EmptyState>
        ) : ranked.length === 0 ? (
          <EmptyState icon="book" title="Ninguna receta usa lo que tienes">Prueba a crear una propuesta con tus ingredientes (abajo).</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ranked.slice(0, 12).map((x) => (
              <RecipeCard
                key={x.recipe.id}
                recipe={x.recipe}
                summary={x.summary}
                extra={
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={x.coverage === 1 ? 'ok' : 'neutral'}>{x.coverage === 1 ? 'Lo tienes todo' : `${Math.round(x.coverage * 100)} % en casa`}</Badge>
                    {x.usesExpiring.length > 0 && <Badge tone="warn">Aprovecha: {x.usesExpiring.join(', ')}</Badge>}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Crear una propuesta automática</h2>
        <p className="mb-3 text-sm text-muted">
          Elige ingredientes de tu despensa y se abrirá una receta borrador con ellos. Quedará marcada como <strong>propuesta sin revisar</strong> hasta que la compruebes: no es una receta verificada.
        </p>
        {inPantry.length === 0 ? (
          <p className="text-sm text-muted">No hay productos en la despensa.</p>
        ) : (
          <Card className="p-3">
            <div className="flex flex-wrap gap-2">
              {inPantry.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => setSelected(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])} className={`min-h-9 rounded-full border px-3 text-sm ${on ? 'border-brand bg-soft text-brand' : 'border-line'}`}>
                    {p.name}
                    {expiring.includes(p.id) && ' ⏳'}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="primary" icon="sparkles" disabled={selected.length === 0} onClick={() => navigate(`/recetas/nueva?propuesta=${selected.join(',')}`)}>
                Crear propuesta con {selected.length || '…'} ingrediente{selected.length === 1 ? '' : 's'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">⏳ = caduca en {settings.expiryWarningDays} días o menos.</p>
          </Card>
        )}
      </section>
    </div>
  );
}
