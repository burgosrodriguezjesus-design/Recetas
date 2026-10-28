import { useMemo, useState } from 'react';
import type { MealEntry, MealSlot, Product, Recipe } from '../../domain/types';
import { summarizeRecipe, type RecipeSummary } from '../../domain/recipeCalc';
import { normalizeText } from '../../domain/units';
import { formatMoney, formatNumber } from '../../domain/format';
import { Badge } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { CostText, RecipePhoto } from '../recipes/RecipeBits';

export function MealCard({ entry, recipe, summary, compact = false, onOpen }: { entry: MealEntry; recipe?: Recipe; summary?: RecipeSummary; compact?: boolean; onOpen: () => void }) {
  if (!recipe || !summary) {
    return (
      <button type="button" onClick={onOpen} className="w-full rounded-xl border border-dashed border-danger px-3 py-2 text-left text-sm text-danger">
        Receta eliminada — toca para quitarla
      </button>
    );
  }
  const n = summary.nutritionPerServing;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex w-full items-stretch gap-3 overflow-hidden rounded-xl border text-left transition hover:shadow-sm ${entry.prepared ? 'border-ok/40 bg-ok-soft/50' : 'border-line bg-raised'}`}
      aria-label={`${recipe.name}, ${entry.servings} raciones${entry.prepared ? ', preparada' : ''}. Abrir opciones`}
    >
      <RecipePhoto recipe={recipe} className={compact ? 'w-14 shrink-0' : 'w-20 shrink-0 sm:w-24'} />
      <div className="min-w-0 flex-1 py-2 pr-2">
        <div className="flex items-start justify-between gap-2">
          <span className={`leading-snug font-medium ${entry.prepared ? 'line-through decoration-ok/60' : ''}`}>{recipe.name}</span>
          {entry.prepared && <Icon name="check" size={18} className="text-ok" title="Preparada" />}
        </div>
        <div className="tabular mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Icon name="clock" size={12} />{summary.totalMinutes} min</span>
          <span className="inline-flex items-center gap-1"><Icon name="users" size={12} />{formatNumber(entry.servings)} rac.</span>
          <span><CostText summary={summary} /> · <CostText summary={summary} perServing />/rac.</span>
          {n && summary.nutritionComplete ? (
            <span className="inline-flex items-center gap-1"><Icon name="flame" size={12} />{formatNumber(n.kcal, 0)} kcal/rac.</span>
          ) : (
            !compact && <span>kcal: sin datos</span>
          )}
        </div>
        {!compact && n && summary.nutritionComplete && (
          <div className="tabular mt-0.5 text-xs text-muted">
            P {formatNumber(n.protein, 1)} g · H {formatNumber(n.carbs, 1)} g · G {formatNumber(n.fat, 1)} g por ración
          </div>
        )}
      </div>
    </button>
  );
}

/** Resúmenes de recetas por comida (escalados a las raciones de cada comida). */
export function useMealSummaries(entries: MealEntry[] | undefined, recipes: Map<string, Recipe>, products: Map<string, Product>) {
  return useMemo(() => {
    const m = new Map<string, RecipeSummary>();
    for (const e of entries ?? []) {
      const r = recipes.get(e.recipeId);
      if (r) m.set(e.id, summarizeRecipe(r, products, e.servings));
    }
    return m;
  }, [entries, recipes, products]);
}

/** Lista de recetas con búsqueda para elegir una. */
export function RecipePicker({ recipes, products, slot, onPick }: { recipes: Recipe[]; products: Map<string, Product>; slot?: MealSlot; onPick: (r: Recipe) => void }) {
  const [q, setQ] = useState('');
  const [onlySlot, setOnlySlot] = useState(!!slot);
  const list = useMemo(() => {
    const n = normalizeText(q);
    return recipes
      .filter((r) => !n || normalizeText(r.name).includes(n) || r.ingredients.some((i) => normalizeText(products.get(i.productId)?.name ?? '').includes(n)))
      .filter((r) => !onlySlot || !slot || r.mealTypes.length === 0 || r.mealTypes.includes(slot))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'es'));
  }, [recipes, products, q, onlySlot, slot]);
  return (
    <div className="grid gap-2">
      <input type="search" autoFocus aria-label="Buscar receta" placeholder="Buscar receta o ingrediente…" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11 rounded-xl border border-line bg-card px-3" />
      {slot && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="h-5 w-5" checked={onlySlot} onChange={(e) => setOnlySlot(e.target.checked)} /> Solo recetas indicadas para esta comida
        </label>
      )}
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No hay recetas que coincidan.</p>
      ) : (
        <ul className="grid max-h-[50dvh] gap-1 overflow-y-auto">
          {list.map((r) => {
            const s = summarizeRecipe(r, products);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onPick(r)} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-raised">
                  <RecipePhoto recipe={r} className="h-11 w-11 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.favorite ? '★ ' : ''}{r.name}</div>
                    <div className="tabular text-xs text-muted">
                      {s.totalMinutes} min · {s.costPerServing !== null ? `${formatMoney(s.costPerServing)}/rac.` : 'sin precio'}
                      {r.origin === 'propuesta' && ' · propuesta sin revisar'}
                    </div>
                  </div>
                  {r.origin === 'propuesta' && <Badge tone="warn">propuesta</Badge>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
