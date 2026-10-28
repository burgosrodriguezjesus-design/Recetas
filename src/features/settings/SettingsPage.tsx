import { useEffect, useState } from 'react';
import { saveSettings } from '../../db/catalog';
import { eraseAllData, exportBackup, markBackupDone, parseBackup, restoreBackup } from '../../db/backup';
import { loadSampleData } from '../../db/sampleData';
import { requestPersistentStorage } from '../../db/db';
import { useSettings } from '../../hooks/data';
import { MEAL_SLOTS, type ThemePref } from '../../domain/types';
import { SLOT_LABEL } from '../../domain/labels';
import { formatNumber, parseDecimal } from '../../domain/format';
import { formatShortDate, today } from '../../domain/dates';
import { Button, Card, Notice, NumberInput, PageHeader, Segmented, Stepper } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';
import { downloadFile } from '../../ui/share';

const TABLE_LABEL: Record<string, string> = {
  products: 'productos', recipes: 'recetas', mealEntries: 'comidas planificadas', pantry: 'lotes en despensa', shoppingLists: 'listas',
  shoppingItems: 'productos en listas', purchases: 'compras', priceRecords: 'precios', consumption: 'consumos', settings: 'ajustes',
};

export function SettingsPage() {
  const settings = useSettings();
  const { toast, error, confirm } = useFeedback();
  const [weekly, setWeekly] = useState('');
  const [monthly, setMonthly] = useState('');
  const [storage, setStorage] = useState<{ persisted: boolean | null; usage?: number; quota?: number }>({ persisted: null });

  useEffect(() => {
    setWeekly(settings.weeklyBudget !== undefined ? String(settings.weeklyBudget).replace('.', ',') : '');
    setMonthly(settings.monthlyBudget !== undefined ? String(settings.monthlyBudget).replace('.', ',') : '');
  }, [settings.weeklyBudget, settings.monthlyBudget]);

  useEffect(() => {
    (async () => {
      const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => null) : null;
      const est = navigator.storage?.estimate ? await navigator.storage.estimate().catch(() => undefined) : undefined;
      setStorage({ persisted, usage: est?.usage, quota: est?.quota });
    })();
  }, []);

  const save = async (patch: Parameters<typeof saveSettings>[0], msg = 'Ajustes guardados') => {
    try {
      await saveSettings(patch);
      toast(msg);
    } catch (e) {
      error(e);
    }
  };

  const saveBudgets = () => {
    const w = weekly.trim() ? parseDecimal(weekly) : undefined;
    const m = monthly.trim() ? parseDecimal(monthly) : undefined;
    if (w === null || m === null || (w !== undefined && w < 0) || (m !== undefined && m < 0)) return error(new Error('Los presupuestos deben ser importes válidos'));
    void save({ weeklyBudget: w, monthlyBudget: m }, 'Presupuestos guardados');
  };

  const doExport = async () => {
    try {
      const backup = await exportBackup();
      downloadFile(`mi-cocina-copia-${today()}.json`, JSON.stringify(backup, null, 1), 'application/json');
      await markBackupDone();
      toast('Copia de seguridad descargada');
    } catch (e) {
      error(e);
    }
  };

  const doImport = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const { backup, counts } = parseBackup(text);
      const summary = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${TABLE_LABEL[k] ?? k}`).join(', ');
      const ok = await confirm({
        title: 'Restaurar copia de seguridad',
        message: <>La copia del {formatShortDate(backup.exportedAt)} contiene: {summary || 'nada'}.<br /><strong>Sustituirá todos tus datos actuales.</strong> Te recomendamos exportar antes una copia de lo que tienes ahora.</>,
        confirmLabel: 'Sustituir mis datos',
        danger: true,
      });
      if (!ok) return;
      await restoreBackup(backup);
      toast('Copia restaurada correctamente');
    } catch (e) {
      error(e);
    }
  };

  const doSample = async () => {
    try {
      const r = await loadSampleData();
      toast(`Ejemplos cargados: ${r.recipes} recetas y ${r.products} productos`);
    } catch (e) {
      error(e);
    }
  };

  const doErase = async () => {
    const ok = await confirm({ title: '¿Borrar todos los datos?', message: 'Se eliminarán recetas, plan, listas, despensa, compras y ajustes de este dispositivo. No se puede deshacer.', confirmLabel: 'Continuar', danger: true });
    if (!ok) return;
    const ok2 = await confirm({ title: 'Confirmación final', message: '¿Seguro? Si no tienes una copia de seguridad, los datos se perderán definitivamente.', confirmLabel: 'Borrar todo', danger: true });
    if (!ok2) return;
    await eraseAllData();
    toast('Todos los datos se han borrado');
  };

  const persist = async () => {
    const r = await requestPersistentStorage();
    setStorage((s) => ({ ...s, persisted: r }));
    toast(r ? 'Almacenamiento persistente concedido' : 'El navegador no lo ha concedido. Instalar la app en la pantalla de inicio ayuda.', { type: r ? 'ok' : 'info' });
  };

  const mb = (n?: number) => (n === undefined ? '—' : `${formatNumber(n / 1024 / 1024, 1)} MB`);

  return (
    <div className="grid gap-4">
      <PageHeader title="Ajustes" />

      <Card className="grid gap-4 p-4">
        <h2 className="font-semibold">Hogar y presupuesto</h2>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Comensales por defecto</span>
          <Stepper label="comensales" value={settings.people} onChange={(v) => save({ people: v })} max={50} />
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <NumberInput label="Presupuesto semanal" suffix="€" value={weekly} onChange={(e) => setWeekly(e.target.value)} />
          <NumberInput label="Presupuesto mensual" suffix="€" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          <Button variant="primary" onClick={saveBudgets}>Guardar</Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Avisar de caducidad con (días)</span>
          <Stepper label="días de aviso" value={settings.expiryWarningDays} onChange={(v) => save({ expiryWarningDays: v })} min={0} max={30} />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Comidas que se muestran en el planificador</legend>
          <div className="flex flex-wrap gap-2">
            {MEAL_SLOTS.map((s) => {
              const on = settings.enabledSlots.includes(s);
              return (
                <button key={s} type="button" aria-pressed={on} onClick={() => {
                  const next = on ? settings.enabledSlots.filter((x) => x !== s) : [...settings.enabledSlots, s];
                  if (next.length === 0) return error(new Error('Debe quedar al menos una comida'));
                  void save({ enabledSlots: MEAL_SLOTS.filter((x) => next.includes(x)) });
                }} className={`min-h-9 rounded-full border px-3 text-sm ${on ? 'border-brand bg-soft text-brand' : 'border-line text-muted'}`}>
                  {SLOT_LABEL[s]}
                </button>
              );
            })}
          </div>
        </fieldset>
      </Card>

      <Card className="grid gap-3 p-4">
        <h2 className="font-semibold">Apariencia</h2>
        <Segmented<ThemePref> label="Tema" value={settings.theme} onChange={(v) => save({ theme: v }, 'Tema actualizado')} options={[{ value: 'sistema', label: 'Automático' }, { value: 'claro', label: 'Claro' }, { value: 'oscuro', label: 'Oscuro' }]} />
      </Card>

      <Card className="grid gap-3 p-4">
        <h2 className="font-semibold">Tus datos</h2>
        <p className="text-sm text-muted">
          Todo se guarda solo en este dispositivo (no hay servidor ni cuenta). Exporta una copia periódicamente para no perder nada y para pasar tus datos a otro dispositivo.
          {settings.lastBackupAt ? ` Última copia: ${formatShortDate(settings.lastBackupAt)}.` : ' Aún no has hecho ninguna copia.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon="download" onClick={doExport}>Exportar copia (JSON)</Button>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-4 font-medium">
            Importar copia
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <div className="text-sm">
          Almacenamiento usado: {mb(storage.usage)}{storage.quota ? ` de ${mb(storage.quota)} disponibles` : ''}.{' '}
          {storage.persisted === true ? <span className="text-ok">Protegido frente a borrados automáticos.</span> : storage.persisted === false ? <button type="button" className="font-medium text-brand underline" onClick={persist}>Pedir almacenamiento persistente</button> : <span className="text-muted">El navegador no informa del estado de persistencia.</span>}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button onClick={doSample}>Cargar recetas de ejemplo</Button>
          <Button variant="ghost" className="text-danger" icon="trash" onClick={doErase}>Borrar todos los datos</Button>
        </div>
        <p className="text-xs text-muted">Los ejemplos llevan la etiqueta «ejemplo» y precios ilustrativos (indicado en cada producto). No incluyen datos nutricionales.</p>
      </Card>

      <Card className="grid gap-2 p-4">
        <h2 className="font-semibold">Instalar en el iPhone</h2>
        <ol className="list-decimal pl-5 text-sm">
          <li>Abre la app en <strong>Safari</strong>.</li>
          <li>Pulsa el botón <strong>Compartir</strong> (cuadrado con flecha).</li>
          <li>Elige <strong>«Añadir a pantalla de inicio»</strong>.</li>
        </ol>
        <Notice tone="brand">Instalada, se abre a pantalla completa y funciona sin conexión. Safari puede borrar los datos de webs no instaladas que no uses en 7 días; instalada en la pantalla de inicio no ocurre, aun así exporta copias de vez en cuando.</Notice>
      </Card>
    </div>
  );
}
