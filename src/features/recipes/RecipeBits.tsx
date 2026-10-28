import { Link } from 'react-router-dom';
import type { Nutrition, Recipe } from '../../domain/types';
import type { RecipeSummary } from '../../domain/recipeCalc';
import { formatMoney, formatNumber } from '../../domain/format';
import { DIFFICULTY_LABEL } from '../../domain/labels';
import { Badge, Card } from '../../ui/kit';
import { Icon } from '../../ui/Icon';

export function RecipePhoto({ recipe, className = '' }: { recipe: Pick<Recipe, 'photo' | 'name'>; className?: string }) {
  if (recipe.photo) return <img src={recipe.photo} alt="" className={`object-cover ${className}`} loading="lazy" />;
  return (
    <div className={`flex items-center justify-center bg-soft text-brand ${className}`} aria-hidden>
      <Icon name="utensils" size={28} />
    </div>
  );
}

export function OriginBadge({ recipe }: { recipe: Recipe }) {
  if (recipe.origin === 'propuesta') return <Badge tone="warn">Propuesta automática · sin revisar</Badge>;
  if (recipe.origin === 'importada') return <Badge>Importada</Badge>;
  return null;
}

/** Coste con aviso de "parcial" cuando faltan precios. */
export function CostText({ summary, perServing = false }: { summary: RecipeSummary; perServing?: boolean }) {
  const v = perServing ? summary.costPerServing : summary.totalCost;
  if (v === null) return <span className="text-muted">sin precios</span>;
  return (
    <span title={summary.costComplete ? 'Coste estimado' : 'Coste parcial: faltan precios de algunos ingredientes'}>
      {summary.costComplete ? '' : '≥ '}
      {formatMoney(v)}
    </span>
  );
}

export function MacroLine({ n, complete }: { n: Nutrition | null; complete: boolean }) {
  if (!n || !complete) return <span className="text-muted">nutrición: datos incompletos</span>;
  return (
    <span className="tabular">
      {formatNumber(n.kcal, 0)} kcal · P {formatNumber(n.protein, 1)} g · H {formatNumber(n.carbs, 1)} g · G {formatNumber(n.fat, 1)} g
    </span>
  );
}

export function RecipeCard({ recipe, summary, extra }: { recipe: Recipe; summary: RecipeSummary; extra?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden transition hover:shadow-md">
      <Link to={`/recetas/${recipe.id}`} className="flex h-full flex-col">
        <RecipePhoto recipe={recipe} className="aspect-[16/9] w-full" />
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="leading-snug font-semibold">{recipe.name}</h3>
            {recipe.favorite && <Icon name="star" size={18} className="mt-0.5 fill-current text-accent" title="Favorita" />}
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge tone="brand">{recipe.category || 'Sin categoría'}</Badge>
            <Badge>
              <Icon name="clock" size={12} /> {summary.totalMinutes} min
            </Badge>
            <Badge>{DIFFICULTY_LABEL[recipe.difficulty]}</Badge>
            <OriginBadge recipe={recipe} />
          </div>
          <div className="mt-auto flex items-center justify-between text-sm">
            <span className="text-muted">
              <CostText summary={summary} perServing /> / ración
            </span>
            <span className="text-xs text-muted">{recipe.servings} rac.</span>
          </div>
          {extra}
        </div>
      </Link>
    </Card>
  );
}
