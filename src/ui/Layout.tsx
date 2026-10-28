import { Suspense } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { Loading } from './kit';
import { Icon, type IconName } from './Icon';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const MAIN: NavItem[] = [
  { to: '/', label: 'Plan', icon: 'calendar', end: true },
  { to: '/recetas', label: 'Recetas', icon: 'book' },
  { to: '/compra', label: 'Compra', icon: 'cart' },
  { to: '/despensa', label: 'Despensa', icon: 'box' },
];

const SECONDARY: NavItem[] = [
  { to: '/productos', label: 'Productos y precios', icon: 'tag' },
  { to: '/estadisticas', label: 'Estadísticas', icon: 'chart' },
  { to: '/ajustes', label: 'Ajustes y copias', icon: 'settings' },
];

export function Layout() {
  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral (ordenador) */}
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 border-r border-line bg-card px-3 py-5 lg:flex">
        <Link to="/" className="mb-4 flex items-center gap-2 px-2 text-lg font-bold">
          <img src="./icon.svg" alt="" className="h-8 w-8" />
          Mi Cocina
        </Link>
        <NavLink to="/buscar" className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-line bg-raised px-3 text-sm text-muted">
          <Icon name="search" size={18} /> Buscar…
        </NavLink>
        {[...MAIN, ...SECONDARY].map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium transition ${isActive ? 'bg-soft text-brand' : 'text-ink hover:bg-raised'}`}
          >
            <Icon name={n.icon} /> {n.label}
          </NavLink>
        ))}
      </aside>

      <div className="min-w-0 flex-1">
        {/* Cabecera (móvil) */}
        <header className="no-print pt-safe sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-2 font-bold">
              <img src="./icon.svg" alt="" className="h-7 w-7" /> Mi Cocina
            </Link>
            <Link to="/buscar" aria-label="Buscar" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-raised">
              <Icon name="search" />
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-28 lg:px-8 lg:pt-8 lg:pb-12">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Navegación inferior (móvil) */}
      <nav aria-label="Principal" className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {[...MAIN, { to: '/mas', label: 'Más', icon: 'more' as IconName }].map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? 'text-brand' : 'text-muted'}`}
              >
                <Icon name={n.icon} size={22} />
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function MorePage() {
  const items: NavItem[] = [
    ...SECONDARY,
    { to: '/plan/generar', label: 'Generar menú semanal', icon: 'sparkles' },
    { to: '/recetas/sugerencias', label: 'Sugerencias con lo que tengo', icon: 'chef' },
    { to: '/buscar', label: 'Búsqueda global', icon: 'search' },
  ];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Más</h1>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {items.map((n) => (
          <li key={n.to}>
            <Link to={n.to} className="flex min-h-14 items-center gap-3 px-4 hover:bg-raised">
              <Icon name={n.icon} className="text-brand" />
              <span className="flex-1 font-medium">{n.label}</span>
              <Icon name="right" className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
