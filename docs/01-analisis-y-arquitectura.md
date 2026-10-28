# FASE 1 · Análisis de requisitos y arquitectura

## 1. Qué hay que resolver realmente

La aplicación tiene cinco módulos que **comparten datos**:

```
 Productos (catálogo de ingredientes: precio, envase, nutrición)
     ▲            ▲              ▲              ▲
     │            │              │              │
  Recetas ──► Planificador ──► Lista compra ──► Despensa
  (ingredientes   (qué receta,    (lo que falta,    (lo que hay
   + cantidades)   qué día,        con precios)      en casa)
                   cuántas raciones)
```

La pieza que une todo es el **catálogo de productos**: «pechuga de pollo» es
un único registro. La receta dice «300 g de pechuga de pollo», la despensa dice
«tengo 450 g de pechuga de pollo» y la lista de la compra dice «comprar 1
bandeja de pechuga de pollo a 5,20 €». Como todos apuntan al mismo producto, se
pueden sumar, restar y valorar sin comparar textos.

## 2. Ambigüedades detectadas y decisión tomada

| Ambigüedad | Decisión (modificable más adelante) |
|---|---|
| ¿Un solo dispositivo o sincronización entre varios? | **Un dispositivo** (tu iPhone) con almacenamiento local persistente. Se incluye copia de seguridad/restauración en JSON para mover datos entre dispositivos. Si más adelante quieres sincronización automática, la capa de datos está aislada para añadir un backend (por ejemplo Supabase) sin rehacer la interfaz. |
| ¿De dónde salen los valores nutricionales? | **Los introduces tú** por producto (por 100 g o 100 ml, por ejemplo copiándolos de la etiqueta). No se incluye una base de datos inventada. Si un ingrediente no tiene datos o no se puede convertir a gramos, la app dice «datos incompletos» en vez de estimar. |
| ¿De dónde salen los precios? | **Manuales** (y del histórico de tus compras). No hay *scraping* de supermercados: no existe una API pública fiable y simularla sería engañoso. |
| «Unidad» (1 huevo) frente a gramos | Cada producto puede tener un **peso medio por unidad** opcional. Solo si existe, la app convierte `ud ↔ g`. Lo mismo con la **densidad** para `ml ↔ g`. Sin esa equivalencia, no se convierte. |
| Envases (paquete de 1 kg) | Cada producto puede tener **tamaño y precio de envase**. La lista calcula «necesitas 1,3 kg → compra 2 paquetes». El sobrante entra en la despensa al recibir la compra. |
| ¿Qué significa «gasto real»? | El gasto real solo procede de **compras registradas** (productos marcados como comprados, con el precio pagado). El coste de un menú es siempre **estimado**. |
| ¿Cuándo se descuenta la despensa? | **Solo** cuando confirmas que has cocinado una receta (con vista previa) o registras un consumo/desperdicio. Planificar no descuenta nada. |
| Generación de menús con IA | Se implementa un **generador local por reglas** (sin servicios externos, sin coste, verificable). Respeta presupuesto, tiempo, exclusiones y prioriza tu despensa. No promete objetivos nutricionales si faltan datos. |
| Autenticación | Sin backend no hay cuentas: los datos no salen de tu dispositivo. Si se añade sincronización, entonces sí habrá autenticación y permisos por usuario. |

## 3. Opciones evaluadas

| Opción | Ventajas | Inconvenientes | Veredicto |
|---|---|---|---|
| App nativa iOS (Swift) | Integración total | Requiere Mac, cuenta de desarrollador (99 €/año), no funciona en ordenador | Descartada |
| Web con backend (Next.js + PostgreSQL + login) | Sincroniza dispositivos | Servidor que mantener y pagar, autenticación, más superficie de ataque | Excesiva para empezar |
| **PWA local-first (React + IndexedDB)** | Gratis, funciona sin conexión, instalable en la pantalla de inicio del iPhone, datos privados en el dispositivo, rápida | No sincroniza sola (se mitiga con exportar/importar); Safari puede borrar datos de webs **no instaladas** tras 7 días sin uso | **Elegida** |

