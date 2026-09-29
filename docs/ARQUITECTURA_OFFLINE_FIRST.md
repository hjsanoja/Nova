# NOVA v3 · Arquitectura offline-first

Laboratorio → Equipos comerciales → Droguerías → Farmacias. El vendedor captura en campo **sin conexión**; todo se
guarda en el dispositivo y se sincroniza solo, en segundo plano, cuando vuelve la red.

```
┌────────────────────────── Dispositivo (PWA) ──────────────────────────┐        ┌──────────── Supabase ────────────┐
│ React UI ── Dexie/IndexedDB ── Outbox (cola FIFO, UUID del cliente)    │        │ PostgREST + RLS                  │
│   captura      catálogo, clientes, reglas,   │                         │ RPC    │  sync_crear_pedido    ┐          │
│   carrito      pedidos, detalles, visitas    ▼                         │ ─────▶ │  sync_modificar_pedido│ idempot. │
│   borrador  ◀── pull incremental (cursor updated_at) ◀───────────────  │ ◀───── │  rerutear_remanente   ┘          │
│ Service Worker: precache de la app + Background Sync                   │  REST  │ triggers: correlativo, estados,  │
│ Indicador: 🟢 conectado · 🟠 sin conexión (N guardados) · 🔵 sincroniza │        │ geofence, notificación, RLS      │
└────────────────────────────────────────────────────────────────────────┘        └──────────────────────────────────┘
```

## 1. Archivos

| Capa | Archivo | Qué hace |
|---|---|---|
| Base de datos | `src/sql/nova_produccion_v3.sql` | DDL completo: 24 tablas, enums, PostGIS, triggers, RPC, RLS, Realtime, purga segura |
| | `db-tests/` | Valida el DDL en un PostgreSQL local (`./db-tests/run.sh`): 11 escenarios de negocio |
| Datos locales | `src/offline/db.ts` | Esquema Dexie (índice multiEntry `tokens` para búsqueda por prefijo) |
| | `src/offline/types.ts` | Tipos locales (reflejan las tablas + `sync_estado`, `correlativo_provisional`) |
| Cola | `src/offline/outbox.ts` | Outbox: encolar, enviar en orden, backoff, ack, errores, compensación |
| | `src/offline/pedidos.ts` | Operaciones del vendedor: cada una escribe local **y** encola en una sola transacción |
| | `src/offline/splitOrders.ts` | Remanente y correlativos `PED-XXXX-R1` (puro) |
| Sync | `src/offline/pull.ts` | Descarga incremental por cursor (10 tablas) |
| | `src/offline/motor.ts` | Dispara el sync solo: `online`, visibilidad, temporizadores, Web Locks, Background Sync |
| | `src/offline/remoto.ts`, `supabaseRemoto.ts` | Puerto `SyncRemote` y su implementación con supabase-js |
| Negocio cliente | `src/offline/politicas.ts` | Reglas comerciales (espejo del servidor) |
| | `src/offline/sugerido.ts`, `busqueda.ts` | Pedido sugerido y búsqueda local |
| Exportación | `src/services/exportacionDrogueria.ts` | CSV/TXT por droguería con códigos homologados |
| UI | `src/components/capture/*` | Pantalla de captura móvil/tablet (carrito flotante, búsqueda, condiciones, escáner) |
| | `src/components/SyncStatusChip.tsx` | Indicador de sincronización del encabezado |
| PWA | `public/sw.js`, `manifest.webmanifest`, `vite.config.ts` (plugin `sw-manifest`) | Instalable y abre sin red |

## 2. Contrato de sincronización

**Regla de oro:** el dispositivo nunca espera al servidor. Toda mutación es `cambio local + item en Outbox` en una sola
transacción de IndexedDB; el servidor la aplica con una RPC **idempotente** (mismo `id` ⇒ mismo resultado).

| Outbox `tipo` | RPC | Idempotencia | Respuesta que adopta el dispositivo |
|---|---|---|---|
| `pedido.crear` | `sync_crear_pedido(p)` | por `p.id` | `correlativo` oficial, `estado`, motivos de revisión, `row_version` |
| `pedido.modificar` | `sync_modificar_pedido(p)` | `base_version` | igual, o `{conflicto:true}` |
| `pedido.rerutear` | `rerutear_remanente(pedido, drogueria, nuevo_id)` | por `nuevo_id` | correlativo `PED-XXXX-R1`, líneas con ids del servidor |
| `prospecto.crear` | `sync_crear_prospecto(p)` | upsert por `id` | `estado_validacion` |
| `visita.registrar` | `sync_registrar_visita(p)` | upsert por `id` | distancia real (PostGIS) y `dentro_de_radio` |
| `plantilla.guardar` | `sync_guardar_plantilla(p)` | upsert por `id` | — |

- **Orden:** FIFO por `seq`. Un item espera a los anteriores de su misma entidad y a los de la entidad de la que depende
  (`depende_de`): un re-ruteo no sale antes del alta de su pedido padre. Un item en error **no bloquea** a otras entidades.
- **Fallos:** `red` (sin conexión, 5xx, 429) ⇒ espera exponencial 2 s→5 min con jitter y se reanuda al evento `online`;
  `auth` ⇒ la cola se pausa hasta iniciar sesión; `permanente` (validación, permisos, FK) ⇒ el item queda en `error`,
  el pedido muestra el motivo y se puede reintentar o descartar. Un re-ruteo rechazado **se deshace** (compensación).
