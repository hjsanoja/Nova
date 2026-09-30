# NOVA v3.2 · Interfaz simplificada, acceso obligatorio y gestión de datos

- **Acceso**: inicio de sesión obligatorio (Supabase Auth). Ya no hay usuario administrador por defecto; el modo demostración solo aparece si no hay Supabase configurado.
- **Menús**: de 12 pestañas a 9 según el rol. *Resumen* (consulta), *Reportes* y *Cargar y editar datos* (administración). Los errores de sincronización se resuelven en **Configuración → Sincronización**.
- **Fichero**: cada vendedor ve solo sus farmacias (RLS + limpieza local al cambiar de usuario); el teletransferencista, gerente y admin ven todas. El administrador asigna el fichero desde *Cargar y editar datos → Fichero de vendedores*.
- **Mesa del teletransferencista** (*Por procesar*): tomar pedido con bloqueo, descargar el archivo para la droguería y confirmar lo despachado (genera el remanente).
- **Borrado**: *Configuración → Base de datos*, solo admin, con clave, por alcance (historial o todo).
- **Retirado**: Script SQL, Generador SQL, Vademécum aparte, Carga masiva de inventario, Auditoría como pestaña, dictado por voz, toma clásica, dashboards con cifras de ejemplo, scripts de migración.
- **UI**: botones y tarjetas compactos (`components/ui/kit.tsx`), listas en tarjeta en móvil.

---

# Historial · NOVA v2.1 (pantallas ya retiradas; se conserva como registro)


Revisión completa del proyecto (`SYSTEM_CONTEXT.md` como referencia). Foco: menos consumo de recursos, menos código muerto y una interfaz que se adapta a móvil, iPad/tablet y PC.

## Resultados medidos

| Métrica | Antes | Ahora |
|---|---|---|
| JS inicial (gzip) | 334 kB en un solo archivo (1.31 MB) | ≈ 91 kB (react 68 + app 16 + iconos 6); cada pestaña baja aparte (2–31 kB gzip) |
| Escáner de códigos (`html5-qrcode`, 111 kB gzip) | En el bundle inicial | Solo al abrir la cámara |
| SDK de Supabase (55 kB gzip) | En el bundle inicial | Solo en pestañas/modales que lo usan |
| Script SQL (60 kB) | En el bundle inicial | Solo en la pestaña "Script SQL" |
| Fuentes | Inter ×5 pesos, Jakarta ×4, JetBrains Mono, Material Symbols (sin uso) | Inter ×4, Jakarta ×3 |
| Dependencias | 21 (12 + 9 de desarrollo) | 13 (5 + 8 de desarrollo): se quitaron `@google/genai`, `express`, `dotenv`, `motion`, `tsx`, `esbuild`, `autoprefixer` y `@types/express`, ninguna se usaba |
| Cargar ventas de 30 000 filas (catálogo de demostración) | **Se caía** (`QuotaExceededError` en `PHARMA_HISTORICO` → pantalla de error) | Diagnóstico 0.2 s + proceso 0.2 s; la app sigue viva y avisa si el navegador no puede guardar |
| Cargar ventas con catálogo real (3 000 farmacias, 2 000 productos) | 5 000 filas: > 175 s (se abortó la prueba) | 30 000 filas: 0.7 s de diagnóstico + 1.2 s de proceso |
| TypeScript | Sin `strict` | `strict` + `noUnusedLocals/Parameters`, 0 errores |

## Mejoras implementadas

