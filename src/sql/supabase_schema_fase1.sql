-- ==============================================================================
-- SISTEMA DE TOMA DE PEDIDOS, MOTOR DE SUGERIDOS Y TELETRANSFERENCIAS FARMACÉUTICAS
-- SCRIPT DE MIGRACIÓN SUPABASE / POSTGRESQL (FASE 1)
-- ==============================================================================

-- 1. HABILITACIÓN DE EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. TIPOS ENUMERADOS DEL SISTEMA
DO $$ BEGIN
    CREATE TYPE rol_usuario_enum AS ENUM ('vendedor', 'teletransferencista', 'gerente', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE equipo_ventas_enum AS ENUM ('La Sante', 'Comercial', 'OTC', 'TODOS', 'A', 'B', 'AMBOS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE estado_pedido_enum AS ENUM (
        'borrador',
        'enviado_teletransferencia',
        'en_proceso',
        'procesado_total',
        'procesado_parcial',
        'facturado',
        'rechazado'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE motivo_ajuste_enum AS ENUM (
        'sin_quiebre',
        'quiebre_stock_drogueria',
        'limite_credito',
        'producto_descontinuado',
        'ajuste_comercial',
        'otro'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE clasificacion_cliente_enum AS ENUM ('A', 'B', 'C');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 3. TABLAS DIMENSIONALES (DIMENSIONES)
-- ==============================================================================

-- 3.1. DIM_USUARIOS: Usuarios de la fuerza de ventas, teletransferencia y administradores
CREATE TABLE IF NOT EXISTS dim_usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    nombre_completo VARCHAR(255) NOT NULL,
    rol rol_usuario_enum NOT NULL DEFAULT 'vendedor',
    equipo equipo_ventas_enum NOT NULL DEFAULT 'A',
    telefono VARCHAR(50),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2. DIM_CLIENTES: Farmacias, cadenas y boticas (ident01 como ID unico / Primary Key comercial)
CREATE TABLE IF NOT EXISTS dim_clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ident01 VARCHAR(100) NOT NULL UNIQUE, -- ID unico PK especificado por el cliente (ej: CLI001, FAR-01)
    codigo_cliente VARCHAR(100), -- Retrocompatible (igual a ident01)
    rif VARCHAR(30) NOT NULL,
    razon_social VARCHAR(255) NOT NULL,
    nombre_fantasia VARCHAR(255) NOT NULL,
    nombre_comercial VARCHAR(255), -- Retrocompatible (igual a nombre_fantasia)
    brick VARCHAR(100), -- IMS Brick / Zona territorial comercial farmaceutica
    municipio_ciudad VARCHAR(150), -- Municipio / Ciudad / Alcaldia
    direccion TEXT NOT NULL DEFAULT 'Sin direccion fiscal',
    estado VARCHAR(100) NOT NULL,
    ciudad VARCHAR(100), -- Retrocompatible (igual a municipio_ciudad)
    frecuencia VARCHAR(50) DEFAULT 'Semanal', -- Frecuencia de visita (F1, F2, F4, Quincenal, Mensual)
    bandera VARCHAR(100) DEFAULT 'Independiente', -- Cadena o grupo (Farmatodo, Locatel, Farmahorro, etc.)
    local_gps_lat NUMERIC(10,7), -- Latitud GPS
    local_gps_lon NUMERIC(10,7), -- Longitud GPS
    clasificacion_abc clasificacion_cliente_enum NOT NULL DEFAULT 'B',
    cupo_credito NUMERIC(15,2) NOT NULL DEFAULT 5000.00,
    dias_credito INT NOT NULL DEFAULT 15,
    telefono VARCHAR(50),
    email_contacto VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3. DIM_DROGUERIAS: Droguerías de distribución con configuración dinámica de layout CSV
CREATE TABLE IF NOT EXISTS dim_droguerias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_numero INT UNIQUE,
    codigo_drogueria VARCHAR(50) NOT NULL UNIQUE,
    rif VARCHAR(30) DEFAULT 'J-00000000-0',
    nombre_drogueria VARCHAR(255) NOT NULL,
    email_pedidos VARCHAR(255),
    pagina_web VARCHAR(255),
    telefono VARCHAR(50),
    tiempo_entrega_promedio_dias INT NOT NULL DEFAULT 2,
    -- Estructura JSONB que define el mapeo exacto de columnas, separadores, orden y formatos
    formato_csv_config JSONB NOT NULL DEFAULT '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "COD_CLIENTE", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF_FARMACIA", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "COD_ARTICULO", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "ORDEN_COMPRA", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.4. DIM_PRODUCTOS: Vademécum farmacéutico, principios activos, precios y prioridades
CREATE TABLE IF NOT EXISTS dim_productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(50) NOT NULL UNIQUE,
    codigo_barras_ean13 VARCHAR(50),
    principio_activo VARCHAR(255) NOT NULL,
    nombre_comercial VARCHAR(255) NOT NULL,
    presentacion VARCHAR(255) NOT NULL,
    laboratorio VARCHAR(150) NOT NULL,
    precio_lista NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (precio_lista >= 0),
    descuento_maximo_porc NUMERIC(5,2) NOT NULL DEFAULT 15.00 CHECK (descuento_maximo_porc >= 0 AND descuento_maximo_porc <= 100),
    es_prioritario BOOLEAN NOT NULL DEFAULT false,
    factor_prioridad NUMERIC(4,2) NOT NULL DEFAULT 1.00 CHECK (factor_prioridad >= 1.00),
    empaque_minimo INT NOT NULL DEFAULT 1 CHECK (empaque_minimo >= 1),
    stock_disponible INT NOT NULL DEFAULT 0 CHECK (stock_disponible >= 0),
    unidad_negocio VARCHAR(100),
    clase_terapeutica VARCHAR(150),
    sistemas VARCHAR(150),
    clasificacion_portafolio VARCHAR(100),
    product_code VARCHAR(100),
    pack_code VARCHAR(100),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.5. REL_CLIENTE_VENDEDOR: Asignación de clientes compartidos entre equipos A y B
CREATE TABLE IF NOT EXISTS rel_cliente_vendedor (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES dim_clientes(id) ON DELETE CASCADE,
    vendedor_id UUID NOT NULL REFERENCES dim_usuarios(id) ON DELETE CASCADE,
    equipo equipo_ventas_enum NOT NULL,
    rol_asignacion VARCHAR(50) NOT NULL DEFAULT 'titular', -- titular, suplente, compartido
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cliente_vendedor_equipo UNIQUE (cliente_id, vendedor_id, equipo)
);

-- 3.6. REL_CLIENTE_DROGUERIA_CODIGOS: Código B2B asignado por cada droguería a cada cliente/farmacia
CREATE TABLE IF NOT EXISTS rel_cliente_drogueria_codigos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES dim_clientes(id) ON DELETE CASCADE,
    drogueria_id UUID NOT NULL REFERENCES dim_droguerias(id) ON DELETE CASCADE,
    codigo_cliente_drogueria VARCHAR(50) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cliente_drogueria UNIQUE (cliente_id, drogueria_id)
);

-- 3.7. DIM_CLIENTE_DROGUERIA_ALIAS: Homologación de nombres y códigos que cada droguería le da a una misma farmacia
-- Resuelve el problema: una misma farmacia física es nombrada de formas distintas por Nena, Cobeca, Farvenca, etc.
-- Permite que al cargar las ventas mensuales de cada droguería, se asocien automáticamente a la farmacia matriz.
CREATE TABLE IF NOT EXISTS dim_cliente_drogueria_alias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_ident01 VARCHAR(100) REFERENCES dim_clientes(ident01) ON DELETE CASCADE,
    drogueria VARCHAR(150) NOT NULL,
    cod_cliente_drogueria VARCHAR(100),
    nombre_cliente_drogueria VARCHAR(255) NOT NULL,
    nombre_normalizado VARCHAR(255),
    verificado BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cliente_drogueria_alias UNIQUE (drogueria, nombre_cliente_drogueria, cod_cliente_drogueria)
);

CREATE INDEX IF NOT EXISTS idx_alias_cliente_ident01 ON dim_cliente_drogueria_alias(cliente_ident01);
CREATE INDEX IF NOT EXISTS idx_alias_drogueria ON dim_cliente_drogueria_alias(drogueria);
CREATE INDEX IF NOT EXISTS idx_alias_cod_drog ON dim_cliente_drogueria_alias(drogueria, cod_cliente_drogueria);
CREATE INDEX IF NOT EXISTS idx_alias_trgm_nombre ON dim_cliente_drogueria_alias USING gin (nombre_cliente_drogueria gin_trgm_ops);

-- 3.8. DIM_PRODUCTO_DROGUERIA_MAPEO: Catálogo cruzado entre Cod Sap (interno) y Código de Producto de Droguería
-- Resuelve el problema: el Cod Sap no viene en los reportes de las droguerías. Este mapeo autocompleta el SKU interno
-- para que el usuario no tenga que anexar el Cod Sap manualmente en Excel cada mes.
CREATE TABLE IF NOT EXISTS dim_producto_drogueria_mapeo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cod_sap VARCHAR(100) NOT NULL,
    drogueria VARCHAR(150) NOT NULL,
    codigo_producto_drogueria VARCHAR(100) NOT NULL,
    nombre_producto_drogueria VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_producto_drogueria_mapeo UNIQUE (drogueria, codigo_producto_drogueria)
);

