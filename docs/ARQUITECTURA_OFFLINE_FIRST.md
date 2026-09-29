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
| Base de datos | `src/sql/nova_produccion_v3.sql` | DDL completo: 24 tablas y 4 vistas, enums, PostGIS, triggers, RPC, RLS, Realtime, purga segura |
| | `src/sql/migracion/` | Migración desde el esquema de fase 1: archivar (`1_…`) y copiar datos (`2_…`) |
| | `db-tests/` | Valida el DDL, la homologación y la migración en un PostgreSQL local (`./db-tests/run.sh`): escenarios de negocio + verificación de migración |
| Datos locales | `src/offline/db.ts` | Esquema Dexie (índice multiEntry `tokens` para búsqueda por prefijo) |
| | `src/offline/types.ts` | Tipos locales (reflejan las tablas + `sync_estado`, `correlativo_provisional`) |
| Cola | `src/offline/outbox.ts` | Outbox: encolar, enviar en orden, backoff, ack, errores, compensación |
| | `src/offline/pedidos.ts` | Operaciones del vendedor: cada una escribe local **y** encola en una sola transacción |
| | `src/offline/splitOrders.ts` | Remanente y correlativos `PED-XXXX-R1` (puro) |
| Sync | `src/offline/pull.ts` | Descarga incremental por cursor (11 tablas; las compras solo de los últimos 6 meses) |
| | `src/offline/motor.ts` | Dispara el sync solo: `online`, visibilidad, temporizadores, Web Locks, Background Sync |
| | `src/offline/remoto.ts`, `supabaseRemoto.ts` | Puerto `SyncRemote` y su implementación con supabase-js |
| Negocio cliente | `src/offline/politicas.ts` | Reglas comerciales (espejo del servidor) |
| | `src/offline/sugerido.ts`, `busqueda.ts` | Pedido sugerido y búsqueda local |
| Exportación | `src/services/exportacionDrogueria.ts` | CSV/TXT por droguería con los códigos **principales** de esa droguería |
| Puente app clásica | `src/services/nubeV3.ts` | Import Studio, catálogos y usuarios contra v3 por clave natural (ident01, SKU, códigos de droguería) |
| UI | `src/components/capture/*` | Pantalla de captura móvil/tablet (carrito flotante, búsqueda, condiciones, escáner) |
| | `src/components/SyncStatusChip.tsx` | Indicador de sincronización del encabezado |
| PWA | `public/sw.js`, `manifest.webmanifest`, `vite.config.ts` (plugin `sw-manifest`) | Instalable y abre sin red |

## 1B. Modelo de datos: dimensiones, hechos y homologación

```
                        DIMENSIONES                                   HOMOLOGACIÓN (puentes)               HECHOS
 dim_equipos ─┬─ dim_usuarios ──────────────┐
              │        │                    │
              │  rel_cliente_vendedor       │            map_cliente_drogueria  ──┐          fact_pedidos ── fact_pedido_detalles
              │        │                    │              (N cuentas/nombres      │             (parent_pedido_id: PED-1045-R1)
              └─ dim_productos ─────────────┼───────────    por farmacia y por     ├──▶ dim_droguerias
                       │                    │               droguería, 1 principal)│
 dim_clientes ─────────┴────────────────────┘            map_producto_drogueria ──┘          fact_ventas_drogueria ◀── import_lotes
 (farmacias; prospectos hasta validar)                     (N códigos por producto y            (lo que reporta cada droguería,
                                                            droguería, 1 principal)              con SUS códigos y nombres)
 dim_droguerias (layout de exportación en                                                              │ homologar_ventas()
 formato_export)                                                                                        ▼
                                                                                              fact_compras_mensual  (cliente × producto × mes)
                                                                                              → pedido sugerido, segmentos VIP, alertas
```

