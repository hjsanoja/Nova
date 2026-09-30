# NOVA - Contexto Arquitectónico y Manual de Ingeniería para IA & Desarrolladores

> **Propósito de este documento:** Este archivo proporciona a cualquier modelo de Inteligencia Artificial (IA) o desarrollador senior el contexto completo, arquitectónico, funcional y técnico de la aplicación **NOVA**. Permite continuar el desarrollo, generar código nuevo de máxima calidad y mantener estricta coherencia con las reglas del negocio farmacéutico sin romper esquemas ni introducir dependencias innecesarias.

---

## 1. Visión General del Negocio y Dominio Farmacéutico

**NOVA** es una Single Page Application (SPA) de grado empresarial diseñada específicamente para la industria comercial farmacéutica (enfocada en laboratorios como **La Santé**, líneas **Comercial**, **OTC** y cadenas de farmacias en Venezuela).

### Problemas clave que resuelve el sistema:
1. **Multi-nombre de Farmacias entre Droguerías:** Una misma farmacia física (ej. *Farmatodo Las Mercedes*, con código maestro `CLI-1001`) es nombrada de forma diferente por cada droguería (ej. `"FARMATODO LAS MERCEDES CARACAS"` en Cobeca, `"FTO LAS MERCEDES AV PPAL"` en Nena, `"DROGUERIA Y FARMACIA LA PAZ"` en Drobienca). NOVA homologa automáticamente estos nombres con puntuación de similitud y persistencia en base de datos.
2. **Ausencia de `Cod Sap` en reportes brutos de venta:** Los reportes diarios de ventas descargados de las droguerías traen el código interno de la droguería (`Codigo Producto`), pero no el `Cod Sap` interno del laboratorio. NOVA cuenta con un diccionario de aprendizaje automático que memoriza la relación `(Droguería + Código Droguería) <-> Cod Sap Maestro`, eliminando la necesidad de anexar manualmente el código SAP en Excel cada mes.
3. **Mapeo B2B de Clientes:** Cada droguería exige su propio código de cliente en los pedidos B2B. NOVA almacena la relación en `rel_cliente_drogueria_codigos` para inyectarlo en caliente al exportar teletransferencias.
4. **Motor de Sugerido Global:** Algoritmo que analiza el histórico acumulado de ventas a 30, 60 y 90 días (sumando compras de los equipos A La Santé y B Comercial/OTC), ponderando productos estratégicos, empaque mínimo y límites de descuento por droguería.
5. **Exportación Dinámica de Teletransferencias CSV:** Cada droguería (Cobeca, Nena, Drobienca, BLV, etc.) exige un formato CSV completamente distinto (delimitadores `;`, `,`, `|`, orden de columnas, entrecomillado, formato decimal). NOVA compila estos layouts dinámicamente en el navegador sin backend intermedio.
6. **Movilidad en Campo para Vendedores:** Toma de pedidos optimizada para tablets y smartphones, sin conexión, con búsqueda rápida y escaneo de códigos de barra/QR con cámara trasera. Cada vendedor ve solo su fichero de farmacias.

---

## 2. Arquitectura Tecnológica y Alojamiento

* **Frontend:** React 19 con Vite 8 y TypeScript estricto (`strict`, `noUnusedLocals`, `noUnusedParameters`; `npm run lint` = `tsc --noEmit`).
* **Estilos:** Tailwind CSS v4 con modo Claro y Oscuro (`ThemeContext` alterna la clase `dark` en `<html>`; el variante `dark:` de Tailwind está enlazado a esa clase en `src/index.css`). Los tokens de diseño (fuentes, paleta Stitch, animación) viven en el bloque `@theme` de `src/index.css`.
* **Rendimiento:** cada pestaña y cada modal se cargan con `React.lazy` (bundle inicial ≈ 105 kB gzip); `@supabase/supabase-js` y `html5-qrcode` solo se descargan cuando se usan; el estado persistido en `localStorage` se escribe con debounce y tolera cuota llena (`src/hooks/usePersistentState.ts`).
* **Navegación responsiva:** móvil (<768 px) barra inferior + hoja "Más"; tablet y laptop pequeña (768–1279 px) riel lateral compacto; PC (≥1280 px) barra lateral agrupada. La pestaña activa se sincroniza con el hash (`#/teletransferencia`) para que el botón "atrás" funcione.
* **Diseño para Alojamiento:** **100% Estático y Gratuito**. Puede desplegarse en **GitHub Pages** (con soporte de SPA mediante script de redirección 404 o hash routing) y en contenedores **Google Cloud Run / AI Studio**.
* **Backend & Base de Datos:** **Supabase (PostgreSQL 15+ con PostGIS)**:
  * Autenticación con Supabase Auth (correo/contraseña, recuperación nativa); el rol se lee de `dim_usuarios`, nunca de los metadatos.
  * Row Level Security (RLS) estricto por roles (`admin`, `gerente`, `transferencista`, `vendedor`).
  * Triggers y funciones PL/pgSQL: correlativos, máquina de estados, homologación automática de ventas, geofence, alertas.