CREATE INDEX IF NOT EXISTS idx_prod_mapeo_cod_sap ON dim_producto_drogueria_mapeo(cod_sap);
CREATE INDEX IF NOT EXISTS idx_prod_mapeo_drog_cod ON dim_producto_drogueria_mapeo(drogueria, codigo_producto_drogueria);
CREATE INDEX IF NOT EXISTS idx_prod_mapeo_trgm_nombre ON dim_producto_drogueria_mapeo USING gin (nombre_producto_drogueria gin_trgm_ops);

-- ==============================================================================
-- 4. TABLAS DE HECHOS Y OPERATIVAS (TRANSACCIONES)
-- ==============================================================================

-- 4.1. HISTORICO_PEDIDOS_PREVIOS: Base de datos histórica acumulada de compras de clientes
CREATE TABLE IF NOT EXISTS historico_pedidos_previos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID NOT NULL REFERENCES dim_clientes(id) ON DELETE CASCADE,
    drogueria_id UUID NOT NULL REFERENCES dim_droguerias(id) ON DELETE RESTRICT,
    producto_id UUID NOT NULL REFERENCES dim_productos(id) ON DELETE RESTRICT,
    fecha_pedido DATE NOT NULL,
    equipo_origen VARCHAR(30) NOT NULL CHECK (equipo_origen IN ('La Sante', 'Comercial', 'OTC', 'A', 'B', 'AMBOS', 'TODOS')),
    numero_factura_origen VARCHAR(100),
    cantidad_solicitada INT NOT NULL CHECK (cantidad_solicitada >= 0),
    cantidad_facturada INT NOT NULL CHECK (cantidad_facturada >= 0),
    precio_unitario NUMERIC(12,2) NOT NULL,
    descuento_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.1.B. HISTORICO_PEDIDOS_RESUMEN: Tabla pre-agregada mensual (Óptima para +1.000.000 de filas en Supabase Gratuito)
-- Reduce 1M de registros transaccionales diarios a ~40.000 filas mensuales agrupadas (ahorro del 95% de espacio, < 15 MB en disco).
CREATE TABLE IF NOT EXISTS historico_pedidos_resumen (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_ident01 VARCHAR(100) NOT NULL, -- Código ident01 del cliente (FK lógica a dim_clientes)
    sku VARCHAR(50) NOT NULL, -- Código SKU del producto (FK lógica a dim_productos)
    anio_mes VARCHAR(7) NOT NULL, -- Formato YYYY-MM (ej: '2026-01', '2026-02')
    equipo_origen VARCHAR(30) NOT NULL CHECK (equipo_origen IN ('La Sante', 'Comercial', 'OTC', 'A', 'B', 'AMBOS', 'TODOS')),
    cantidad_total INT NOT NULL CHECK (cantidad_total >= 0),
    frecuencia_pedidos INT NOT NULL DEFAULT 1 CHECK (frecuencia_pedidos >= 1),
    descuento_promedio NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hist_resumen UNIQUE (cliente_ident01, sku, anio_mes, equipo_origen)
);

CREATE INDEX IF NOT EXISTS idx_hist_resumen_cliente ON historico_pedidos_resumen(cliente_ident01);
CREATE INDEX IF NOT EXISTS idx_hist_resumen_sku ON historico_pedidos_resumen(sku);
CREATE INDEX IF NOT EXISTS idx_hist_resumen_periodo ON historico_pedidos_resumen(anio_mes);

-- 4.1.C. FACT_HISTORICO_VENTAS: Tabla nativa para las 8 columnas comerciales del cliente (Venta Diaria por Mes)
-- Columnas de origen: Fecha | Cod Cliente | Nombre_cliente | Drogueria | Codigo Producto | Nombre Producto | Unidades | Cod Sap
-- NOTA: cod_sap es NULLABLE para permitir importar reportes crudos sin necesidad de editar manualmente Excel previamente.
CREATE TABLE IF NOT EXISTS fact_historico_ventas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha DATE NOT NULL,
    mes_periodo VARCHAR(7),                     -- Formato YYYY-MM inferido automáticamente (ej: '2026-01' para ventas_enero)
    archivo_origen VARCHAR(255),               -- Nombre del archivo cargado (ej: 'ventas_enero.csv', 'ventas_febrero.csv')
    cod_cliente VARCHAR(100) NOT NULL,         -- Código del cliente asignado por la droguería
    nombre_cliente VARCHAR(255) NOT NULL,      -- Nombre que cada droguería le da a la farmacia (sujeto a homologación)
    drogueria VARCHAR(150) NOT NULL,           -- Droguería distribuidora (Cobeca, Nena, Drobienca, etc.)
    codigo_producto VARCHAR(100) NOT NULL,     -- Código del producto en esa droguería
    nombre_producto VARCHAR(255) NOT NULL,     -- Nombre del producto según la droguería
    unidades INT NOT NULL CHECK (unidades >= 0),
    cod_sap VARCHAR(100),                      -- Código de producto interno SAP / SKU (opcional en origen, autocompletable)
    cliente_ident01 VARCHAR(100),              -- Código maestro de la farmacia homologada (FK lógica a dim_clientes)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_hist_cod_sap ON fact_historico_ventas(cod_sap);
CREATE INDEX IF NOT EXISTS idx_fact_hist_cod_cliente ON fact_historico_ventas(cod_cliente);
CREATE INDEX IF NOT EXISTS idx_fact_hist_drogueria ON fact_historico_ventas(drogueria);
CREATE INDEX IF NOT EXISTS idx_fact_hist_fecha ON fact_historico_ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_fact_hist_periodo ON fact_historico_ventas(mes_periodo);
CREATE INDEX IF NOT EXISTS idx_fact_hist_cliente_ident01 ON fact_historico_ventas(cliente_ident01);
CREATE INDEX IF NOT EXISTS idx_fact_hist_archivo ON fact_historico_ventas(archivo_origen);

-- TRIGGER AUTOMÁTICO DE ENRIQUECIMIENTO EN FACT_HISTORICO_VENTAS
-- 1. Infiere automáticamente el período YYYY-MM a partir de la fecha.
-- 2. Si no viene el Cod SAP, lo resuelve mediante dim_producto_drogueria_mapeo o dim_productos.
-- 3. Si viene el Cod SAP, guarda la equivalencia en dim_producto_drogueria_mapeo para automatizar meses futuros.
-- 4. Si no viene cliente_ident01, busca el alias homologado en dim_cliente_drogueria_alias o dim_clientes.
CREATE OR REPLACE FUNCTION fn_resolver_fact_historico_ventas()
RETURNS TRIGGER AS $$
DECLARE
    v_cod_sap VARCHAR(100);
    v_ident01 VARCHAR(100);
