import { Component, lazy, useEffect, type ReactNode } from 'react';
import { HashRouter, Route, Routes, Link } from 'react-router-dom';
import { Layout, MorePage } from './ui/Layout';
import { FeedbackProvider, useFeedback } from './ui/feedback';
import { useSettings } from './hooks/data';
import { useTheme } from './hooks/useTheme';
import { db, requestPersistentStorage } from './db/db';
import { seedTemplateOnce } from './db/templates';
import { PlannerPage } from './features/planner/PlannerPage';
import { RecipesPage } from './features/recipes/RecipesPage';
import { RecipeDetail } from './features/recipes/RecipeDetail';
import { RecipeFormPage } from './features/recipes/RecipeForm';
import { ShoppingPage } from './features/shopping/ShoppingPage';
import { PantryPage } from './features/pantry/PantryPage';

// Pantallas secundarias: se descargan solo al abrirlas (arranque más rápido).
const GeneratorPage = lazy(() => import('./features/planner/GeneratorPage').then((m) => ({ default: m.GeneratorPage })));
const ImportRecipePage = lazy(() => import('./features/recipes/ImportRecipe').then((m) => ({ default: m.ImportRecipePage })));
const SuggestionsPage = lazy(() => import('./features/recipes/Suggestions').then((m) => ({ default: m.SuggestionsPage })));
const ProductsPage = lazy(() => import('./features/products/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const StatsPage = lazy(() => import('./features/stats/StatsPage').then((m) => ({ default: m.StatsPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SearchPage = lazy(() => import('./features/search/SearchPage').then((m) => ({ default: m.SearchPage })));

/** Si una pantalla falla, se muestra un mensaje en vez de dejar la app en blanco. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg p-6">
          <h1 className="mb-2 text-xl font-bold">Algo ha fallado en esta pantalla</h1>
          <p className="mb-4 text-sm text-muted">Tus datos no se han perdido. Detalle técnico: {this.state.error.message}</p>
          <div className="flex gap-2">
            <button type="button" className="min-h-11 rounded-xl bg-brand px-4 font-medium text-brand-ink" onClick={() => this.setState({ error: null })}>Reintentar</button>
            <a href="#/" onClick={() => this.setState({ error: null })} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-medium">Ir al inicio</a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Bootstrap() {
  const settings = useSettings();
  const { toast, error } = useFeedback();
  useTheme(settings.theme);

  useEffect(() => {
    db.open()
      .then(() => seedTemplateOnce())
      .then((created) => created && toast('Te he preparado tu lista semanal de Mercadona en «Compra»', { type: 'info' }))
      .catch((e) => error(new Error(`No se pudo abrir la base de datos local (${e?.message ?? e}). Comprueba que el navegador no está en modo privado.`)));
    void requestPersistentStorage();
    if (import.meta.env.PROD) {
      import('./pwa')
        .then(({ setupPWA }) =>
          setupPWA({
            onNeedRefresh: (update) => toast('Hay una versión nueva de la app', { type: 'info', duration: 30000, action: { label: 'Actualizar', onClick: update } }),
            onOfflineReady: () => toast('Lista para usarse sin conexión', { type: 'info' }),
          }),
        )
        .catch(() => undefined);
    }
  }, [toast, error]);
  return null;
}

function NotFound() {
  return (
    <div className="py-10 text-center">
      <h1 className="mb-2 text-xl font-bold">Página no encontrada</h1>
      <Link to="/" className="font-medium text-brand underline">Volver al planificador</Link>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PlannerPage />} />
        <Route path="plan/generar" element={<GeneratorPage />} />
        <Route path="recetas" element={<RecipesPage />} />
        <Route path="recetas/nueva" element={<RecipeFormPage />} />
        <Route path="recetas/importar" element={<ImportRecipePage />} />
        <Route path="recetas/sugerencias" element={<SuggestionsPage />} />
        <Route path="recetas/:id" element={<RecipeDetail />} />
        <Route path="recetas/:id/editar" element={<RecipeFormPage />} />
        <Route path="compra" element={<ShoppingPage />} />
        <Route path="despensa" element={<PantryPage />} />
        <Route path="productos" element={<ProductsPage />} />
        <Route path="estadisticas" element={<StatsPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="buscar" element={<SearchPage />} />
        <Route path="mas" element={<MorePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <FeedbackProvider>
        <HashRouter>
          <Bootstrap />
          <AppRoutes />
        </HashRouter>
      </FeedbackProvider>
    </ErrorBoundary>
  );
}