> Nota importante sobre iPhone: Safari aplica una política que puede borrar el
> almacenamiento de sitios web visitados en el navegador si no se usan durante
> 7 días. **Las PWA añadidas a la pantalla de inicio no están sujetas a esa
> limpieza**. Por eso la app pide almacenamiento persistente
> (`navigator.storage.persist()`), recomienda instalarla y recuerda hacer copias
> de seguridad periódicas.

## 4. Arquitectura elegida

```
┌──────────────────────────── Navegador / PWA ────────────────────────────┐
│  UI (React + Tailwind)  ── pantallas: Planificador, Recetas, Compra, ...│
│        │ lee con useLiveQuery (se actualiza sola al cambiar datos)      │
│        ▼                                                                │
│  Acciones (src/db/actions.ts) ── operaciones con transacción:           │
│        generar lista, recibir compra, cocinar, copiar semana, backup... │
│        │                                                                │
│        ├──► Dominio puro (src/domain/*) ── cálculos sin dependencias:   │
│        │       unidades, costes, nutrición, agregación, generador menú  │
│        ▼                                                                │
│  Base de datos (Dexie sobre IndexedDB, con versiones/migraciones)       │
│  Service Worker (vite-plugin-pwa) ── caché de la app para uso offline   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Por qué esta separación:** los cálculos (unidades, precios, raciones) están
en funciones puras, sin base de datos ni interfaz. Eso permite probarlos con
cientos de casos en milisegundos y reutilizarlos si algún día hay servidor.

### Tecnologías

| Pieza | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript | Los tipos detectan errores (p. ej. sumar euros con gramos) antes de ejecutar |
| Interfaz | React 19 | Estándar, componentes reutilizables |
| Compilador | Vite | Arranque instantáneo y compilación rápida |
| Estilos | Tailwind CSS 4 | Diseño responsive y modo oscuro sin hojas de estilo enormes |
| Base de datos | IndexedDB vía Dexie 4 | Persistente, transaccional, gran capacidad, con migraciones por versión |
| Validación | Zod | Un esquema valida formularios **y** copias de seguridad importadas |
| Navegación | React Router (modo *hash*) | Funciona en cualquier hosting estático sin configuración |
| PWA | vite-plugin-pwa (Workbox) | Manifiesto + service worker probados |
| Pruebas | Vitest + Testing Library + fake-indexeddb + Playwright | Unitarias, de base de datos, de componentes y de navegador real en tamaño iPhone |

Deliberadamente **no** se usan: gestor de estado global (Dexie ya es la fuente
de verdad), librería de gráficas (SVG propio, ligero), librería de fechas
(`Intl` nativo en español es suficiente).

### Seguridad en este contexto

- No hay servidor ni claves: nada secreto que filtrar. `.env` está en `.gitignore` por si se añade backend.
- Política de seguridad de contenido (CSP) estricta: solo scripts propios, sin conexiones externas.
- React escapa todo el texto; no se usa `dangerouslySetInnerHTML`.
- Todo dato que entra (formularios, importaciones de recetas, copias de seguridad) se valida con Zod antes de guardarse.
- Las fotos se redimensionan y se guardan como imagen dentro de la base local; no se suben a ningún sitio.

## 5. Plan de implementación (fases)

1. ✅ Análisis y arquitectura (este documento).
2. Diseño de pantallas y navegación → `docs/02-diseno-ux.md`.
3. Modelo de datos → `docs/03-base-de-datos.md`.
4. Núcleo: dominio (unidades, dinero, fechas), base de datos, componentes base.
5. Planificador semanal y diario.
6. Recetas.
7. Lista de la compra y precios.
8. Conexión despensa ↔ recetas ↔ planificador (cocinar, recibir compra).
9. Estadísticas, exportaciones, generador de menús, búsqueda.
10. Pruebas completas, corrección de errores e instalación.

El registro de progreso está en `docs/REGISTRO.md`.
