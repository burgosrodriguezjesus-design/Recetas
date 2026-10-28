# FASE 3 · Modelo de datos

Base de datos: **IndexedDB** (dentro del navegador) gestionada con **Dexie**.
Cada «tabla» es un *object store*; los índices permiten buscar rápido.

## Diagrama de relaciones

```
                     ┌──────────────┐
                     │  products    │  catálogo: nombre, categoría, unidad base,
                     │              │  envase, precio, nutrición/100, g por ud
                     └──────┬───────┘
          productId ┌───────┼──────────────┬───────────────┬──────────────┐
                    ▼       ▼              ▼               ▼              ▼
          ┌─────────────┐ ┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌─────────────┐
          │ recipes     │ │ pantry     │ │ shoppingItems│ │ priceRecords│ │consumption │
          │ ingredients[]│ │ cantidad,  │ │ cantidad,    │ │ histórico  │ │ cocinado /  │
          │ (productId, │ │ caducidad, │ │ precio, est. │ │ de precios │ │ desperdicio │
          │  cant, ud)  │ │ ubicación  │ │ origen       │ └────────────┘ └─────────────┘
          └──────┬──────┘ └────────────┘ └──────┬───────┘
        recipeId │                       listId │
                 ▼                              ▼
          ┌─────────────┐               ┌───────────────┐      ┌────────────┐
          │ mealEntries │               │ shoppingLists │ ───► │ purchases  │
          │ fecha, franja│              │ nombre, tipo, │      │ compras    │
          │ raciones,   │               │ presupuesto   │      │ registradas│
          │ preparada   │               └───────────────┘      │ (gasto real)│
          └─────────────┘                                      └────────────┘
          settings (clave única): presupuestos, comensales, tema
```

## Tablas

| Tabla | Clave e índices | Para qué |
|---|---|---|
| `products` | `id`, `name`, `category`, `frequent` | Catálogo único de ingredientes/productos |
| `recipes` | `id`, `name`, `category`, `favorite`, `updatedAt` | Recetas con ingredientes incrustados (siempre se leen juntos) |
| `mealEntries` | `id`, `date`, `[date+slot]`, `recipeId` | Una receta colocada en una franja de un día |
| `pantry` | `id`, `productId`, `expiryDate`, `location` | Lotes en casa (un producto puede tener varios lotes con distinta caducidad) |
| `shoppingLists` | `id`, `createdAt`, `status` | Listas por semana u ocasión |
| `shoppingItems` | `id`, `listId`, `productId`, `status` | Líneas de cada lista |
| `purchases` | `id`, `date`, `listId` | **Gasto real**: cada recepción de compra con sus líneas y precios pagados |
| `priceRecords` | `id`, `productId`, `date` | Histórico de precios pagados o anotados |
| `consumption` | `id`, `date`, `productId`, `reason` | Consumos al cocinar, desperdicios, ajustes |
| `settings` | `id` (= `'app'`) | Preferencias |

## Decisiones clave explicadas

- **Ingredientes dentro de la receta** (no en tabla aparte): una receta siempre
  se lee completa, y así duplicarla o exportarla es copiar un objeto.
- **Despensa por lotes**: si compras leche el lunes y el jueves, son dos lotes
  con distinta caducidad. Al cocinar se consume primero el que caduca antes (FIFO).
- **La lista guarda una foto del precio estimado** en el momento de crearla;
  si luego cambias el precio del producto no se reescribe tu lista ya hecha.
  Se puede recalcular explícitamente.
- **`purchases` separa gasto real de estimaciones**: un paquete de arroz de 2 €
  cuenta 2 € de gasto el día que lo compras, aunque en la receta solo uses 0,40 €.
  El coste de las recetas se calcula con el precio por kg/l/ud, sin duplicar el gasto.
- **Cantidades en unidad base**: internamente se convierte a `g`, `ml` o `ud`
  para sumar y restar. La unidad original se conserva para mostrarla.
- **Fechas como texto `AAAA-MM-DD`** en hora local: evita errores de zona
  horaria (un plan para «el lunes» no salta al domingo).
- **Migraciones**: Dexie numera las versiones del esquema (`db.version(n)`).
  Cuando cambie el modelo se añade una versión nueva con su función `upgrade`,
  y los datos existentes se transforman sin perderse.
- **Copia de seguridad**: un JSON con `formatVersion`, fecha y todas las tablas.
  Al importar se valida con Zod tabla a tabla antes de tocar nada; la sustitución
  ocurre dentro de una única transacción (o todo o nada).
