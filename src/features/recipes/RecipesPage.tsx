import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProductMap, useRecipes } from '../../hooks/data';
import { summarizeRecipe } from '../../domain/recipeCalc';
import { normalizeText } from '../../domain/units';
import { parseDecimal } from '../../domain/format';
import type { Difficulty } from '../../domain/types';
import { Button, EmptyState, Loading, PageHeader, Select } from '../../ui/kit';
import { RecipeCard } from './RecipeBits';

type Sort = 'nombre' | 'coste' | 'duracion' | 'recientes';

export function RecipesPage() {
  const recipes = useRecipes();
  const products = useProductMap();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState<'' | Difficulty>('');
  const [maxMinutes, setMaxMinutes] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [sort, setSort] = useState<Sort>('nombre');
  const [showFilters, setShowFilters] = useState(false);

  const withSummary = useMemo(() => (recipes ?? []).map((r) => ({ recipe: r, summary: summarizeRecipe(r, products) })), [recipes, products]);
  const categories = useMemo(() => [...new Set((recipes ?? []).map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [recipes]);

  const visible = useMemo(() => {
    const q = normalizeText(query);
    const maxM = parseDecimal(maxMinutes);
    const maxC = parseDecimal(maxCost);
    const list = withSummary.filter(({ recipe: r, summary: s }) => {
      if (q) {
        const inName = normalizeText(r.name).includes(q) || r.tags.some((t) => normalizeText(t).includes(q));
        const inIngredients = r.ingredients.some((i) => normalizeText(products.get(i.productId)?.name ?? '').includes(q));
        if (!inName && !inIngredients) return false;
      }
      if (category && r.category !== category) return false;
      if (difficulty && r.difficulty !== difficulty) return false;
      if (maxM !== null && s.totalMinutes > maxM) return false;
      if (maxC !== null && (s.costPerServing === null || s.costPerServing > maxC)) return false;
      if (onlyFav && !r.favorite) return false;
      return true;
    });
    const cmp: Record<Sort, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      nombre: (a, b) => a.recipe.name.localeCompare(b.recipe.name, 'es'),
      coste: (a, b) => (a.summary.costPerServing ?? Infinity) - (b.summary.costPerServing ?? Infinity),
      duracion: (a, b) => a.summary.totalMinutes - b.summary.totalMinutes,
      recientes: (a, b) => b.recipe.updatedAt.localeCompare(a.recipe.updatedAt),
    };
    return [...list].sort(cmp[sort]);
  }, [withSummary, query, category, difficulty, maxMinutes, maxCost, onlyFav, sort, products]);

  if (!recipes) return <Loading />;
  const activeFilters = [category, difficulty, maxMinutes, maxCost, onlyFav ? 'x' : ''].filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Recetas"
        subtitle={`${recipes.length} receta${recipes.length === 1 ? '' : 's'} en tu biblioteca`}
        actions={
          <>
            <Link to="/recetas/sugerencias" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 font-medium">Con lo que tengo</Link>
            <Link to="/recetas/importar" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4 font-medium">Importar</Link>
            <Link to="/recetas/nueva" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-medium text-brand-ink">+ Nueva receta</Link>
          </>
        }
      />

      <div className="mb-3 flex gap-2">
        <input
          type="search"
          aria-label="Buscar por nombre o ingrediente"
          placeholder="Buscar por nombre, etiqueta o ingrediente…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3"
        />
        <Button icon="list" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          Filtros{activeFilters ? ` (${activeFilters})` : ''}
        </Button>
      </div>
      {showFilters && (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-card p-3 md:grid-cols-6">
          <Select label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select label="Dificultad" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}>
            <option value="">Todas</option>
            <option value="facil">Fácil</option>
            <option value="media">Media</option>
            <option value="dificil">Difícil</option>
          </Select>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tiempo máx. (min)
            <input inputMode="numeric" className="min-h-11 rounded-xl border border-line bg-card px-3" value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            € máx. / ración
            <input inputMode="decimal" className="min-h-11 rounded-xl border border-line bg-card px-3" value={maxCost} onChange={(e) => setMaxCost(e.target.value)} />
          </label>
          <Select label="Ordenar por" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="nombre">Nombre</option>
            <option value="coste">Coste por ración</option>
            <option value="duracion">Duración</option>
            <option value="recientes">Modificadas recientemente</option>
          </Select>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium">
            <input type="checkbox" className="h-5 w-5" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> Solo favoritas
          </label>
        </div>
      )}

      {recipes.length === 0 ? (
        <EmptyState
          icon="book"
          title="Tu biblioteca está vacía"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/recetas/nueva" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-medium text-brand-ink">Crear receta</Link>
              <Link to="/recetas/importar" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-medium">Importar desde texto</Link>
            </div>
          }
        >
          Crea tu primera receta o importa una pegando su texto. En Ajustes puedes cargar recetas de ejemplo.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon="search" title="Ninguna receta coincide">Cambia la búsqueda o los filtros.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ recipe, summary }) => (
            <RecipeCard key={recipe.id} recipe={recipe} summary={summary} />
          ))}
        </div>
      )}
    </div>
  );
}
