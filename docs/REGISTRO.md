# Registro de progreso

## Fases

| Fase | Estado | Resultado |
|---|---|---|
| 1. Análisis y arquitectura | ✅ | `docs/01-analisis-y-arquitectura.md` |
| 2. Pantallas y UX | ✅ | `docs/02-diseno-ux.md` |
| 3. Modelo de datos | ✅ | `docs/03-base-de-datos.md` |
| 4. Núcleo y persistencia | ✅ | `src/domain`, `src/db`, `src/ui` |
| 5. Planificador semanal y diario | ✅ | `src/features/planner` |
| 6. Biblioteca de recetas | ✅ | `src/features/recipes` |
| 7. Lista de la compra y precios | ✅ | `src/features/shopping`, `src/features/products` |
| 8. Despensa ↔ recetas ↔ plan | ✅ | cocinar con descuento, recepción de compra, sugerencias |
| 9. Estadísticas, exportaciones, mejoras | ✅ | `src/features/stats`, CSV, copias, búsqueda |
| 10. Pruebas, correcciones, instalación | ✅ | ver abajo |

## Pruebas obligatorias → dónde se comprueban

Ejecutadas el 28/10/2026: **56 pruebas automáticas** (Vitest: dominio, base de datos,
componentes) y **16 pasos E2E** en Chromium real a 390×844 (tamaño iPhone) y 1280×900.
Todas pasan; las automáticas se ejecutaron 10 veces seguidas sin fallos.

| # | Requisito | Prueba |
|---|---|---|
| 1 | Añadir producto con precio y cantidad | `forms.test.tsx` · E2E «Añadir un producto manual» |
| 2 | Subtotales | `domain.test.ts` (incluido 500 g a 7,50 €/kg) · `forms.test.tsx` |
| 3 | Total de la lista | `domain.test.ts` (ejemplo del enunciado = 13,50 €) · E2E |
| 4 | Total al marcar comprado | `domain.test.ts` · `db.test.ts` · E2E |
| 5 | Modificar precio y recalcular | `domain.test.ts` (estimado ≠ pagado) |
| 6 | Receta con varios ingredientes | `domain.test.ts` · `db.test.ts` |
| 7 | Cambiar raciones | `domain.test.ts` · E2E (4 → 5 raciones) |
| 8 | Planificar en un día | `db.test.ts` · E2E |
| 9 | Lista desde varias recetas | `domain.test.ts` · `db.test.ts` · E2E |
| 10 | Unificar repetidos (200 g + 300 g = 500 g) | `domain.test.ts` · `db.test.ts` |
| 11 | Restar despensa (800 − 300 = 500 g) | `domain.test.ts` · `db.test.ts` |
| 12 | Evitar conversiones incorrectas | `domain.test.ts` (ud↔g, ml↔g, pizca, paquete) |
| 13 | Registrar compra → inventario | `db.test.ts` · E2E |
| 14 | Datos tras cerrar y abrir | `db.test.ts` (cerrar/reabrir BD) · E2E (recarga) |
| 15 | Exportar/importar sin pérdidas | `db.test.ts` (ida y vuelta idéntica; copia corrupta rechazada) |
| 16 | Pantallas pequeñas | E2E: 14 pantallas sin desplazamiento horizontal a 390 px + capturas revisadas |
| 17 | Errores y formularios incompletos | `db.test.ts` · `forms.test.tsx` · E2E |

Extra comprobado: funcionamiento sin conexión (service worker), modo oscuro,
barra lateral en escritorio, migración de base de datos v1 → v2, sin errores en consola.

## Errores encontrados y corregidos durante las pruebas
1. **Desbordamiento horizontal en móvil** (lista de la compra a 437 px en pantalla de
   390 px; los diálogos quedaban cortados). Causa: columnas implícitas de CSS Grid que
   crecen hasta el contenido mínimo. Corrección global en `index.css`. La comprobación
   E2E también se corrigió: comparaba con `innerWidth`, que en móvil crece con el desborde.
2. **Orden inestable del histórico de precios** del mismo día (prueba intermitente).
   Corrección con `createdAt`, reloj monótono y migración v2.
3. **Vista semanal demasiado larga en móvil** (franjas vacías). Ahora las franjas vacías
   se muestran como botones compactos.

## Limitaciones conocidas y pendientes
- **Sin sincronización automática entre dispositivos** (decisión de arquitectura). Se
  usa exportar/importar. Siguiente paso posible: backend (p. ej. Supabase) con login.
- **No probado en un iPhone físico** desde este entorno: las pruebas usan Chromium con
  tamaño y comportamiento táctil de móvil. Safari/WebKit puede tener diferencias
  menores; conviene revisarla tras publicarla.
- Valores nutricionales y precios: los introduce el usuario. No hay base de datos
  nutricional ni precios de supermercados (no existe una fuente gratuita y fiable integrada).
- Desmarcar una comida preparada no devuelve los ingredientes a la despensa (se avisa).
- Reordenar recetas dentro de una misma comida por arrastre: no implementado
  (se puede mover o intercambiar).
