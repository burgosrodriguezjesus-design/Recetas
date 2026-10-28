# FASE 2 · Pantallas, navegación y experiencia de usuario

## Navegación

| Móvil (< 1024 px) | Ordenador / tablet horizontal (≥ 1024 px) |
|---|---|
| Barra **inferior** fija con 5 destinos: Plan · Recetas · Compra · Despensa · Más | Barra **lateral** con todos los destinos y búsqueda |
| Botón de búsqueda en la cabecera | Búsqueda siempre visible en la barra lateral |
| Respeta la zona segura del iPhone (`safe-area-inset`) | — |

«Más» agrupa: Productos y precios, Estadísticas, Ajustes y copias de seguridad.

## Pantallas

| Ruta | Pantalla | Contenido principal |
|---|---|---|
| `#/` | **Planificador** (inicio) | Selector de semana, alternancia *Semana / Día*, accesos rápidos (recetas, compra, despensa), avisos de caducidad |
| `#/plan/dia/:fecha` | Vista diaria | Comidas en orden (desayuno → cena), resumen nutricional, coste, tiempo, pendientes, ingredientes que faltan |
| `#/plan/generar` | Generador de menús | Formulario de preferencias → vista previa → aplicar (con confirmación si sobrescribe) |
| `#/recetas` | Biblioteca | Búsqueda, filtros (categoría, dificultad, tiempo, precio, favoritas), orden, tarjetas |
| `#/recetas/nueva`, `#/recetas/:id/editar` | Formulario de receta | Datos, ingredientes con autocompletado del catálogo, pasos, utensilios, etiquetas, foto |
| `#/recetas/:id` | Detalle | Escalado de raciones, coste, nutrición, ingredientes disponibles/faltantes, añadir a la compra, planificar |
| `#/recetas/importar` | Importar | Pegar texto de una receta → vista previa → guardar |
| `#/recetas/sugerencias` | Sugerencias | Recetas ordenadas por lo que tienes y lo que caduca; propuestas automáticas marcadas como tales |
| `#/compra` | Lista de la compra | Selector de lista, resumen económico, productos por categoría, marcar comprado, precio real, recibir compra |
| `#/despensa` | Despensa | Inventario con filtros por ubicación/categoría/caducidad, consumir, desechar, ajustar |
| `#/productos` | Productos y precios | Catálogo con precio, envase, nutrición, histórico de precios |
| `#/estadisticas` | Panel | Gasto, presupuesto, recetas más usadas, consumo, desperdicio, variaciones de precio |
| `#/ajustes` | Ajustes | Presupuestos, comensales, tema claro/oscuro, exportar/importar copia, almacenamiento |
| `#/buscar` | Búsqueda global | Recetas, productos, despensa y lista en una sola caja |

## Componentes base (`src/ui`)

- `Button`, `IconButton`: tamaños táctiles mínimos de 44 px (recomendación de Apple).
- `Dialog`: diálogo nativo `<dialog>` accesible (foco atrapado, cierre con Escape).
- `ConfirmDialog` / `useConfirm()`: confirmación obligatoria antes de borrar.
- `Toast` / `useToast()`: notificaciones con acción **Deshacer** cuando es posible.
- `Field`, `NumberField`, `Select`: etiquetas visibles, errores debajo del campo, teclado numérico decimal en móvil.
- `EmptyState`: cada lista vacía explica qué hacer a continuación.
- `Money`, `Qty`: formatean euros y cantidades en español (`1.234,50 €`, `1,5 kg`).

## Principios aplicados

1. **Lo importante primero**: la pantalla de inicio es el plan de la semana.
2. **Nada simulado**: si un dato no existe se muestra «sin datos» o «—», nunca un número inventado.
3. **Estimado ≠ real**: los importes estimados llevan la palabra «estimado»; el gasto real solo aparece tras registrar compras.
4. **Acciones destructivas protegidas**: confirmación + deshacer.
5. **Modo oscuro** automático según el sistema, con opción manual.
