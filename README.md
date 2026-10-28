# Mi Cocina Inteligente

Aplicación personal para **planificar comidas**, gestionar **recetas**, controlar la
**despensa** y preparar la **lista de la compra con precios y presupuesto**.
Funciona en iPhone, tablet y ordenador, se instala como app (PWA), trabaja sin
conexión y guarda los datos en el propio dispositivo.

## Qué hace

| Sección | Funciones principales |
|---|---|
| **Planificador** (inicio) | Semana y día · 5 comidas al día · varias recetas por comida · coste, tiempo, kcal y macros (si hay datos) · cambiar, duplicar, mover, intercambiar, quitar · copiar día y semana · marcar como preparada descontando la despensa · sobras · generador de menús |
| **Recetas** | Crear, editar, duplicar, eliminar · foto · favoritas · búsqueda por nombre/ingrediente · filtros y orden · escalado de raciones · coste total y por ración · ingredientes que faltan · añadir a la compra · importar desde texto · sugerencias con lo que tienes · propuestas automáticas marcadas como tales |
| **Compra** | Varias listas · subtotales y total · comprado / pendiente / presupuesto · precio real frente a estimado · envases · generar desde el plan (suma ingredientes, resta despensa, redondea a envases) · frecuentes · duplicar, archivar, vaciar con deshacer · CSV, imprimir, compartir · registrar compra → despensa + histórico de precios · comparación con la última compra |
| **Despensa** | Lotes con cantidad, caducidad, ubicación, precio · avisos de caducidad · consumir / desperdiciar sin cantidades negativas · sobras |
| **Productos y precios** | Catálogo común · precio de referencia y envase · equivalencias (g por unidad, densidad) · nutrición por 100 g/ml · histórico de precios |
| **Estadísticas** | Gasto real semanal/mensual frente a presupuesto · previsto frente a real · evolución · coste medio por comida y ración · recetas más usadas · consumo · desperdicio · subidas y bajadas de precio |
| **Ajustes** | Comensales, presupuestos, días de aviso, comidas visibles, tema claro/oscuro · exportar/importar copia de seguridad · ejemplos opcionales |

**Principio de transparencia:** si falta un precio o un dato nutricional, la app
lo dice («sin precio», «datos incompletos», «≥ coste parcial») en lugar de
inventarlo. No hay precios de supermercados simulados ni integraciones ficticias.

## Uso rápido

```bash
npm install
npm run dev        # desarrollo en http://localhost:5173
npm test           # pruebas unitarias, de base de datos y de componentes
npm run build      # versión de producción en dist/
npm run preview    # sirve dist/ (necesario para probar la PWA)
npm run test:e2e   # prueba en navegador real (requiere Playwright, ver abajo)
```

Prueba E2E en tu equipo: `npm i -D playwright && npx playwright install chromium`,
después `npm run build && npm run test:e2e`.

## Instalarla en el iPhone

**App publicada:** https://mi-cocina-inteligente.vercel.app (Vercel, proyecto `mi-cocina-inteligente`).

1. Publica la carpeta `dist/` en cualquier hosting estático **con HTTPS**
   (el flujo `.github/workflows/deploy.yml` lo hace en GitHub Pages: activa
   *Settings → Pages → Source: GitHub Actions* y haz push a `main`).
2. Abre la dirección en **Safari** → botón **Compartir** → **Añadir a pantalla de inicio**.
3. Ábrela desde el icono: pantalla completa y funcionamiento sin conexión.

> Los datos viven en ese dispositivo. Para pasarlos a otro, usa **Ajustes →
> Exportar copia** y luego **Importar copia** en el otro dispositivo.

## Documentación (para aprender cómo está hecha)

- [`docs/01-analisis-y-arquitectura.md`](docs/01-analisis-y-arquitectura.md): requisitos, ambigüedades, decisión técnica.
- [`docs/02-diseno-ux.md`](docs/02-diseno-ux.md): pantallas, navegación y componentes.
- [`docs/03-base-de-datos.md`](docs/03-base-de-datos.md): modelo de datos y relaciones.
- [`docs/04-implementacion.md`](docs/04-implementacion.md): recorrido por el código y los cálculos clave.
- [`docs/REGISTRO.md`](docs/REGISTRO.md): tareas completadas, pruebas ejecutadas y pendientes.
