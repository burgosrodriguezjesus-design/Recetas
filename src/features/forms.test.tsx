// Pruebas de componentes: formularios, validación y cálculo en vivo.
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FeedbackProvider } from '../ui/feedback';
import { ItemDialog } from './shopping/ItemDialog';
import { formToProduct } from './products/ProductForm';
import { createList } from '../db/shopping';
import { eraseAllData } from '../db/backup';
import { db } from '../db/db';
import { AppRoutes } from '../App';

function wrap(ui: React.ReactNode, path = '/') {
  return render(
    <FeedbackProvider>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </FeedbackProvider>,
  );
}

beforeEach(async () => {
  await eraseAllData();
});

describe('Formulario de producto de la lista', () => {
  it('(1-2) añade un producto con precio y cantidad y calcula el subtotal en vivo', async () => {
    const list = await createList({ name: 'Semana', kind: 'semana' });
    const user = userEvent.setup();
    wrap(<ItemDialog open listId={list.id} onClose={() => {}} />);
    await user.type(screen.getByLabelText('Nombre *'), 'Pechuga de pollo');
    const qty = screen.getByLabelText('Cantidad *');
    await user.clear(qty);
    await user.type(qty, '1,5');
    await user.selectOptions(screen.getByLabelText('Unidad'), 'kg');
    await user.type(screen.getByLabelText('Precio estimado'), '7,50');
    await user.selectOptions(screen.getByLabelText('por'), 'kg');
    expect(screen.getByText(/Subtotal estimado/).textContent).toMatch(/11,25\s€/);
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await waitFor(async () => expect(await db.shoppingItems.count()).toBe(1));
    const saved = (await db.shoppingItems.toArray())[0];
    expect(saved).toMatchObject({ name: 'Pechuga de pollo', quantity: 1.5, unit: 'kg', unitPrice: 7.5, priceUnit: 'kg', status: 'pendiente', origin: 'manual' });
  });

  it('(17) muestra errores con el formulario incompleto y no guarda', async () => {
    const list = await createList({ name: 'Semana', kind: 'semana' });
    const user = userEvent.setup();
    wrap(<ItemDialog open listId={list.id} onClose={() => {}} />);
    await user.clear(screen.getByLabelText('Cantidad *'));
    await user.type(screen.getByLabelText('Precio estimado'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(await screen.findByText('Escribe el nombre del producto')).toBeInTheDocument();
    expect(screen.getByText('La cantidad debe ser mayor que 0')).toBeInTheDocument();
    expect(screen.getByText('Precio no válido')).toBeInTheDocument();
    expect(await db.shoppingItems.count()).toBe(0);
  });
});

describe('Formulario de producto del catálogo', () => {
  const base = { name: 'Arroz', category: 'Despensa', unit: 'g', price: '', priceQuantity: '1', priceUnit: 'kg', packageQuantity: '', packageUnit: 'kg', packagePrice: '', gramsPerUnit: '', densityGPerMl: '', kcal: '', protein: '', carbs: '', fat: '', store: '', brand: '', notes: '', frequent: false };

  it('convierte números en formato español', () => {
    const r = formToProduct({ ...base, price: '1,80', packageQuantity: '1', packagePrice: '1,80' });
    expect(r.errors).toEqual({});
    expect(r.input).toMatchObject({ price: 1.8, priceQuantity: 1, priceUnit: 'kg', packageQuantity: 1, packagePrice: 1.8 });
  });

  it('exige los cuatro valores nutricionales o ninguno', () => {
    const r = formToProduct({ ...base, kcal: '350' });
    expect(r.input).toBeUndefined();
    expect(r.errors.protein).toMatch(/Completa los cuatro/);
  });

  it('rechaza importes no numéricos o negativos', () => {
    expect(formToProduct({ ...base, price: '-2' }).errors.price).toBeDefined();
    expect(formToProduct({ ...base, name: ' ' }).errors.name).toBe('El nombre es obligatorio');
  });
});

describe('Navegación', () => {
  it('muestra el planificador como pantalla principal', async () => {
    wrap(<AppRoutes />, '/');
    expect(await screen.findByRole('heading', { name: 'Planificador' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Recetas/ }).length).toBeGreaterThan(0);
  });
});
