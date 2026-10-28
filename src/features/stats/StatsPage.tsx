// Panel de estadísticas basado únicamente en datos guardados.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { useProductMap, useRecipeMap, useSettings } from '../../hooks/data';
import { consumedByProduct, perReferenceUnit, plannedCost, priceChanges, spendBy, topRecipes } from '../../domain/stats';
import { addDays, endOfMonth, formatDayMonth, startOfMonth, startOfWeek, today } from '../../domain/dates';
import { formatMoney, formatNumber, formatQty } from '../../domain/format';
import { UNITS } from '../../domain/units';
import { Badge, Card, Loading, Notice, PageHeader, Segmented, Stat } from '../../ui/kit';

interface Bar {
  key: string;
  label: string;
  value: number;
  planned?: number;
}

/** Gráfico de columnas de una serie con línea de presupuesto opcional y tooltip. */
function ColumnChart({ bars, budget, title }: { bars: Bar[]; budget?: number; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Dibujado a tamaño de móvil (≈ 1:1 en un iPhone) para que los textos sean legibles.
  const W = 360;
  const H = 200;
  const pad = { l: 40, r: 6, t: 18, b: 24 };
  const max = Math.max(1, budget ?? 0, ...bars.map((b) => b.value));
  const niceMax = Math.ceil(max / 10) * 10 || 10;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / niceMax);
  const slot = (W - pad.l - pad.r) / bars.length;
  const bw = Math.min(24, slot * 0.6);
  const ticks = [0, niceMax / 2, niceMax];
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-2xl" role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--c-line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--c-muted)">{formatNumber(t, 0)} €</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = pad.l + slot * i + (slot - bw) / 2;
          const top = y(b.value);
          const h = Math.max(0, y(0) - top);
          const r = Math.min(4, h);
          return (
            <g key={b.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && <path d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`} fill="var(--c-brand)" opacity={hover === null || hover === i ? 1 : 0.55} />}
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--c-muted)">{b.label}</text>
            </g>
          );
        })}
        {budget !== undefined && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(budget)} y2={y(budget)} stroke="var(--c-accent)" strokeWidth={2} />
            <text x={W - pad.r} y={y(budget) - 4} textAnchor="end" fontSize={11} fill="var(--c-ink)">Presupuesto {formatMoney(budget)}</text>
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="tabular pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 rounded-lg bg-ink px-3 py-1.5 text-xs text-bg shadow">
          {bars[hover].label}: <strong>{formatMoney(bars[hover].value)}</strong> gastado
          {bars[hover].planned !== undefined && ` · ${formatMoney(bars[hover].planned!)} previsto`}
        </div>
      )}
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-muted">Ver como tabla</summary>
        <table className="tabular mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted"><tr><th className="font-medium">Periodo</th><th className="font-medium">Gasto real</th>{bars.some((b) => b.planned !== undefined) && <th className="font-medium">Previsto (menú)</th>}</tr></thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key} className="border-t border-line"><td className="py-1">{b.label}</td><td>{formatMoney(b.value)}</td>{b.planned !== undefined && <td>{formatMoney(b.planned)}</td>}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function StatsPage() {
  const settings = useSettings();
  const products = useProductMap();
  const recipes = useRecipeMap();
  const [period, setPeriod] = useState<'semanas' | 'meses'>('semanas');
  const data = useLiveQuery(async () => {
    const from = addDays(today(), -365);
    const [purchases, meals, consumption, prices] = await Promise.all([
      db.purchases.where('date').aboveOrEqual(from).toArray(),
      db.mealEntries.where('date').aboveOrEqual(from).toArray(),
      db.consumption.where('date').aboveOrEqual(from).toArray(),
      db.priceRecords.toArray(),
    ]);
    return { purchases, meals, consumption, prices };
  }, []);

  const computed = useMemo(() => {
    if (!data) return null;
    const t = today();
    const ws = startOfWeek(t);
    const ms = startOfMonth(t);
    const byWeek = spendBy(data.purchases, 'week');
    const byMonth = spendBy(data.purchases, 'month');
    const inRange = (from: string, to: string) => data.meals.filter((m) => m.date >= from && m.date <= to);
    const weekPlan = plannedCost(inRange(ws, addDays(ws, 6)), recipes, products);
    const monthPlan = plannedCost(inRange(ms, endOfMonth(t)), recipes, products);
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(ws, -7 * (7 - i)));
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1 - (5 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const weekBars: Bar[] = weeks.map((w) => ({ key: w, label: formatDayMonth(w), value: byWeek.get(w) ?? 0, planned: plannedCost(inRange(w, addDays(w, 6)), recipes, products).total }));
    const monthBars: Bar[] = months.map((m) => ({
      key: m,
      label: new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1)).replace('.', ''),
      value: byMonth.get(m) ?? 0,
      planned: plannedCost(inRange(`${m}-01`, endOfMonth(`${m}-01`)), recipes, products).total,
    }));
    const pastWeeksWithSpend = weeks.slice(0, -1).filter((w) => byWeek.has(w));
    const budgetWeeksOk = settings.weeklyBudget !== undefined ? pastWeeksWithSpend.filter((w) => (byWeek.get(w) ?? 0) <= settings.weeklyBudget!).length : null;
    const last8 = inRange(weeks[0], addDays(ws, 6));
    const past = last8.filter((m) => m.date <= t);
    return {
      weekSpend: byWeek.get(ws) ?? 0,
      monthSpend: byMonth.get(t.slice(0, 7)) ?? 0,
      weekPlan,
      monthPlan,
      weekBars,
      monthBars,
      pastWeeksWithSpend: pastWeeksWithSpend.length,
      budgetWeeksOk,
      avg: plannedCost(last8, recipes, products),
      planned: past.length,
      prepared: past.filter((m) => m.prepared).length,
      top: topRecipes(data.meals, 5),
      consumed: consumedByProduct(data.consumption, products, ['cocinado', 'consumo']).slice(0, 6),
      wasted: consumedByProduct(data.consumption, products, ['desperdicio']),
      changes: priceChanges(data.prices),
    };
  }, [data, recipes, products, settings.weeklyBudget]);

  if (!computed) return <Loading />;
  const c = computed;
  const wasteTotal = c.wasted.reduce((s, w) => s + w.cost, 0);
  const ups = c.changes.filter((x) => x.pct > 0).slice(0, 5);
  const downs = c.changes.filter((x) => x.pct < 0).slice(0, 5);
  const diff = (real: number, budget?: number) => (budget === undefined ? undefined : budget - real);
  const wDiff = diff(c.weekSpend, settings.weeklyBudget);
  const mDiff = diff(c.monthSpend, settings.monthlyBudget);

  return (
    <div className="grid gap-4">
      <PageHeader title="Estadísticas" subtitle="Calculadas con tus compras registradas, tu plan y tus consumos." />

      <Card className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-4">
        <Stat label="Gasto real (semana)" value={formatMoney(c.weekSpend)} hint={wDiff !== undefined ? `${wDiff >= 0 ? 'quedan' : 'excede en'} ${formatMoney(Math.abs(wDiff))} de ${formatMoney(settings.weeklyBudget)}` : 'sin presupuesto semanal'} tone={wDiff === undefined ? undefined : wDiff >= 0 ? 'ok' : 'danger'} />
        <Stat label="Gasto real (mes)" value={formatMoney(c.monthSpend)} hint={mDiff !== undefined ? `${mDiff >= 0 ? 'quedan' : 'excede en'} ${formatMoney(Math.abs(mDiff))} de ${formatMoney(settings.monthlyBudget)}` : 'sin presupuesto mensual'} tone={mDiff === undefined ? undefined : mDiff >= 0 ? 'ok' : 'danger'} />
        <Stat label="Previsto (semana)" value={`${c.weekPlan.complete ? '' : '≥ '}${formatMoney(c.weekPlan.total)}`} hint={`Diferencia con lo gastado: ${formatMoney(c.weekSpend - c.weekPlan.total)}`} />
        <Stat label="Previsto (mes)" value={`${c.monthPlan.complete ? '' : '≥ '}${formatMoney(c.monthPlan.total)}`} hint="coste de ingredientes usados" />
      </Card>
      <Notice tone="brand">
        <strong>Gasto real</strong> = lo pagado en compras registradas (paquetes completos). <strong>Previsto</strong> = coste estimado de los ingredientes que usan tus menús. Es normal que difieran: un paquete de arroz cuenta entero el día que lo compras, pero en cada receta solo cuenta la parte usada.
      </Notice>

      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Evolución del gasto real</h2>
          <Segmented label="Periodo" value={period} onChange={setPeriod} options={[{ value: 'semanas', label: '8 semanas' }, { value: 'meses', label: '6 meses' }]} />
        </div>
        {period === 'semanas' ? (
          <ColumnChart title="Gasto real por semana" bars={c.weekBars} budget={settings.weeklyBudget} />
        ) : (
          <ColumnChart title="Gasto real por mes" bars={c.monthBars} budget={settings.monthlyBudget} />
        )}
        {c.budgetWeeksOk !== null && c.pastWeeksWithSpend > 0 && (
          <p className="mt-2 text-sm">Cumplimiento del presupuesto: <strong>{c.budgetWeeksOk} de {c.pastWeeksWithSpend}</strong> semanas con compras dentro del presupuesto.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="grid gap-2 p-4">
          <h2 className="font-semibold">Comidas (últimas 8 semanas)</h2>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Media por comida" value={c.avg.perMeal !== null ? formatMoney(c.avg.perMeal) : '—'} hint={c.avg.complete ? 'estimado' : 'parcial: faltan precios'} />
            <Stat label="Media por ración" value={c.avg.perServing !== null ? formatMoney(c.avg.perServing) : '—'} />
            <Stat label="Planificadas" value={c.planned} />
            <Stat label="Preparadas" value={c.planned ? `${c.prepared} (${Math.round((c.prepared / c.planned) * 100)} %)` : '0'} />
          </div>
          <h3 className="mt-2 text-sm font-semibold">Recetas más utilizadas</h3>
          {c.top.length === 0 ? <p className="text-sm text-muted">Aún no hay comidas planificadas.</p> : (
            <ol className="grid gap-1 text-sm">
              {c.top.map((t) => <li key={t.recipeId} className="flex justify-between gap-2"><span>{recipes.get(t.recipeId)?.name ?? 'Receta eliminada'}</span><span className="tabular text-muted">{t.count}×</span></li>)}
            </ol>
          )}
        </Card>

        <Card className="grid content-start gap-2 p-4">
          <h2 className="font-semibold">Ingredientes más consumidos</h2>
          {c.consumed.length === 0 ? <p className="text-sm text-muted">Se registran al marcar comidas como preparadas descontando la despensa, o al consumir desde la despensa.</p> : (
            <ul className="grid gap-1 text-sm">
              {c.consumed.map((x) => (
                <li key={x.productId} className="flex justify-between gap-2">
                  <span>{products.get(x.productId)?.name ?? '?'}</span>
                  <span className="tabular text-muted">{x.quantity !== null ? formatQty(x.quantity, x.unit) : 'varias unidades'} · {formatMoney(x.cost)}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-2 text-sm font-semibold">Alimentos desperdiciados</h3>
          {c.wasted.length === 0 ? <p className="text-sm text-muted">No hay desperdicios registrados.</p> : (
            <>
              <p className="text-sm">Valor estimado tirado: <strong className="tabular">{formatMoney(wasteTotal)}</strong></p>
              <ul className="grid gap-1 text-sm">
                {c.wasted.slice(0, 6).map((x) => <li key={x.productId} className="flex justify-between gap-2"><span>{products.get(x.productId)?.name ?? '?'}</span><span className="tabular text-muted">{x.quantity !== null ? formatQty(x.quantity, x.unit) : '—'} · {formatMoney(x.cost)}</span></li>)}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold">Variación de precios</h2>
        {c.changes.length === 0 ? (
          <p className="text-sm text-muted">Hace falta al menos dos precios registrados del mismo producto (al registrar compras o cambiar el precio de referencia).</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {[{ title: 'Más han subido', list: ups, tone: 'danger' as const }, { title: 'Más han bajado', list: downs, tone: 'ok' as const }].map((g) => (
              <div key={g.title}>
                <h3 className="mb-1 text-sm font-semibold">{g.title}</h3>
                {g.list.length === 0 ? <p className="text-sm text-muted">Ninguno.</p> : (
                  <ul className="grid gap-1 text-sm">
                    {g.list.map((x) => {
                      const prev = perReferenceUnit(x.previous, x.baseUnit);
                      const last = perReferenceUnit(x.last, x.baseUnit);
                      return (
                        <li key={x.productId} className="flex flex-wrap justify-between gap-2">
                          <span>{products.get(x.productId)?.name ?? '?'}</span>
                          <span className="tabular text-muted">
                            {formatMoney(prev.value)} → {formatMoney(last.value)}/{UNITS[last.unit].label} <Badge tone={g.tone}>{x.pct > 0 ? '+' : ''}{formatNumber(x.pct, 1)} %</Badge>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