- **Pull:** por tabla, `updated_at > cursor` (con 5 s de solape), páginas de 500, upsert idempotente. Una fila con cambios
  locales pendientes no se pisa; `deleted_at` borra localmente. Primera carga: solo 90 días de pedidos.
- **Conflictos:** concurrencia optimista con `row_version`. Si otro usuario cambió el pedido mientras editabas offline,
  el servidor responde `conflicto` y el pedido queda marcado; el usuario descarta lo local (`descartarCambiosLocales`).
- **Correlativo:** lo asigna solo el servidor (`PED-1045`). Mientras tanto se muestra el folio local `L-7F3A2C11-0012`.

## 3. Split orders (regla 2)

```
Pedido PED-1045 (droguería A) ──mesa confirma parcial──▶ procesado_parcial ──🔔──▶ vendedor
   línea 1: 10/10   línea 2: 3/8   línea 3: 0/6
                                            un toque: "re-rutear a droguería B"
                                                     ▼
Pedido PED-1045-R1 (droguería B, en_revision, parent_pedido_id = PED-1045)
   solo lo pendiente: línea 2: 5 uds, línea 3: 6 uds
```

- `fact_pedido_detalles.unidades_pendientes` es una columna generada; `remanente_derivado_en` evita derivar dos veces.
- La numeración sigue a la **raíz** de la cadena: un derivado que sale parcial genera `PED-1045-R2` con `parent_pedido_id = R1`.
- Se puede hacer offline: el hijo aparece al instante (`PED-1045-R1`, provisional) y el servidor confirma el correlativo.

## 4. Políticas comerciales (regla 3)

`config_reglas_comerciales` define topes de descuento (por línea o pedido), mínimo de SKUs distintos, de unidades totales y de
unidades por categoría, con alcance opcional por equipo, droguería y segmento (VIP/recurrente). El dispositivo cachea las
reglas y evalúa con `politicas.ts`; el servidor re-evalúa con `app.evaluar_reglas_pedido`. Lo que excede el tope **se acepta**
pero queda `en_revision` con `requiere_revision_especial = true` y el detalle de cada violación. Ambas implementaciones
comparten los mismos casos de prueba (`politicas.test.ts` y `db-tests/10_escenarios.sql`).

## 5. Seguridad

| Rol | Ve | Escribe |
|---|---|---|
| Vendedor | catálogo, sus farmacias (de **cualquier** equipo) y **todos** los pedidos de esas farmacias | sus pedidos mientras están `borrador`/`enviado`/`en_revision`; prospectos propios |
| Transferencista | todo lo operativo | estados de pedido vía `tomar_pedido` + `confirmar_pedido`, homologaciones, aprobación de prospectos |
| Gerente | todo (lectura) | — |
| Admin | todo | catálogos, reglas, usuarios, purga |

- Un prospecto no puede pasar a `en_proceso`/`procesado_*`/`facturado` sin RIF verificado y homologación con la droguería
  destino (trigger `guardar_transicion_pedido`).
- `purgar_base_datos_pruebas(admin_pass, solo_transaccional)`: solo admin, solo si `purga_habilitada = true`, clave bcrypt,
  5 intentos por 15 min, y queda en `audit_log`. Nunca toca usuarios, equipos, configuración ni auditoría.
- `anon` no tiene acceso a ninguna tabla; las funciones internas viven en el esquema `app`.

## 6. Puesta en marcha en Supabase

1. Crear un proyecto nuevo y ejecutar `src/sql/nova_produccion_v3.sql` completo en el SQL Editor (es re-ejecutable).
2. Crear usuarios en Auth y su fila en `dim_usuarios` (idealmente con una Edge Function; el navegador no debe usar la service key).
3. Cargar catálogo, droguerías (con su `formato_export`), homologaciones y `config_reglas_comerciales`.
4. Realtime ya queda habilitado para `fact_pedidos`, `pedido_bloqueos`, `notificaciones` y `dim_clientes`.
5. Programar `recalcular_segmentos_clientes()` y `generar_alertas_comerciales()` a diario (pg_cron, ver el final del DDL).
6. En la app: **Supabase (configurar)** con URL y anon key. La sesión de Supabase Auth es obligatoria (RLS).

## 7. Pruebas

```bash
npm test                                   # 46 pruebas de lógica cliente (Dexie en memoria)
NOVA_PG=1 PGHOST=… PGUSER=… npm test       # +8 de integración contra PostgreSQL + PostGIS reales
./db-tests/run.sh                          # DDL (dos veces) + 11 escenarios de negocio en SQL
```

La prueba de integración ejecuta la **misma cola** del dispositivo contra las RPC reales: cubre pull, pedido offline,
split `PED-1001-R1`, exportación, prospecto, check-in y aislamiento de errores.

## 8. Límites conocidos

- **Background Sync** solo existe en Chromium/Android. En Safari/iOS el envío ocurre al reconectar (`online`), al volver a la
  pestaña y cada 30 s con la app abierta; con la app cerrada en iOS no hay envío hasta abrirla.
- El navegador puede liberar IndexedDB si el dispositivo se queda sin espacio: `navigator.storage.persist()` reduce el riesgo
  pero no lo elimina. Lo pendiente de enviar es lo único irremplazable; conviene sincronizar al final de cada jornada.
- Falta la interfaz del panel del transferencista con presencia en vivo (el servidor —`tomar_pedido`, `pedido_bloqueos`,
  Realtime— y el adaptador ya existen) y la del administrador para editar reglas comerciales (hoy son datos en la tabla).
- Las pantallas anteriores (toma clásica, sugerido, teletransferencias) siguen usando el modelo local previo; la captura v3
  convive con ellas hasta migrarlas.
