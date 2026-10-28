import { useEffect, useId, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../db/db';
import { saveRecipe } from '../../db/catalog';
import { addMeal } from '../../db/planner';
import { ValidationError } from '../../db/common';
import { MEAL_SLOTS, type Difficulty, type MealSlot, type Recipe, type RecipeOrigin, type Unit } from '../../domain/types';
import { parseDecimal } from '../../domain/format';
import { UNIT_OPTIONS } from '../../domain/units';
import { SLOT_LABEL } from '../../domain/labels';
import { isISODate } from '../../domain/dates';
import { useCategories, useProductMap, useSettings } from '../../hooks/data';
import { Button, Card, Checkbox, Loading, NumberInput, Notice, PageHeader, Select, TextArea, TextInput, IconButton } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';
import { resizeImage } from '../../ui/image';
import { ProductPicker } from '../products/ProductPicker';
import { RecipePhoto } from './RecipeBits';

interface IngRow {
  key: string;
  productId?: string;
  quantity: string;
  unit: Unit;
  note: string;
  optional: boolean;
}

interface Form {
  name: string;
  description: string;
  photo?: string;
  category: string;
  mealTypes: MealSlot[];
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  difficulty: Difficulty;
  ingredients: IngRow[];
  steps: string;
  utensils: string;
  tags: string;
  favorite: boolean;
  origin: RecipeOrigin;
}

let rowSeq = 0;
const newRow = (p?: Partial<IngRow>): IngRow => ({ key: `r${++rowSeq}`, quantity: '', unit: 'g', note: '', optional: false, ...p });

function fromRecipe(r: Recipe): Form {
  return {
    name: r.name,
    description: r.description ?? '',
    photo: r.photo,
    category: r.category,
    mealTypes: r.mealTypes,
    servings: String(r.servings),
    prepMinutes: String(r.prepMinutes),
    cookMinutes: String(r.cookMinutes),
    difficulty: r.difficulty,
    ingredients: r.ingredients.map((i) => newRow({ productId: i.productId, quantity: String(i.quantity).replace('.', ','), unit: i.unit, note: i.note ?? '', optional: !!i.optional })),
    steps: r.steps.join('\n'),
    utensils: r.utensils.join(', '),
    tags: r.tags.join(', '),
    favorite: r.favorite,
    origin: r.origin,
  };
}

const emptyForm = (servings: number): Form => ({
  name: '',
  description: '',
  category: '',
  mealTypes: [],
  servings: String(servings),
  prepMinutes: '10',
  cookMinutes: '0',
  difficulty: 'facil',
  ingredients: [newRow()],
  steps: '',
  utensils: '',
  tags: '',
  favorite: false,
  origin: 'manual',
});

export function RecipeFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const products = useProductMap();
  const categories = useCategories('recipe');
  const { toast, error } = useFeedback();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const catList = useId();

  const planDate = params.get('fecha');
  const planSlot = params.get('franja') as MealSlot | null;
  const proposal = params.get('propuesta');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (id) {
        const r = await db.recipes.get(id);
        if (cancelled) return;
        if (r) setForm(fromRecipe(r));
        else setNotFound(true);
        return;
      }
      const f = emptyForm(settings.people);
      if (planSlot && MEAL_SLOTS.includes(planSlot)) f.mealTypes = [planSlot];
      if (proposal) {
        // Propuesta automática a partir de ingredientes de la despensa: se marca como tal.
        const ids = proposal.split(',').filter(Boolean);
        const lots = await db.pantry.where('productId').anyOf(ids).toArray();
        f.ingredients = ids.map((pid) => {
          const lot = lots.find((l) => l.productId === pid);
          return newRow({ productId: pid, quantity: lot ? String(lot.quantity).replace('.', ',') : '', unit: lot?.unit ?? 'g' });
        });
        f.origin = 'propuesta';
        f.name = 'Propuesta con ' + ids.map((pid) => (products.get(pid)?.name ?? '').toLowerCase()).filter(Boolean).slice(0, 3).join(', ');
        f.tags = 'aprovechamiento';
      }
      if (!cancelled) setForm(f);
    })();
    return () => {
      cancelled = true;
    };
    // `products` solo se usa para el nombre inicial de la propuesta.
  }, [id, proposal, planSlot, settings.people, products.size > 0]);

  if (notFound) return <Notice tone="danger">La receta no existe o se ha eliminado.</Notice>;
  if (form === null) return <Loading />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setRow = (key: string, patch: Partial<IngRow>) => setForm((f) => (f ? { ...f, ingredients: f.ingredients.map((r) => (r.key === key ? { ...r, ...patch } : r)) } : f));

  const onPhoto = async (file?: File) => {
    if (!file) return;
    try {
      set('photo', await resizeImage(file));
    } catch (e) {
      error(e);
    }
  };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'El nombre es obligatorio';
    const servings = parseDecimal(form.servings);
    if (servings === null || !Number.isInteger(servings) || servings < 1) errs.servings = 'Número entero de 1 o más';
    const prep = parseDecimal(form.prepMinutes || '0');
    const cook = parseDecimal(form.cookMinutes || '0');
    if (prep === null || prep < 0) errs.prepMinutes = 'Minutos no válidos';
    if (cook === null || cook < 0) errs.cookMinutes = 'Minutos no válidos';
    const rows = form.ingredients.filter((r) => r.productId || r.quantity.trim());
    if (rows.length === 0) errs.ingredients = 'Añade al menos un ingrediente';
    const ingredients = rows.map((r) => {
      const q = parseDecimal(r.quantity);
      if (!r.productId) errs[`ing.${r.key}.product`] = 'Elige un producto';
      if (q === null || q <= 0) errs[`ing.${r.key}.qty`] = 'Cantidad mayor que 0';
      return { productId: r.productId ?? '', quantity: q ?? 0, unit: r.unit, note: r.note.trim() || undefined, optional: r.optional || undefined };
    });
    setErrors(errs);
    if (Object.keys(errs).length) {
      error(new ValidationError('Revisa los campos marcados en rojo'));
      return;
    }
    setSaving(true);
    try {
      const saved = await saveRecipe({
        id,
        name: form.name,
        description: form.description.trim() || undefined,
        photo: form.photo,
        category: form.category.trim(),
        mealTypes: form.mealTypes,
        servings: servings!,
        prepMinutes: Math.round(prep!),
        cookMinutes: Math.round(cook!),
        difficulty: form.difficulty,
        ingredients,
        steps: form.steps.split('\n'),
        utensils: form.utensils.split(','),
        tags: form.tags.split(','),
        favorite: form.favorite,
        origin: form.origin === 'propuesta' && reviewed ? 'manual' : form.origin,
      });
      if (planDate && isISODate(planDate) && planSlot && MEAL_SLOTS.includes(planSlot)) {
        await addMeal(planDate, planSlot, saved.id, settings.people);
        toast('Receta creada y añadida al plan');
        navigate(`/?fecha=${planDate}`);
      } else {
        toast(id ? 'Receta guardada' : 'Receta creada');
        navigate(`/recetas/${saved.id}`, { replace: true });
      }
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.fields);
      error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <PageHeader
        title={id ? 'Editar receta' : 'Nueva receta'}
        subtitle={planDate ? 'Se añadirá al plan al guardarla' : undefined}
        actions={
          <>
            <Button onClick={() => navigate(-1)}>Cancelar</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      />
      {form.origin === 'propuesta' && (
        <div className="mb-4">
          <Notice>
            Esta receta es una <strong>propuesta automática</strong> creada a partir de ingredientes de tu despensa. Las cantidades son las que tienes en casa, no una receta probada: revísalas, añade los pasos y márcala como revisada cuando la hayas comprobado.
            <Checkbox label="La he revisado: guardarla como receta verificada" checked={reviewed} onChange={setReviewed} />
          </Notice>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-4">
          <Card className="grid gap-3 p-4 sm:grid-cols-2">
            <TextInput label="Nombre *" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} className="sm:col-span-2" />
            <TextArea label="Descripción" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} className="sm:col-span-2" />
            <TextInput label="Categoría" list={catList} placeholder="Ej.: Legumbres" value={form.category} onChange={(e) => set('category', e.target.value)} />
            <datalist id={catList}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
            <Select label="Dificultad" value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as Difficulty)}>
              <option value="facil">Fácil</option>
              <option value="media">Media</option>
              <option value="dificil">Difícil</option>
            </Select>
            <NumberInput label="Raciones *" value={form.servings} onChange={(e) => set('servings', e.target.value)} error={errors.servings} inputMode="numeric" />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Preparación" suffix="min" value={form.prepMinutes} onChange={(e) => set('prepMinutes', e.target.value)} error={errors.prepMinutes} inputMode="numeric" />
              <NumberInput label="Cocción" suffix="min" value={form.cookMinutes} onChange={(e) => set('cookMinutes', e.target.value)} error={errors.cookMinutes} inputMode="numeric" />
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">Adecuada para</legend>
              <div className="flex flex-wrap gap-2">
                {MEAL_SLOTS.map((s) => {
                  const on = form.mealTypes.includes(s);
                  return (
                    <button key={s} type="button" aria-pressed={on} onClick={() => set('mealTypes', on ? form.mealTypes.filter((x) => x !== s) : [...form.mealTypes, s])} className={`min-h-9 rounded-full border px-3 text-sm ${on ? 'border-brand bg-soft text-brand' : 'border-line text-muted'}`}>
                      {SLOT_LABEL[s]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-muted">Lo usa el generador de menús. Si no marcas ninguna, vale para cualquier comida.</p>
            </fieldset>
          </Card>

          <Card className="p-4">
            <h2 className="mb-1 font-semibold">Ingredientes *</h2>
            <p className="mb-3 text-xs text-muted">Cantidades para {form.servings || '?'} raciones. Se podrán adaptar a cualquier número de raciones.</p>
            {errors.ingredients && <p className="mb-2 text-sm text-danger" role="alert">{errors.ingredients}</p>}
            <div className="grid gap-3">
              {form.ingredients.map((row, idx) => (
                <div key={row.key} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-start">
                  <ProductPicker
                    label={`Ingrediente ${idx + 1}`}
                    value={row.productId}
                    error={errors[`ing.${row.key}.product`]}
                    onChange={(p) => setRow(row.key, { productId: p?.id, unit: p && !row.quantity ? (p.unit === 'g' || p.unit === 'ml' || p.unit === 'ud' ? p.unit : row.unit) : row.unit })}
                  />
                  <NumberInput label="Cantidad" value={row.quantity} onChange={(e) => setRow(row.key, { quantity: e.target.value })} error={errors[`ing.${row.key}.qty`]} />
                  <Select label="Unidad" value={row.unit} onChange={(e) => setRow(row.key, { unit: e.target.value as Unit })}>
                    {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </Select>
                  <div className="flex items-end justify-end sm:pt-6">
                    <IconButton icon="trash" label={`Quitar ingrediente ${idx + 1}`} onClick={() => set('ingredients', form.ingredients.filter((r) => r.key !== row.key))} />
                  </div>
                  <div className="grid gap-2 sm:col-span-4 sm:grid-cols-[2fr_1fr]">
                    <input aria-label="Nota del ingrediente" placeholder="Nota (ej.: picada fina)" className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm" value={row.note} onChange={(e) => setRow(row.key, { note: e.target.value })} />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={row.optional} onChange={(e) => setRow(row.key, { optional: e.target.checked })} /> Opcional (no cuenta en compra ni coste)</label>
                  </div>
                </div>
              ))}
            </div>
            <Button className="mt-3" icon="plus" onClick={() => set('ingredients', [...form.ingredients, newRow()])}>
              Añadir ingrediente
            </Button>
          </Card>

          <Card className="grid gap-3 p-4">
            <TextArea label="Pasos (uno por línea)" rows={7} value={form.steps} onChange={(e) => set('steps', e.target.value)} placeholder={'Pela y pica la cebolla.\nSofríe a fuego medio 5 minutos.\n…'} />
            <TextInput label="Utensilios (separados por comas)" value={form.utensils} onChange={(e) => set('utensils', e.target.value)} placeholder="Sartén, horno" />
            <TextInput label="Etiquetas (separadas por comas)" value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="vegetariana, rápida" />
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card className="overflow-hidden">
            <RecipePhoto recipe={{ photo: form.photo, name: form.name }} className="aspect-[4/3] w-full" />
            <div className="flex flex-wrap gap-2 p-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line px-4 font-medium">
                {form.photo ? 'Cambiar foto' : 'Añadir foto'}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
              </label>
              {form.photo && <Button variant="ghost" onClick={() => set('photo', undefined)}>Quitar</Button>}
            </div>
          </Card>
          <Card className="p-3">
            <Checkbox label="Favorita" checked={form.favorite} onChange={(v) => set('favorite', v)} />
          </Card>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2 lg:hidden">
        <Button variant="primary" type="submit" disabled={saving} className="w-full">
          {saving ? 'Guardando…' : 'Guardar receta'}
        </Button>
      </div>
    </form>
  );
}
