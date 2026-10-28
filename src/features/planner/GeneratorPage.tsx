import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../../db/db';
import { applyMenu, restoreMeals } from '../../db/planner';
import { useProductMap, usePantry, useRecipeMap, useRecipes, useSettings } from '../../hooks/data';
import { expiringProductIds, generateMenu, type GeneratorResult } from '../../domain/menuGenerator';
import { MEAL_SLOTS, type MealSlot } from '../../domain/types';
import { SLOT_LABEL } from '../../domain/labels';
import { formatLongDate, formatWeekRange, formatWeekdayShort, formatDayMonth, isISODate, startOfWeek, today, weekDays } from '../../domain/dates';
import { formatMoney, formatNumber, parseDecimal } from '../../domain/format';
import { Badge, Button, Card, Checkbox, Loading, Notice, NumberInput, PageHeader, Stepper, TextInput } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';

function Chips<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {options.length === 0 ? (
        <p className="text-xs text-muted">No hay opciones disponibles.</p>
      ) : (
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {options.map((o) => {
            const on = value.includes(o.id);
            return (
              <button key={o.id} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])} className={`min-h-9 rounded-full border px-3 text-sm ${on ? 'border-brand bg-soft text-brand' : 'border-line'}`}>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export function GeneratorPage() {
  const [params] = useSearchParams();
  const settings = useSettings();
  const recipes = useRecipes();
  const recipeMap = useRecipeMap();
  const products = useProductMap();
  const pantry = usePantry();
  const navigate = useNavigate();
  const { toast, error, confirm } = useFeedback();

  const initialWeek = isISODate(params.get('semana') ?? '') ? params.get('semana')! : startOfWeek(today());
  const [week, setWeek] = useState(initialWeek);
  const [people, setPeople] = useState<number | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [maxMinutes, setMaxMinutes] = useState('');
  const [slots, setSlots] = useState<MealSlot[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [disliked, setDisliked] = useState<string[] | null>(null);
  const [useFirst, setUseFirst] = useState<string[]>([]);
  const [preferPantry, setPreferPantry] = useState(true);
  const [kcal, setKcal] = useState('');
  const [seed, setSeed] = useState(1);
  const [result, setResult] = useState<GeneratorResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const p = people ?? settings.people;
  const b = budget ?? (settings.weeklyBudget !== undefined ? String(settings.weeklyBudget).replace('.', ',') : '');
  const sl = slots ?? settings.enabledSlots.filter((s) => s !== 'media_manana' && s !== 'merienda');
  const dis = disliked ?? settings.dislikedProductIds;

  const allTags = useMemo(() => [...new Set((recipes ?? []).flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'es')), [recipes]);
  const productOpts = useMemo(() => [...products.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((x) => ({ id: x.id, label: x.name })), [products]);
  const pantryOpts = useMemo(() => {
    const ids = new Set((pantry ?? []).map((x) => x.productId));
    return productOpts.filter((o) => ids.has(o.id));
  }, [pantry, productOpts]);

  if (!recipes || !pantry) return <Loading />;
  const verified = recipes.filter((r) => r.origin !== 'propuesta');

  const run = (s: number) => {
    setFormError(null);
    const bud = b.trim() ? parseDecimal(b) : undefined;
    const mm = maxMinutes.trim() ? parseDecimal(maxMinutes) : undefined;
    const kc = kcal.trim() ? parseDecimal(kcal) : undefined;
    if (bud === null || (bud !== undefined && bud <= 0)) return setFormError('El presupuesto debe ser un número mayor que 0.');
    if (mm === null || (mm !== undefined && mm <= 0)) return setFormError('El tiempo máximo debe ser un número de minutos.');
    if (kc === null || (kc !== undefined && kc <= 0)) return setFormError('El objetivo calórico debe ser un número.');
    if (sl.length === 0) return setFormError('Elige al menos una comida del día.');
    if (!isISODate(week)) return setFormError('Fecha de semana no válida.');
    const ws = startOfWeek(week);
    setResult(
      generateMenu(verified, products, pantry, {
        days: weekDays(ws),
        slots: MEAL_SLOTS.filter((x) => sl.includes(x)),
        people: p,
        weeklyBudget: bud,
        maxMinutes: mm,
        useFirstProductIds: useFirst,
        expiringProductIds: expiringProductIds(pantry, today(), settings.expiryWarningDays, products),
        excludedProductIds: dis,
        requiredTags: tags,
        dailyKcalTarget: kc,
        preferPantry,
        seed: s,
      }),
    );
  };

  const apply = async () => {
    if (!result) return;
    const ws = startOfWeek(week);
    const days = weekDays(ws);
    const existing = await db.mealEntries.where('date').anyOf(days).count();
    let replace = false;
    if (existing > 0) {
      replace = await confirm({
        title: 'La semana ya tiene comidas',
        message: `Hay ${existing} comida(s) planificadas en la semana del ${formatWeekRange(ws)}. Si continúas, se sustituirán por el menú generado (podrás deshacerlo).`,
        confirmLabel: 'Sustituir',
        danger: true,
      });
      if (!replace) return;
    }
    try {
      const removed = await applyMenu(result.meals, days, replace);
      toast('Menú aplicado al plan', {
        action: {
          label: 'Deshacer',
          onClick: async () => {
            await db.mealEntries.where('date').anyOf(days).delete();
            await restoreMeals(removed);
          },
        },
      });
      navigate(`/?fecha=${ws}`);
    } catch (e) {
      error(e);
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader title="Generar menú semanal" subtitle="Propuesta local a partir de tus recetas verificadas, tu despensa y tus preferencias." />
      {verified.length === 0 ? (
        <Notice>Necesitas recetas en tu biblioteca para generar un menú. Las propuestas automáticas sin revisar no se usan.</Notice>
      ) : (
        <Card className="grid gap-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput label="Semana (cualquier día)" type="date" value={week} onChange={(e) => setWeek(e.target.value)} hint={isISODate(week) ? formatWeekRange(startOfWeek(week)) : undefined} />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Personas</span>
              <Stepper label="personas" value={p} onChange={setPeople} />
            </div>
            <NumberInput label="Presupuesto semanal" suffix="€" value={b} onChange={(e) => setBudget(e.target.value)} hint="Opcional" />
            <NumberInput label="Tiempo máximo por receta" suffix="min" value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)} hint="Opcional" inputMode="numeric" />
          </div>
          <Chips label="Comidas del día a planificar" options={MEAL_SLOTS.map((s) => ({ id: s, label: SLOT_LABEL[s] }))} value={sl} onChange={(v) => setSlots(v)} />
          <Chips label="Preferencias (la receta debe tener todas estas etiquetas)" options={allTags.map((t) => ({ id: t, label: `#${t}` }))} value={tags} onChange={setTags} />
          <Chips label="Alimentos que no me gustan (se excluyen)" options={productOpts} value={dis} onChange={(v) => setDisliked(v)} />
          <Chips label="Ingredientes que quiero gastar primero" options={pantryOpts} value={useFirst} onChange={setUseFirst} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox label="Priorizar recetas con ingredientes que ya tengo" hint="Los productos próximos a caducar se priorizan siempre." checked={preferPantry} onChange={setPreferPantry} />
            <NumberInput label="Objetivo de calorías por persona y día" suffix="kcal" value={kcal} onChange={(e) => setKcal(e.target.value)} hint="Opcional. Solo se tiene en cuenta en recetas con datos nutricionales completos." inputMode="numeric" />
          </div>
          {formError && <Notice tone="danger">{formError}</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="primary" icon="sparkles" onClick={() => run(seed)}>Generar propuesta</Button>
          </div>
        </Card>
      )}

      {result && (
        <Card className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Propuesta</h2>
            <div className="flex flex-wrap gap-2">
              <Button icon="sparkles" onClick={() => { setSeed(seed + 1); run(seed + 1); }}>Otra propuesta</Button>
              <Button variant="primary" icon="check" onClick={apply} disabled={result.meals.length === 0}>Aplicar al plan</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="brand">Coste estimado: {result.costComplete ? '' : '≥ '}{formatMoney(result.estimatedTotal)}</Badge>
            {result.withinBudget !== null && <Badge tone={result.withinBudget ? 'ok' : 'danger'}>{result.withinBudget ? 'Dentro del presupuesto (estimado)' : 'Supera el presupuesto'}</Badge>}
            <Badge>{result.meals.length} comidas</Badge>
          </div>
          {result.notes.map((n, i) => <Notice key={i}>{n}</Notice>)}
          {result.unfilled.length > 0 && <Notice>Sin receta en {result.unfilled.length} franja(s): no hay recetas que cumplan los filtros.</Notice>}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {weekDays(startOfWeek(week)).map((d) => {
              const meals = result.meals.filter((m) => m.date === d);
              const nut = result.nutrition.find((n) => n.date === d);
              return (
                <div key={d} className="rounded-xl border border-line p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold">{formatWeekdayShort(d)} {formatDayMonth(d)}</span>
                    <span className="tabular text-xs text-muted">{nut?.kcalPerPerson != null ? `${formatNumber(nut.kcalPerPerson, 0)} kcal/pers. (est.)` : 'kcal: sin datos completos'}</span>
                  </div>
                  <ul className="grid gap-1 text-sm">
                    {meals.map((m, i) => (
                      <li key={i}>
                        <span className="text-xs text-muted">{SLOT_LABEL[m.slot]}: </span>
                        <span className="font-medium">{recipeMap.get(m.recipeId)?.name}</span>
                        {m.estimatedCost !== null && <span className="tabular text-xs text-muted"> · {formatMoney(m.estimatedCost)}</span>}
                        {m.reasons.length > 0 && <div className="text-xs text-ok">{m.reasons.join(' · ')}</div>}
                      </li>
                    ))}
                    {result.unfilled.filter((u) => u.date === d).map((u, i) => (
                      <li key={`u${i}`} className="text-xs text-warn">{SLOT_LABEL[u.slot]}: sin receta disponible</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted">Los costes y calorías son estimaciones a partir de tus datos. {formatLongDate(startOfWeek(week))} es el primer día.</p>
        </Card>
      )}
    </div>
  );
}
