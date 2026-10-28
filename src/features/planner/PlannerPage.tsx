import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { addMeal, copyDays, restoreMeals, swapDays } from '../../db/planner';
import { previewFromPlan } from '../../db/shopping';
import { useProductMap, usePantry, useRecipeMap, useRecipes, useSettings } from '../../hooks/data';
import { MEAL_SLOTS, type MealEntry, type MealSlot } from '../../domain/types';
import { addDays, formatDayMonth, formatLongDate, formatWeekRange, formatWeekdayShort, isISODate, startOfWeek, today, weekDays } from '../../domain/dates';
import { SLOT_LABEL } from '../../domain/labels';
import { addNutrition, EMPTY_NUTRITION, roundNutrition, type RecipeSummary } from '../../domain/recipeCalc';
import { aggregateRequirements, subtractPantry, summarizeList } from '../../domain/shopping';
import { expiryState } from '../../domain/pantry';
import { formatMoney, formatNumber, formatQty, roundMoney } from '../../domain/format';
import { Badge, Button, Card, Dialog, IconButton, Loading, Notice, Segmented, Stat, Stepper, TextInput } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { useFeedback } from '../../ui/feedback';
import { AddDraftDialog } from '../shopping/AddDraftDialog';
import { MealCard, RecipePicker, useMealSummaries } from './MealCard';
import { MealDialog } from './MealDialog';

const sortEntries = (a: MealEntry, b: MealEntry) => a.date.localeCompare(b.date) || MEAL_SLOTS.indexOf(a.slot) - MEAL_SLOTS.indexOf(b.slot) || a.order - b.order;

interface DayTotals {
  cost: number;
  costComplete: boolean;
  kcal: number | null; // por persona (suma de una ración de cada comida)
  nutrition: ReturnType<typeof roundNutrition> | null;
  minutes: number;
  pending: number;
  meals: number;
}

function dayTotals(entries: MealEntry[], summaries: Map<string, RecipeSummary>): DayTotals {
  let cost = 0;
  let costComplete = true;
  let nut = { ...EMPTY_NUTRITION };
  let nutComplete = entries.length > 0;
  let minutes = 0;
  for (const e of entries) {
    const s = summaries.get(e.id);
    if (!s) continue;
    cost += s.totalCost ?? 0;
    if (!s.costComplete) costComplete = false;
    if (s.nutritionComplete && s.nutritionPerServing) nut = addNutrition(nut, s.nutritionPerServing);
    else nutComplete = false;
    minutes += s.totalMinutes;
  }
  return {
    cost: roundMoney(cost),
    costComplete,
    kcal: nutComplete ? Math.round(nut.kcal) : null,
    nutrition: nutComplete ? roundNutrition(nut) : null,
    minutes,
    pending: entries.filter((e) => !e.prepared).length,
    meals: entries.length,
  };
}