BEGIN
    -- A. Asignar mes_periodo (YYYY-MM) si viene vacío
    IF NEW.mes_periodo IS NULL OR NEW.mes_periodo = '' THEN
        NEW.mes_periodo := TO_CHAR(NEW.fecha, 'YYYY-MM');
    END IF;

    -- B. Resolver Cod SAP si viene vacío o nulo
    IF NEW.cod_sap IS NULL OR TRIM(NEW.cod_sap) = '' THEN
        -- 1. Buscar en tabla de mapeos por droguería y código de producto
        SELECT m.cod_sap INTO v_cod_sap
        FROM dim_producto_drogueria_mapeo m
        WHERE UPPER(m.drogueria) = UPPER(NEW.drogueria)
          AND UPPER(m.codigo_producto_drogueria) = UPPER(NEW.codigo_producto)
        LIMIT 1;

        -- 2. Si no se encontró por código, buscar en dim_productos por coincidencia exacta de SKU
        IF v_cod_sap IS NULL THEN
            SELECT p.sku INTO v_cod_sap
            FROM dim_productos p
            WHERE UPPER(p.sku) = UPPER(NEW.codigo_producto)
            LIMIT 1;
        END IF;

        IF v_cod_sap IS NOT NULL THEN
            NEW.cod_sap := v_cod_sap;
        END IF;
    ELSE
        -- Si vino con Cod SAP, alimentar automáticamente el diccionario de mapeo
        BEGIN
            INSERT INTO dim_producto_drogueria_mapeo (cod_sap, drogueria, codigo_producto_drogueria, nombre_producto_drogueria)
            VALUES (TRIM(NEW.cod_sap), UPPER(TRIM(NEW.drogueria)), TRIM(NEW.codigo_producto), TRIM(NEW.nombre_producto))
            ON CONFLICT (drogueria, codigo_producto_drogueria) DO UPDATE
            SET cod_sap = EXCLUDED.cod_sap,
                nombre_producto_drogueria = COALESCE(EXCLUDED.nombre_producto_drogueria, dim_producto_drogueria_mapeo.nombre_producto_drogueria);
        EXCEPTION
            WHEN OTHERS THEN NULL;
        END;
    END IF;

    -- C. Resolver cliente_ident01 (Homologación de farmacias multi-nombre)
    IF NEW.cliente_ident01 IS NULL OR TRIM(NEW.cliente_ident01) = '' THEN
        -- 1. Buscar por alias registrado previamente
        SELECT a.cliente_ident01 INTO v_ident01
        FROM dim_cliente_drogueria_alias a
        WHERE UPPER(a.drogueria) = UPPER(NEW.drogueria)
          AND (
            (a.cod_cliente_drogueria IS NOT NULL AND a.cod_cliente_drogueria = NEW.cod_cliente)
            OR UPPER(a.nombre_cliente_drogueria) = UPPER(NEW.nombre_cliente)
          )
        LIMIT 1;

        -- 2. Si no hay alias, intentar emparejar directamente con dim_clientes por ident01, RIF o razón social
        IF v_ident01 IS NULL THEN
            SELECT c.ident01 INTO v_ident01
            FROM dim_clientes c
            WHERE UPPER(c.ident01) = UPPER(NEW.cod_cliente)
               OR UPPER(c.rif) = UPPER(NEW.cod_cliente)
               OR UPPER(c.nombre_fantasia) = UPPER(NEW.nombre_cliente)
               OR UPPER(c.razon_social) = UPPER(NEW.nombre_cliente)
            LIMIT 1;
        END IF;

        IF v_ident01 IS NOT NULL THEN
            NEW.cliente_ident01 := v_ident01;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resolver_fact_historico ON fact_historico_ventas;
CREATE TRIGGER trg_resolver_fact_historico
BEFORE INSERT OR UPDATE ON fact_historico_ventas
FOR EACH ROW EXECUTE FUNCTION fn_resolver_fact_historico_ventas();

-- VISTAS ANALÍTICAS Y DE AUDITORÍA
-- 1. Vista de productos pendientes de Cod SAP
CREATE OR REPLACE VIEW vw_productos_pendientes_sap AS
SELECT 
    drogueria,
    codigo_producto,
    nombre_producto,
    SUM(unidades) AS total_unidades_sin_sap,
    COUNT(*) AS total_transacciones,
    MIN(fecha) AS primera_venta,
    MAX(fecha) AS ultima_venta
FROM fact_historico_ventas
WHERE cod_sap IS NULL OR TRIM(cod_sap) = ''
GROUP BY drogueria, codigo_producto, nombre_producto
ORDER BY total_unidades_sin_sap DESC;

-- 2. Vista de nombres de farmacias pendientes de homologar a dim_clientes
CREATE OR REPLACE VIEW vw_farmacias_pendientes_homologar AS
SELECT 
    f.drogueria,
    f.cod_cliente AS cod_cliente_drogueria,
    f.nombre_cliente AS nombre_cliente_drogueria,
    SUM(f.unidades) AS total_unidades,
    COUNT(DISTINCT f.fecha) AS dias_actividad,
    COUNT(*) AS total_lineas
FROM fact_historico_ventas f
WHERE f.cliente_ident01 IS NULL
GROUP BY f.drogueria, f.cod_cliente, f.nombre_cliente
ORDER BY total_unidades DESC;

-- 3. Vista analítica consolidada y homologada para reportes y motor de sugeridos
CREATE OR REPLACE VIEW vw_historico_ventas_homologado AS
SELECT 
    f.id,
    f.fecha,
    f.mes_periodo,
    f.archivo_origen,
    f.drogueria,
    COALESCE(f.cliente_ident01, f.cod_cliente) AS cliente_ident01,
    COALESCE(c.nombre_fantasia, f.nombre_cliente) AS nombre_farmacia_maestra,
    f.cod_cliente AS cod_cliente_drogueria,
    f.nombre_cliente AS nombre_cliente_drogueria,
    COALESCE(f.cod_sap, f.codigo_producto) AS cod_sap,
    COALESCE(p.nombre_comercial, f.nombre_producto) AS nombre_producto_maestro,
    f.codigo_producto AS codigo_producto_drogueria,
    f.nombre_producto AS nombre_producto_drogueria,
    f.unidades,
    COALESCE(p.precio_lista, 0.00) AS precio_unitario_estimado,
    ROUND(f.unidades * COALESCE(p.precio_lista, 0.00), 2) AS subtotal_estimado,
    COALESCE(p.es_prioritario, false) AS es_prioritario,
    COALESCE(p.unidad_negocio, 'La Sante') AS unidad_negocio
FROM fact_historico_ventas f
LEFT JOIN dim_clientes c ON c.ident01 = f.cliente_ident01
LEFT JOIN dim_productos p ON p.sku = f.cod_sap;