* **Resiliencia Offline-First:** Si Supabase no está conectado o el usuario no tiene conexión en calle, el sistema opera con `localStorage` y estado en memoria, permitiendo sincronización posterior.

---

## 3. Estructura de la Base de Datos (PostgreSQL / Supabase)

El esquema vigente es **v3**: `src/sql/nova_produccion_v3.sql` (24 tablas, 4 vistas, RLS, RPC). No existe migración de datos desde esquemas anteriores: el script se ejecuta sobre un proyecto vacío. Si el proyecto tiene restos de otra versión, `src/sql/00_reiniciar_esquema_anterior.sql` los aparta en un esquema de respaldo antes de instalar. El detalle completo del modelo, del flujo de
homologación y de la seguridad está en ese documento; aquí van las reglas que no deben romperse.

### 3.1. Dimensiones (los "quién / qué / dónde")

* **`dim_clientes`** (farmacias): PK `id` (UUID; lo genera el dispositivo si nace en campo) y clave natural `codigo_interno` (= el antiguo `ident01`, `CLI-1001`; nulo en prospectos).
  `razon_social`, `nombre_comercial`, `rif` (**no único**: una cadena comparte RIF entre locales), `brick`, `municipio`, `estado_geografico`, `bandera`, `ubicacion` (PostGIS) + `lat`/`lon` generadas,
  `frecuencia_dias`, `estado_validacion` (`prospecto_pendiente` → `activo`/`inactivo`), `segmento` (`estandar`/`recurrente`/`vip`).
* **`dim_productos`**: clave natural `sku` (= Cod SAP), `ean13`, `nombre_comercial`, `presentacion`, `principio_activo`, `categoria`, `empaque_minimo`, `es_prioritario`. Sin precios ni stock en fase 1.
* **`dim_droguerias`**: `codigo`, `nombre`, `nombre_normalizado` (para reconocerla en los reportes) y `formato_export` (JSONB con el layout del archivo de pedido: delimitador, encabezados, orden de columnas, codificación, decimal, TXT posicional…).
* **`dim_equipos`** y **`dim_usuarios`** (extiende `auth.users`; roles `vendedor`, `transferencista`, `gerente`, `admin`). Una cuenta nueva nace inactiva: el rol/equipo lo fija un administrador.

### 3.2. Puentes y homologación por droguería

Cada droguería tiene **sus propios** códigos y nombres para cada producto y cada farmacia. Los identificadores internos nunca cambian; lo de cada droguería vive en:

* **`map_cliente_drogueria`**: (droguería, farmacia) → `codigo_cuenta` (opcional) y/o `nombre_en_drogueria` (normalizado). N filas por farmacia y droguería; **una principal** (`es_principal`) es la que se escribe en el pedido. Un código de cuenta pertenece a una sola farmacia por droguería.
* **`map_producto_drogueria`**: (droguería, producto) → `codigo_drogueria`. N códigos por producto (códigos reemplazados, presentaciones); **uno principal** para exportar; un código identifica un solo producto por droguería.
* **`rel_cliente_vendedor`**: una farmacia puede tener vendedores de varios equipos (visibilidad cruzada).

### 3.3. Hechos

* **`fact_pedidos` / `fact_pedido_detalles`**: lo que Nova toma en campo. Correlativo del servidor (`PED-1045`, derivados `PED-1045-R1` con `parent_pedido_id`), estados con máquina de transiciones, campos de precio nulos.
* **`fact_ventas_drogueria`** (+ `import_lotes`): lo que **reportan las droguerías**, guardado con sus códigos y nombres; `cliente_id`/`producto_id` se enlazan con los `map_*` (`app.homologar_ventas`) y quedan nulos si no se reconocen (`vw_pendientes_clientes`, `vw_pendientes_productos`). Homologar después enlaza el histórico retroactivamente.
* **`fact_compras_mensual`**: consolidado farmacia × producto × mes. Baja al dispositivo (6 meses) y alimenta pedido sugerido, segmentos y alertas.
* Operativas: `crm_visitas` (geofence), `notificaciones`, `alertas_comerciales`, `pedido_bloqueos`, `config_reglas_comerciales`, `precios_drogueria_producto` (futura), `audit_log`.

