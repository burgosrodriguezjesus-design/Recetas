import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { deleteRecipe, duplicateRecipe, restoreRecipe, saveRecipe, toggleFavorite } from '../../db/catalog';
import { addMeal } from '../../db/planner';
import { previewFromRecipe } from '../../db/shopping';
import { useProductMap, useSettings, usePantry } from '../../hooks/data';
import { ingredientCost, scaleIngredients, summarizeRecipe } from '../../domain/recipeCalc';
import { availableIn } from '../../domain/shopping';
import { formatMoney, formatQty } from '../../domain/format';
import { formatShortDate, today } from '../../domain/dates';
import { DIFFICULTY_LABEL, SLOT_LABEL } from '../../domain/labels';
import { MEAL_SLOTS, type MealSlot } from '../../domain/types';
import { Badge, Button, Card, Dialog, IconButton, Loading, Notice, Select, Stat, Stepper, TextInput } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { useFeedback } from '../../ui/feedback';
import { AddDraftDialog } from '../shopping/AddDraftDialog';
import { CostText, MacroLine, OriginBadge, RecipePhoto } from './RecipeBits';

export function RecipeDetail() {
  const { id = '' } = useParams();
  const recipe = useLiveQuery(async () => (await db.recipes.get(id)) ?? null, [id]);
  const products = useProductMap();
  const pantry = usePantry();
  const settings = useSettings();
  const navigate = useNavigate();
  const { toast, error, confirm } = useFeedback();
  const [servings, setServings] = useState<number | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const s = servings ?? recipe?.servings ?? 1;
  const summary = useMemo(() => (recipe ? summarizeRecipe(recipe, products, s) : null), [recipe, products, s]);
  const scaled = useMemo(() => (recipe ? scaleIngredients(recipe.ingredients, recipe.servings, s) : []), [recipe, s]);

  if (recipe === undefined) return <Loading />;
  if (recipe === null || !summary) return <Notice tone="danger">La receta no existe o se ha eliminado.</Notice>;

  const missing = scaled.filter((ing) => {
    if (ing.optional) return false;
    const { total } = availableIn(pantry ?? [], ing.productId, ing.unit, products.get(ing.productId));
    return total + 1e-9 < ing.quantity;
  });

  const remove = async () => {
    const meals = await db.mealEntries.where('recipeId').equals(recipe.id).count();
    const ok = await confirm({
      title: `¿Eliminar «${recipe.name}»?`,
      message: meals ? `También se quitará de ${meals} comida(s) planificada(s).` : 'Esta acción se puede deshacer durante unos segundos.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      const snap = await deleteRecipe(recipe.id);
      navigate('/recetas');
      toast('Receta eliminada', { action: { label: 'Deshacer', onClick: () => restoreRecipe(snap) } });
    } catch (e) {
      error(e);
    }
  };

  const duplicate = async () => {
    try {
      const copy = await duplicateRecipe(recipe.id);
      toast('Receta duplicada');
      navigate(`/recetas/${copy.id}/editar`);
    } catch (e) {
      error(e);
    }
  };

  const markReviewed = async () => {
    try {
      const { id: rid, createdAt: _c, updatedAt: _u, ...rest } = recipe;
      await saveRecipe({ ...rest, id: rid, origin: 'manual' });
      toast('Marcada como receta revisada');
    } catch (e) {
      error(e);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="no-print flex items-center gap-2">
        <Link to="/recetas" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted">
          <Icon name="left" size={18} /> Recetas
        </Link>
      </div>
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-[2fr_3fr]">
          <RecipePhoto recipe={recipe} className="aspect-[4/3] w-full md:aspect-auto md:h-full" />
          <div className="grid gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-2xl font-bold">{recipe.name}</h1>
                {recipe.description && <p className="mt-1 text-muted">{recipe.description}</p>}
              </div>
              <IconButton icon="star" label={recipe.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'} aria-pressed={recipe.favorite} className={recipe.favorite ? 'text-accent [&_svg]:fill-current' : 'text-muted'} onClick={() => toggleFavorite(recipe.id)} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="brand">{recipe.category || 'Sin categoría'}</Badge>
              <Badge>{DIFFICULTY_LABEL[recipe.difficulty]}</Badge>
              <Badge><Icon name="clock" size={12} /> {recipe.prepMinutes} min prep. + {recipe.cookMinutes} min cocción</Badge>
              {recipe.mealTypes.map((m) => <Badge key={m}>{SLOT_LABEL[m]}</Badge>)}
              {recipe.tags.map((t) => <Badge key={t}>#{t}</Badge>)}
              <OriginBadge recipe={recipe} />
            </div>
            {recipe.origin === 'propuesta' && (
              <Notice>
                Propuesta generada automáticamente a partir de tu despensa. No se usará en el generador de menús hasta que la revises.
                <div className="mt-2 flex gap-2">
                  <Link to={`/recetas/${recipe.id}/editar`} className="font-semibold underline">Revisar y editar</Link>
                  <button type="button" className="font-semibold underline" onClick={markReviewed}>Marcar como revisada</button>
                </div>
              </Notice>
            )}
            <div className="no-print flex flex-wrap gap-2">
              <Button variant="primary" icon="calendar" onClick={() => setPlanOpen(true)}>Planificar</Button>
              <Button icon="cart" onClick={() => setListOpen(true)}>Añadir a la compra</Button>
              <Button icon="edit" onClick={() => navigate(`/recetas/${recipe.id}/editar`)}>Editar</Button>
              <Button icon="copy" onClick={duplicate}>Duplicar</Button>
              <Button icon="trash" variant="ghost" className="text-danger" onClick={remove}>Eliminar</Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Ingredientes</h2>
            <div className="flex items-center gap-2 text-sm">
              Raciones <Stepper label="raciones" value={s} onChange={setServings} min={1} max={50} />
            </div>
          </div>
          {s !== recipe.servings && <p className="mb-2 text-xs text-muted">Cantidades adaptadas de {recipe.servings} a {s} raciones.</p>}
          <ul className="divide-y divide-line">
            {scaled.map((ing, i) => {
              const p = products.get(ing.productId);
              const cost = ingredientCost(ing, p);
              const isMissing = missing.includes(ing);
              return (
                <li key={i} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div>
                      <span className="tabular font-semibold">{formatQty(ing.quantity, ing.unit)}</span> {p?.name ?? 'Producto eliminado'}
                      {ing.optional && <span className="text-xs text-muted"> (opcional)</span>}
                    </div>
                    {ing.note && <div className="text-xs text-muted">{ing.note}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
                    <span className="tabular text-muted">{cost.cost !== null ? formatMoney(cost.cost) : cost.reason === 'unidad-incompatible' ? 'unidad sin equivalencia' : 'sin precio'}</span>
                    {!ing.optional && (isMissing ? <Badge tone="warn">falta</Badge> : <Badge tone="ok">en casa</Badge>)}
                  </div>
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && <p className="mt-2 text-sm text-warn">Te faltan {missing.length} ingrediente(s) para {s} raciones.</p>}
        </Card>

        <div className="grid content-start gap-4">
          <Card className="grid grid-cols-2 gap-2 p-4">
            <Stat label="Coste total (estimado)" value={<CostText summary={summary} />} />
            <Stat label="Coste por ración" value={<CostText summary={summary} perServing />} />
            {!summary.costComplete && (
              <p className="col-span-2 text-xs text-warn">Coste parcial: {summary.missingPrice.length} ingrediente(s) sin precio o sin equivalencia de unidades. Complétalos en «Productos y precios».</p>
            )}
            <div className="col-span-2 text-sm">
              <div className="text-xs text-muted">Nutrición por ración (estimada)</div>
              <MacroLine n={summary.nutritionPerServing} complete={summary.nutritionComplete} />
              {!summary.nutritionComplete && summary.missingNutrition.length > 0 && (
                <p className="mt-1 text-xs text-muted">Faltan datos de: {summary.missingNutrition.map((pid) => products.get(pid)?.name).filter(Boolean).join(', ')}.</p>
              )}
            </div>
          </Card>
          {recipe.utensils.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2 font-semibold">Utensilios</h2>
              <p className="text-sm">{recipe.utensils.join(' · ')}</p>
            </Card>
          )}
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold">Preparación</h2>
        {recipe.steps.length === 0 ? (
          <p className="text-sm text-muted">Sin pasos todavía.</p>
        ) : (
          <ol className="grid gap-3">
            {recipe.steps.map((st, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-soft text-sm font-semibold text-brand">{i + 1}</span>
                <p className="pt-0.5">{st}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <p className="text-xs text-muted">Creada el {formatShortDate(recipe.createdAt)} · modificada el {formatShortDate(recipe.updatedAt)}</p>

      <PlanRecipeDialog open={planOpen} onClose={() => setPlanOpen(false)} recipeId={recipe.id} defaultServings={servings ?? settings.people} slots={recipe.mealTypes.length ? recipe.mealTypes : MEAL_SLOTS.slice()} />
      <AddDraftDialog open={listOpen} onClose={() => setListOpen(false)} title={`Comprar para «${recipe.name}» (${s} rac.)`} mode="add" load={(o) => previewFromRecipe(recipe.id, s, o)} />
    </div>
  );
}

function PlanRecipeDialog({ open, onClose, recipeId, defaultServings, slots }: { open: boolean; onClose: () => void; recipeId: string; defaultServings: number; slots: MealSlot[] }) {
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState<MealSlot>(slots[0] ?? 'comida');
  const [servings, setServings] = useState(defaultServings);
  const { toast, error } = useFeedback();
  const navigate = useNavigate();
  const submit = async () => {
    try {
      await addMeal(date, slot, recipeId, servings);
      toast('Añadida al plan', { action: { label: 'Ver', onClick: () => navigate(`/?fecha=${date}`) } });
      onClose();
    } catch (e) {
      error(e);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Planificar receta" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Añadir al plan</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Día" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select label="Comida" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
          {MEAL_SLOTS.map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}{slots.includes(s) ? '' : ' (no indicada en la receta)'}</option>)}
        </Select>
        <div className="flex items-center justify-between gap-2 sm:col-span-2">
          <span className="text-sm font-medium">Raciones / comensales</span>
          <Stepper label="raciones" value={servings} onChange={setServings} />
        </div>
      </div>
    </Dialog>
  );
}