| Tipo | Tablas | Para qué |
|---|---|---|
| **Dimensiones** | `dim_equipos`, `dim_usuarios`, `dim_clientes`, `dim_productos`, `dim_droguerias` | Los "quién / qué / dónde": cada fila es una entidad maestra con **un solo** identificador interno (UUID) y su clave natural (`codigo_interno` = ident01, `sku` = Cod SAP, `codigo` de droguería). |
| **Puentes** | `rel_cliente_vendedor`, `map_cliente_drogueria`, `map_producto_drogueria` | Conectan dimensiones. Los `map_*` traducen entre **nuestro** código y **el de cada droguería**. |
| **Hechos** | `fact_pedidos` + `fact_pedido_detalles` (lo que Nova toma), `fact_ventas_drogueria` (lo que reportan las droguerías), `fact_compras_mensual` (consolidado) | Los eventos medibles (unidades). Sin precios en fase 1. |
| **Operativas** | `crm_visitas`, `plantillas_reposicion`/`plantilla_items`, `notificaciones`, `alertas_comerciales`, `pedido_bloqueos`, `config_reglas_comerciales`, `precios_drogueria_producto` (futura), `import_lotes`, `config_sistema`, `secretos_sistema`, `audit_log` | Soporte de campo, alertas, reglas, auditoría. |

### Cada droguería habla su propio idioma (códigos y nombres únicos)

Una misma farmacia y un mismo producto reciben códigos y nombres distintos en cada droguería. NOVA nunca cambia sus identificadores: **mantiene los de cada droguería en las tablas puente**.

| Situación real | Cómo lo resuelve el modelo |
|---|---|
| Cobeca llama a la farmacia `COB-1001 · "FARMACIA LA PAZ"` y Nena `"LA PAZ CHACAO"` (sin código) | Dos filas en `map_cliente_drogueria`, una por droguería, apuntando a la **misma** `dim_clientes`. Se reconoce por código de cuenta o, si el reporte no trae código, por **nombre normalizado** (sin tildes, mayúsculas, sin signos). |
| Una droguería tiene **dos cuentas** (o dos nombres) para la misma farmacia | Varias filas en `map_cliente_drogueria` para (droguería, farmacia). Una es la **principal** (`es_principal`): esa se escribe en el pedido; las demás sirven para leer reportes. |
| Cobeca codifica Losartán como `COB-LOS` y luego lo reemplaza por `COB-LOS2` | Varias filas en `map_producto_drogueria`: los reportes de ambos códigos suman al mismo SKU; el **principal** es el que se exporta. |
| El mismo código de una droguería no puede significar dos productos/farmacias | Índice único `(drogueria, código)`: intentar repetirlo falla con un error claro (`homologar_*`, `importar_homologacion`). |
| El reporte de ventas trae el Cod SAP | `homologar_ventas` **aprende** el código de la droguería solo (si ese código apunta a un único SKU): el mapeo queda con `origen = 'importacion'`. |

Flujo de un reporte de ventas (`importar_ventas_drogueria`):

1. La fila se guarda **tal como llegó** (códigos y nombres de la droguería) en `fact_ventas_drogueria`, agrupada en un `import_lotes` (el `checksum` evita duplicar si se reenvía el archivo).
2. `app.homologar_ventas` enlaza `cliente_id` / `producto_id` con los `map_*`. Lo que no reconoce queda con FK nula y aparece en **`vw_pendientes_clientes` / `vw_pendientes_productos`**, ordenado por volumen (se resuelve primero lo que más pesa; `sugerir_farmacias` / `sugerir_productos` proponen candidatos por similitud).
3. Al crear un mapeo (`homologar_cliente`, `homologar_producto`, `importar_homologacion` o un INSERT), un trigger **enlaza retroactivamente** todo el histórico de esa droguería. Corregir un mapeo equivocado: se edita y se corre `reprocesar_homologacion`.
4. `fact_compras_mensual` se recalcula solo para los meses afectados y baja al dispositivo (últimos 6 meses) para el pedido sugerido, los segmentos VIP y las alertas (SKU hueso, abandono).
5. `vw_estado_homologacion` muestra, por droguería, el % de filas ya enlazadas.

Al **exportar** un pedido hacia una droguería (`exportacionDrogueria.ts`) se hace el camino inverso: farmacia y productos internos → sus códigos **principales** en esa droguería. Si falta alguno, no sale un archivo incompleto: se listan los SKU/farmacias sin código.

Decisión deliberada: el **RIF no es único** (una cadena comparte razón social entre locales); la identidad de cada local es su `codigo_interno`. `vw_clientes_rif_repetido` ayuda a detectar duplicados reales.

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
- **Alta de usuarios:** toda cuenta nueva de Supabase Auth nace como `vendedor` **inactivo** (trigger `on_auth_user_created`); el rol y el
  equipo NUNCA se toman de los metadatos del registro (los escribe quien se registra). Un administrador la activa con
  `admin_configurar_usuario`. La app lee el rol desde `dim_usuarios` al iniciar sesión, no desde `user_metadata`.

