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
6. **Movilidad en Campo para Vendedores:** Toma de pedidos optimizada para tablets y smartphones mediante dictado por voz (Web Speech API con parser semántico en español) y escaneo de códigos de barra/QR con cámara trasera.

---

## 2. Arquitectura Tecnológica y Alojamiento

* **Frontend:** React 18+ estructurado con Vite y TypeScript estricto.
* **Estilos:** Tailwind CSS con soporte de modo Claro y Oscuro nativo (`ThemeContext`).
* **Diseño para Alojamiento:** **100% Estático y Gratuito**. Puede desplegarse en **GitHub Pages** (con soporte de SPA mediante script de redirección 404 o hash routing) y en contenedores **Google Cloud Run / AI Studio**.
* **Backend & Base de Datos:** **Supabase (PostgreSQL 15+)**:
  * Autenticación con Supabase Auth (correo/contraseña, recuperación nativa).
  * Row Level Security (RLS) estricto por roles (`admin`, `supervisor`, `vendedor`).
  * Triggers en PL/pgSQL para resolución automática de claves e histórico.
  * Funciones analíticas en base de datos (`calcular_pedido_sugerido`).
* **Resiliencia Offline-First:** Si Supabase no está conectado o el usuario no tiene conexión en calle, el sistema opera con `localStorage` y estado en memoria, permitiendo sincronización posterior.

---

## 3. Estructura de la Base de Datos (PostgreSQL / Supabase)

El script SQL maestro se encuentra en: `/src/sql/supabase_schema_fase1.sql`.

### 3.1. Tablas Maestras (Dimensiones)

1. **`dim_clientes` (Maestro Unificado de Farmacias - 11 Campos):**
   * `ident01` (VARCHAR PK): Código maestro único de la farmacia (ej: `CLI-1001`).
   * `razon_social`, `nombre_fantasia`, `brick`, `municipio_ciudad`, `estado`, `rif`.
   * `frecuencia` ('Semanal', 'Quincenal', 'Mensual').
   * `bandera` ('Farmatodo', 'Farmahorro', 'Farmacias Saas', 'Botiqueria', 'Independiente').
   * `local_gps_lat`, `local_gps_lon` (Coordenadas geográficas).
   * `activo` (BOOLEAN).

2. **`dim_productos` (Catálogo de Medicamentos - 12 Campos sin Acentos):**
   * `sku` (VARCHAR PK): Código interno o SAP del producto (ej: `SKU-LOS-50`).
   * `codigo_barras_ean13`, `principio_activo`, `nombre_comercial`, `presentacion`.
   * `laboratorio` / `unidad_negocio` ('La Sante', 'Comercial', 'OTC').
   * `precio_lista`, `descuento_maximo_porc`, `empaque_minimo`, `stock_disponible`.
   * `es_prioritario` (BOOLEAN), `factor_prioridad` (NUMERIC 1.0 - 2.0).
   * `clase_terapeutica`, `sistemas`, `clasificacion_portafolio`, `product_code`, `pack_code`.

3. **`dim_droguerias` (Distribuidoras Nacionales con Layout JSON Dinámico):**
   * `id_numero` (INT PK): Identificador secuencial (1: BLV, 2: COBECA, 3: DROBIENCA, 6: NENA, etc.).
   * `codigo_drogueria`, `rif`, `nombre_drogueria`, `email_pedidos`, `pagina_web`, `telefono`.
   * `tiempo_entrega_promedio_dias`.
   * `formato_csv_config` (JSONB): Configuración dinámica del layout de exportación:
     ```json
     {
       "delimitador": ";",
       "incluir_encabezados": true,
       "entrecomillado": "solo_texto",
       "codificacion": "UTF-8",
       "salto_linea": "\r\n",
       "formato_decimal": "coma",
       "columnas": [
         { "campo_origen": "codigo_cliente", "nombre_encabezado": "COD_CLIENTE", "orden": 1, "formato": "texto" },
         { "campo_origen": "rif_cliente", "nombre_encabezado": "RIF_FARMACIA", "orden": 2, "formato": "texto" },
         { "campo_origen": "sku", "nombre_encabezado": "SKU_PRODUCTO", "orden": 3, "formato": "texto" },
         { "campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 4, "formato": "entero" },
         { "campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO", "orden": 5, "formato": "decimal_coma" }
       ]
     }
     ```

### 3.2. Tablas Puente y Homologación Comercial