1. **Carga perezosa** de las 12 pestañas y los 5 modales, con esqueleto de carga y captura de error por pestaña (si falla la descarga sin señal, el resto de la app sigue).
2. **Persistencia segura** (`usePersistentState`): una sola escritura con debounce en vez de serializar el arreglo completo en cada cambio (cada tecla en una cantidad facturada reescribía todos los detalles de pedido); no reescribe los datos semilla; vacía al cerrar la pestaña; nunca lanza si `localStorage` se llena y avisa con un banner.
3. **Importación masiva de ventas**: resolución de producto/farmacia/droguería memoizada por valor distinto, índice de columnas construido una vez por archivo, similitud de nombres pre-tokenizada, el diccionario Cod SAP aprende **una** regla por producto (antes duplicaba una por fila) e inserción a Supabase por lotes de 500.
4. **Homologar Farmacias y Diccionario Cod SAP** (`import/HomologationPanels.tsx`): las dos secciones estaban en la barra pero sin contenido y los botones de alerta abrían modales que no existían. Ahora hay sugerencia con % de afinidad, "Aceptar", "Aceptar todas ≥ 85 %", buscador de otra farmacia/producto, listado con filtro y borrado, y sincronización con `map_cliente_drogueria` / `map_producto_drogueria` (esquema v3) si hay Supabase.
5. **Navegación adaptable**: barra inferior + hoja "Más" (móvil), riel de iconos (iPad/tablet y laptop pequeña) y barra lateral agrupada (PC ≥ 1280 px). Cabecera de una sola fila (antes ocupaba dos), sin `backdrop-blur`, márgenes seguros de iPhone, botón "atrás" que navega entre módulos (`#/pestaña`).
6. **Pantalla del transferencista rehecha**: lista + detalle lado a lado en PC (con SKU y precio en pantallas ≥ 1536 px), lista → detalle en tablet/móvil, conciliación con teclado (Enter/↓/↑), "Facturar todo completo", N° de factura guardado en el pedido, filtros por estado con contadores, barra de cierre siempre visible, líneas como tarjetas en móvil.
7. **Motor de sugeridos**: nombres normalizados una vez, detalles indexados por pedido y fechas ISO comparadas como texto (antes, `toLowerCase` + `new Date` por cada fila del histórico).
8. **Vademécum**: se dibuja solo una vista (antes tarjetas **y** tabla a la vez) y por páginas de 60.
9. **Base visual y táctil**: variante `dark:` de Tailwind enlazado al tema de la app (antes seguía el modo del sistema operativo y las clases `dark:` no coincidían con el botón de tema), animaciones que no existían (`animate-in` requiere un plugin que no estaba instalado), campos a 16 px en móvil (evita el zoom de iOS), objetivos táctiles ≥ 44 px, `100dvh`, icono de pestaña y `theme-color`.
10. **Recursos**: el micrófono se libera al cerrar el dictado (se creaba un reconocedor nuevo por cada cambio del catálogo y nunca se detenía), el cliente Supabase se recrea si cambia la URL/clave, y los toasts del transferencista limpian sus temporizadores.

## Errores corregidos

- `TeletransferQueueTab`: el monto liquidado acumulaba `conf` (suma corrida) en vez de la cantidad de cada línea; el detalle mostraba un pedido oculto por los filtros; el botón "Confirmar Facturado Droguería" no hacía nada; el N° de factura no se guardaba.
- `RepDashboardTab`: "Mi rendimiento" calculaba con los pedidos de **todos** los vendedores.
- `OrderTakingTab`: cada pedido nuevo arrancaba con 3 líneas de demostración (riesgo de transmitirlas) y el escáner/voz mutaba el estado (duplicaba cantidades en StrictMode).
- `AdminUsersTab`: "Restablecer contraseña" mostraba éxito sin hacer nada; ahora envía el correo de Supabase o explica que hace falta conexión.
- `index.html`/`metadata.json`/`.env.example` hablaban de "PharmaTransfer" y de Gemini.
- Eliminados imports, estados y funciones sin uso en más de 15 archivos.

## Próximas mejoras (listas para implementar)

1. **IndexedDB para el histórico de ventas**: `localStorage` no aguanta un trimestre completo (≈ 3 MB por cada 5 000 filas). Con IndexedDB (o solo Supabase + agregados) desaparece el aviso de almacenamiento lleno.
2. **PWA + Service Worker** (ya en el roadmap): cachear la shell y los chunks para que el vendedor abra la app sin señal y no vuelva a descargar nada.
3. **Cola offline de pedidos** con reintento al recuperar conexión (hoy los pedidos solo viven en el navegador que los tomó).
4. **Supabase Realtime** para la cola del transferencista: que vea llegar pedidos sin recargar y que se acabe el estado por navegador.
5. **Partir `DataImportStudioTab.tsx` (≈ 4 000 líneas)** en un módulo por sub-pestaña y mover la resolución de filas a un Web Worker para que archivos de 100 000+ filas no congelen la interfaz.
6. **Pruebas automáticas** (Vitest) para `suggestedOrderEngine`, `csvExportEngine`, `importUtils` y un workflow de CI con `npm run lint && npm run build`.

## Hallazgos que requieren tu decisión (no se tocaron)

- **Sin sesión, la interfaz es de administrador**: `usuarioActual` arranca (y vuelve tras "Cerrar sesión") con el usuario admin de `mockData`. La seguridad real depende solo de RLS en Supabase.
- **`AdminUsersTab` → `supabase.auth.signUp`** desde el navegador puede reemplazar la sesión del admin por la del usuario recién creado. Lo correcto es una Edge Function con la service key.
- **`RepDashboardTab`** muestra cifras y paneles inventados (salud de enlaces B2B, flujo horario, vendedores en campo, "18 min", "96.4 %") cuando no hay datos. Conviene etiquetarlos como demo o quitarlos.
- **`design.md` no llegó al repositorio** (no existe en ninguna rama). Las referencias "Stitch design.md" del dashboard y de la toma de pedido se conservaron y su paleta quedó como tokens en `@theme` de `src/index.css` (`bg-primary`, `text-on-surface`…). Al subir el archivo se aplica sobre esos tokens.
