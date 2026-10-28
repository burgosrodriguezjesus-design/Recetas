import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseRecipeText } from '../../domain/importText';
import { parseDecimal } from '../../domain/format';
import { normalizeText, UNIT_OPTIONS, dimensionOf } from '../../domain/units';
import type { Product, Unit } from '../../domain/types';
import { findOrCreateProduct, saveRecipe } from '../../db/catalog';
import { useProducts, useSettings } from '../../hooks/data';
import { Badge, Button, Card, Notice, PageHeader, TextArea, TextInput } from '../../ui/kit';
import { useFeedback } from '../../ui/feedback';

const EXAMPLE = `Crema de calabacín
Suave y rápida.
Raciones: 4
Tiempo: 10 min de preparación, 25 min de cocción
Ingredientes:
- 800 g de calabacín
- 1 cebolla
- 2 cucharadas de aceite de oliva
- 500 ml de caldo de verduras
- sal al gusto
Preparación:
1. Pica la cebolla y el calabacín.
2. Rehoga la cebolla en el aceite 5 minutos.
3. Añade el calabacín y el caldo y cuece 20 minutos.
4. Tritura y rectifica de sal.`;

interface Row {
  include: boolean;
  name: string;
  quantity: string;
  unit: Unit;
  match?: Product;
}

const singular = (s: string) => s.replace(/(es|s)$/, '');

/** Busca un producto existente con el mismo nombre (tolerando plural y tildes). */
export function matchProduct(name: string, products: Product[]): Product | undefined {
  const n = normalizeText(name);
  return products.find((p) => normalizeText(p.name) === n) ?? products.find((p) => singular(normalizeText(p.name)) === singular(n));
}

export function ImportRecipePage() {
  const products = useProducts() ?? [];
  const settings = useSettings();
  const navigate = useNavigate();
  const { toast, error } = useFeedback();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseRecipeText> | null>(null);
  const [name, setName] = useState('');
  const [servings, setServings] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const analyze = () => {
    const r = parseRecipeText(text);
    setParsed(r);
    setName(r.name);
    setServings(String(r.servings ?? settings.people));
    setRows(
      r.ingredients.map((i) => ({
        include: i.quantity !== null,
        name: i.name,
        quantity: i.quantity === null ? '' : String(i.quantity).replace('.', ','),
        unit: i.unit ?? 'ud',
        match: matchProduct(i.name, products),
      })),
    );
  };

  const save = async () => {
    if (!parsed) return;
    const s = parseDecimal(servings);
    if (!name.trim()) return error(new Error('Falta el nombre de la receta'));
    if (s === null || s < 1 || !Number.isInteger(s)) return error(new Error('Las raciones deben ser un número entero'));
    const included = rows.filter((r) => r.include);
    const bad = included.find((r) => !r.name.trim() || !((parseDecimal(r.quantity) ?? 0) > 0));
    if (bad) return error(new Error(`Revisa el ingrediente «${bad.name || '(sin nombre)'}»: necesita nombre y cantidad, o desmárcalo.`));
    if (included.length === 0) return error(new Error('Incluye al menos un ingrediente'));
    setSaving(true);
    try {
      const ingredients = [];
      for (const r of included) {
        const p = r.match ?? (await findOrCreateProduct(r.name, r.unit));
        ingredients.push({ productId: p.id, quantity: parseDecimal(r.quantity)!, unit: r.unit });
      }
      const notIncluded = rows.filter((r) => !r.include).map((r) => r.name);
      const recipe = await saveRecipe({
        name: name.trim(),
        description: [parsed.description, notIncluded.length ? `Sin cantidad: ${notIncluded.join(', ')}.` : ''].filter(Boolean).join(' ') || undefined,
        category: '',
        mealTypes: [],
        servings: s,
        prepMinutes: parsed.prepMinutes ?? 0,
        cookMinutes: parsed.cookMinutes ?? 0,
        difficulty: 'facil',
        ingredients,
        steps: parsed.steps,
        utensils: [],
        tags: [],
        favorite: false,
        origin: 'importada',
      });
      toast('Receta importada. Revisa categoría y detalles.');
      navigate(`/recetas/${recipe.id}`);
    } catch (e) {
      error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <PageHeader title="Importar receta" subtitle="Pega el texto de una receta y revisa lo que se ha entendido antes de guardarla." />
      <Card className="grid gap-3 p-4">
        <TextArea label="Texto de la receta" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} hint='Primera línea: nombre. Después "Ingredientes:" (uno por línea) y "Preparación:" (un paso por línea).' />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={analyze} disabled={!text.trim()}>Analizar texto</Button>
          <Button variant="ghost" onClick={() => setText(EXAMPLE)}>Usar texto de ejemplo</Button>
        </div>
      </Card>

      {parsed && (
        <Card className="grid gap-4 p-4">
          {parsed.warnings.length > 0 && (
            <Notice>
              <ul className="list-disc pl-4">{parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </Notice>
          )}
          <div className="grid gap-3 sm:grid-cols-[3fr_1fr]">
            <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
            <TextInput label="Raciones" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
          </div>
          <p className="text-sm text-muted">Tiempo: {parsed.prepMinutes ?? 0} min de preparación · {parsed.cookMinutes ?? 0} min de cocción · {parsed.steps.length} pasos</p>
          <div>
            <h2 className="mb-2 font-semibold">Ingredientes detectados</h2>
            <ul className="grid gap-2">
              {rows.map((r, i) => {
                const upd = (patch: Partial<Row>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                const unitMismatch = r.match && dimensionOf(r.unit) !== dimensionOf(r.match.unit) && !(r.match.gramsPerUnit || r.match.densityGPerMl);
                return (
                  <li key={i} className={`grid gap-2 rounded-xl border border-line p-2 sm:grid-cols-[auto_2fr_1fr_1fr] sm:items-center ${r.include ? '' : 'opacity-60'}`}>
                    <input type="checkbox" aria-label={`Incluir ${r.name}`} className="h-5 w-5" checked={r.include} onChange={(e) => upd({ include: e.target.checked })} />
                    <div>
                      <input aria-label="Ingrediente" className="min-h-11 w-full rounded-xl border border-line bg-card px-3" value={r.name} onChange={(e) => upd({ name: e.target.value, match: matchProduct(e.target.value, products) })} />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.match ? <Badge tone="ok">usa «{r.match.name}»</Badge> : <Badge tone="brand">se creará producto nuevo</Badge>}
                        {unitMismatch && <Badge tone="warn">unidad distinta a la del producto sin equivalencia</Badge>}
                      </div>
                    </div>
                    <input aria-label="Cantidad" inputMode="decimal" className="min-h-11 rounded-xl border border-line bg-card px-3" value={r.quantity} placeholder="cantidad" onChange={(e) => upd({ quantity: e.target.value })} />
                    <select aria-label="Unidad" className="min-h-11 rounded-xl border border-line bg-card px-2" value={r.unit} onChange={(e) => upd({ unit: e.target.value as Unit })}>
                      {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar receta'}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