---

## 4. Estructura de Archivos del Código Fuente

```text
/
├── .env.example                       # Variables de entorno Supabase (URL y Anon Key)
├── index.html                         # Punto de entrada HTML con meta tags
├── metadata.json                      # Metadatos del applet en AI Studio
├── package.json                       # Dependencias: React, Lucide, Supabase, html5-qrcode
├── tsconfig.json                      # Configuración TypeScript estricta
├── vite.config.ts                     # Configuración de Vite
├── SYSTEM_CONTEXT.md                  # Este documento de contexto para IA
└── src/
    ├── App.tsx                        # Raíz: estado global, handlers, pestañas/modales perezosos, hash-routing
    ├── main.tsx                       # Montaje React DOM
    ├── index.css                      # Tailwind v4, tokens @theme, utilidades (safe-area, cv-auto, scrollbar-none)
    ├── context/
    │   └── ThemeContext.tsx           # Modo Claro / Oscuro con persistencia
    ├── hooks/
    │   └── usePersistentState.ts      # useState persistido: debounce, flush al cerrar, aviso si localStorage se llena
    ├── data/
    │   └── mockData.ts                # Datos semilla de 17 droguerías, productos, farmacias e histórico
    ├── services/
    │   ├── supabaseConfig.ts          # URL/Anon Key (sin cargar el SDK de Supabase)
    │   ├── supabaseClient.ts          # Cliente Supabase, cliente sin sesión (altas de usuarios) y prueba de conexión
    │   ├── nubeV3.ts                  # Puente pantallas clásicas ↔ esquema v3 (catálogos, homologación, ventas, usuarios)
    │   ├── storageMigrations.ts       # Saneado de datos guardados (productos, clientes, droguerías) y CSV por defecto
    │   ├── importUtils.ts             # Similitud de nombres, detección de mes, lector de columnas indexado
    │   ├── sesion.ts                  # Inicio/cierre de sesión (Supabase Auth), rol leído de dim_usuarios
    │   ├── exportacionDrogueria.ts    # Archivo de pedido por droguería con los códigos principales
    │   └── nubeV3.ts                  # Carga masiva, catálogos, usuarios y borrado contra el esquema v3
    ├── offline/                       # Dexie, Outbox, pull incremental, motor de sync, aislamiento por usuario
    ├── pedido/                        # Tienda: carritos por farmacia (carritos.ts), dictado (dictado.ts + useDictado.ts), vista previa
    ├── sql/
    │   ├── 00_reiniciar_esquema_anterior.sql  # Solo si hay restos de otra versión: los aparta en un respaldo
    │   └── nova_produccion_v3.sql     # Esquema vigente: DDL, RLS, triggers, RPC
    ├── types/
    │   └── pharmacy.ts                # Interfaces TypeScript de dominio
    ├── vistas/                        # Un archivo por menú (cargados con React.lazy) + lógica pura testeada
    │   ├── Inicio.tsx                 # Resumen del rol: unidades/pedidos del mes con variación, gráfico diario, rankings
    │   ├── indicadores.ts             # Cálculos puros del Resumen (con pruebas)
    │   ├── CondicionesVista.tsx       # Condiciones comerciales: % descuento, mínimo de SKU y de unidades (+ simulador)
    │   ├── ClientesVista.tsx          # Fichero: vendedor = sus farmacias; teletransferencista/gerente/admin = todas
    │   ├── PedidosVista.tsx           # Listado y detalle (re-ruteo del remanente)
    │   ├── PorProcesarVista.tsx       # Mesa del teletransferencista: tomar, descargar archivo, confirmar
    │   ├── CatalogoVista.tsx          # Productos y droguerías (consulta)
    │   ├── ReportesVista.tsx          # Pedidos (CSV), cumplimiento por droguería, alertas
    │   ├── DatosVista.tsx             # Datos maestros: farmacias, productos, droguerías, fichero, homologación, ventas
    │   ├── maestros/                  # Una tabla por maestro (buscar, crear, editar, cargar CSV, borrar varios)
    │   ├── config/                    # Mi cuenta, Sincronización, Usuarios, Base de datos (borrado), Ayuda
    │   └── datos/                     # Fichero.tsx, Pendientes.tsx
    └── components/
        ├── Header.tsx                 # Barra superior mínima: estado de sincronización, tema, menú de usuario
        ├── acceso/                    # LoginGate (inicio de sesión obligatorio) y ConexionForm (URL/anon key)
        ├── shell/                     # navConfig.ts (menús por rol) y Navigation.tsx (lateral / inferior)
        ├── ui/kit.tsx                 # Sistema de diseño: botones, etiquetas, campos, tarjetas, selección múltiple, avatar
        ├── graficos/Graficos.tsx      # Columnas, ranking en barras y medidor (una serie, con tabla y ayuda al pasar)
        ├── maestros/TablaMaestro.tsx  # Tabla genérica con casillas y barra de acciones
        ├── import/                    # Diálogo de carga con confirmación, progreso y resultado
        ├── SyncStatusChip.tsx         # Estado de sincronización (abre Configuración)
        ├── ErrorBoundary.tsx
        └── NovaLogo.tsx
```

