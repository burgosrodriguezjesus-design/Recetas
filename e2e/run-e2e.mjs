// Prueba de extremo a extremo en un navegador real (Chromium) con tamaño de iPhone.
// Uso: npm run build && npm run test:e2e
// Arranca `vite preview`, recorre el flujo principal y comprueba:
//  - que no hay errores en consola,
//  - que no hay desplazamiento horizontal en pantallas pequeñas,
//  - persistencia tras recargar,
//  - funcionamiento sin conexión (service worker).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright se carga con require para usar también una instalación global
// (en tu equipo: `npm i -D playwright && npx playwright install chromium`).
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.E2E_SCREENSHOTS ?? 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      /* aún no */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('El servidor de preview no arrancó');
}

let failures = 0;
const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(`✔ ${name}`);
  } catch (e) {
    failures++;
    results.push(`✘ ${name}\n    ${e.message.split('\n').slice(0, 4).join('\n    ')}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

await waitForServer();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));

// En móvil el navegador amplía el viewport si algo desborda, así que se compara
// con el ancho real de la pantalla configurada, no con innerWidth.
const noHorizontalScroll = async (label) => {
  const expected = page.viewportSize().width;
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert(sw <= expected + 1 && iw <= expected + 1, `${label}: desplazamiento horizontal (${Math.max(sw, iw)}px > ${expected}px)`);
};
const slotCard = (name) => page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name, exact: true }) });
const go = async (hash) => {
  await page.goto(`${BASE}#${hash}`);
  await page.waitForLoadState('networkidle');
};

await step('La app carga en el planificador', async () => {
  await go('/');
  await page.getByRole('heading', { name: 'Planificador' }).waitFor();
  await noHorizontalScroll('Planificador vacío');
  await page.screenshot({ path: `${SHOTS}/01-plan-vacio.png`, fullPage: true });
});

await step('Formulario incompleto muestra errores (17)', async () => {
  await go('/recetas/nueva');
  await page.getByRole('button', { name: 'Guardar receta' }).click();
  await page.getByText('El nombre es obligatorio').waitFor();
  await page.getByText('Revisa los campos marcados en rojo').waitFor();
});

await step('Cargar recetas de ejemplo desde Ajustes', async () => {
  await go('/ajustes');
  await page.getByRole('button', { name: 'Cargar recetas de ejemplo' }).click();
  await page.getByText(/Ejemplos cargados: 9 recetas/).waitFor();
  await noHorizontalScroll('Ajustes');
  await page.screenshot({ path: `${SHOTS}/02-ajustes.png`, fullPage: true });
});

await step('Planificar una receta en la comida de hoy (8)', async () => {
  await go('/?vista=dia');
  await slotCard('Comida').getByRole('button', { name: 'Añadir' }).click();
  await page.getByRole('searchbox', { name: 'Buscar receta' }).fill('arroz');
  await page.getByRole('button', { name: /Arroz con pollo/ }).click();
  await page.getByText('«Arroz con pollo» añadida').waitFor();
  await page.getByRole('button', { name: /Arroz con pollo, 2 raciones/ }).waitFor();
  await noHorizontalScroll('Vista diaria');
  await page.screenshot({ path: `${SHOTS}/03-dia.png`, fullPage: true });
});

await step('Añadir una segunda receta en la cena y ver la semana', async () => {
  await slotCard('Cena').getByRole('button', { name: 'Añadir' }).click();
  await page.getByRole('searchbox', { name: 'Buscar receta' }).fill('tortilla');
  await page.getByRole('button', { name: /Tortilla de patatas/ }).click();
  await page.getByText('«Tortilla de patatas» añadida').waitFor();
  await page.getByRole('radio', { name: 'Semana' }).click();
  await page.getByText('Coste estimado semana').waitFor();
  await noHorizontalScroll('Vista semanal');
  await page.screenshot({ path: `${SHOTS}/04-semana.png`, fullPage: true });
});

await step('Generar la lista de la compra desde el plan (9-11)', async () => {
  await page.getByRole('button', { name: 'Lista de la compra' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(/Total estimado/).waitFor();
  await page.screenshot({ path: `${SHOTS}/05-generar-lista.png` });
  await dialog.getByRole('button', { name: 'Guardar en la lista' }).click();
  await page.getByText(/Lista actualizada/).waitFor();
});

let totalBefore = '';
await step('La lista muestra totales y al marcar comprado se actualizan (3-4)', async () => {
  await go('/compra');
  await page.getByText('Total estimado').waitFor();
  totalBefore = await page.locator('text=Pendiente (estimado)').locator('..').innerText();
  const first = page.getByRole('checkbox', { name: /Marcar como comprado/ }).first();
  await first.click();
  await page.getByText(/1 comprado/).waitFor();
  const after = await page.locator('text=Pendiente (estimado)').locator('..').innerText();
  assert(after !== totalBefore, `El pendiente no cambió (${after})`);
  await noHorizontalScroll('Compra');
  await page.screenshot({ path: `${SHOTS}/06-compra.png`, fullPage: true });
});

await step('Añadir un producto manual con precio y cantidad (1-2)', async () => {
  await page.getByRole('button', { name: 'Añadir producto' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Nombre *').fill('Detergente');
  await d.getByLabel('Cantidad *').fill('2');
  await d.getByLabel('Precio estimado').fill('3,25');
  await d.getByText('6,50 €').waitFor(); // subtotal en vivo
  await d.getByRole('button', { name: 'Añadir', exact: true }).click();
  await page.getByText('Detergente').waitFor();
});

await step('Registrar la compra y pasarla a la despensa (13)', async () => {
  await page.getByRole('button', { name: /Registrar compra \(1\)/ }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Registrar' }).click();
  await page.getByText(/Compra registrada/).waitFor();
  await go('/despensa');
  await page.getByText(/1 producto en casa/).waitFor();
  await noHorizontalScroll('Despensa');
  await page.screenshot({ path: `${SHOTS}/07-despensa.png`, fullPage: true });
});

await step('Los datos persisten tras recargar (14)', async () => {
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.getByText(/1 producto en casa/).waitFor();
  await go('/recetas');
  await page.getByText('9 recetas en tu biblioteca').waitFor();
});

await step('Detalle de receta, raciones y pantallas secundarias sin desbordes (16)', async () => {
  await page.getByRole('link', { name: /Lentejas con verduras/ }).click();
  await page.getByRole('heading', { name: 'Lentejas con verduras' }).waitFor();
  await page.getByRole('button', { name: 'Más raciones' }).click();
  await page.getByText('Cantidades adaptadas de 4 a 5 raciones.').waitFor();
  await noHorizontalScroll('Detalle receta');
  await page.screenshot({ path: `${SHOTS}/08-receta.png`, fullPage: true });
  for (const [hash, name] of [['/recetas', 'recetas'], ['/productos', 'productos'], ['/estadisticas', 'estadisticas'], ['/plan/generar', 'generar'], ['/recetas/importar', 'importar'], ['/recetas/sugerencias', 'sugerencias'], ['/mas', 'mas'], ['/buscar', 'buscar']]) {
    await go(hash);
    await page.waitForTimeout(150);
    await noHorizontalScroll(hash);
    await page.screenshot({ path: `${SHOTS}/09-${name}.png`, fullPage: true });
  }
});

await step('Generador de menús produce una propuesta', async () => {
  await go('/plan/generar');
  await page.getByRole('button', { name: 'Generar propuesta' }).click();
  await page.getByRole('heading', { name: 'Propuesta' }).waitFor();
  await page.screenshot({ path: `${SHOTS}/10-propuesta.png`, fullPage: true });
});

await step('Modo oscuro', async () => {
  await go('/ajustes');
  await page.getByRole('radio', { name: 'Oscuro' }).click();
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await go('/');
  await page.screenshot({ path: `${SHOTS}/11-oscuro.png`, fullPage: true });
});

await step('Funciona sin conexión tras la primera visita (PWA)', async () => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Planificador' }).waitFor({ timeout: 10000 });
  await context.setOffline(false);
});

await step('Vista de escritorio con barra lateral', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await go('/');
  await page.getByRole('complementary').getByRole('link', { name: 'Estadísticas' }).waitFor();
  await noHorizontalScroll('Escritorio');
  await page.screenshot({ path: `${SHOTS}/12-escritorio.png`, fullPage: true });
});

await step('Sin errores en la consola', async () => {
  const relevant = consoleErrors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  assert(relevant.length === 0, relevant.join('\n'));
});

await browser.close();
stop();
console.log(results.join('\n'));
console.log(failures ? `\n${failures} paso(s) fallidos` : '\nTodos los pasos E2E han pasado');
process.exit(failures ? 1 : 0);