4. **`dim_cliente_drogueria_alias` (Homologación de Nombres por Droguería):**
   * Resuelve la disparidad de nombres de una misma farmacia entre droguerías.
   * `cliente_ident01`: FK a `dim_clientes(ident01)`.
   * `drogueria`: Nombre de la droguería (ej. `COBECA`).
   * `cod_cliente_drogueria`: Código asignado por esa droguería.
   * `nombre_cliente_drogueria`: Razón social o nombre textual en reportes de esa droguería.
   * `verificado`: Booleano de validación.

5. **`dim_producto_drogueria_mapeo` (Diccionario Permanente Cod SAP):**
   * Resuelve la ausencia de Cod SAP en reportes brutos.
   * Clave única: `(drogueria, codigo_producto_drogueria)`.
   * `cod_sap`: FK lógica a `dim_productos(sku)`.
   * `nombre_producto_drogueria`: Descripción textual en la droguería.

6. **`rel_cliente_drogueria_codigos`:**
   * Almacena el código B2B oficial que cada droguería exige para pedidos de cada farmacia.

7. **`rel_cliente_vendedor`:**
   * Vincula vendedores de La Santé (Equipo A) y Comercial/OTC (Equipo B) a farmacias comunes.

### 3.3. Tablas de Hechos (Transaccionales)

8. **`fact_historico_ventas` (8 Columnas Comerciales de Venta Diaria por Mes):**
   * Columnas de origen: `fecha` (DATE), `cod_cliente`, `nombre_cliente`, `drogueria`, `codigo_producto`, `nombre_producto`, `unidades` (INT), `cod_sap` (VARCHAR NULLABLE).
   * Columnas de enriquecimiento: `mes_periodo` (ej: `2026-06`), `archivo_origen` (ej: `ventas_junio.csv`), `cliente_ident01`.
   * **Trigger reactivo `fn_resolver_fact_historico_ventas()`:** Infiere el período, busca el Cod SAP en el mapeo, busca la farmacia en los alias, y alimenta el diccionario de mapeo si la fila traía Cod SAP.

9. **`fact_pedidos_cabecera` & `fact_pedidos_detalle`:**
   * Gestión de órdenes tomadas en campo, fill-rate, droguería seleccionada, descuentos y estados (`borrador`, `confirmado_farmacia`, `enviado_teletransferencia`, `facturado`).

---

## 4. Estructura de Archivos del Código Fuente

```text
/
├── .env.example                       # Variables de entorno Supabase (URL y Anon Key)
├── index.html                         # Punto de entrada HTML con meta tags
├── metadata.json                      # Metadatos del applet en AI Studio
├── package.json                       # Dependencias: React, Lucide, @zxing/library
├── tsconfig.json                      # Configuración TypeScript estricta
├── vite.config.ts                     # Configuración de Vite
├── SYSTEM_CONTEXT.md                  # Este documento de contexto para IA
└── src/
    ├── App.tsx                        # Componente raíz, orquestación de tabs y sincronización
    ├── main.tsx                       # Montaje React DOM
    ├── context/
    │   └── ThemeContext.tsx           # Contexto de Modo Claro / Oscuro con persistencia
    ├── data/
    │   └── mockData.ts                # Datos semilla de 17 droguerías, productos, farmacias e histórico
    ├── services/
    │   └── supabaseClient.ts          # Inicializador dinámico de cliente Supabase
    ├── sql/
    │   └── supabase_schema_fase1.sql  # Script DDL completo, RLS, triggers y funciones
    ├── types/
    │   └── pharmacy.ts                # Interfaces TypeScript de todo el dominio farmacéutico
    └── components/
        ├── Header.tsx                 # Barra superior con selector de rol, equipo comercial y Supabase
        ├── RepDashboardTab.tsx        # Dashboard del representante (KPIs, pedidos del día, visitas)
        ├── SuggestedOrderTab.tsx      # Motor analítico de pedido sugerido 30/60/90 días
        ├── OrderTakingTab.tsx         # Toma de pedidos en mostrador (catálogo, carrito, voz, escáner)
        ├── MyOrdersTab.tsx            # Historial de pedidos tomados por el vendedor
        ├── TeletransferQueueTab.tsx   # Cola de teletransferencias y gestión de fill-rate
        ├── DrugstoreCsvTab.tsx        # Generador dinámico de CSV según layout de cada droguería
        ├── DrugstoreInventoryUploadTab.tsx # Carga de inventario y precios actualizados por droguería
        ├── InventoryCatalogTab.tsx    # Vademécum de productos con empaques y prioridades
        ├── DataImportStudioTab.tsx    # Centro de importación masiva, homologador de farmacias y Cod SAP
        ├── SqlStudioTab.tsx           # Visor y descargador del esquema SQL de Supabase
        ├── AdminUsersTab.tsx          # Gestión de usuarios y roles
        ├── UserGuideTab.tsx           # Manual operativo paso a paso para el usuario
        ├── VoiceDictationModal.tsx    # Modal de dictado por voz con Web Speech API y NLP
        ├── BarcodeScannerModal.tsx    # Escáner de código de barras/QR con cámara trasera
        ├── AuthModal.tsx              # Modal de login/registro de Supabase Auth
        ├── SupabaseConfigModal.tsx    # Modal de conexión directa con URL y Anon Key
        └── AboutModal.tsx             # Modal informativo de créditos y versión
```

