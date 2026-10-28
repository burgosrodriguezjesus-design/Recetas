# FASES 4-10 · Cómo está construida (recorrido por el código)

## Mapa de carpetas

```
src/
├── domain/         ← LÓGICA PURA (sin interfaz ni base de datos). Lo más importante.
│   ├── types.ts         tipos de todos los datos
│   ├── units.ts         unidades y conversiones seguras
│   ├── format.ts        euros, cantidades, números en español
│   ├── dates.ts         fechas AAAA-MM-DD, semanas que empiezan en lunes
│   ├── recipeCalc.ts    coste y nutrición de recetas, escalado de raciones
│   ├── shopping.ts      subtotales, resumen económico, generación de la lista
│   ├── pantry.ts        consumo por lotes (FIFO) y caducidades
│   ├── menuGenerator.ts generador de menús por reglas
│   ├── importText.ts    lectura de recetas pegadas como texto
│   ├── stats.ts         estadísticas
│   ├── csv.ts           exportación CSV
│   └── schemas.ts       validación (Zod) de formularios y copias de seguridad
├── db/             ← PERSISTENCIA (IndexedDB con Dexie)
│   ├── db.ts            esquema y migraciones
│   ├── catalog.ts       productos, recetas, ajustes
│   ├── planner.ts       plan de comidas, cocinar
│   ├── shopping.ts      listas, generación desde el plan, recepción de compra
│   ├── pantry.ts        despensa
│   ├── backup.ts        exportar / importar / borrar
│   └── sampleData.ts    ejemplos opcionales
├── ui/             ← componentes base (botones, diálogos, avisos, iconos, layout)
├── hooks/          ← lectura reactiva de datos y tema
├── features/       ← una carpeta por pantalla
└── App.tsx         ← rutas
```

**Regla de dependencias:** `features → db → domain`. El dominio no conoce a nadie.
Por eso se puede probar con datos inventados en milisegundos y reutilizar si un día
hay servidor.

## Los cálculos clave, explicados

### 1. Unidades (`domain/units.ts`)
Cada unidad pertenece a una *dimensión*: masa (g, kg), volumen (ml, l, cda, cdta),
recuento (ud) u «otra» (pizca, paquete). Dentro de la misma dimensión se convierte
siempre. Entre dimensiones **solo** si el producto tiene equivalencia:
`gramsPerUnit` (1 huevo ≈ 60 g) o `densityGPerMl` (aceite ≈ 0,92 g/ml).
`convert()` devuelve `null` cuando no puede: el resto del código trata ese `null`
como «no lo sé» y lo muestra, nunca como cero.

### 2. Coste de una receta (`domain/recipeCalc.ts`)
1. Se calcula el **precio por unidad base** del producto (€/g, €/ml o €/ud) a partir
   del precio de referencia o del precio del envase.
2. Cada ingrediente se pasa a esa unidad base y se multiplica.
3. Si algún ingrediente no tiene precio, el total se marca como **parcial** (`≥`).

Así, 200 g de un arroz de 2 €/kg cuestan 0,40 € en la receta, aunque la compra sea
el paquete entero de 2 €: **coste de ingredientes ≠ gasto de compra**.

### 3. De plan a lista de la compra (`domain/shopping.ts`)
```
comidas del rango ──► escalar a raciones ──► agrupar por producto y unidad base
   (200 g + 0,3 kg de pollo = 500 g; "2 ud" y "100 g" de huevo sin equivalencia → 2 líneas)
──► restar despensa (lotes compatibles; los incompatibles se avisan, no se restan)
──► decidir compra: envases = techo(necesario / envase); sobrante → despensa al recibir
```
Regenerar la lista sustituye solo las líneas pendientes que venían de recetas; lo
añadido a mano y lo comprado se respeta.

### 4. Estimado frente a real
- `unitPrice` de una línea = estimación.
- `paidPrice` = lo realmente pagado (solo al comprar).
- `purchases` = gasto real registrado, base de las estadísticas de gasto.
El resumen de la lista distingue «comprado con precio real» de «comprado aún estimado».

### 5. Cocinar (`db/planner.ts → markPrepared`)
Planificar **no** toca la despensa. Al confirmar «la he cocinado» se muestra una vista
previa, se descuenta por lotes (primero lo que caduca antes) **sin bajar de cero**, y
se registra cada consumo con su coste estimado. Todo dentro de una transacción.

### 6. Generador de menús (`domain/menuGenerator.ts`)
Filtra (franja, tiempo, excluidos, etiquetas, nunca propuestas sin revisar) y puntúa
(despensa, gastar primero, caducidad, favoritas, variedad, presupuesto y, solo si hay
datos completos, calorías). Tiene semilla: «Otra propuesta» cambia la semilla. Si
faltan datos nutricionales lo dice explícitamente.

## Persistencia, migraciones y copias
- Dexie numera versiones de esquema. La **versión 2** añadió `createdAt` a los precios
  para ordenar varios registros del mismo día (lo detectó una prueba que fallaba de
  forma intermitente); su función `upgrade` rellena los registros antiguos.
  Hay una prueba que crea una base v1 y comprueba la migración.
- La copia de seguridad JSON lleva `format` y `formatVersion`; al importar se valida
  todo con Zod y la integridad entre tablas **antes** de borrar nada, y la sustitución
  se hace en una única transacción.

## PWA
`vite-plugin-pwa` genera el manifiesto y un *service worker* que precachea la app.
Comprobado con la prueba E2E: tras la primera visita, la app recarga y funciona con
la red desactivada. Cuando hay versión nueva, aparece un aviso con «Actualizar».

## Seguridad
- Sin servidor ni credenciales; `.env*` ignorado por git.
- CSP en `index.html`: solo scripts propios, sin conexiones externas.
- Validación de todo lo que entra (formularios, importaciones, copias).
- CSV protegido contra inyección de fórmulas en hojas de cálculo.
- Fotos redimensionadas a JPEG en el propio dispositivo; solo se aceptan `data:image/…`.
- `npm audit --omit=dev`: 0 vulnerabilidades. Las 4 de severidad baja están en
  la herramienta de compilación de la PWA (no llegan al navegador).