## 6. Puesta en marcha en Supabase

**Proyecto nuevo:**
1. SQL Editor: ejecutar `src/sql/nova_produccion_v3.sql` completo (re-ejecutable).
2. Registrar tu usuario (Authentication → Users, o desde la app) y promoverte una sola vez desde el SQL Editor:
   `UPDATE dim_usuarios SET rol = 'admin', activo = true WHERE email = 'tu@correo.com';`
3. Iniciar sesión en la app; desde ahí, cargar catálogos, droguerías (con su layout), homologaciones y ventas en **Carga de Datos**, y dar de alta al resto del equipo en **Usuarios**.

**Proyecto con el esquema de fase 1 (dim_clientes con `ident01`, `fact_historico_ventas`…):**
1. `src/sql/migracion/1_archivar_esquema_anterior.sql` — mueve las tablas anteriores al esquema `legacy` (no borra nada) y retira el trigger de alta inseguro.
2. `src/sql/nova_produccion_v3.sql`.
3. `src/sql/migracion/2_migrar_datos_anteriores.sql` — copia usuarios, droguerías (convierte el layout CSV), productos, farmacias, homologaciones y ventas; enlaza el histórico e imprime el resumen y lo pendiente. Re-ejecutable.
4. Promover tu usuario administrador si el resumen avisa que no hay ninguno (paso 2 de arriba) e iniciar sesión.
5. Con todo verificado: `DROP SCHEMA legacy CASCADE;`.

Después, en ambos casos:
- Realtime ya queda habilitado para `fact_pedidos`, `pedido_bloqueos`, `notificaciones` y `dim_clientes`.
- Programar `recalcular_segmentos_clientes()` y `generar_alertas_comerciales()` a diario (pg_cron, ver el final del DDL).
- En la app: **Supabase (configurar)** con URL y anon key. La sesión de Supabase Auth es obligatoria (RLS): sin iniciar sesión las tablas no devuelven datos.

## 7. Pruebas

```bash
npm test                                   # 67 pruebas de lógica cliente (Dexie en memoria)
NOVA_PG=1 PGHOST=… PGUSER=… npm test       # +9 de integración contra PostgreSQL + PostGIS reales
./db-tests/run.sh                          # DDL (dos veces) + escenarios de negocio + migración desde la fase 1 (dos veces)
```

La prueba de integración ejecuta la **misma cola** del dispositivo contra las RPC reales: cubre pull, pedido offline,
split `PED-1001-R1`, exportación, prospecto, check-in, aislamiento de errores y el circuito ventas de droguería → homologación → consolidado → pedido sugerido.
`db-tests/20_homologacion.sql` cubre códigos múltiples con principal, pendientes, homologación retroactiva, corrección, permisos y alta de usuarios;
`db-tests/30-31` cargan un esquema de fase 1 con datos y verifican la migración (incluida su re-ejecución).

## 8. Límites conocidos

- **Background Sync** solo existe en Chromium/Android. En Safari/iOS el envío ocurre al reconectar (`online`), al volver a la
  pestaña y cada 30 s con la app abierta; con la app cerrada en iOS no hay envío hasta abrirla.
- El navegador puede liberar IndexedDB si el dispositivo se queda sin espacio: `navigator.storage.persist()` reduce el riesgo
  pero no lo elimina. Lo pendiente de enviar es lo único irremplazable; conviene sincronizar al final de cada jornada.
- Falta la interfaz del panel del transferencista con presencia en vivo (el servidor —`tomar_pedido`, `pedido_bloqueos`,
  Realtime— y el adaptador ya existen) y la del administrador para editar reglas comerciales (hoy son datos en la tabla).
- Las pantallas anteriores (toma clásica, sugerido, teletransferencias) siguen usando el modelo local previo (`localStorage`); la
  captura v3 convive con ellas hasta migrarlas. Sus cargas a la nube (catálogos, homologación, ventas, usuarios) ya van al esquema v3
  a través de `src/services/nubeV3.ts`.
- Las pantallas para resolver lo pendiente de homologar y el tablero `vw_estado_homologacion` existen como vistas/RPC; la pantalla nueva
  está por hacer (hoy se usa la del Import Studio, que trabaja con el modelo local y sube por `importar_homologacion`).
- La tabla `inventario_drogueria` de la fase 1 no se migra (la app nunca la usó): el inventario sigue siendo local.