---

## 5. Algoritmos y Reglas de Negocio Implementadas

### 5.1. Normalización de Fechas Diarias e Intuición de Mes
* Los archivos de ventas suelen llamarse `ventas_junio.csv`, `ventas_julio.csv`, etc.
* La función `detectarMesDeNombreArchivo()` analiza el nombre y detecta automáticamente el período (ej. `2026-06` para Junio, `2026-07` para Julio, `2026-08` para Agosto).
* En el procesamiento de filas, la columna `Fecha` soporta el formato oficial **`dd/mm/aaaa`** (con o sin marcas de tiempo como `00:00:00`), normalizándola al formato ISO `aaaa-mm-dd` para PostgreSQL y garantizando que `mes_periodo` refleje con exactitud la fecha de la venta.

### 5.2. Motor de Homologación de Farmacias Multi-Nombre
* Cuando una droguería reporta una venta con un nombre no reconocido directamente en `dim_clientes`:
  1. Se verifica si ya existe en `dim_cliente_drogueria_alias`.
  2. Si no existe, se ejecuta el algoritmo `calcularSimilitudNombres(nombreA, nombreB)` basado en token Dice-Sørensen + subcadenas (filtrando stopwords comerciales como "Farmacia", "C.A.", "S.A.", "Droguería").
  3. En la interfaz **2. Homologar Farmacias**, se presenta al usuario la sugerencia con mayor porcentaje de afinidad (ej. 92% de coincidencia) para su aprobación en un solo clic.

### 5.3. Diccionario Dinámico de Cod SAP
* Si un archivo de ventas no incluye la columna `Cod Sap`, el sistema busca en `dim_producto_drogueria_mapeo`.
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
2. **Conectores SFTP / API Directa con Droguerías:** Automatizar la transmisión de los CSV generados por `DrugstoreCsvTab` directamente hacia los buzones SFTP o endpoints B2B de Cobeca, Nena y Drobienca.
3. **PWA y Sincronización en Segundo Plano:** Implementar Service Worker e IndexedDB para permitir navegación y toma de pedidos en zonas rurales o sótanos hospitalarios sin cobertura, con sincronización automática al recuperar señal.
4. **Optimización de Rutas GPS:** Aprovechar las coordenadas `local_gps_lat` y `local_gps_lon` de `dim_clientes` para calcular la ruta de visitas diaria óptima del vendedor mediante algoritmo del viajero (TSP).

---

## 7. Directrices Estrictas para Generación de Código por otra IA

1. **Cero Placeholders:** Nunca escribir comentarios como `// TODO`, `// resto del código`, `// implement logic here`. Todo código debe entregarse completo, funcional y fuertemente tipado.
2. **Respetar Nombres y Schemas:** No alterar las 11 columnas de `dim_clientes` ni las 12 columnas de `dim_productos`. No renombrar `ident01` (clave primaria de farmacias) ni `sku` (clave primaria de productos).
3. **Sin Coste en Infraestructura:** Mantener la arquitectura compatible con hosting estático gratuito y capa gratuita de Supabase (500 MB DB / RLS).
4. **TypeScript Estricto:** Evitar el uso indiscriminado de `any`. Utilizar las interfaces definidas en `/src/types/pharmacy.ts`.
5. **Estilos:** Usar exclusivamente clases de utilidad de Tailwind CSS con soporte para temas claro y oscuro (`esClaro ? '...' : '...'`).