-- 4.2. PEDIDOS_CABECERA: Órdenes tomadas en campo o sugeridas
CREATE TABLE IF NOT EXISTS pedidos_cabecera (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_pedido VARCHAR(50) NOT NULL UNIQUE,
    cliente_id UUID NOT NULL REFERENCES dim_clientes(id) ON DELETE RESTRICT,
    vendedor_id UUID NOT NULL REFERENCES dim_usuarios(id) ON DELETE RESTRICT,
    drogueria_id UUID NOT NULL REFERENCES dim_droguerias(id) ON DELETE RESTRICT,
    fecha_pedido TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    equipo_origen VARCHAR(30) NOT NULL CHECK (equipo_origen IN ('La Sante', 'Comercial', 'OTC', 'A', 'B', 'AMBOS', 'TODOS')),
    estado estado_pedido_enum NOT NULL DEFAULT 'borrador',
    observaciones TEXT,
    total_solicitado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_confirmado NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    fill_rate NUMERIC(5,2) NOT NULL DEFAULT 100.00, -- (total_confirmado / total_solicitado) * 100
    transferencista_id UUID REFERENCES dim_usuarios(id) ON DELETE SET NULL,
    fecha_procesamiento TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.3. PEDIDOS_DETALLE: Líneas individuales del pedido con fill-rate y motivos de ajuste
CREATE TABLE IF NOT EXISTS pedidos_detalle (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID NOT NULL REFERENCES pedidos_cabecera(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES dim_productos(id) ON DELETE RESTRICT,
    cantidad_solicitada INT NOT NULL CHECK (cantidad_solicitada > 0),
    cantidad_confirmada INT NOT NULL DEFAULT 0 CHECK (cantidad_confirmada >= 0),
    precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario >= 0),
    descuento_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (descuento_porcentaje >= 0 AND descuento_porcentaje <= 100),
    subtotal_solicitado NUMERIC(15,2) GENERATED ALWAYS AS (
        ROUND(cantidad_solicitada * precio_unitario * (1 - (descuento_porcentaje / 100.0)), 2)
    ) STORED,
    subtotal_confirmado NUMERIC(15,2) GENERATED ALWAYS AS (
        ROUND(cantidad_confirmada * precio_unitario * (1 - (descuento_porcentaje / 100.0)), 2)
    ) STORED,
    motivo_ajuste motivo_ajuste_enum NOT NULL DEFAULT 'sin_quiebre',
    observaciones_linea TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pedido_producto UNIQUE (pedido_id, producto_id)
);

-- ==============================================================================
-- 5. ÍNDICES DE ALTO RENDIMIENTO
-- ==============================================================================

-- Índices B-Tree para claves foráneas y búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_clientes_rif ON dim_clientes(rif);
CREATE INDEX IF NOT EXISTS idx_clientes_codigo ON dim_clientes(codigo_cliente);
CREATE INDEX IF NOT EXISTS idx_productos_sku ON dim_productos(sku);
CREATE INDEX IF NOT EXISTS idx_productos_ean13 ON dim_productos(codigo_barras_ean13);
CREATE INDEX IF NOT EXISTS idx_productos_prioritario ON dim_productos(es_prioritario);

-- Búsqueda de texto rápido con pg_trgm en productos
CREATE INDEX IF NOT EXISTS idx_productos_trgm_nombre ON dim_productos USING gin (nombre_comercial gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_productos_trgm_principio ON dim_productos USING gin (principio_activo gin_trgm_ops);

-- GIN Index sobre la configuración JSONB de droguerías
CREATE INDEX IF NOT EXISTS idx_droguerias_formato_csv ON dim_droguerias USING gin (formato_csv_config);

-- Índices compuestos para consultas operativas y motor de sugeridos
CREATE INDEX IF NOT EXISTS idx_rel_cliente_vendedor ON rel_cliente_vendedor(cliente_id, vendedor_id, activo);
CREATE INDEX IF NOT EXISTS idx_historico_cliente_fecha ON historico_pedidos_previos(cliente_id, fecha_pedido DESC);
CREATE INDEX IF NOT EXISTS idx_historico_producto ON historico_pedidos_previos(producto_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_fecha ON pedidos_cabecera(cliente_id, fecha_pedido DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor ON pedidos_cabecera(vendedor_id, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos_cabecera(estado, fecha_pedido DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_detalle_pedido ON pedidos_detalle(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_detalle_producto ON pedidos_detalle(producto_id);

-- ==============================================================================
-- 6. FUNCIONES AUXILIARES Y TRIGGERS AUTOMATIZADOS
-- ==============================================================================

-- 6.1. Actualización automática de timestamp updated_at
CREATE OR REPLACE FUNCTION fn_actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_cabecera_updated_at ON pedidos_cabecera;
CREATE TRIGGER trg_pedidos_cabecera_updated_at
BEFORE UPDATE ON pedidos_cabecera
FOR EACH ROW EXECUTE FUNCTION fn_actualizar_updated_at();

-- 6.2. Validación de regla de negocio: Descuento máximo no superable por producto
CREATE OR REPLACE FUNCTION fn_validar_descuento_producto()
RETURNS TRIGGER AS $$
DECLARE
    v_descuento_maximo NUMERIC(5,2);
    v_nombre_prod VARCHAR(255);
BEGIN
    SELECT descuento_maximo_porc, nombre_comercial 
    INTO v_descuento_maximo, v_nombre_prod
    FROM dim_productos
    WHERE id = NEW.producto_id;

    IF NEW.descuento_porcentaje > v_descuento_maximo THEN
        RAISE EXCEPTION 'El descuento ingresado (% %%) supera el descuento máximo permitido de (% %%) para el producto: %',
            NEW.descuento_porcentaje, v_descuento_maximo, v_nombre_prod;
    END IF;

    -- Si no se ha asignado cantidad confirmada al insertar, igualar a solicitada
    IF TG_OP = 'INSERT' AND (NEW.cantidad_confirmada IS NULL OR NEW.cantidad_confirmada = 0) THEN
        NEW.cantidad_confirmada := NEW.cantidad_solicitada;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_descuento ON pedidos_detalle;
CREATE TRIGGER trg_validar_descuento
BEFORE INSERT OR UPDATE ON pedidos_detalle
FOR EACH ROW EXECUTE FUNCTION fn_validar_descuento_producto();

-- 6.3. Recálculo automático de totales y Fill-Rate en la cabecera del pedido
CREATE OR REPLACE FUNCTION fn_recalcular_totales_pedido()
RETURNS TRIGGER AS $$
DECLARE
    v_pedido_id UUID;
    v_total_solicitado NUMERIC(15,2);
    v_total_confirmado NUMERIC(15,2);
    v_fill_rate NUMERIC(5,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_pedido_id := OLD.pedido_id;
    ELSE
        v_pedido_id := NEW.pedido_id;
    END IF;

    SELECT 
        COALESCE(SUM(subtotal_solicitado), 0.00),
        COALESCE(SUM(subtotal_confirmado), 0.00)
    INTO v_total_solicitado, v_total_confirmado
    FROM pedidos_detalle
    WHERE pedido_id = v_pedido_id;

    IF v_total_solicitado > 0 THEN
        v_fill_rate := ROUND((v_total_confirmado / v_total_solicitado) * 100.0, 2);
    ELSE
        v_fill_rate := 100.00;
    END IF;

    UPDATE pedidos_cabecera
    SET 
        total_solicitado = v_total_solicitado,
        total_confirmado = v_total_confirmado,
        fill_rate = v_fill_rate
    WHERE id = v_pedido_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalcular_totales ON pedidos_detalle;
CREATE TRIGGER trg_recalcular_totales
AFTER INSERT OR UPDATE OR DELETE ON pedidos_detalle
FOR EACH ROW EXECUTE FUNCTION fn_recalcular_totales_pedido();

-- ==============================================================================
-- 7. MOTOR DE PEDIDO SUGERIDO GLOBAL (FUNCIÓN SQL CONSOLIDADA)
-- Evalúa historial total de compras (Equipo A + Equipo B) en 30/60/90 días,
-- frecuencia de compra, redondeo a empaque mínimo y ponderación de SKUs prioritarios.
-- ==============================================================================

CREATE OR REPLACE FUNCTION calcular_pedido_sugerido(
    p_cliente_id UUID,
    p_dias_analisis INT DEFAULT 60,
    p_factor_crecimiento NUMERIC DEFAULT 1.00
)
RETURNS TABLE (
    producto_id UUID,
    sku VARCHAR(50),
    codigo_barras VARCHAR(50),
    nombre_comercial VARCHAR(255),
    principio_activo VARCHAR(255),
    laboratorio VARCHAR(150),
    precio_lista NUMERIC(12,2),
    descuento_maximo_porc NUMERIC(5,2),
    es_prioritario BOOLEAN,
    factor_prioridad NUMERIC(4,2),
    empaque_minimo INT,
    stock_disponible INT,
    total_unidades_historicas BIGINT,
    frecuencia_pedidos BIGINT,
    compras_equipo_a BIGINT,
    compras_equipo_b BIGINT,
    promedio_mensual NUMERIC(10,2),
    sugerido_calculado INT,
    descuento_sugerido NUMERIC(5,2),
    explicacion_algoritmo TEXT
) AS $$
DECLARE
    v_fecha_desde DATE;
BEGIN
    v_fecha_desde := CURRENT_DATE - (p_dias_analisis || ' days')::INTERVAL;

    RETURN QUERY
    WITH consolidado_historia AS (
        -- Consolidación de órdenes de historico_pedidos_previos
        SELECT 
            h.producto_id,
            h.cantidad_facturada AS cantidad,
            h.descuento_porcentaje,
            h.equipo_origen,
            1 AS conteo_pedido
        FROM historico_pedidos_previos h
        WHERE h.cliente_id = p_cliente_id 
          AND h.fecha_pedido >= v_fecha_desde

        UNION ALL

        -- Más pedidos reales procesados en el sistema
        SELECT 
            d.producto_id,
            d.cantidad_confirmada AS cantidad,
            d.descuento_porcentaje,
            c.equipo_origen,
            1 AS conteo_pedido
        FROM pedidos_detalle d
        JOIN pedidos_cabecera c ON c.id = d.pedido_id
        WHERE c.cliente_id = p_cliente_id 
          AND c.fecha_pedido >= v_fecha_desde
          AND c.estado IN ('procesado_total', 'procesado_parcial')
    ),
    metricas_producto AS (
        SELECT 
            ch.producto_id,
            SUM(ch.cantidad) AS total_unidades,
            COUNT(ch.conteo_pedido) AS frecuencia,
            SUM(CASE WHEN ch.equipo_origen = 'A' THEN ch.cantidad ELSE 0 END) AS cant_equipo_a,
            SUM(CASE WHEN ch.equipo_origen = 'B' THEN ch.cantidad ELSE 0 END) AS cant_equipo_b,
            AVG(ch.descuento_porcentaje) AS desc_promedio
        FROM consolidado_historia ch
        GROUP BY ch.producto_id
    )
    SELECT 
        p.id AS producto_id,
        p.sku,
        p.codigo_barras_ean13 AS codigo_barras,
        p.nombre_comercial,
        p.principio_activo,
        p.laboratorio,
        p.precio_lista,
        p.descuento_maximo_porc,
        p.es_prioritario,
        p.factor_prioridad,
        p.empaque_minimo,
        p.stock_disponible,
        COALESCE(m.total_unidades, 0)::BIGINT AS total_unidades_historicas,
        COALESCE(m.frecuencia, 0)::BIGINT AS frecuencia_pedidos,
        COALESCE(m.cant_equipo_a, 0)::BIGINT AS compras_equipo_a,
        COALESCE(m.cant_equipo_b, 0)::BIGINT AS compras_equipo_b,
        -- Promedio mensual estimado: (unidades / dias) * 30
        ROUND(COALESCE((m.total_unidades::NUMERIC / NULLIF(p_dias_analisis, 0)) * 30.0, 0), 2) AS promedio_mensual,
        -- Cálculo de Unidades Sugeridas redondeadas a empaque_minimo
        (
            CASE 
                -- Si tiene historia
                WHEN COALESCE(m.total_unidades, 0) > 0 THEN
                    GREATEST(
                        p.empaque_minimo,
                        (CEIL(
                            ((m.total_unidades::NUMERIC / NULLIF(p_dias_analisis, 0)) * 30.0 * p_factor_crecimiento * p.factor_prioridad)
                            / p.empaque_minimo
                        ) * p.empaque_minimo)::INT
                    )
                -- Si no tiene historia pero es SKU prioritario, sugerir el empaque mínimo base
                WHEN p.es_prioritario = true THEN
                    p.empaque_minimo
                ELSE 0
            END
        )::INT AS sugerido_calculado,
        -- Descuento sugerido: promedio histórico o el 80% del descuento máximo permitido
        ROUND(
            LEAST(p.descuento_maximo_porc, GREATEST(0.00, COALESCE(m.desc_promedio, p.descuento_maximo_porc * 0.8))),
            2
        ) AS descuento_sugerido,
        -- Explicación auditable del cálculo
        (
            CASE 
                WHEN COALESCE(m.total_unidades, 0) > 0 THEN
                    format('Venta acum. %s uds en %s días (%s Eq.A + %s Eq.B). Vel. mensual %s uds. Factor prioridad %sx. Empaque x%s.',
                        m.total_unidades, p_dias_analisis, m.cant_equipo_a, m.cant_equipo_b, 
                        ROUND((m.total_unidades::NUMERIC / p_dias_analisis) * 30.0, 1),
                        p.factor_prioridad, p.empaque_minimo
                    )
                WHEN p.es_prioritario THEN
                    format('SKU Estratégico prioritario sin compra en últimos %s días. Sugerido mínimo de colocación (%s uds).', p_dias_analisis, p.empaque_minimo)
                ELSE
                    'Sin historial en el período seleccionado.'
            END
        ) AS explicacion_algoritmo
    FROM dim_productos p
    LEFT JOIN metricas_producto m ON m.producto_id = p.id
    WHERE p.activo = true 
      AND (COALESCE(m.total_unidades, 0) > 0 OR p.es_prioritario = true)
    ORDER BY 
        p.es_prioritario DESC,
        sugerido_calculado DESC,
        p.nombre_comercial ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 8. SEGURIDAD A NIVEL DE FILAS (ROW LEVEL SECURITY - RLS)
-- ==============================================================================

-- 8.1. Habilitación de RLS en todas las tablas
ALTER TABLE dim_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_droguerias ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rel_cliente_vendedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE rel_cliente_drogueria_codigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_cliente_drogueria_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE dim_producto_drogueria_mapeo ENABLE ROW LEVEL SECURITY;
ALTER TABLE fact_historico_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_pedidos_previos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_cabecera ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_detalle ENABLE ROW LEVEL SECURITY;

-- 8.2. Funciones auxiliares para verificar el rol del usuario autenticado
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS rol_usuario_enum AS $$
    SELECT rol FROM dim_usuarios WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_user_equipo()
RETURNS equipo_ventas_enum AS $$
    SELECT equipo FROM dim_usuarios WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 8.3. POLÍTICAS PARA DIM_USUARIOS
DROP POLICY IF EXISTS "Usuarios: Admin acceso total" ON dim_usuarios;
CREATE POLICY "Usuarios: Admin acceso total" ON dim_usuarios
    FOR ALL TO authenticated
    USING (auth_user_role() = 'admin')
    WITH CHECK (auth_user_role() = 'admin');

DROP POLICY IF EXISTS "Usuarios: Gerente lectura" ON dim_usuarios;
CREATE POLICY "Usuarios: Gerente lectura" ON dim_usuarios
    FOR SELECT TO authenticated
    USING (auth_user_role() = 'gerente');

DROP POLICY IF EXISTS "Usuarios: Ver propio perfil" ON dim_usuarios;
CREATE POLICY "Usuarios: Ver propio perfil" ON dim_usuarios
    FOR SELECT TO authenticated
    USING (id = auth.uid());

-- 8.4. POLÍTICAS PARA DIM_CLIENTES
DROP POLICY IF EXISTS "Clientes: Admin acceso total" ON dim_clientes;
CREATE POLICY "Clientes: Admin acceso total" ON dim_clientes
    FOR ALL TO authenticated
    USING (auth_user_role() = 'admin')
    WITH CHECK (auth_user_role() = 'admin');

DROP POLICY IF EXISTS "Clientes: Gerente y Teletransferencista lectura general" ON dim_clientes;
CREATE POLICY "Clientes: Gerente y Teletransferencista lectura general" ON dim_clientes
    FOR SELECT TO authenticated
    USING (auth_user_role() IN ('gerente', 'teletransferencista'));

DROP POLICY IF EXISTS "Clientes: Vendedores leen asignados o de su cartera" ON dim_clientes;
CREATE POLICY "Clientes: Vendedores leen asignados o de su cartera" ON dim_clientes
    FOR SELECT TO authenticated
    USING (
        auth_user_role() = 'vendedor' AND (
            id IN (SELECT cliente_id FROM rel_cliente_vendedor WHERE vendedor_id = auth.uid() AND activo = true)
        )
    );

-- 8.5. POLÍTICAS PARA DIM_DROGUERIAS Y DIM_PRODUCTOS (Catálogo común)
DROP POLICY IF EXISTS "Droguerias: Lectura autenticados, escritura admin" ON dim_droguerias;
CREATE POLICY "Droguerias: Lectura autenticados, escritura admin" ON dim_droguerias
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Droguerias: Modificacion admin" ON dim_droguerias;
CREATE POLICY "Droguerias: Modificacion admin" ON dim_droguerias
    FOR ALL TO authenticated
    USING (auth_user_role() = 'admin')
    WITH CHECK (auth_user_role() = 'admin');

DROP POLICY IF EXISTS "Productos: Lectura autenticados, escritura admin" ON dim_productos;
CREATE POLICY "Productos: Lectura autenticados, escritura admin" ON dim_productos
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Productos: Modificacion admin" ON dim_productos;
CREATE POLICY "Productos: Modificacion admin" ON dim_productos
    FOR ALL TO authenticated
    USING (auth_user_role() = 'admin')
    WITH CHECK (auth_user_role() = 'admin');

-- POLÍTICAS PARA REL_CLIENTE_VENDEDOR Y REL_CLIENTE_DROGUERIA_CODIGOS
DROP POLICY IF EXISTS "Rel Cliente Vendedor: Lectura autenticados" ON rel_cliente_vendedor;
CREATE POLICY "Rel Cliente Vendedor: Lectura autenticados" ON rel_cliente_vendedor
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Rel Cliente Vendedor: Modificacion admin" ON rel_cliente_vendedor;
CREATE POLICY "Rel Cliente Vendedor: Modificacion admin" ON rel_cliente_vendedor
    FOR ALL TO authenticated
    USING (auth_user_role() = 'admin')
    WITH CHECK (auth_user_role() = 'admin');

DROP POLICY IF EXISTS "Rel Cliente Drogueria Codigos: Lectura autenticados" ON rel_cliente_drogueria_codigos;
CREATE POLICY "Rel Cliente Drogueria Codigos: Lectura autenticados" ON rel_cliente_drogueria_codigos
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Rel Cliente Drogueria Codigos: Modificacion admin" ON rel_cliente_drogueria_codigos;
CREATE POLICY "Rel Cliente Drogueria Codigos: Modificacion admin" ON rel_cliente_drogueria_codigos
    FOR ALL TO authenticated
    USING (auth_user_role() = 'admin')
    WITH CHECK (auth_user_role() = 'admin');

-- POLÍTICAS PARA DIM_CLIENTE_DROGUERIA_ALIAS (Homologación de nombres de farmacias)
DROP POLICY IF EXISTS "Alias Drogueria: Lectura autenticados" ON dim_cliente_drogueria_alias;
CREATE POLICY "Alias Drogueria: Lectura autenticados" ON dim_cliente_drogueria_alias
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Alias Drogueria: Gestion autenticados" ON dim_cliente_drogueria_alias;
CREATE POLICY "Alias Drogueria: Gestion autenticados" ON dim_cliente_drogueria_alias
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- POLÍTICAS PARA DIM_PRODUCTO_DROGUERIA_MAPEO (Cod SAP vs Códigos Droguerías)
DROP POLICY IF EXISTS "Mapeo Drogueria: Lectura autenticados" ON dim_producto_drogueria_mapeo;
CREATE POLICY "Mapeo Drogueria: Lectura autenticados" ON dim_producto_drogueria_mapeo
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Mapeo Drogueria: Gestion autenticados" ON dim_producto_drogueria_mapeo;
CREATE POLICY "Mapeo Drogueria: Gestion autenticados" ON dim_producto_drogueria_mapeo
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- POLÍTICAS PARA FACT_HISTORICO_VENTAS (Ventas diarias por mes)
DROP POLICY IF EXISTS "Fact Historico Ventas: Lectura autenticados" ON fact_historico_ventas;
CREATE POLICY "Fact Historico Ventas: Lectura autenticados" ON fact_historico_ventas
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Fact Historico Ventas: Insercion y administracion" ON fact_historico_ventas;
CREATE POLICY "Fact Historico Ventas: Insercion y administracion" ON fact_historico_ventas
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- 8.6. POLÍTICAS PARA HISTORICO_PEDIDOS_PREVIOS
DROP POLICY IF EXISTS "Historico: Admin, Gerente y Teletransferencista lectura total" ON historico_pedidos_previos;
CREATE POLICY "Historico: Admin, Gerente y Teletransferencista lectura total" ON historico_pedidos_previos
    FOR SELECT TO authenticated
    USING (auth_user_role() IN ('admin', 'gerente', 'teletransferencista'));

DROP POLICY IF EXISTS "Historico: Vendedores leen historial de sus clientes" ON historico_pedidos_previos;
CREATE POLICY "Historico: Vendedores leen historial de sus clientes" ON historico_pedidos_previos
    FOR SELECT TO authenticated
    USING (
        auth_user_role() = 'vendedor' AND (
            cliente_id IN (SELECT cliente_id FROM rel_cliente_vendedor WHERE vendedor_id = auth.uid() AND activo = true)
        )
    );

DROP POLICY IF EXISTS "Historico: Insercion y administracion solo admin" ON historico_pedidos_previos;
CREATE POLICY "Historico: Insercion y administracion solo admin" ON historico_pedidos_previos
    FOR ALL TO authenticated
    USING (auth_user_role() = 'admin')
    WITH CHECK (auth_user_role() = 'admin');

-- 8.7. POLÍTICAS PARA PEDIDOS_CABECERA
DROP POLICY IF EXISTS "Pedidos Cabecera: Admin total" ON pedidos_cabecera;
CREATE POLICY "Pedidos Cabecera: Admin total" ON pedidos_cabecera
    FOR ALL TO authenticated
    USING (auth_user_role() = 'admin')
    WITH CHECK (auth_user_role() = 'admin');

DROP POLICY IF EXISTS "Pedidos Cabecera: Gerente lectura monitoreo" ON pedidos_cabecera;
CREATE POLICY "Pedidos Cabecera: Gerente lectura monitoreo" ON pedidos_cabecera
    FOR SELECT TO authenticated
    USING (auth_user_role() = 'gerente');

DROP POLICY IF EXISTS "Pedidos Cabecera: Vendedor gestiona sus pedidos" ON pedidos_cabecera;
CREATE POLICY "Pedidos Cabecera: Vendedor gestiona sus pedidos" ON pedidos_cabecera
    FOR SELECT TO authenticated
    USING (auth_user_role() = 'vendedor' AND vendedor_id = auth.uid());

DROP POLICY IF EXISTS "Pedidos Cabecera: Vendedor inserta nuevos" ON pedidos_cabecera;
CREATE POLICY "Pedidos Cabecera: Vendedor inserta nuevos" ON pedidos_cabecera
    FOR INSERT TO authenticated
    WITH CHECK (auth_user_role() = 'vendedor' AND vendedor_id = auth.uid());

DROP POLICY IF EXISTS "Pedidos Cabecera: Vendedor modifica solo en borrador" ON pedidos_cabecera;
CREATE POLICY "Pedidos Cabecera: Vendedor modifica solo en borrador" ON pedidos_cabecera
    FOR UPDATE TO authenticated
    USING (auth_user_role() = 'vendedor' AND vendedor_id = auth.uid() AND estado = 'borrador')
    WITH CHECK (auth_user_role() = 'vendedor' AND vendedor_id = auth.uid() AND estado IN ('borrador', 'enviado_teletransferencia'));

DROP POLICY IF EXISTS "Pedidos Cabecera: Teletransferencista gestiona cola" ON pedidos_cabecera;
CREATE POLICY "Pedidos Cabecera: Teletransferencista gestiona cola" ON pedidos_cabecera
    FOR SELECT TO authenticated
    USING (auth_user_role() = 'teletransferencista' AND estado != 'borrador');

DROP POLICY IF EXISTS "Pedidos Cabecera: Teletransferencista actualiza estado" ON pedidos_cabecera;
CREATE POLICY "Pedidos Cabecera: Teletransferencista actualiza estado" ON pedidos_cabecera
    FOR UPDATE TO authenticated
    USING (auth_user_role() = 'teletransferencista' AND estado != 'borrador')
    WITH CHECK (auth_user_role() = 'teletransferencista' AND estado IN ('en_proceso', 'procesado_total', 'procesado_parcial', 'facturado', 'rechazado'));

-- 8.8. POLÍTICAS PARA PEDIDOS_DETALLE
DROP POLICY IF EXISTS "Pedidos Detalle: Admin total" ON pedidos_detalle;
CREATE POLICY "Pedidos Detalle: Admin total" ON pedidos_detalle
    FOR ALL TO authenticated
    USING (auth_user_role() = 'admin')
    WITH CHECK (auth_user_role() = 'admin');

DROP POLICY IF EXISTS "Pedidos Detalle: Gerente lectura monitoreo" ON pedidos_detalle;
CREATE POLICY "Pedidos Detalle: Gerente lectura monitoreo" ON pedidos_detalle
    FOR SELECT TO authenticated
    USING (auth_user_role() = 'gerente');

DROP POLICY IF EXISTS "Pedidos Detalle: Vendedor lectura de sus pedidos" ON pedidos_detalle;
CREATE POLICY "Pedidos Detalle: Vendedor lectura de sus pedidos" ON pedidos_detalle
    FOR SELECT TO authenticated
    USING (
        pedido_id IN (SELECT id FROM pedidos_cabecera WHERE vendedor_id = auth.uid())
    );

DROP POLICY IF EXISTS "Pedidos Detalle: Vendedor modifica solo en borrador" ON pedidos_detalle;
CREATE POLICY "Pedidos Detalle: Vendedor modifica solo en borrador" ON pedidos_detalle
    FOR ALL TO authenticated
    USING (
        pedido_id IN (SELECT id FROM pedidos_cabecera WHERE vendedor_id = auth.uid() AND estado = 'borrador')
    )
    WITH CHECK (
        pedido_id IN (SELECT id FROM pedidos_cabecera WHERE vendedor_id = auth.uid() AND estado = 'borrador')
    );

DROP POLICY IF EXISTS "Pedidos Detalle: Teletransferencista lectura de cola" ON pedidos_detalle;
CREATE POLICY "Pedidos Detalle: Teletransferencista lectura de cola" ON pedidos_detalle
    FOR SELECT TO authenticated
    USING (
        pedido_id IN (SELECT id FROM pedidos_cabecera WHERE estado != 'borrador')
    );

DROP POLICY IF EXISTS "Pedidos Detalle: Teletransferencista ajusta cantidades y motivos" ON pedidos_detalle;
CREATE POLICY "Pedidos Detalle: Teletransferencista ajusta cantidades y motivos" ON pedidos_detalle
    FOR UPDATE TO authenticated
    USING (
        pedido_id IN (SELECT id FROM pedidos_cabecera WHERE estado != 'borrador')
    )
    WITH CHECK (
        pedido_id IN (SELECT id FROM pedidos_cabecera WHERE estado != 'borrador')
    );

-- ==============================================================================
-- 9. DATOS SEMILLA (SEED DATA) DE PRODUCCIÓN
-- Incluye droguerías reales de Venezuela/LatAm con formatos CSV disímiles,
-- vademécum de productos, clientes compartidos y órdenes históricas.
-- ==============================================================================

-- 9.1. Droguerías (Nomenclatura Ventas al Día) y configuraciones dinámicas de CSV
INSERT INTO dim_droguerias (codigo_drogueria, rif, nombre_drogueria, email_pedidos, telefono, tiempo_entrega_promedio_dias, formato_csv_config)
VALUES 
(
    'DROG-BLV',
    'J-31012456-1',
    'BLV',
    'pedidos@blv.com.ve',
    '0212-2345678',
    2,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "COD_CLIENTE", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF_FARMACIA", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "SKU_PRODUCTO", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "NUMERO_ORDEN", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-COBECA',
    'J-07000305-6',
    'COBECA',
    'teletransferencias@cobeca.com',
    '0261-7501000',
    1,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "COD_CLIENTE_COBECA", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF_CLIENTE", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "CODIGO_ARTICULO", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD_DESPACHO", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "PORCENTAJE_DESCUENTO", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "NUMERO_PEDIDO_ORIGEN", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-DROBIENCA',
    'J-30456123-2',
    'DROBIENCA',
    'pedidos@drobienca.com',
    '0243-2471122',
    2,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "CLIENTE", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "COD_ARTICULO", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANT_CONFIRMADA", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "PORC_DSCTO", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "ORDEN_COMPRA", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-365',
    'J-40891234-5',
    'DROGUERIA 365',
    'ventas@drogueria365.com',
    '0212-9876543',
    2,
    '{
        "delimitador": ",",
        "incluir_encabezados": true,
        "entrecomillado": "siempre",
        "codificacion": "UTF-8",
        "salto_linea": "\n",
        "formato_decimal": "punto",
        "columnas": [
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF", "orden": 1, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "SKU", "orden": 2, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 3, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO", "orden": 4, "formato": "decimal_punto"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "REFERENCIA", "orden": 5, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-DROMARKO',
    'J-31298456-7',
    'DROMARKO',
    'operaciones@dromarko.com',
    '0241-8712345',
    2,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "COD_CLIENTE", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "PRODUCTO", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "UNIDADES", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DSCTO", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "PEDIDO_NO", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-NENA',
    'J-00045678-9',
    'NENA',
    'transfers@droguerianena.com',
    '0212-9051111',
    2,
    '{
        "delimitador": ",",
        "incluir_encabezados": true,
        "entrecomillado": "siempre",
        "codificacion": "UTF-8",
        "salto_linea": "\n",
        "formato_decimal": "punto",
        "columnas": [
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF_FARMACIA", "orden": 1, "formato": "texto"},
            {"campo_origen": "codigo_barras", "nombre_encabezado": "EAN_13", "orden": 2, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANT_SOLICITADA", "orden": 3, "formato": "entero"},
            {"campo_origen": "precio_unitario", "nombre_encabezado": "PRECIO_BASE", "orden": 4, "formato": "decimal_punto"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DSCTO_COMERCIAL", "orden": 5, "formato": "decimal_punto"}
        ]
    }'::jsonb
),
(
    'DROG-DROPHARMA',
    'J-31567890-3',
    'DROPHARMA',
    'pedidos@dropharma.com',
    '0251-4456789',
    2,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "COD_CTE", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "COD_PROD", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "DOC_PEDIDO", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-DROVENCENTRO',
    'J-30987123-4',
    'DROVENCENTRO',
    'transferencias@drovencentro.com',
    '0243-5567890',
    2,
    '{
        "delimitador": "|",
        "incluir_encabezados": true,
        "entrecomillado": "nunca",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "punto",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "CLIENTE_ID", "orden": 1, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "SKU_ITEM", "orden": 2, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 3, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO", "orden": 4, "formato": "decimal_punto"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "ORDEN_NO", "orden": 5, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-FARMA24',
    'J-40123987-8',
    'FARMACEUTICA 24',
    'ordenes@farmaceutica24.com',
    '0212-7654321',
    1,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF_COMPRADOR", "orden": 1, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "CODIGO_SKU", "orden": 2, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "UNIDADES_PEDIDAS", "orden": 3, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "PORCENTAJE_DSCTO", "orden": 4, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "NUM_TRANSACCION", "orden": 5, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-INSUAMINCA',
    'J-31456098-9',
    'INSUAMINCA',
    'ventas@insuaminca.com',
    '0281-2876543',
    2,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "COD_CTE", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF_CTE", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "ITEM_COD", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO_PCT", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "ID_PEDIDO", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-ITS',
    'J-40567123-0',
    'ITS',
    'pedidos@itsfarma.com',
    '0212-3456789',
    2,
    '{
        "delimitador": ",",
        "incluir_encabezados": true,
        "entrecomillado": "siempre",
        "codificacion": "UTF-8",
        "salto_linea": "\n",
        "formato_decimal": "punto",
        "columnas": [
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF", "orden": 1, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "CODIGO", "orden": 2, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 3, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO", "orden": 4, "formato": "decimal_punto"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "ORDEN_NO", "orden": 5, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-MEGA',
    'J-31678234-1',
    'MEGA',
    'despachos@drogueriamega.com',
    '0261-7890123',
    2,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "COD_CLIENTE_MEGA", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF_FARMACIA", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "SKU_PRODUCTO", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANT_CONFIRMADA", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DSCTO_PCT", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "REF_PEDIDO", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-PHARMAMEDIC',
    'J-40987654-2',
    'PHARMA MEDIC',
    'contacto@pharmamedic.com',
    '0241-8654321',
    2,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "COD_CLIENTE", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "ARTICULO", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "PEDIDO", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-SANGREGORIO',
    'J-30789012-3',
    'SAN GREGORIO',
    'pedidos@sangregorio.com',
    '0276-3456789',
    2,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "CODIGO_CTE", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF_CTE", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "COD_ARTICULO", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DSCTO", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "ORDEN_NUMERO", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-SANTOREMEDIO',
    'J-40345678-4',
    'SANTO REMEDIO',
    'ventas@santoremedio.com',
    '0251-7890123',
    2,
    '{
        "delimitador": ",",
        "incluir_encabezados": true,
        "entrecomillado": "siempre",
        "codificacion": "UTF-8",
        "salto_linea": "\n",
        "formato_decimal": "punto",
        "columnas": [
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF", "orden": 1, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "SKU", "orden": 2, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 3, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO", "orden": 4, "formato": "decimal_punto"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "NUMERO_PEDIDO", "orden": 5, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-VITAL',
    'J-31890123-5',
    'VITAL',
    'ordenes@drogueriavital.com',
    '0212-9871234',
    2,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "COD_CTE", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "COD_ARTICULO", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "CANTIDAD", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "PORCENTAJE_DESCUENTO", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "PEDIDO_NUMERO", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
),
(
    'DROG-ZAKIPHARMA',
    'J-41123456-6',
    'ZAKIPHARMA',
    'pedidos@zakipharma.com',
    '0261-7123456',
    2,
    '{
        "delimitador": ";",
        "incluir_encabezados": true,
        "entrecomillado": "solo_texto",
        "codificacion": "UTF-8",
        "salto_linea": "\r\n",
        "formato_decimal": "coma",
        "columnas": [
            {"campo_origen": "codigo_cliente", "nombre_encabezado": "CLIENTE_COD", "orden": 1, "formato": "texto"},
            {"campo_origen": "rif_cliente", "nombre_encabezado": "RIF_CLIENTE", "orden": 2, "formato": "texto"},
            {"campo_origen": "sku", "nombre_encabezado": "SKU_PRODUCTO", "orden": 3, "formato": "texto"},
            {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "UNIDADES_DESPACHAR", "orden": 4, "formato": "entero"},
            {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESCUENTO_PCT", "orden": 5, "formato": "decimal_coma"},
            {"campo_origen": "numero_pedido", "nombre_encabezado": "ORDEN_COMPRA", "orden": 6, "formato": "texto"}
        ]
    }'::jsonb
)
ON CONFLICT (codigo_drogueria) DO UPDATE 
SET 
    nombre_drogueria = EXCLUDED.nombre_drogueria,
    rif = EXCLUDED.rif,
    email_pedidos = EXCLUDED.email_pedidos,
    telefono = EXCLUDED.telefono,
    formato_csv_config = EXCLUDED.formato_csv_config;

-- 9.2. Catálogo de Productos y Vademécum
INSERT INTO dim_productos (sku, codigo_barras_ean13, principio_activo, nombre_comercial, presentacion, laboratorio, precio_lista, descuento_maximo_porc, es_prioritario, factor_prioridad, empaque_minimo, stock_disponible)
VALUES 
('SKU-LOS-50', '7702057001014', 'Losartán Potásico', 'Losartán 50mg', 'Caja x 30 tabletas', 'Genfar', 4.80, 18.00, true, 1.40, 10, 1250),
('SKU-ATO-20', '7702057002028', 'Atorvastatina Cálcica', 'Atorvastatina 20mg', 'Caja x 30 tabletas', 'Calox', 6.50, 15.00, true, 1.35, 10, 840),
('SKU-AMX-500', '7702057003035', 'Amoxicilina + Ác. Clavulánico', 'Clavumox 500/125mg', 'Caja x 14 tabletas recubiertas', 'Megalabs', 8.90, 12.00, true, 1.30, 6, 620),
('SKU-ACE-500', '7702057004042', 'Acetaminofén (Paracetamol)', 'Atamel 500mg', 'Caja x 20 tabletas', 'Pfizer / Elmor', 2.30, 20.00, false, 1.00, 20, 3100),
('SKU-IBU-400', '7702057005059', 'Ibuprofeno', 'Ibuprofeno 400mg', 'Caja x 20 cápsulas blandas', 'Behrens', 3.10, 15.00, false, 1.00, 12, 1400),
('SKU-OME-20', '7702057006066', 'Omeprazol Magnésico', 'Omeprazol 20mg', 'Caja x 28 cápsulas', 'Leti', 5.20, 16.00, true, 1.25, 10, 950),
('SKU-MET-850', '7702057007073', 'Metformina Clorhidrato', 'Diaformin 850mg', 'Caja x 30 tabletas', 'Laboratorios Vargas', 4.10, 14.00, false, 1.00, 10, 780),
('SKU-LOR-10', '7702057008080', 'Loratadina', 'Lorex 10mg', 'Caja x 10 tabletas', 'Calox', 2.50, 18.00, false, 1.00, 20, 1600),
('SKU-AZI-500', '7702057009097', 'Azitromicina Dihidrato', 'Azitromicina 500mg', 'Caja x 3 tabletas', 'Genfar', 5.80, 15.00, true, 1.30, 6, 510),
('SKU-CIP-500', '7702057010109', 'Ciprofloxacina', 'Ciprofloxacina 500mg', 'Caja x 10 tabletas', 'Behrens', 4.90, 12.00, false, 1.00, 10, 430)
ON CONFLICT (sku) DO NOTHING;

-- 9.3. Clientes Farmacéuticos
INSERT INTO dim_clientes (codigo_cliente, rif, razon_social, nombre_comercial, direccion, estado, ciudad, clasificacion_abc, cupo_credito, dias_credito, telefono, email_contacto)
VALUES 
('CLI-1001', 'J-30129845-1', 'Farmacias Unidas C.A.', 'Farmatodo Las Mercedes', 'Av. Principal de Las Mercedes, Caracas', 'Miranda', 'Caracas', 'A', 25000.00, 30, '0212-9910001', 'compras@farmatodo.com.ve'),
('CLI-1002', 'J-30489218-4', 'Droguería y Farmacia La Paz S.R.L.', 'Farmacia La Paz Chacao', 'Calle Bolívar, Edif. La Paz, Chacao', 'Miranda', 'Caracas', 'A', 18000.00, 21, '0212-2634455', 'lapazchacao@gmail.com'),
('CLI-1003', 'J-31002941-8', 'Inversiones FarmaSalud 2020 C.A.', 'Farmacia San Rafael', 'Av. Intercomunal Jorge Rodríguez, Barcelona', 'Anzoátegui', 'Barcelona', 'B', 8500.00, 15, '0281-2861122', 'contacto@farmasanrafael.com'),
('CLI-1004', 'J-40112879-0', 'Botiquería El Valle C.A.', 'Botiquería El Valle', 'Calle Real del Valle, Parroquia El Valle', 'Distrito Capital', 'Caracas', 'B', 6000.00, 15, '0212-6819922', 'botiqueriaelvalle@cantv.net'),
('CLI-1005', 'J-40998811-2', 'Farmacia y Misceláneas Maracaibo C.A.', 'FarmaBella Maracaibo', 'Av. 5 de Julio cruce con Delicias, Maracaibo', 'Zulia', 'Maracaibo', 'C', 4500.00, 7, '0261-7928800', 'farmabella.zulia@hotmail.com')
ON CONFLICT (codigo_cliente) DO NOTHING;

-- ==============================================================================
-- 10. MÓDULO DE INVENTARIO Y PRECIOS POR DROGUERÍA (REQUERIMIENTO #3)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS inventario_drogueria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drogueria_id UUID NOT NULL REFERENCES dim_droguerias(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES dim_productos(id) ON DELETE CASCADE,
    stock_disponible INT NOT NULL DEFAULT 0 CHECK (stock_disponible >= 0),
    precio_drogueria NUMERIC(12,2) CHECK (precio_drogueria >= 0),
    codigo_articulo_drogueria VARCHAR(100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_inventario_drogueria_producto UNIQUE (drogueria_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_drogueria_prod ON inventario_drogueria(drogueria_id, producto_id);

ALTER TABLE inventario_drogueria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inv Drogueria: Lectura general" ON inventario_drogueria;
CREATE POLICY "Inv Drogueria: Lectura general" ON inventario_drogueria
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Inv Drogueria: Modificacion admin" ON inventario_drogueria;
CREATE POLICY "Inv Drogueria: Modificacion admin" ON inventario_drogueria
    FOR ALL TO authenticated
    USING (auth_user_role() = 'admin')
    WITH CHECK (auth_user_role() = 'admin');

-- ==============================================================================
-- 11. SINCRONIZACIÓN AUTOMÁTICA DE SUPABASE AUTH CON DIM_USUARIOS
-- Permite que al crear o invitar un usuario en Supabase Auth se cree su perfil
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.dim_usuarios (id, email, nombre_completo, rol, equipo)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, 'usuario@nova.farmacia'),
        COALESCE(NEW.raw_user_meta_data->>'nombre_completo', split_part(COALESCE(NEW.email, 'usuario'), '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'rol')::rol_usuario_enum, 'vendedor'),
        COALESCE((NEW.raw_user_meta_data->>'equipo')::equipo_ventas_enum, 'La Sante')
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        nombre_completo = COALESCE(EXCLUDED.nombre_completo, dim_usuarios.nombre_completo);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
EXCEPTION
    WHEN OTHERS THEN null;
END $$;