**Menús por rol** (`navConfig.ts`, agrupados en Ventas · Clientes y productos · Gestión · Cuenta): vendedor (Inicio, Nuevo pedido, Mis pedidos, Mis clientes, Configuración) ·
teletransferencista (Por procesar, Pedidos, Clientes, Catálogo, Configuración) · gerente (Resumen, Pedidos, Clientes, Catálogo, Reportes, Condiciones comerciales, Configuración) ·
admin (todo, más *Datos maestros*). Sin sesión no hay datos: no existe usuario por defecto; el modo demostración solo está disponible cuando Supabase no está configurado.

---

## 4.1. Arquitectura offline-first v3 (captura en campo)

La toma de pedidos (`src/pedido/`: tienda con un carrito por farmacia, envío en bloque y dictado por voz) trabaja sobre **IndexedDB (Dexie)** y una cola de sincronización, no sobre `localStorage`.
Esquema de producción: `src/sql/nova_produccion_v3.sql` (PostGIS, RLS, RPC idempotentes). Documentación completa en
`docs/ARQUITECTURA_OFFLINE_FIRST.md`. Reglas que no deben romperse:

1. Toda escritura del vendedor pasa por `src/offline/pedidos.ts`: cambio local **+** item de Outbox en una sola transacción, con UUID generado en el cliente.
2. El servidor es la única fuente de los correlativos (`PED-1045`, `PED-1045-R1`); el dispositivo solo muestra un folio local provisional.
3. Las RPC de sincronización son idempotentes: reintentar nunca duplica. No agregar mutaciones que no lo sean.
4. Las políticas comerciales existen en dos lugares (`src/offline/politicas.ts` y `app.evaluar_reglas_pedido`); cualquier cambio debe reflejarse en ambos y en sus pruebas.
5. Fase 1 opera solo con unidades; los campos de precio (`precios_drogueria_producto`, `precio_unitario`, `subtotal`) permanecen nulos.
6. Un prospecto (`prospecto_pendiente`) no puede transferirse a droguería hasta validar RIF y homologarlo (`aprobar_prospecto`).

## 5. Algoritmos y Reglas de Negocio Implementadas

### 5.1. Normalización de Fechas Diarias e Intuición de Mes
* Los archivos de ventas suelen llamarse `ventas_junio.csv`, `ventas_julio.csv`, etc.
* La función `detectarMesDeNombreArchivo()` analiza el nombre y detecta automáticamente el período (ej. `2026-06` para Junio, `2026-07` para Julio, `2026-08` para Agosto).
* En el procesamiento de filas, la columna `Fecha` soporta el formato oficial **`dd/mm/aaaa`** (con o sin marcas de tiempo como `00:00:00`), normalizándola al formato ISO `aaaa-mm-dd` para PostgreSQL y garantizando que `mes_periodo` refleje con exactitud la fecha de la venta.

### 5.2. Motor de Homologación de Farmacias Multi-Nombre
* Cuando una droguería reporta una venta con un nombre no reconocido directamente en `dim_clientes`:
  1. Se verifica si ya existe en la homologación de esa droguería (`map_cliente_drogueria`; en la app clásica, los alias locales, que se suben con `importar_homologacion`).
  2. Si no existe, se ejecuta el algoritmo `calcularSimilitudNombres(nombreA, nombreB)` basado en token Dice-Sørensen + subcadenas (filtrando stopwords comerciales como "Farmacia", "C.A.", "S.A.", "Droguería").
  3. En la interfaz **2. Homologar Farmacias**, se presenta al usuario la sugerencia con mayor porcentaje de afinidad (ej. 92% de coincidencia) para su aprobación en un solo clic.

