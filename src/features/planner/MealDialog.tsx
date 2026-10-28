import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteMeal, duplicateMeal, markPrepared, moveMeal, previewCooking, restoreMeals, swapMeals, unmarkPrepared, updateMeal } from '../../db/planner';
import { findOrCreateProduct } from '../../db/catalog';
import { savePantryItem } from '../../db/pantry';
import type { ConsumptionLine } from '../../domain/pantry';
import { MEAL_SLOTS, type MealEntry, type MealSlot, type PantryItem, type Product, type Recipe } from '../../domain/types';
import { scaleIngredients, summarizeRecipe } from '../../domain/recipeCalc';
import { availableIn } from '../../domain/shopping';
import { formatQty } from '../../domain/format';
import { addDays, formatLongDate, formatShortDate, today } from '../../domain/dates';
import { SLOT_LABEL } from '../../domain/labels';
import { Badge, Button, Checkbox, Dialog, Loading, Notice, NumberInput, Select, Stepper, TextInput } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';
import { CostText, MacroLine } from '../recipes/RecipeBits';
import { RecipePicker } from './MealCard';

type Mode = 'main' | 'change' | 'duplicate' | 'move' | 'swap' | 'cook';

export function MealDialog({
  entry,
  recipe,
  recipes,
  products,
  pantry,
  weekEntries,
  onClose,
}: {
  entry: MealEntry | null;
  recipe?: Recipe;
  recipes: Recipe[];
  products: Map<string, Product>;
  pantry: PantryItem[];
  weekEntries: MealEntry[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('main');
  const { toast, error, confirm } = useFeedback();
  useEffect(() => setMode('main'), [entry?.id]);

  const summary = useMemo(() => (entry && recipe ? summarizeRecipe(recipe, products, entry.servings) : null), [entry, recipe, products]);
  const ingredients = useMemo(() => (entry && recipe ? scaleIngredients(recipe.ingredients, recipe.servings, entry.servings) : []), [entry, recipe]);

  if (!entry) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>;

  const run = async (fn: () => Promise<unknown>, msg?: string, close = true) => {
    try {
      await fn();
      if (msg) toast(msg);
      if (close) onClose();
    } catch (e) {
      error(e);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Quitar del plan', message: `Se quitará «${recipe?.name ?? 'esta comida'}» del ${formatLongDate(entry.date).toLowerCase()}.`, confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    try {
      const removed = await deleteMeal(entry.id);
      onClose();
      toast('Comida quitada del plan', { action: removed ? { label: 'Deshacer', onClick: () => restoreMeals([removed]) } : undefined });
    } catch (e) {
      error(e);
    }
  };

  const title = mode === 'change' ? 'Cambiar receta' : mode === 'duplicate' ? 'Duplicar en otro día' : mode === 'move' ? 'Mover a otro día' : mode === 'swap' ? 'Intercambiar con otra comida' : mode === 'cook' ? 'Marcar como preparada' : recipe?.name ?? 'Comida';

  return (
    <Dialog open={!!entry} onClose={onClose} title={title} wide={mode === 'cook'}>
      {mode !== 'main' && (
        <button type="button" className="mb-3 text-sm font-medium text-brand" onClick={() => setMode('main')}>
          ← Volver
        </button>
      )}

      {mode === 'main' && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{formatLongDate(entry.date)} · {SLOT_LABEL[entry.slot]}</span>
            {entry.prepared && <Badge tone="ok">Preparada {entry.preparedAt ? `el ${formatShortDate(entry.preparedAt)}` : ''}</Badge>}
          </div>
          {!recipe ? (
            <Notice tone="danger">La receta de esta comida ya no existe.</Notice>
          ) : (
            summary && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium">Comensales / raciones</span>
                  <Stepper label="raciones" value={entry.servings} onChange={(v) => run(() => updateMeal(entry.id, { servings: v }), undefined, false)} min={1} max={50} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-raised p-2"><div className="text-xs text-muted">Coste estimado</div><CostText summary={summary} /> <span className="text-muted">(<CostText summary={summary} perServing />/rac.)</span></div>
                  <div className="rounded-xl bg-raised p-2"><div className="text-xs text-muted">Tiempo</div>{summary.totalMinutes} min</div>
                  <div className="col-span-2 rounded-xl bg-raised p-2"><div className="text-xs text-muted">Por ración</div><MacroLine n={summary.nutritionPerServing} complete={summary.nutritionComplete} /></div>
                </div>
                <details className="rounded-xl border border-line p-3">
                  <summary className="cursor-pointer font-medium">Ingredientes para {entry.servings} raciones</summary>
                  <ul className="mt-2 grid gap-1 text-sm">
                    {ingredients.map((ing, i) => {
                      const p = products.get(ing.productId);
                      const { total } = availableIn(pantry, ing.productId, ing.unit, p);
                      const ok = ing.optional || total + 1e-9 >= ing.quantity;
                      return (
                        <li key={i} className="flex justify-between gap-2">
                          <span><span className="tabular font-medium">{formatQty(ing.quantity, ing.unit)}</span> {p?.name ?? '?'}{ing.optional ? ' (opcional)' : ''}</span>
                          {!ing.optional && <Badge tone={ok ? 'ok' : 'warn'}>{ok ? 'en casa' : 'falta'}</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </>
            )
          )}
          <div className="grid grid-cols-2 gap-2">
            {recipe && !entry.prepared && <Button variant="primary" icon="check" className="col-span-2" onClick={() => setMode('cook')}>Marcar como preparada</Button>}
            {entry.prepared && (
              <Button
                icon="undo"
                className="col-span-2"
                onClick={() => run(() => unmarkPrepared(entry.id), entry.pantryDeducted ? 'Desmarcada. Lo descontado de la despensa no se devuelve automáticamente.' : 'Desmarcada')}
              >
                Desmarcar como preparada
              </Button>
            )}
            {recipe && <Link to={`/recetas/${recipe.id}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 font-medium">Ver receta</Link>}
            <Button icon="edit" onClick={() => setMode('change')}>Cambiar receta</Button>
            <Button icon="copy" onClick={() => setMode('duplicate')}>Duplicar</Button>
            <Button icon="calendar" onClick={() => setMode('move')}>Mover</Button>
            <Button icon="swap" onClick={() => setMode('swap')}>Intercambiar</Button>
            <Button icon="trash" variant="ghost" className="text-danger" onClick={remove}>Quitar</Button>
          </div>
        </div>
      )}

      {mode === 'change' && <RecipePicker recipes={recipes} products={products} slot={entry.slot} onPick={(r) => run(() => updateMeal(entry.id, { recipeId: r.id }), `Cambiada por «${r.name}»`)} />}

      {(mode === 'duplicate' || mode === 'move') && (
        <DateSlotForm
          initialDate={mode === 'duplicate' ? addDays(entry.date, 1) : entry.date}
          initialSlot={entry.slot}
          submitLabel={mode === 'duplicate' ? 'Duplicar' : 'Mover'}
          onSubmit={(date, slot) =>
            mode === 'duplicate' ? run(() => duplicateMeal(entry.id, date, slot), `Duplicada en ${formatLongDate(date).toLowerCase()}`) : run(() => moveMeal(entry.id, date, slot), 'Comida movida')
          }
        />
      )}

      {mode === 'swap' && (
        <SwapList entry={entry} weekEntries={weekEntries} recipes={recipes} onPick={(other) => run(() => swapMeals(entry.id, other.id), 'Comidas intercambiadas')} />
      )}

      {mode === 'cook' && recipe && <CookPanel entry={entry} recipe={recipe} products={products} onDone={onClose} />}
    </Dialog>
  );
}

export function DateSlotForm({ initialDate, initialSlot, submitLabel, onSubmit }: { initialDate: string; initialSlot: MealSlot; submitLabel: string; onSubmit: (date: string, slot: MealSlot) => void }) {
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextInput label="Día" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Select label="Comida" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
        {MEAL_SLOTS.map((s) => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}
      </Select>
      <Button variant="primary" className="sm:col-span-2" disabled={!date} onClick={() => onSubmit(date, slot)}>{submitLabel}</Button>
    </div>
  );
}

function SwapList({ entry, weekEntries, recipes, onPick }: { entry: MealEntry; weekEntries: MealEntry[]; recipes: Recipe[]; onPick: (e: MealEntry) => void }) {
  const others = weekEntries.filter((e) => e.id !== entry.id).sort((a, b) => a.date.localeCompare(b.date) || MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot));
  if (others.length === 0) return <p className="text-sm text-muted">No hay otras comidas esta semana. Usa «Mover» para cambiarla de día.</p>;
  return (
    <ul className="grid gap-1">
      {others.map((o) => (
        <li key={o.id}>
          <button type="button" className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-3 text-left hover:bg-raised" onClick={() => onPick(o)}>
            <span className="font-medium">{recipes.find((r) => r.id === o.recipeId)?.name ?? '?'}</span>
            <span className="text-xs text-muted">{formatShortDate(o.date)} · {SLOT_LABEL[o.slot]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Confirmación de "he cocinado": vista previa del descuento de despensa y sobras. */
function CookPanel({ entry, recipe, products, onDone }: { entry: MealEntry; recipe: Recipe; products: Map<string, Product>; onDone: () => void }) {
  const [lines, setLines] = useState<ConsumptionLine[] | null>(null);
  const [deduct, setDeduct] = useState(true);
  const [leftovers, setLeftovers] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast, error } = useFeedback();
  useEffect(() => {
    previewCooking(entry.id).then(setLines).catch(error);
  }, [entry.id, error]);

  const submit = async () => {
    setBusy(true);
    try {
      const { shortages } = await markPrepared(entry.id, deduct);
      const n = Number((leftovers || '0').replace(',', '.'));
      if (n > 0) {
        const p = await findOrCreateProduct(`Sobras: ${recipe.name}`, 'ud', 'Sobras');
        await savePantryItem({ productId: p.id, quantity: n, unit: 'ud', location: 'nevera', isLeftover: true, purchaseDate: today(), expiryDate: addDays(today(), 3), notes: 'Raciones sobrantes. Fecha orientativa de consumo: 3 días en nevera.' });
      }
      toast(deduct ? (shortages.length ? 'Preparada. Algunos ingredientes no estaban completos en la despensa.' : 'Preparada y despensa actualizada') : 'Marcada como preparada');
      onDone();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!lines) return <Loading />;
  return (
    <div className="grid gap-3">
      <Checkbox label="Descontar los ingredientes usados de la despensa" hint="Solo se descuenta lo que hay; nunca quedan cantidades negativas." checked={deduct} onChange={setDeduct} />
      {deduct && (
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {lines.map((l, i) => {
            const p = products.get(l.productId);
            return (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span><span className="tabular font-medium">{formatQty(l.needed, l.unit)}</span> {p?.name}</span>
                {l.deductions.length === 0 && l.shortage > 0 ? (
                  <Badge tone="warn">no hay en la despensa</Badge>
                ) : l.shortage > 0 ? (
                  <Badge tone="warn">faltaban {formatQty(l.shortage, l.unit)}</Badge>
                ) : (
                  <Badge tone="ok">se descuenta</Badge>
                )}
                {l.incompatibleLots && <Badge tone="warn">hay existencias en otra unidad sin equivalencia</Badge>}
              </li>
            );
          })}
        </ul>
      )}
      <NumberInput label="Raciones que sobran (opcional)" hint="Se guardan en la despensa (nevera) como sobras." value={leftovers} onChange={(e) => setLeftovers(e.target.value)} inputMode="numeric" />
      <Button variant="primary" icon="check" onClick={submit} disabled={busy}>Confirmar: la he cocinado</Button>
    </div>
  );
}