export function PlannerPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const recipes = useRecipes();
  const recipeMap = useRecipeMap();
  const products = useProductMap();
  const pantry = usePantry();
  const { toast, confirm } = useFeedback();

  const date = isISODate(params.get('fecha') ?? '') ? params.get('fecha')! : today();
  const view = params.get('vista') === 'dia' ? 'dia' : 'semana';
  const weekStart = startOfWeek(date);
  const days = weekDays(weekStart);
  const weekEnd = days[6];

  const entries = useLiveQuery(() => db.mealEntries.where('date').between(weekStart, weekEnd, true, true).toArray(), [weekStart, weekEnd]);
  const summaries = useMealSummaries(entries, recipeMap, products);
  const sorted = useMemo(() => (entries ?? []).slice().sort(sortEntries), [entries]);

  const [openEntry, setOpenEntry] = useState<MealEntry | null>(null);
  const [adding, setAdding] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [dayMenu, setDayMenu] = useState<string | null>(null);
  const [copyWeekOpen, setCopyWeekOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const go = (patch: { fecha?: string; vista?: 'dia' | 'semana' }) => {
    const p = new URLSearchParams(params);
    if (patch.fecha) p.set('fecha', patch.fecha);
    if (patch.vista) p.set('vista', patch.vista);
    setParams(p, { replace: true });
  };

  const slots = MEAL_SLOTS.filter((s) => settings.enabledSlots.includes(s));
  const weekTotals = useMemo(() => dayTotals(sorted, summaries), [sorted, summaries]);
  const openRecipe = openEntry ? recipeMap.get(openEntry.recipeId) : undefined;
  const liveOpenEntry = openEntry ? sorted.find((e) => e.id === openEntry.id) ?? null : null;

  if (!entries || !recipes || !pantry) return <Loading />;

  const clearWeek = async () => {
    if (sorted.length === 0) return;
    const ok = await confirm({ title: 'Vaciar la semana', message: `Se quitarán ${sorted.length} comidas del ${formatWeekRange(weekStart)}.`, confirmLabel: 'Vaciar', danger: true });
    if (!ok) return;
    const removed = sorted.slice();
    await db.mealEntries.bulkDelete(removed.map((e) => e.id));
    toast('Semana vaciada', { action: { label: 'Deshacer', onClick: () => restoreMeals(removed) } });
  };

  const expiringCount = pantry.filter((p) => ['pronto', 'caducado'].includes(expiryState(p, today(), settings.expiryWarningDays))).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planificador</h1>
          <p className="text-sm text-muted">{view === 'semana' ? `Semana del ${formatWeekRange(weekStart)}` : formatLongDate(date)}</p>
        </div>
        <Segmented label="Vista" value={view} onChange={(v) => go({ vista: v })} options={[{ value: 'semana', label: 'Semana' }, { value: 'dia', label: 'Día' }]} />
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        <IconButton icon="left" label={view === 'semana' ? 'Semana anterior' : 'Día anterior'} variant="secondary" onClick={() => go({ fecha: addDays(date, view === 'semana' ? -7 : -1) })} />
        <Button onClick={() => go({ fecha: today() })}>Hoy</Button>
        <IconButton icon="right" label={view === 'semana' ? 'Semana siguiente' : 'Día siguiente'} variant="secondary" onClick={() => go({ fecha: addDays(date, view === 'semana' ? 7 : 1) })} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button icon="sparkles" onClick={() => navigate(`/plan/generar?semana=${weekStart}`)}>Generar menú</Button>
          <Button icon="cart" variant="primary" onClick={() => setListOpen(true)}>Lista de la compra</Button>
        </div>
      </div>

      {expiringCount > 0 && (
        <Link to="/despensa?caducidad=pronto" className="block">
          <Notice icon="alert">
            {expiringCount} producto{expiringCount === 1 ? '' : 's'} de tu despensa caduca{expiringCount === 1 ? '' : 'n'} pronto o ya {expiringCount === 1 ? 'ha' : 'han'} caducado. <span className="font-semibold underline">Ver</span>
          </Notice>
        </Link>
      )}

      {view === 'semana' ? (
        <>
          <Card className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
            <Stat label="Coste estimado semana" value={<>{weekTotals.costComplete ? '' : '≥ '}{formatMoney(weekTotals.cost)}</>} hint={settings.weeklyBudget !== undefined ? `Presupuesto ${formatMoney(settings.weeklyBudget)}` : undefined} tone={settings.weeklyBudget !== undefined ? (weekTotals.cost <= settings.weeklyBudget ? 'ok' : 'danger') : undefined} />
            <Stat label="Comidas planificadas" value={weekTotals.meals} />
            <Stat label="Preparadas" value={`${weekTotals.meals - weekTotals.pending} / ${weekTotals.meals}`} />
            <Stat label="Tiempo de cocina" value={`${formatNumber(weekTotals.minutes / 60, 1)} h`} />
          </Card>
          <div className="no-print flex flex-wrap gap-2">
            <Button size="sm" icon="copy" onClick={() => setCopyWeekOpen(true)} disabled={sorted.length === 0}>Copiar semana</Button>
            <Button size="sm" icon="trash" variant="ghost" onClick={clearWeek} disabled={sorted.length === 0}>Vaciar semana</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {days.map((d) => {
              const dayEntries = sorted.filter((e) => e.date === d);
              const t = dayTotals(dayEntries, summaries);
              const isToday = d === today();
              return (
                <Card key={d} className={`flex flex-col ${isToday ? 'ring-2 ring-brand' : ''}`}>
                  <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                    <button type="button" className="text-left" onClick={() => go({ fecha: d, vista: 'dia' })}>
                      <div className="font-semibold">
                        {formatWeekdayShort(d)} {formatDayMonth(d)} {isToday && <Badge tone="brand">Hoy</Badge>}
                      </div>
                      <div className="tabular text-xs text-muted">
                        {t.meals ? `${t.costComplete ? '' : '≥ '}${formatMoney(t.cost)}` : 'Sin comidas'}
                        {t.meals > 0 && (t.kcal !== null ? ` · ${formatNumber(t.kcal, 0)} kcal/pers.` : ' · kcal: datos incompletos')}
                      </div>
                    </button>
                    <IconButton icon="dots" label={`Opciones del ${formatLongDate(d)}`} onClick={() => setDayMenu(d)} />
                  </div>
                  <div className="grid gap-2 p-3">
                    {slots.filter((slot) => dayEntries.some((e) => e.slot === slot)).map((slot) => {
                      const slotEntries = dayEntries.filter((e) => e.slot === slot);
                      return (
                        <div key={slot}>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-semibold tracking-wide text-muted uppercase">{SLOT_LABEL[slot]}</span>
                            <button type="button" aria-label={`Añadir a ${SLOT_LABEL[slot]} del ${formatLongDate(d)}`} onClick={() => setAdding({ date: d, slot })} className="no-print flex h-9 w-9 items-center justify-center rounded-lg text-brand hover:bg-soft">
                              <Icon name="plus" size={18} />
                            </button>
                          </div>
                          <div className="grid gap-1.5">
                            {slotEntries.map((e) => (
                              <MealCard key={e.id} compact entry={e} recipe={recipeMap.get(e.recipeId)} summary={summaries.get(e.id)} onOpen={() => setOpenEntry(e)} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {/* Franjas vacías: botones compactos para no alargar la vista en el móvil */}
                    <div className="no-print flex flex-wrap gap-1.5">
                      {slots.filter((slot) => !dayEntries.some((e) => e.slot === slot)).map((slot) => (
                        <button key={slot} type="button" aria-label={`Añadir a ${SLOT_LABEL[slot]} del ${formatLongDate(d)}`} onClick={() => setAdding({ date: d, slot })} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-line px-3 text-xs font-medium text-muted hover:border-brand hover:text-brand">
                          <Icon name="plus" size={14} /> {SLOT_LABEL[slot]}
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <DayView
          entries={sorted.filter((e) => e.date === date)}
          summaries={summaries}
          slots={slots}
          onOpen={setOpenEntry}
          onAdd={(slot) => setAdding({ date, slot })}
          onMenu={() => setDayMenu(date)}
        />
      )}

      <QuickAccess />

      <MealDialog entry={liveOpenEntry} recipe={openRecipe} recipes={recipes} products={products} pantry={pantry} weekEntries={sorted} onClose={() => setOpenEntry(null)} />
      <AddMealDialog target={adding} onClose={() => setAdding(null)} defaultServings={settings.people} />
      <DayMenuDialog date={dayMenu} entries={sorted.filter((e) => e.date === dayMenu)} onClose={() => setDayMenu(null)} onView={(d) => go({ fecha: d, vista: 'dia' })} />
      <CopyWeekDialog open={copyWeekOpen} weekStart={weekStart} onClose={() => setCopyWeekOpen(false)} />
      <AddDraftDialog
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={`Lista de la compra · ${view === 'semana' ? formatWeekRange(weekStart) : formatLongDate(date)}`}
        mode="replace-plan"
        defaultListName={`Compra ${formatWeekRange(weekStart)}`}
        load={(o) => (view === 'semana' ? previewFromPlan(weekStart, weekEnd, o) : previewFromPlan(date, date, o))}
      />
      {sorted.length === 0 && recipes.length === 0 && (
        <Notice tone="brand">
          Para empezar, crea recetas en <Link className="font-semibold underline" to="/recetas/nueva">Recetas</Link> o carga los ejemplos desde <Link className="font-semibold underline" to="/ajustes">Ajustes</Link>.
        </Notice>
      )}
    </div>
  );
}

function DayView({ entries, summaries, slots, onOpen, onAdd, onMenu }: { entries: MealEntry[]; summaries: Map<string, RecipeSummary>; slots: MealSlot[]; onOpen: (e: MealEntry) => void; onAdd: (s: MealSlot) => void; onMenu: () => void }) {
  const t = dayTotals(entries, summaries);
  const recipes = useRecipeMap();
  const products = useProductMap();
  const pantry = usePantry() ?? [];
  const missing = useMemo(() => {
    const reqs = aggregateRequirements(entries.filter((e) => !e.prepared), recipes, products);
    return subtractPantry(reqs, pantry, products).filter((r) => r.toBuy > 0);
  }, [entries, recipes, products, pantry]);
  const extraSlots = MEAL_SLOTS.filter((s) => !slots.includes(s) && entries.some((e) => e.slot === s));

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="grid content-start gap-3">
        {[...slots, ...extraSlots].sort((a, b) => MEAL_SLOTS.indexOf(a) - MEAL_SLOTS.indexOf(b)).map((slot) => {
          const list = entries.filter((e) => e.slot === slot);
          return (
            <Card key={slot} className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">{SLOT_LABEL[slot]}</h2>
                <Button size="sm" icon="plus" variant="soft" onClick={() => onAdd(slot)}>Añadir</Button>
              </div>
              {list.length === 0 ? <p className="text-sm text-muted">Nada planificado.</p> : <div className="grid gap-2">{list.map((e) => <MealCard key={e.id} entry={e} recipe={recipes.get(e.recipeId)} summary={summaries.get(e.id)} onOpen={() => onOpen(e)} />)}</div>}
            </Card>
          );
        })}
      </div>
      <div className="grid content-start gap-3">
        <Card className="grid gap-2 p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Resumen del día</h2>
            <IconButton icon="dots" label="Opciones del día" onClick={onMenu} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Coste estimado" value={<>{t.costComplete ? '' : '≥ '}{formatMoney(t.cost)}</>} hint={t.costComplete ? undefined : 'faltan precios'} />
            <Stat label="Tiempo de preparación" value={`${t.minutes} min`} />
            <Stat label="Pendientes de preparar" value={`${t.pending} de ${t.meals}`} />
            <Stat label="Calorías (por persona)" value={t.kcal !== null ? `${formatNumber(t.kcal, 0)} kcal` : '—'} hint={t.kcal === null && t.meals > 0 ? 'datos incompletos' : undefined} />
          </div>
          {t.nutrition ? (
            <p className="tabular text-sm">Proteínas {formatNumber(t.nutrition.protein, 1)} g · Hidratos {formatNumber(t.nutrition.carbs, 1)} g · Grasas {formatNumber(t.nutrition.fat, 1)} g</p>
          ) : (
            t.meals > 0 && <p className="text-xs text-muted">Para ver los macronutrientes, completa la nutrición de todos los ingredientes en «Productos y precios». No se estiman datos que faltan.</p>
          )}
        </Card>
        <Card className="p-3">
          <h2 className="mb-2 font-semibold">Ingredientes que faltan</h2>
          {entries.length === 0 ? (
            <p className="text-sm text-muted">Sin comidas planificadas.</p>
          ) : missing.length === 0 ? (
            <p className="text-sm text-ok">Tienes todo lo necesario para las comidas pendientes.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {missing.map((m) => (
                <li key={m.key} className="flex justify-between gap-2">
                  <span>{products.get(m.productId)?.name}</span>
                  <span className="tabular text-muted">{formatQty(m.toBuy, m.unit)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function AddMealDialog({ target, onClose, defaultServings }: { target: { date: string; slot: MealSlot } | null; onClose: () => void; defaultServings: number }) {
  const recipes = useRecipes() ?? [];
  const products = useProductMap();
  const [servings, setServings] = useState(defaultServings);
  const { toast, error } = useFeedback();
  const navigate = useNavigate();
  if (!target) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>;
  return (
    <Dialog open={!!target} onClose={onClose} title={`${SLOT_LABEL[target.slot]} · ${formatLongDate(target.date)}`}>
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Comensales / raciones</span>
          <Stepper label="raciones" value={servings} onChange={setServings} />
        </div>
        <Button icon="plus" variant="soft" onClick={() => navigate(`/recetas/nueva?fecha=${target.date}&franja=${target.slot}`)}>Crear receta nueva para esta comida</Button>
        {recipes.length === 0 ? (
          <p className="text-sm text-muted">Aún no tienes recetas.</p>
        ) : (
          <RecipePicker
            recipes={recipes}
            products={products}
            slot={target.slot}
            onPick={async (r) => {
              try {
                await addMeal(target.date, target.slot, r.id, servings);
                toast(`«${r.name}» añadida`);
                onClose();
              } catch (e) {
                error(e);
              }
            }}
          />
        )}
      </div>
    </Dialog>
  );
}

function DayMenuDialog({ date, entries, onClose, onView }: { date: string | null; entries: MealEntry[]; onClose: () => void; onView: (d: string) => void }) {
  const [mode, setMode] = useState<'menu' | 'copy' | 'swap'>('menu');
  const [target, setTarget] = useState('');
  const { toast, error, confirm } = useFeedback();
  if (!date) return <Dialog open={false} onClose={onClose} title="">{null}</Dialog>;
  const close = () => {
    setMode('menu');
    setTarget('');
    onClose();
  };

  const copy = async (replace: boolean) => {
    try {
      const res = await copyDays(date, target, 1, replace ? 'replace' : 'append');
      toast(`${res.created} comida(s) copiada(s) al ${formatLongDate(target).toLowerCase()}`, { action: { label: 'Deshacer', onClick: async () => { await db.mealEntries.where('date').equals(target).delete(); await restoreMeals(res.removed); } } });
      close();
    } catch (e) {
      error(e);
    }
  };

  const doCopy = async () => {
    const existing = await db.mealEntries.where('date').equals(target).count();
    if (existing > 0) {
      const replace = await confirm({ title: 'El día de destino ya tiene comidas', message: `Tiene ${existing} comida(s). ¿Quieres sustituirlas? (Cancelar = no copiar)`, confirmLabel: 'Sustituir' });
      if (!replace) return;
      return copy(true);
    }
    return copy(false);
  };

  const clearDay = async () => {
    const ok = await confirm({ title: 'Vaciar el día', message: `Se quitarán ${entries.length} comida(s).`, confirmLabel: 'Vaciar', danger: true });
    if (!ok) return;
    await db.mealEntries.bulkDelete(entries.map((e) => e.id));
    toast('Día vaciado', { action: { label: 'Deshacer', onClick: () => restoreMeals(entries) } });
    close();
  };

  return (
    <Dialog open={!!date} onClose={close} title={formatLongDate(date)}>
      {mode === 'menu' && (
        <div className="grid gap-2">
          <Button icon="calendar" onClick={() => { onView(date); close(); }}>Ver el día</Button>
          <Button icon="copy" disabled={entries.length === 0} onClick={() => { setTarget(addDays(date, 1)); setMode('copy'); }}>Copiar el menú a otro día</Button>
          <Button icon="swap" onClick={() => { setTarget(addDays(date, 1)); setMode('swap'); }}>Intercambiar con otro día</Button>
          <Button icon="trash" variant="ghost" className="text-danger" disabled={entries.length === 0} onClick={clearDay}>Vaciar el día</Button>
        </div>
      )}
      {mode !== 'menu' && (
        <div className="grid gap-3">
          <TextInput label={mode === 'copy' ? 'Copiar a' : 'Intercambiar con'} type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Button
            variant="primary"
            disabled={!isISODate(target) || target === date}
            onClick={async () => {
              if (mode === 'copy') return doCopy();
              try {
                await swapDays(date, target);
                toast('Días intercambiados', { action: { label: 'Deshacer', onClick: () => swapDays(date, target) } });
                close();
              } catch (e) {
                error(e);
              }
            }}
          >
            {mode === 'copy' ? 'Copiar' : 'Intercambiar'}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function CopyWeekDialog({ open, weekStart, onClose }: { open: boolean; weekStart: string; onClose: () => void }) {
  const [target, setTarget] = useState(addDays(weekStart, 7));
  const { toast, error, confirm } = useFeedback();
  const submit = async () => {
    const to = startOfWeek(target);
    if (to === weekStart) return error(new Error('Elige una semana distinta'));
    try {
      const existing = await db.mealEntries.where('date').between(to, addDays(to, 6), true, true).count();
      let mode: 'replace' | 'append' = 'append';
      if (existing > 0) {
        const ok = await confirm({ title: 'La semana de destino ya tiene comidas', message: `Tiene ${existing} comida(s) planificadas. Se sustituirán por las de esta semana.`, confirmLabel: 'Sustituir' });
        if (!ok) return;
        mode = 'replace';
      }
      const res = await copyDays(weekStart, to, 7, mode);
      toast(`${res.created} comidas copiadas a la semana del ${formatWeekRange(to)}`, {
        action: { label: 'Deshacer', onClick: async () => { await db.mealEntries.where('date').between(to, addDays(to, 6), true, true).delete(); await restoreMeals(res.removed); } },
      });
      onClose();
    } catch (e) {
      error(e);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Copiar semana" footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={submit}>Copiar</Button></>}>
      <TextInput label="Cualquier día de la semana de destino" type="date" value={target} onChange={(e) => setTarget(e.target.value)} hint={isISODate(target) ? `Semana del ${formatWeekRange(startOfWeek(target))}` : undefined} />
    </Dialog>
  );
}

function QuickAccess() {
  const data = useLiveQuery(async () => {
    const lists = await db.shoppingLists.where('status').equals('activa').toArray();
    const items = await db.shoppingItems.where('listId').anyOf(lists.map((l) => l.id)).toArray();
    const s = summarizeList(items);
    return { recipes: await db.recipes.count(), pantry: await db.pantry.count(), pending: s.pendingCount, pendingAmount: s.pendingAmount };
  }, []);
  if (!data) return null;
  const tiles = [
    { to: '/recetas', icon: 'book' as const, title: 'Recetas', text: `${data.recipes} en tu biblioteca` },
    { to: '/compra', icon: 'cart' as const, title: 'Lista de la compra', text: data.pending ? `${data.pending} pendientes · ${formatMoney(data.pendingAmount)} est.` : 'Nada pendiente' },
    { to: '/despensa', icon: 'box' as const, title: 'Despensa', text: `${data.pantry} productos en casa` },
  ];
  return (
    <section className="no-print">
      <h2 className="mb-2 text-sm font-semibold text-muted">Accesos rápidos</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-card p-3 hover:shadow-sm">
            <span className="rounded-xl bg-soft p-2 text-brand"><Icon name={t.icon} /></span>
            <span className="min-w-0">
              <span className="block font-semibold">{t.title}</span>
              <span className="tabular block truncate text-xs text-muted">{t.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