### 5.3. Diccionario Dinámico de Cod SAP
* Si un archivo de ventas no incluye la columna `Cod Sap`, el sistema busca el código de la droguería en `map_producto_drogueria` (en el servidor, `app.homologar_ventas`; si el reporte sí trae el Cod SAP, el servidor aprende el mapeo solo).
* Si el producto no ha sido mapeado previamente, se lista en la subpestaña **3. Diccionario Cod SAP**, donde el administrador selecciona el medicamento correspondiente del vademécum. Una vez seleccionado, **queda guardado permanentemente**, evitando tener que volver a editar los archivos Excel en meses futuros.

### 5.4. Motor de Pedido Sugerido (30 / 60 / 90 Días)
* **Demanda Base:** Promedio ponderado mensual = $(V_{30d} \times 0.50) + (V_{60d} \times 0.30) + (V_{90d} \times 0.20)$.
* **Factor de Prioridad:** Si el producto tiene `es_prioritario = true`, la sugerencia se multiplica por `factor_prioridad` (ej. 1.25x).
* **Ajuste de Empaque Mínimo:** La cantidad calculada siempre se redondea hacia arriba al múltiplo entero de su `empaque_minimo` (ej. cajas de 10, 20 o 30 unidades).
* **Consolidación Multi-Equipo:** Suma las ventas de los representantes de ambos equipos comerciales (La Santé y Comercial/OTC) para reflejar la reposición integral de anaquel.

---

## 6. Hoja de Ruta y Próximos Pasos (Roadmap)

Cualquier IA o ingeniero que trabaje en fases subsiguientes debe considerar las siguientes características planificadas:

1. **Pruebas con Junio, Julio y Agosto:** Carga consecutiva de los tres meses históricos para validar la serie trimestral completa del motor de sugeridos.
2. **Conectores SFTP / API Directa con Droguerías:** Automatizar la transmisión de los archivos generados por `exportacionDrogueria.ts` directamente hacia los buzones SFTP o endpoints B2B de Cobeca, Nena y Drobienca.
3. **PWA y Sincronización en Segundo Plano:** Implementar Service Worker e IndexedDB para permitir navegación y toma de pedidos en zonas rurales o sótanos hospitalarios sin cobertura, con sincronización automática al recuperar señal.
4. **Optimización de Rutas GPS:** Aprovechar las coordenadas `local_gps_lat` y `local_gps_lon` de `dim_clientes` para calcular la ruta de visitas diaria óptima del vendedor mediante algoritmo del viajero (TSP).

---

## 7. Directrices Estrictas para Generación de Código por otra IA

1. **Cero Placeholders:** Nunca escribir comentarios como `// TODO`, `// resto del código`, `// implement logic here`. Todo código debe entregarse completo, funcional y fuertemente tipado.
2. **Respetar Nombres y Schemas:** En el modelo de las pantallas clásicas no renombrar `ident01` ni `sku`; en la base (v3) sus equivalentes son `dim_clientes.codigo_interno` y `dim_productos.sku` (claves naturales únicas; el RIF NO es único). Los códigos de cada droguería viven solo en `map_*`, nunca en las dimensiones.
3. **Sin Coste en Infraestructura:** Mantener la arquitectura compatible con hosting estático gratuito y capa gratuita de Supabase (500 MB DB / RLS).
4. **TypeScript Estricto:** Evitar el uso indiscriminado de `any`. Utilizar las interfaces definidas en `/src/types/pharmacy.ts`.
5. **Estilos:** Usar exclusivamente clases de utilidad de Tailwind CSS con soporte para temas claro y oscuro. Preferir el variante `dark:` (`bg-white dark:bg-slate-900`); `esClaro ? '...' : '...'` sigue siendo válido en componentes existentes.
6. **Rendimiento:** toda pestaña o modal nuevo debe cargarse con `React.lazy` desde `App.tsx`; el estado que se guarda en `localStorage` usa `usePersistentState` (nunca `localStorage.setItem` dentro de un `useEffect` por cada cambio); en cargas masivas se indexa con `Map`/`Set` o se memoiza por valor distinto, no se llama `.find()` sobre catálogos por cada fila.
7. **Táctil y responsivo:** objetivos táctiles de al menos 44 px (`min-h-11`), campos de formulario a 16 px en móvil (regla global en `index.css`, evita el zoom de iOS), tablas anchas se convierten en tarjetas bajo `md`.
