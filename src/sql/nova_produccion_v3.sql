-- ==============================================================================
-- NOVA v3 · ESQUEMA DE PRODUCCIÓN (Supabase / PostgreSQL 15+ con PostGIS)
-- Laboratorio -> Equipos comerciales -> Droguerías -> Farmacias
--
-- Diseño:
--   * Offline-first: todos los identificadores los genera el cliente (UUID v4) y todas las
--     operaciones de escritura desde el dispositivo son IDEMPOTENTES (reintentar no duplica).
--   * Sincronización por cursor: cada tabla sincronizable tiene updated_at, row_version y
--     deleted_at (borrado lógico). El cliente pide `updated_at > cursor`.
--   * Fase 1 sin dinero: solo unidades. precios_drogueria_producto y las columnas de precio de
--     los detalles quedan nulas y listas para activarse sin tocar la lógica operativa.
--   * Seguridad: RLS en todas las tablas; las operaciones críticas viven en funciones RPC.
--
-- Uso: ejecutar completo en el SQL Editor de un proyecto Supabase NUEVO (o tras retirar el
-- esquema de fase 1, cuyos nombres de tabla coinciden). Es re-ejecutable (IF NOT EXISTS).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. EXTENSIONES Y ESQUEMA DE APOYO
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;   -- geography(Point,4326), ST_Distance
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- búsqueda difusa de productos/clientes
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid(), crypt() para la clave de purga

CREATE SCHEMA IF NOT EXISTS app;          -- funciones internas (no expuestas como API)

-- ------------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS
-- ------------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE rol_usuario AS ENUM ('vendedor','transferencista','gerente','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE estado_validacion_cliente AS ENUM ('prospecto_pendiente','activo','inactivo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE segmento_cliente AS ENUM ('estandar','recurrente','vip');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE estado_pedido AS ENUM (
  'borrador',                    -- guardado, aún no enviado
  'enviado_teletransferencia',   -- en la bandeja del transferencista
  'en_revision',                 -- retenido: condición fuera de rango, cliente sin validar o pedido derivado
  'en_proceso',                  -- el transferencista lo gestiona con la droguería
  'procesado_parcial',           -- la droguería despachó solo una parte
  'procesado_total',
  'facturado',
  'rechazado',
  'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE motivo_ajuste AS ENUM
  ('sin_quiebre','quiebre_stock_drogueria','limite_credito','producto_descontinuado','ajuste_comercial','otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE tipo_alerta AS ENUM ('sku_hueso','churn_riesgo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE resultado_visita AS ENUM ('pedido_tomado','sin_pedido','cliente_cerrado','reprogramada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE alcance_regla AS ENUM ('linea','pedido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger genérico de sincronización: marca de tiempo y versión de fila (concurrencia optimista).
CREATE OR REPLACE FUNCTION app.touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  IF TG_OP = 'UPDATE' THEN
    NEW.row_version := OLD.row_version + 1;
  END IF;
  RETURN NEW;
END $$;

-- ------------------------------------------------------------------------------
-- 2. DIMENSIONES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_equipos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text NOT NULL UNIQUE,
  nombre      text NOT NULL,
  linea       text NOT NULL DEFAULT 'etico' CHECK (linea IN ('etico','consumo','otc','otro')),
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version integer NOT NULL DEFAULT 1,
  deleted_at  timestamptz
);

-- Usuarios de la aplicación: extienden auth.users de Supabase.
CREATE TABLE IF NOT EXISTS dim_usuarios (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_completo text NOT NULL,
  email           text NOT NULL,
  rol             rol_usuario NOT NULL DEFAULT 'vendedor',
  equipo_id       uuid REFERENCES dim_equipos(id),
  telefono        text,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version     integer NOT NULL DEFAULT 1,
  deleted_at      timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email ON dim_usuarios (lower(email));
CREATE INDEX IF NOT EXISTS idx_usuarios_rol_equipo ON dim_usuarios (rol, equipo_id) WHERE activo;

CREATE TABLE IF NOT EXISTS dim_clientes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- lo genera el dispositivo si nace en campo
  codigo_interno        text UNIQUE,                                 -- ident01 (nulo en prospectos)
  razon_social          text NOT NULL,
  nombre_comercial      text NOT NULL,
  rif                   text,
  rif_verificado        boolean NOT NULL DEFAULT false,
  rif_verificado_por    uuid REFERENCES dim_usuarios(id),
  rif_verificado_en     timestamptz,
  documentos            jsonb NOT NULL DEFAULT '[]'::jsonb,          -- rutas en Supabase Storage
  brick                 text,
  municipio             text,
  estado_geografico     text,
  direccion             text,
  telefono              text,
  bandera               text,
  ubicacion             geography(Point,4326),
  -- Coordenadas planas para el dispositivo (PostgREST devuelve geography en binario).
  lat                   double precision GENERATED ALWAYS AS (ST_Y(ubicacion::geometry)) STORED,
  lon                   double precision GENERATED ALWAYS AS (ST_X(ubicacion::geometry)) STORED,
  frecuencia_dias       smallint CHECK (frecuencia_dias IS NULL OR frecuencia_dias BETWEEN 1 AND 365),
  estado_validacion     estado_validacion_cliente NOT NULL DEFAULT 'prospecto_pendiente',
  segmento              segmento_cliente NOT NULL DEFAULT 'estandar',
  origen                text NOT NULL DEFAULT 'oficina' CHECK (origen IN ('oficina','campo')),
  creado_por            uuid REFERENCES dim_usuarios(id),
  validado_por          uuid REFERENCES dim_usuarios(id),
  validado_en           timestamptz,
  motivo_rechazo        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version           integer NOT NULL DEFAULT 1,
  deleted_at            timestamptz,
  -- Un cliente activo exige RIF verificado (regla 4).
  CONSTRAINT ck_cliente_activo_rif CHECK (estado_validacion <> 'activo' OR rif_verificado)
);
-- RIF normalizado único (ignora guiones, puntos y mayúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_rif
  ON dim_clientes (upper(regexp_replace(rif, '[^0-9A-Za-z]', '', 'g')))
  WHERE rif IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_ubicacion ON dim_clientes USING gist (ubicacion);
CREATE INDEX IF NOT EXISTS idx_clientes_estado ON dim_clientes (estado_validacion) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_updated ON dim_clientes (updated_at);
CREATE INDEX IF NOT EXISTS idx_clientes_brick ON dim_clientes (brick) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_nombre_trgm ON dim_clientes USING gin (nombre_comercial gin_trgm_ops);

-- Una farmacia puede tener varios vendedores de distintos equipos (regla 5).
CREATE TABLE IF NOT EXISTS rel_cliente_vendedor (
  cliente_id  uuid NOT NULL REFERENCES dim_clientes(id) ON DELETE CASCADE,
  vendedor_id uuid NOT NULL REFERENCES dim_usuarios(id) ON DELETE CASCADE,
  equipo_id   uuid REFERENCES dim_equipos(id),
  es_titular  boolean NOT NULL DEFAULT true,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version integer NOT NULL DEFAULT 1,
  deleted_at  timestamptz,
  PRIMARY KEY (cliente_id, vendedor_id)
);
CREATE INDEX IF NOT EXISTS idx_relcv_vendedor ON rel_cliente_vendedor (vendedor_id) WHERE activo;

CREATE TABLE IF NOT EXISTS dim_droguerias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text NOT NULL UNIQUE,
  nombre          text NOT NULL,
  rif             text,
  email_pedidos   text,
  telefono        text,
  dias_entrega    smallint,
  -- Layout de exportación (ver src/services/exportacionDrogueria.ts para el contrato completo).
  formato_export  jsonb NOT NULL DEFAULT jsonb_build_object(
      'formato','csv','delimitador',';','encabezado',true,'entrecomillado','solo_texto',
      'salto_linea',E'\r\n','codificacion','utf-8','bom',false,'extension','csv','decimal','punto',
      'formato_fecha','YYYYMMDD','nombre_archivo','{correlativo}_{fecha}.{extension}',
      'columnas', jsonb_build_array(
        jsonb_build_object('encabezado','COD_CLIENTE','origen','codigo_cliente_drogueria'),
        jsonb_build_object('encabezado','COD_PRODUCTO','origen','codigo_producto_drogueria'),
        jsonb_build_object('encabezado','CANTIDAD','origen','unidades_confirmadas'),
        jsonb_build_object('encabezado','PEDIDO','origen','correlativo'))),
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version     integer NOT NULL DEFAULT 1,
  deleted_at      timestamptz,
  CONSTRAINT ck_formato_export CHECK (
    jsonb_typeof(formato_export->'columnas') = 'array'
    AND jsonb_array_length(formato_export->'columnas') > 0
    AND coalesce(formato_export->>'delimitador','') IN (';', ',', '|', E'\t', '')
    AND coalesce(formato_export->>'formato','csv') IN ('csv','txt')
    AND coalesce(formato_export->>'codificacion','utf-8') IN ('utf-8','iso-8859-1','windows-1252'))
);

CREATE TABLE IF NOT EXISTS dim_productos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                  text NOT NULL UNIQUE,            -- Cod SAP
  ean13                text,
  nombre_comercial     text NOT NULL,
  presentacion         text,
  principio_activo     text,
  concentracion        text,
  clase_terapeutica    text,
  categoria            text,                            -- base de las reglas por categoría
  laboratorio          text,
  equipo_id            uuid REFERENCES dim_equipos(id), -- línea que lo comercializa
  empaque_minimo       integer NOT NULL DEFAULT 1 CHECK (empaque_minimo > 0),
  es_prioritario       boolean NOT NULL DEFAULT false,
  activo               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version          integer NOT NULL DEFAULT 1,
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_productos_ean ON dim_productos (ean13) WHERE ean13 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_productos_nombre_trgm ON dim_productos USING gin (nombre_comercial gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_productos_molecula_trgm ON dim_productos USING gin (principio_activo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON dim_productos (categoria);
CREATE INDEX IF NOT EXISTS idx_productos_updated ON dim_productos (updated_at);

-- ------------------------------------------------------------------------------
-- 3. HOMOLOGACIÓN CON CATÁLOGOS EXTERNOS DE CADA DROGUERÍA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS map_producto_drogueria (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drogueria_id           uuid NOT NULL REFERENCES dim_droguerias(id) ON DELETE CASCADE,
  producto_id            uuid NOT NULL REFERENCES dim_productos(id) ON DELETE CASCADE,
  codigo_drogueria       text NOT NULL,
  descripcion_drogueria  text,
  activo                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version            integer NOT NULL DEFAULT 1,
  deleted_at             timestamptz,
  UNIQUE (drogueria_id, producto_id),          -- relación unívoca interno -> droguería
  UNIQUE (drogueria_id, codigo_drogueria)      -- y droguería -> interno
);
CREATE INDEX IF NOT EXISTS idx_mapprod_producto ON map_producto_drogueria (producto_id);
CREATE INDEX IF NOT EXISTS idx_mapprod_updated ON map_producto_drogueria (updated_at);

CREATE TABLE IF NOT EXISTS map_cliente_drogueria (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drogueria_id          uuid NOT NULL REFERENCES dim_droguerias(id) ON DELETE CASCADE,
  cliente_id            uuid NOT NULL REFERENCES dim_clientes(id) ON DELETE CASCADE,
  codigo_cuenta         text NOT NULL,
  nombre_en_drogueria   text,
  verificado            boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version           integer NOT NULL DEFAULT 1,
  deleted_at            timestamptz,
  UNIQUE (drogueria_id, cliente_id),
  UNIQUE (drogueria_id, codigo_cuenta)
);
CREATE INDEX IF NOT EXISTS idx_mapcli_cliente ON map_cliente_drogueria (cliente_id);
CREATE INDEX IF NOT EXISTS idx_mapcli_updated ON map_cliente_drogueria (updated_at);

-- ------------------------------------------------------------------------------
-- 4. PRECIOS (FASE POSTERIOR) Y POLÍTICAS COMERCIALES
-- ------------------------------------------------------------------------------
-- Extensible y sin uso operativo en la fase 1.
CREATE TABLE IF NOT EXISTS precios_drogueria_producto (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drogueria_id    uuid NOT NULL REFERENCES dim_droguerias(id) ON DELETE CASCADE,
  producto_id     uuid NOT NULL REFERENCES dim_productos(id) ON DELETE CASCADE,
  precio_base     numeric(14,4) NOT NULL CHECK (precio_base >= 0),
  moneda          char(3) NOT NULL DEFAULT 'USD',
  fecha_vigencia  date NOT NULL DEFAULT current_date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version     integer NOT NULL DEFAULT 1,
  deleted_at      timestamptz,
  UNIQUE (drogueria_id, producto_id, moneda, fecha_vigencia)
);
CREATE INDEX IF NOT EXISTS idx_precios_lookup
  ON precios_drogueria_producto (drogueria_id, producto_id, fecha_vigencia DESC);

CREATE OR REPLACE FUNCTION precio_vigente(p_drogueria uuid, p_producto uuid, p_fecha date DEFAULT current_date)
RETURNS TABLE (precio_base numeric, moneda char(3), fecha_vigencia date)
LANGUAGE sql STABLE AS $$
  SELECT pr.precio_base, pr.moneda, pr.fecha_vigencia
  FROM precios_drogueria_producto pr
  WHERE pr.drogueria_id = p_drogueria AND pr.producto_id = p_producto
    AND pr.fecha_vigencia <= p_fecha AND pr.deleted_at IS NULL
  ORDER BY pr.fecha_vigencia DESC
  LIMIT 1
$$;

-- Reglas dinámicas que el administrador configura y el dispositivo cachea (regla 3).
-- Una regla "aplica" cuando se cumplen TODOS sus umbrales; entonces habilita hasta descuento_max_pct.
CREATE TABLE IF NOT EXISTS config_reglas_comerciales (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                    text NOT NULL,
  alcance                   alcance_regla NOT NULL DEFAULT 'linea',
  descuento_max_pct         numeric(5,2) NOT NULL DEFAULT 0 CHECK (descuento_max_pct BETWEEN 0 AND 100),
  min_skus_distintos        integer CHECK (min_skus_distintos IS NULL OR min_skus_distintos > 0),
  min_unidades_totales      integer CHECK (min_unidades_totales IS NULL OR min_unidades_totales > 0),
  min_unidades_categoria    integer CHECK (min_unidades_categoria IS NULL OR min_unidades_categoria > 0),
  categoria_objetivo        text,                       -- categoría del umbral (y de las líneas afectadas)
  bonificacion              jsonb,                      -- p. ej. {"por_cada":10,"gratis":1}
  equipo_id                 uuid REFERENCES dim_equipos(id),
  drogueria_id              uuid REFERENCES dim_droguerias(id),
  segmento_cliente          segmento_cliente,           -- escalas mejores para VIP / recurrentes
  vigente_desde             date NOT NULL DEFAULT current_date,
  vigente_hasta             date,
  prioridad                 integer NOT NULL DEFAULT 100,
  activo                    boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version               integer NOT NULL DEFAULT 1,
  deleted_at                timestamptz,
  CONSTRAINT ck_regla_categoria CHECK (min_unidades_categoria IS NULL OR categoria_objetivo IS NOT NULL),
  CONSTRAINT ck_regla_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);
CREATE INDEX IF NOT EXISTS idx_reglas_activas ON config_reglas_comerciales (activo, vigente_desde, vigente_hasta);
CREATE INDEX IF NOT EXISTS idx_reglas_updated ON config_reglas_comerciales (updated_at);

CREATE TABLE IF NOT EXISTS config_sistema (
  clave        text PRIMARY KEY,
  valor        jsonb NOT NULL,
  descripcion  text,
  updated_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO config_sistema (clave, valor, descripcion) VALUES
  ('radio_geofence_m',           '100'::jsonb,   'Radio de tolerancia del check-in (metros)'),
  ('dias_sku_hueso',             '60'::jsonb,    'Días sin colocar un SKU para marcarlo como hueso'),
  ('churn_factor',               '1.5'::jsonb,   'Ciclos de frecuencia sin pedido para alertar abandono'),
  ('vip_min_pedidos_6m',         '6'::jsonb,     'Pedidos en 6 meses para segmento VIP'),
  ('vip_min_unidades_6m',        '1000'::jsonb,  'Unidades en 6 meses para segmento VIP'),
  ('recurrente_min_pedidos_6m',  '3'::jsonb,     'Pedidos en 6 meses para segmento recurrente'),
  ('descuento_max_sin_regla',    '0'::jsonb,     'Descuento tolerado cuando ninguna regla aplica'),
  ('bloqueo_segundos',           '120'::jsonb,   'Vigencia del bloqueo de un pedido en edición'),
  ('purga_habilitada',           'false'::jsonb, 'Solo true en entornos de prueba')
ON CONFLICT (clave) DO NOTHING;

-- Secretos internos (hash de la clave de purga). Sin políticas RLS: solo las funciones SECURITY DEFINER lo leen.
CREATE TABLE IF NOT EXISTS secretos_sistema (
  clave text PRIMARY KEY,
  hash  text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 5. HECHOS: PEDIDOS, DETALLES, BLOQUEOS
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_correlativo_pedido START 1001;

CREATE TABLE IF NOT EXISTS fact_pedidos (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- crypto.randomUUID() del dispositivo
  correlativo              text NOT NULL UNIQUE,                         -- PED-1045 / PED-1045-R1 (lo asigna el servidor)
  folio_local              text,                                         -- referencia del dispositivo antes de sincronizar
  parent_pedido_id         uuid REFERENCES fact_pedidos(id),             -- pedido del que se derivó el remanente
  pedido_raiz_id           uuid REFERENCES fact_pedidos(id),
  sufijo_derivado          integer CHECK (sufijo_derivado IS NULL OR sufijo_derivado >= 1),
  cliente_id               uuid NOT NULL REFERENCES dim_clientes(id),
  drogueria_id             uuid NOT NULL REFERENCES dim_droguerias(id),
  vendedor_id              uuid NOT NULL REFERENCES dim_usuarios(id),
  equipo_id                uuid REFERENCES dim_equipos(id),
  transferencista_id       uuid REFERENCES dim_usuarios(id),
  estado                   estado_pedido NOT NULL DEFAULT 'borrador',
  requiere_revision_especial boolean NOT NULL DEFAULT false,
  motivos_revision         jsonb NOT NULL DEFAULT '[]'::jsonb,
  condicion_comercial_id   uuid REFERENCES config_reglas_comerciales(id),
  descuento_pedido_pct     numeric(5,2) CHECK (descuento_pedido_pct IS NULL OR descuento_pedido_pct BETWEEN 0 AND 100),
  observaciones            text,
  numero_factura           text,
  -- Fase posterior (precios): nulos hasta activarse.
  moneda                   char(3),
  total_monetario          numeric(16,4),
  device_id                text,
  creado_en_dispositivo    timestamptz,
  fecha_procesamiento      timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version              integer NOT NULL DEFAULT 1,
  deleted_at               timestamptz,
  CONSTRAINT ck_pedido_no_autoref CHECK (parent_pedido_id IS NULL OR parent_pedido_id <> id),
  CONSTRAINT ck_pedido_derivado CHECK ((parent_pedido_id IS NULL) = (sufijo_derivado IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado_drog ON fact_pedidos (estado, drogueria_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON fact_pedidos (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor ON fact_pedidos (vendedor_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_updated ON fact_pedidos (updated_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_parent ON fact_pedidos (parent_pedido_id) WHERE parent_pedido_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_raiz ON fact_pedidos (pedido_raiz_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_revision ON fact_pedidos (created_at) WHERE estado = 'en_revision';

CREATE TABLE IF NOT EXISTS fact_pedido_detalles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id              uuid NOT NULL REFERENCES fact_pedidos(id) ON DELETE CASCADE,
  linea                  integer NOT NULL DEFAULT 1,
  producto_id            uuid NOT NULL REFERENCES dim_productos(id),
  unidades_solicitadas   integer NOT NULL CHECK (unidades_solicitadas > 0),
  unidades_confirmadas   integer CHECK (unidades_confirmadas IS NULL OR unidades_confirmadas >= 0),
  -- Lo que falta por despachar: base del pedido derivado.
  unidades_pendientes    integer GENERATED ALWAYS AS
                           (GREATEST(unidades_solicitadas - COALESCE(unidades_confirmadas, 0), 0)) STORED,
  motivo_ajuste          motivo_ajuste NOT NULL DEFAULT 'sin_quiebre',
  descuento_pct          numeric(5,2) CHECK (descuento_pct IS NULL OR descuento_pct BETWEEN 0 AND 100),
  notas_linea            text,
  detalle_origen_id      uuid REFERENCES fact_pedido_detalles(id),      -- línea del pedido padre
  remanente_derivado_en  uuid REFERENCES fact_pedidos(id),              -- pedido hijo que recibió el remanente
  -- Fase posterior (precios): nulos hasta activarse.
  precio_unitario        numeric(14,4),
  moneda                 char(3),
  subtotal               numeric(16,4),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version            integer NOT NULL DEFAULT 1,
  deleted_at             timestamptz,
  UNIQUE (pedido_id, producto_id)
);
CREATE INDEX IF NOT EXISTS idx_detalles_pedido ON fact_pedido_detalles (pedido_id);
CREATE INDEX IF NOT EXISTS idx_detalles_producto ON fact_pedido_detalles (producto_id);
CREATE INDEX IF NOT EXISTS idx_detalles_updated ON fact_pedido_detalles (updated_at);
CREATE INDEX IF NOT EXISTS idx_detalles_pendientes ON fact_pedido_detalles (pedido_id)
  WHERE unidades_pendientes > 0 AND remanente_derivado_en IS NULL;

-- Bloqueo optimista con vigencia: evita que dos transferencistas manipulen el mismo pedido.
-- Tabla aparte para que renovar el bloqueo no cambie row_version del pedido.
CREATE TABLE IF NOT EXISTS pedido_bloqueos (
  pedido_id  uuid PRIMARY KEY REFERENCES fact_pedidos(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES dim_usuarios(id) ON DELETE CASCADE,
  tomado_en  timestamptz NOT NULL DEFAULT now(),
  expira_en  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bloqueos_expira ON pedido_bloqueos (expira_en);

-- ------------------------------------------------------------------------------
-- 6. MINI-CRM: VISITAS, PLANTILLAS, NOTIFICACIONES, ALERTAS, AUDITORÍA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_visitas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            uuid NOT NULL REFERENCES dim_clientes(id),
  vendedor_id           uuid NOT NULL REFERENCES dim_usuarios(id),
  checkin_en            timestamptz NOT NULL,
  checkin_ubicacion     geography(Point,4326),
  precision_gps_m       numeric(8,2),
  checkout_en           timestamptz,
  distancia_metros      numeric(10,2),            -- la calcula el servidor (no se confía en el dispositivo)
  radio_tolerancia_m    integer,
  dentro_de_radio       boolean NOT NULL DEFAULT false,
  resultado             resultado_visita,
  pedido_id             uuid REFERENCES fact_pedidos(id),
  notas                 text,
  device_id             text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version           integer NOT NULL DEFAULT 1,
  deleted_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_visitas_vendedor ON crm_visitas (vendedor_id, checkin_en DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_cliente ON crm_visitas (cliente_id, checkin_en DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_ubicacion ON crm_visitas USING gist (checkin_ubicacion);
CREATE INDEX IF NOT EXISTS idx_visitas_updated ON crm_visitas (updated_at);

CREATE TABLE IF NOT EXISTS plantillas_reposicion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id   uuid NOT NULL REFERENCES dim_usuarios(id) ON DELETE CASCADE,
  cliente_id    uuid REFERENCES dim_clientes(id) ON DELETE CASCADE,   -- nula = plantilla general
  drogueria_id  uuid REFERENCES dim_droguerias(id),
  nombre        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version   integer NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_plantillas_vendedor ON plantillas_reposicion (vendedor_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_plantillas_updated ON plantillas_reposicion (updated_at);

CREATE TABLE IF NOT EXISTS plantilla_items (
  plantilla_id uuid NOT NULL REFERENCES plantillas_reposicion(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES dim_productos(id),
  unidades     integer NOT NULL CHECK (unidades > 0),
  PRIMARY KEY (plantilla_id, producto_id)
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES dim_usuarios(id) ON DELETE CASCADE,
  tipo        text NOT NULL,
  titulo      text NOT NULL,
  cuerpo      text,
  pedido_id   uuid REFERENCES fact_pedidos(id) ON DELETE CASCADE,
  leida       boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version integer NOT NULL DEFAULT 1,
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_notif_usuario ON notificaciones (usuario_id, leida, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_updated ON notificaciones (updated_at);

CREATE TABLE IF NOT EXISTS alertas_comerciales (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         tipo_alerta NOT NULL,
  cliente_id   uuid REFERENCES dim_clientes(id) ON DELETE CASCADE,
  producto_id  uuid REFERENCES dim_productos(id) ON DELETE CASCADE,
  equipo_id    uuid REFERENCES dim_equipos(id),
  territorio   text,                                 -- brick para "SKU hueso" por territorio
  severidad    smallint NOT NULL DEFAULT 1 CHECK (severidad BETWEEN 1 AND 3),
  detalle      jsonb NOT NULL DEFAULT '{}'::jsonb,
  generada_en  timestamptz NOT NULL DEFAULT now(),
  resuelta_en  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version  integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alerta_abierta ON alertas_comerciales
  (tipo, COALESCE(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
         COALESCE(producto_id, '00000000-0000-0000-0000-000000000000'::uuid),
         COALESCE(territorio, ''))
  WHERE resuelta_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_alertas_abiertas ON alertas_comerciales (tipo, equipo_id) WHERE resuelta_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_alertas_updated ON alertas_comerciales (updated_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  usuario_id  uuid,
  accion      text NOT NULL,
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_accion ON audit_log (accion, created_at DESC);

-- Triggers de sincronización (updated_at + row_version) en todas las tablas sincronizables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dim_equipos','dim_usuarios','dim_clientes','rel_cliente_vendedor','dim_droguerias',
    'dim_productos','map_producto_drogueria','map_cliente_drogueria','precios_drogueria_producto',
    'config_reglas_comerciales','fact_pedidos','fact_pedido_detalles','crm_visitas','plantillas_reposicion',
    'notificaciones','alertas_comerciales']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_touch BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.touch()', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 7. FUNCIONES DE APOYO PARA SEGURIDAD (RLS)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.rol() RETURNS rol_usuario
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rol FROM dim_usuarios WHERE id = auth.uid() AND activo AND deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION app.es_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT coalesce(app.rol() = 'admin', false) $$;

-- Personal que opera la mesa de transferencias: admin, transferencista y gerente (lectura).
CREATE OR REPLACE FUNCTION app.es_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(app.rol() IN ('admin','transferencista','gerente'), false)
$$;

CREATE OR REPLACE FUNCTION app.es_mesa() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(app.rol() IN ('admin','transferencista'), false)
$$;

-- Regla 5: un vendedor ve el historial de toda farmacia que tiene asignada, sin importar el equipo.
CREATE OR REPLACE FUNCTION app.puede_ver_cliente(p_cliente uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app.es_staff()
      OR EXISTS (SELECT 1 FROM rel_cliente_vendedor r
                 WHERE r.cliente_id = p_cliente AND r.vendedor_id = auth.uid() AND r.activo AND r.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM dim_clientes c WHERE c.id = p_cliente AND c.creado_por = auth.uid())
$$;

CREATE OR REPLACE FUNCTION app.cfg_num(p_clave text, p_defecto numeric) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT (valor #>> '{}')::numeric FROM config_sistema WHERE clave = p_clave), p_defecto)
$$;

-- ------------------------------------------------------------------------------
-- 8. TRIGGERS DE NEGOCIO
-- ------------------------------------------------------------------------------
-- 8.1 Correlativo: PED-1045 para pedidos raíz; PED-1045-R1, -R2... para derivados (regla 2).
--     El servidor es la única fuente de verdad: el folio del dispositivo se guarda en folio_local.
CREATE OR REPLACE FUNCTION app.asignar_correlativo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_raiz uuid; v_corr_raiz text; v_n integer;
BEGIN
  IF NEW.parent_pedido_id IS NULL THEN
    NEW.pedido_raiz_id := NEW.id;
    NEW.sufijo_derivado := NULL;
    NEW.correlativo := 'PED-' || nextval('seq_correlativo_pedido');
  ELSE
    SELECT coalesce(pedido_raiz_id, id) INTO v_raiz FROM fact_pedidos WHERE id = NEW.parent_pedido_id;
    IF v_raiz IS NULL THEN
      RAISE EXCEPTION 'Pedido padre inexistente: %', NEW.parent_pedido_id USING ERRCODE = '23503';
    END IF;
    -- Serializa derivaciones concurrentes de la misma cadena.
    SELECT correlativo INTO v_corr_raiz FROM fact_pedidos WHERE id = v_raiz FOR UPDATE;
    SELECT coalesce(max(sufijo_derivado), 0) + 1 INTO v_n
      FROM fact_pedidos WHERE pedido_raiz_id = v_raiz AND sufijo_derivado IS NOT NULL;
    NEW.pedido_raiz_id := v_raiz;
    NEW.sufijo_derivado := v_n;
    NEW.correlativo := v_corr_raiz || '-R' || v_n;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_correlativo ON fact_pedidos;
CREATE TRIGGER trg_correlativo BEFORE INSERT ON fact_pedidos
  FOR EACH ROW EXECUTE FUNCTION app.asignar_correlativo();

-- 8.2 Máquina de estados del pedido + candados de la regla 4.
CREATE OR REPLACE FUNCTION app.transicion_valida(p_old estado_pedido, p_new estado_pedido) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_old = p_new OR CASE p_old
    WHEN 'borrador'                  THEN p_new IN ('enviado_teletransferencia','en_revision','cancelado')
    WHEN 'enviado_teletransferencia' THEN p_new IN ('en_revision','en_proceso','rechazado','cancelado')
    WHEN 'en_revision'               THEN p_new IN ('enviado_teletransferencia','en_proceso','rechazado','cancelado')
    WHEN 'en_proceso'                THEN p_new IN ('procesado_parcial','procesado_total','rechazado','cancelado')
    WHEN 'procesado_parcial'         THEN p_new IN ('facturado','cancelado')
    WHEN 'procesado_total'           THEN p_new IN ('facturado')
    ELSE false END
$$;

CREATE OR REPLACE FUNCTION app.guardar_transicion_pedido() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_estado estado_validacion_cliente;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  IF NOT app.transicion_valida(OLD.estado, NEW.estado) THEN
    RAISE EXCEPTION 'Transición de pedido no permitida: % -> %', OLD.estado, NEW.estado USING ERRCODE = '22023';
  END IF;
  -- Un prospecto no recibe transferencias definitivas hasta estar validado y homologado con la droguería.
  IF NEW.estado IN ('en_proceso','procesado_parcial','procesado_total','facturado') THEN
    SELECT estado_validacion INTO v_estado FROM dim_clientes WHERE id = NEW.cliente_id;
    IF v_estado IS DISTINCT FROM 'activo' THEN
      RAISE EXCEPTION 'El cliente aún no está validado (RIF/documentación): no puede transferirse' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM map_cliente_drogueria m
                   WHERE m.cliente_id = NEW.cliente_id AND m.drogueria_id = NEW.drogueria_id AND m.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'El cliente no está homologado con la droguería destino' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.estado IN ('en_proceso','procesado_parcial','procesado_total','facturado','rechazado') THEN
    NEW.fecha_procesamiento := coalesce(NEW.fecha_procesamiento, now());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_transicion ON fact_pedidos;
CREATE TRIGGER trg_transicion BEFORE UPDATE OF estado ON fact_pedidos
  FOR EACH ROW EXECUTE FUNCTION app.guardar_transicion_pedido();

-- 8.3 Aviso inmediato al vendedor cuando la droguería despacha solo una parte.
CREATE OR REPLACE FUNCTION app.notificar_parcial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pend integer;
BEGIN
  IF NEW.estado = 'procesado_parcial' AND OLD.estado IS DISTINCT FROM 'procesado_parcial' THEN
    SELECT count(*) INTO v_pend FROM fact_pedido_detalles WHERE pedido_id = NEW.id AND unidades_pendientes > 0;
    INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, pedido_id)
    VALUES (NEW.vendedor_id, 'pedido_parcial',
            'Pedido ' || NEW.correlativo || ' despachado parcialmente',
            v_pend || ' producto(s) quedaron sin stock. Puedes re-rutearlos a otra droguería con un toque.',
            NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notificar_parcial ON fact_pedidos;
CREATE TRIGGER trg_notificar_parcial AFTER UPDATE OF estado ON fact_pedidos
  FOR EACH ROW EXECUTE FUNCTION app.notificar_parcial();

-- 8.4 Geofencing: el servidor calcula la distancia real al punto registrado de la farmacia.
CREATE OR REPLACE FUNCTION app.calcular_geofence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_punto geography;
BEGIN
  SELECT ubicacion INTO v_punto FROM dim_clientes WHERE id = NEW.cliente_id;
  NEW.radio_tolerancia_m := coalesce(NEW.radio_tolerancia_m, app.cfg_num('radio_geofence_m', 100)::integer);
  IF v_punto IS NULL OR NEW.checkin_ubicacion IS NULL THEN
    NEW.distancia_metros := NULL;
    NEW.dentro_de_radio := false;
  ELSE
    NEW.distancia_metros := round(ST_Distance(NEW.checkin_ubicacion, v_punto)::numeric, 2);
    NEW.dentro_de_radio := NEW.distancia_metros <= NEW.radio_tolerancia_m;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_geofence ON crm_visitas;
CREATE TRIGGER trg_geofence BEFORE INSERT OR UPDATE OF checkin_ubicacion, cliente_id, radio_tolerancia_m ON crm_visitas
  FOR EACH ROW EXECUTE FUNCTION app.calcular_geofence();

-- 8.5 Pipeline de prospectos: solo la mesa cambia validación, RIF y segmento (regla 4).
CREATE OR REPLACE FUNCTION app.guardar_cliente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR app.es_mesa() THEN
    -- Activar exige RIF verificado y al menos una homologación con droguería.
    IF TG_OP = 'UPDATE' AND NEW.estado_validacion = 'activo' AND OLD.estado_validacion IS DISTINCT FROM 'activo' THEN
      IF NOT NEW.rif_verificado THEN
        RAISE EXCEPTION 'Verifica el RIF/documentación antes de activar al cliente' USING ERRCODE = 'P0001';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM map_cliente_drogueria WHERE cliente_id = NEW.id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Asigna la homologación con al menos una droguería antes de activar' USING ERRCODE = 'P0001';
      END IF;
      NEW.validado_en := coalesce(NEW.validado_en, now());
      NEW.validado_por := coalesce(NEW.validado_por, auth.uid());
    END IF;
    RETURN NEW;
  END IF;
  -- Vendedor: solo puede crear/editar sus prospectos pendientes, sin tocar campos de control.
  IF TG_OP = 'INSERT' THEN
    NEW.estado_validacion := 'prospecto_pendiente';
    NEW.rif_verificado := false;
    NEW.segmento := 'estandar';
    NEW.origen := 'campo';
    NEW.creado_por := auth.uid();
  ELSE
    NEW.estado_validacion := OLD.estado_validacion;
    NEW.rif_verificado := OLD.rif_verificado;
    NEW.segmento := OLD.segmento;
    NEW.creado_por := OLD.creado_por;
    NEW.codigo_interno := OLD.codigo_interno;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guardar_cliente ON dim_clientes;
CREATE TRIGGER trg_guardar_cliente BEFORE INSERT OR UPDATE ON dim_clientes
  FOR EACH ROW EXECUTE FUNCTION app.guardar_cliente();

-- ------------------------------------------------------------------------------
-- 9. MOTOR DE POLÍTICAS COMERCIALES (validación del servidor; el dispositivo replica la misma lógica)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.regla_aplica(r config_reglas_comerciales, p_pedido uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p fact_pedidos; v_seg segmento_cliente; v_skus integer; v_units integer; v_cat integer;
BEGIN
  IF NOT r.activo OR r.deleted_at IS NOT NULL THEN RETURN false; END IF;
  IF current_date < r.vigente_desde OR (r.vigente_hasta IS NOT NULL AND current_date > r.vigente_hasta) THEN RETURN false; END IF;
  SELECT * INTO v_p FROM fact_pedidos WHERE id = p_pedido;
  IF r.equipo_id IS NOT NULL AND r.equipo_id IS DISTINCT FROM v_p.equipo_id THEN RETURN false; END IF;
  IF r.drogueria_id IS NOT NULL AND r.drogueria_id <> v_p.drogueria_id THEN RETURN false; END IF;
  IF r.segmento_cliente IS NOT NULL THEN
    SELECT segmento INTO v_seg FROM dim_clientes WHERE id = v_p.cliente_id;
    IF v_seg IS DISTINCT FROM r.segmento_cliente THEN RETURN false; END IF;
  END IF;
  SELECT count(*), coalesce(sum(unidades_solicitadas), 0) INTO v_skus, v_units
    FROM fact_pedido_detalles WHERE pedido_id = p_pedido AND deleted_at IS NULL;
  IF r.min_skus_distintos IS NOT NULL AND v_skus < r.min_skus_distintos THEN RETURN false; END IF;
  IF r.min_unidades_totales IS NOT NULL AND v_units < r.min_unidades_totales THEN RETURN false; END IF;
  IF r.min_unidades_categoria IS NOT NULL THEN
    SELECT coalesce(sum(d.unidades_solicitadas), 0) INTO v_cat
      FROM fact_pedido_detalles d JOIN dim_productos pr ON pr.id = d.producto_id
      WHERE d.pedido_id = p_pedido AND d.deleted_at IS NULL AND pr.categoria = r.categoria_objetivo;
    IF v_cat < r.min_unidades_categoria THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $$;

-- Devuelve la lista de violaciones ([] si el pedido cumple las políticas vigentes).
CREATE OR REPLACE FUNCTION app.evaluar_reglas_pedido(p_pedido uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p fact_pedidos; v_base numeric; v_cap numeric; v_viol jsonb := '[]'::jsonb; l record;
BEGIN
  SELECT * INTO v_p FROM fact_pedidos WHERE id = p_pedido;
  v_base := app.cfg_num('descuento_max_sin_regla', 0);

  FOR l IN
    SELECT d.id, d.descuento_pct, pr.categoria, pr.sku
    FROM fact_pedido_detalles d JOIN dim_productos pr ON pr.id = d.producto_id
    WHERE d.pedido_id = p_pedido AND d.deleted_at IS NULL AND coalesce(d.descuento_pct, 0) > 0
  LOOP
    SELECT coalesce(max(cr.descuento_max_pct), v_base) INTO v_cap
      FROM config_reglas_comerciales cr
      WHERE cr.alcance = 'linea'
        AND (cr.categoria_objetivo IS NULL OR cr.categoria_objetivo = l.categoria)
        AND app.regla_aplica(cr, p_pedido);
    IF l.descuento_pct > v_cap THEN
      v_viol := v_viol || jsonb_build_object('tipo','descuento_linea_excedido','detalle_id',l.id,
                                            'sku',l.sku,'descuento',l.descuento_pct,'maximo',v_cap);
    END IF;
  END LOOP;

  IF coalesce(v_p.descuento_pedido_pct, 0) > 0 THEN
    SELECT coalesce(max(cr.descuento_max_pct), v_base) INTO v_cap
      FROM config_reglas_comerciales cr WHERE cr.alcance = 'pedido' AND app.regla_aplica(cr, p_pedido);
    IF v_p.descuento_pedido_pct > v_cap THEN
      v_viol := v_viol || jsonb_build_object('tipo','descuento_pedido_excedido',
                                            'descuento',v_p.descuento_pedido_pct,'maximo',v_cap);
    END IF;
  END IF;
  RETURN v_viol;
END $$;

-- Recalcula estado y banderas de revisión de un pedido tras crearlo o modificarlo.
CREATE OR REPLACE FUNCTION app.clasificar_pedido(p_pedido uuid, p_enviar boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_viol jsonb; v_cli estado_validacion_cliente; v_motivos jsonb; v_estado estado_pedido; v_actual estado_pedido;
BEGIN
  SELECT estado INTO v_actual FROM fact_pedidos WHERE id = p_pedido;
  v_viol := app.evaluar_reglas_pedido(p_pedido);
  v_motivos := v_viol;
  SELECT c.estado_validacion INTO v_cli FROM fact_pedidos p JOIN dim_clientes c ON c.id = p.cliente_id WHERE p.id = p_pedido;
  IF v_cli IS DISTINCT FROM 'activo' THEN
    v_motivos := v_motivos || jsonb_build_object('tipo','cliente_no_validado');
  END IF;

  IF NOT p_enviar THEN
    v_estado := v_actual;                                   -- sigue como borrador
  ELSIF jsonb_array_length(v_motivos) > 0 THEN
    v_estado := 'en_revision';
  ELSE
    v_estado := 'enviado_teletransferencia';
  END IF;

  UPDATE fact_pedidos
     SET requiere_revision_especial = (jsonb_array_length(v_viol) > 0),
         motivos_revision = v_motivos,
         estado = v_estado
   WHERE id = p_pedido;
END $$;

-- ------------------------------------------------------------------------------
-- 10. RPC DE SINCRONIZACIÓN (idempotentes; los invoca la cola Outbox del dispositivo)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_crear_prospecto(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid := (p->>'id')::uuid; v_row dim_clientes;
BEGIN
  INSERT INTO dim_clientes (id, razon_social, nombre_comercial, rif, brick, municipio, estado_geografico, direccion,
                            telefono, bandera, frecuencia_dias, ubicacion, documentos)
  VALUES (v_id, p->>'razon_social', coalesce(p->>'nombre_comercial', p->>'razon_social'), p->>'rif', p->>'brick',
          p->>'municipio', p->>'estado_geografico', p->>'direccion', p->>'telefono', p->>'bandera',
          nullif(p->>'frecuencia_dias','')::smallint,
          CASE WHEN p ? 'lon' AND p ? 'lat'
               THEN ST_SetSRID(ST_MakePoint((p->>'lon')::float8, (p->>'lat')::float8), 4326)::geography END,
          coalesce(p->'documentos', '[]'::jsonb))
  ON CONFLICT (id) DO UPDATE
    SET razon_social = excluded.razon_social, nombre_comercial = excluded.nombre_comercial, rif = excluded.rif,
        brick = excluded.brick, municipio = excluded.municipio, direccion = excluded.direccion,
        telefono = excluded.telefono, ubicacion = coalesce(excluded.ubicacion, dim_clientes.ubicacion),
        documentos = excluded.documentos
    WHERE dim_clientes.creado_por = auth.uid() AND dim_clientes.estado_validacion = 'prospecto_pendiente';

  INSERT INTO rel_cliente_vendedor (cliente_id, vendedor_id, equipo_id)
  SELECT v_id, u.id, u.equipo_id FROM dim_usuarios u WHERE u.id = auth.uid()
  ON CONFLICT DO NOTHING;

  SELECT * INTO v_row FROM dim_clientes WHERE id = v_id;
  RETURN jsonb_build_object('id', v_row.id, 'estado_validacion', v_row.estado_validacion, 'row_version', v_row.row_version);
END $$;

-- Crea un pedido completo (cabecera + líneas) en una sola transacción. Reintentar con el mismo id no duplica.
CREATE OR REPLACE FUNCTION sync_crear_pedido(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid := (p->>'id')::uuid; v_row fact_pedidos; d jsonb; v_n integer := 0;
BEGIN
  SELECT * INTO v_row FROM fact_pedidos WHERE id = v_id;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_row.id, 'correlativo', v_row.correlativo, 'estado', v_row.estado,
                              'row_version', v_row.row_version, 'ya_existia', true);
  END IF;

  INSERT INTO fact_pedidos (id, correlativo, folio_local, cliente_id, drogueria_id, vendedor_id, equipo_id, estado,
                            condicion_comercial_id, descuento_pedido_pct, observaciones, device_id, creado_en_dispositivo)
  VALUES (v_id, 'pendiente', p->>'folio_local', (p->>'cliente_id')::uuid, (p->>'drogueria_id')::uuid, auth.uid(),
          (SELECT equipo_id FROM dim_usuarios WHERE id = auth.uid()), 'borrador',
          nullif(p->>'condicion_comercial_id','')::uuid, nullif(p->>'descuento_pedido_pct','')::numeric,
          p->>'observaciones', p->>'device_id', nullif(p->>'creado_en_dispositivo','')::timestamptz);

  FOR d IN SELECT * FROM jsonb_array_elements(coalesce(p->'detalles', '[]'::jsonb)) LOOP
    v_n := v_n + 1;
    INSERT INTO fact_pedido_detalles (id, pedido_id, linea, producto_id, unidades_solicitadas, descuento_pct, notas_linea)
    VALUES (coalesce(nullif(d->>'id','')::uuid, gen_random_uuid()), v_id, v_n, (d->>'producto_id')::uuid,
            (d->>'unidades_solicitadas')::integer, nullif(d->>'descuento_pct','')::numeric, d->>'notas_linea');
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'El pedido no tiene líneas' USING ERRCODE = '22023'; END IF;

  PERFORM app.clasificar_pedido(v_id, coalesce(p->>'estado', 'enviado_teletransferencia') <> 'borrador');

  SELECT * INTO v_row FROM fact_pedidos WHERE id = v_id;
  RETURN jsonb_build_object('id', v_row.id, 'correlativo', v_row.correlativo, 'estado', v_row.estado,
                            'requiere_revision_especial', v_row.requiere_revision_especial,
                            'motivos_revision', v_row.motivos_revision, 'row_version', v_row.row_version,
                            'ya_existia', false);
END $$;

-- Modifica un pedido aún editable. base_version detecta que otro usuario lo cambió mientras estabas offline.
CREATE OR REPLACE FUNCTION sync_modificar_pedido(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid := (p->>'id')::uuid; v_row fact_pedidos; d jsonb; v_n integer := 0; v_ids uuid[] := '{}'; v_did uuid;
BEGIN
  SELECT * INTO v_row FROM fact_pedidos WHERE id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente' USING ERRCODE = 'P0002'; END IF;
  IF v_row.estado IN ('borrador','enviado_teletransferencia','en_revision') THEN
    PERFORM 1 FROM fact_pedidos WHERE id = v_id FOR UPDATE;     -- serializa ediciones concurrentes
    SELECT * INTO v_row FROM fact_pedidos WHERE id = v_id;
  END IF;
  IF v_row.row_version <> (p->>'base_version')::integer THEN
    RETURN jsonb_build_object('conflicto', true, 'row_version', v_row.row_version, 'estado', v_row.estado);
  END IF;
  IF v_row.estado NOT IN ('borrador','enviado_teletransferencia','en_revision') THEN
    RETURN jsonb_build_object('conflicto', true, 'row_version', v_row.row_version, 'estado', v_row.estado,
                              'motivo', 'pedido_ya_en_proceso');
  END IF;
  IF EXISTS (SELECT 1 FROM pedido_bloqueos b WHERE b.pedido_id = v_id AND b.usuario_id <> auth.uid() AND b.expira_en > now()) THEN
    RETURN jsonb_build_object('conflicto', true, 'row_version', v_row.row_version, 'motivo', 'pedido_bloqueado');
  END IF;

  UPDATE fact_pedidos
     SET observaciones = coalesce(p->>'observaciones', observaciones),
         condicion_comercial_id = nullif(p->>'condicion_comercial_id','')::uuid,
         descuento_pedido_pct = nullif(p->>'descuento_pedido_pct','')::numeric
   WHERE id = v_id;

  IF p ? 'detalles' THEN
    FOR d IN SELECT * FROM jsonb_array_elements(p->'detalles') LOOP
      v_n := v_n + 1;
      v_did := coalesce(nullif(d->>'id','')::uuid, gen_random_uuid());
      v_ids := v_ids || v_did;
      INSERT INTO fact_pedido_detalles (id, pedido_id, linea, producto_id, unidades_solicitadas, descuento_pct, notas_linea)
      VALUES (v_did, v_id, v_n, (d->>'producto_id')::uuid, (d->>'unidades_solicitadas')::integer,
              nullif(d->>'descuento_pct','')::numeric, d->>'notas_linea')
      ON CONFLICT (id) DO UPDATE
        SET unidades_solicitadas = excluded.unidades_solicitadas, descuento_pct = excluded.descuento_pct,
            notas_linea = excluded.notas_linea, linea = excluded.linea;
    END LOOP;
    DELETE FROM fact_pedido_detalles WHERE pedido_id = v_id AND NOT (id = ANY (v_ids));
  END IF;

  PERFORM app.clasificar_pedido(v_id, v_row.estado <> 'borrador' OR coalesce(p->>'estado','borrador') <> 'borrador');
  SELECT * INTO v_row FROM fact_pedidos WHERE id = v_id;
  RETURN jsonb_build_object('id', v_row.id, 'correlativo', v_row.correlativo, 'estado', v_row.estado,
                            'requiere_revision_especial', v_row.requiere_revision_especial,
                            'motivos_revision', v_row.motivos_revision, 'row_version', v_row.row_version,
                            'conflicto', false);
END $$;

CREATE OR REPLACE FUNCTION sync_registrar_visita(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid := (p->>'id')::uuid; v_row crm_visitas;
BEGIN
  INSERT INTO crm_visitas (id, cliente_id, vendedor_id, checkin_en, checkin_ubicacion, precision_gps_m, checkout_en,
                           resultado, pedido_id, notas, device_id)
  VALUES (v_id, (p->>'cliente_id')::uuid, auth.uid(), (p->>'checkin_en')::timestamptz,
          CASE WHEN p ? 'lon' AND p ? 'lat'
               THEN ST_SetSRID(ST_MakePoint((p->>'lon')::float8, (p->>'lat')::float8), 4326)::geography END,
          nullif(p->>'precision_gps_m','')::numeric, nullif(p->>'checkout_en','')::timestamptz,
          nullif(p->>'resultado','')::resultado_visita, nullif(p->>'pedido_id','')::uuid, p->>'notas', p->>'device_id')
  ON CONFLICT (id) DO UPDATE
    SET checkout_en = excluded.checkout_en, resultado = excluded.resultado, pedido_id = excluded.pedido_id,
        notas = excluded.notas
    WHERE crm_visitas.vendedor_id = auth.uid();
  SELECT * INTO v_row FROM crm_visitas WHERE id = v_id;
  RETURN jsonb_build_object('id', v_row.id, 'distancia_metros', v_row.distancia_metros,
                            'dentro_de_radio', v_row.dentro_de_radio, 'row_version', v_row.row_version);
END $$;

CREATE OR REPLACE FUNCTION sync_guardar_plantilla(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid := (p->>'id')::uuid; i jsonb;
BEGIN
  INSERT INTO plantillas_reposicion (id, vendedor_id, cliente_id, drogueria_id, nombre)
  VALUES (v_id, auth.uid(), nullif(p->>'cliente_id','')::uuid, nullif(p->>'drogueria_id','')::uuid, p->>'nombre')
  ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, drogueria_id = excluded.drogueria_id
    WHERE plantillas_reposicion.vendedor_id = auth.uid();
  DELETE FROM plantilla_items WHERE plantilla_id = v_id;
  FOR i IN SELECT * FROM jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) LOOP
    INSERT INTO plantilla_items (plantilla_id, producto_id, unidades)
    VALUES (v_id, (i->>'producto_id')::uuid, (i->>'unidades')::integer);
  END LOOP;
  RETURN jsonb_build_object('id', v_id);
END $$;

-- ------------------------------------------------------------------------------
-- 11. MESA DE TRANSFERENCIAS: BLOQUEO, CONFIRMACIÓN Y SPLIT ORDERS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tomar_pedido(p_pedido uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b pedido_bloqueos; v_nombre text;
BEGIN
  IF NOT app.es_mesa() THEN RAISE EXCEPTION 'Solo la mesa de transferencias puede tomar pedidos' USING ERRCODE = '42501'; END IF;
  INSERT INTO pedido_bloqueos AS b (pedido_id, usuario_id, expira_en)
  VALUES (p_pedido, auth.uid(), now() + make_interval(secs => app.cfg_num('bloqueo_segundos', 120)))
  ON CONFLICT (pedido_id) DO UPDATE
    SET usuario_id = excluded.usuario_id,
        expira_en = excluded.expira_en,
        tomado_en = CASE WHEN b.usuario_id = excluded.usuario_id THEN b.tomado_en ELSE now() END
    WHERE b.usuario_id = auth.uid() OR b.expira_en < now()
  RETURNING * INTO v_b;
  IF v_b.pedido_id IS NULL THEN
    SELECT b2.* INTO v_b FROM pedido_bloqueos b2 WHERE b2.pedido_id = p_pedido;
    SELECT nombre_completo INTO v_nombre FROM dim_usuarios WHERE id = v_b.usuario_id;
    RETURN jsonb_build_object('ok', false, 'bloqueado_por', v_b.usuario_id, 'nombre', v_nombre, 'expira_en', v_b.expira_en);
  END IF;
  RETURN jsonb_build_object('ok', true, 'expira_en', v_b.expira_en);
END $$;

CREATE OR REPLACE FUNCTION liberar_pedido(p_pedido uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM pedido_bloqueos WHERE pedido_id = p_pedido AND (usuario_id = auth.uid() OR app.es_admin())
$$;

-- El transferencista marca las unidades confirmadas por ítem. Estado resultante:
--   todo confirmado -> procesado_total | algo confirmado -> procesado_parcial | nada -> rechazado.
-- p_confirmaciones: [{"detalle_id": "...", "unidades_confirmadas": 8, "motivo": "quiebre_stock_drogueria"}]
CREATE OR REPLACE FUNCTION confirmar_pedido(p_pedido uuid, p_confirmaciones jsonb, p_numero_factura text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p fact_pedidos; c jsonb; v_pend integer; v_conf integer; v_nuevo estado_pedido;
BEGIN
  IF NOT app.es_mesa() THEN RAISE EXCEPTION 'Solo la mesa de transferencias puede confirmar' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_p FROM fact_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pedido_bloqueos WHERE pedido_id = p_pedido AND usuario_id = auth.uid() AND expira_en > now()) THEN
    RAISE EXCEPTION 'Toma el pedido (bloqueo) antes de confirmarlo' USING ERRCODE = 'P0001';
  END IF;
  IF v_p.estado NOT IN ('enviado_teletransferencia','en_revision','en_proceso') THEN
    RAISE EXCEPTION 'El pedido ya fue procesado (estado %)', v_p.estado USING ERRCODE = '22023';
  END IF;
  IF v_p.estado <> 'en_proceso' THEN
    UPDATE fact_pedidos SET estado = 'en_proceso', transferencista_id = auth.uid() WHERE id = p_pedido;
  END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(p_confirmaciones) LOOP
    UPDATE fact_pedido_detalles
       SET unidades_confirmadas = (c->>'unidades_confirmadas')::integer,
           motivo_ajuste = CASE WHEN (c->>'unidades_confirmadas')::integer >= unidades_solicitadas THEN 'sin_quiebre'
                                ELSE coalesce(nullif(c->>'motivo','')::motivo_ajuste, 'quiebre_stock_drogueria') END
     WHERE id = (c->>'detalle_id')::uuid AND pedido_id = p_pedido;
  END LOOP;

  SELECT count(*) FILTER (WHERE unidades_pendientes > 0), coalesce(sum(unidades_confirmadas), 0)
    INTO v_pend, v_conf FROM fact_pedido_detalles WHERE pedido_id = p_pedido AND deleted_at IS NULL;
  v_nuevo := CASE WHEN v_pend = 0 THEN 'procesado_total'
                  WHEN v_conf = 0 THEN 'rechazado'
                  ELSE 'procesado_parcial' END;
  UPDATE fact_pedidos SET estado = v_nuevo, numero_factura = coalesce(p_numero_factura, numero_factura) WHERE id = p_pedido;
  RETURN jsonb_build_object('estado', v_nuevo, 'lineas_pendientes', v_pend, 'unidades_confirmadas', v_conf);
END $$;

-- Un toque del vendedor: el remanente (líneas con unidades_pendientes) se envía a otra droguería.
-- Genera el pedido derivado PED-XXXX-R1 en estado en_revision, con parent_pedido_id y solo lo pendiente.
-- Idempotente por p_nuevo_id: el dispositivo lo genera y puede reintentar sin duplicar.
CREATE OR REPLACE FUNCTION rerutear_remanente(p_pedido uuid, p_drogueria_destino uuid,
                                              p_nuevo_id uuid DEFAULT gen_random_uuid())
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p fact_pedidos; v_hijo fact_pedidos; v_lineas integer; v_unidades integer;
BEGIN
  SELECT * INTO v_hijo FROM fact_pedidos WHERE id = p_nuevo_id;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_hijo.id, 'correlativo', v_hijo.correlativo, 'estado', v_hijo.estado,
                              'parent_pedido_id', v_hijo.parent_pedido_id, 'row_version', v_hijo.row_version,
                              'ya_existia', true,
                              'detalles', (SELECT jsonb_agg(jsonb_build_object('id', d.id, 'linea', d.linea,
                                            'producto_id', d.producto_id, 'unidades_solicitadas', d.unidades_solicitadas,
                                            'descuento_pct', d.descuento_pct, 'detalle_origen_id', d.detalle_origen_id)
                                            ORDER BY d.linea)
                                           FROM fact_pedido_detalles d WHERE d.pedido_id = v_hijo.id));
  END IF;

  SELECT * INTO v_p FROM fact_pedidos WHERE id = p_pedido FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido inexistente' USING ERRCODE = 'P0002'; END IF;
  IF NOT (v_p.vendedor_id = auth.uid() OR app.es_mesa()) THEN
    RAISE EXCEPTION 'No puedes re-rutear este pedido' USING ERRCODE = '42501';
  END IF;
  IF v_p.estado <> 'procesado_parcial' THEN
    RAISE EXCEPTION 'Solo un pedido procesado parcialmente puede re-rutearse (estado %)', v_p.estado USING ERRCODE = '22023';
  END IF;
  IF p_drogueria_destino = v_p.drogueria_id THEN
    RAISE EXCEPTION 'Elige una droguería distinta a la del pedido original' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), coalesce(sum(unidades_pendientes), 0) INTO v_lineas, v_unidades
    FROM fact_pedido_detalles
   WHERE pedido_id = p_pedido AND unidades_pendientes > 0 AND remanente_derivado_en IS NULL AND deleted_at IS NULL;
  IF v_lineas = 0 THEN RAISE EXCEPTION 'No hay remanente por re-rutear' USING ERRCODE = '22023'; END IF;

  INSERT INTO fact_pedidos (id, correlativo, parent_pedido_id, sufijo_derivado, cliente_id, drogueria_id, vendedor_id,
                            equipo_id, estado, observaciones, condicion_comercial_id, descuento_pedido_pct)
  VALUES (p_nuevo_id, 'pendiente', p_pedido, 1, v_p.cliente_id, p_drogueria_destino, v_p.vendedor_id, v_p.equipo_id,
          'en_revision', 'Remanente de ' || v_p.correlativo, v_p.condicion_comercial_id, v_p.descuento_pedido_pct)
  RETURNING * INTO v_hijo;

  INSERT INTO fact_pedido_detalles (pedido_id, linea, producto_id, unidades_solicitadas, descuento_pct,
                                    notas_linea, detalle_origen_id)
  SELECT p_nuevo_id, row_number() OVER (ORDER BY d.linea), d.producto_id, d.unidades_pendientes, d.descuento_pct,
         d.notas_linea, d.id
    FROM fact_pedido_detalles d
   WHERE d.pedido_id = p_pedido AND d.unidades_pendientes > 0 AND d.remanente_derivado_en IS NULL AND d.deleted_at IS NULL;

  UPDATE fact_pedido_detalles SET remanente_derivado_en = p_nuevo_id
   WHERE pedido_id = p_pedido AND unidades_pendientes > 0 AND remanente_derivado_en IS NULL AND deleted_at IS NULL;

  RETURN jsonb_build_object('id', v_hijo.id, 'correlativo', v_hijo.correlativo, 'estado', v_hijo.estado,
                            'parent_pedido_id', p_pedido, 'lineas', v_lineas, 'unidades', v_unidades,
                            'row_version', v_hijo.row_version, 'ya_existia', false,
                            -- ids de las líneas creadas: el dispositivo reemplaza sus líneas provisionales.
                            'detalles', (SELECT jsonb_agg(jsonb_build_object('id', d.id, 'linea', d.linea,
                                          'producto_id', d.producto_id, 'unidades_solicitadas', d.unidades_solicitadas,
                                          'descuento_pct', d.descuento_pct, 'detalle_origen_id', d.detalle_origen_id)
                                          ORDER BY d.linea)
                                         FROM fact_pedido_detalles d WHERE d.pedido_id = p_nuevo_id));
END $$;

-- Bandeja de aprobación de prospectos (Administrador y Transferencista).
CREATE OR REPLACE FUNCTION aprobar_prospecto(p_cliente uuid, p_rif_verificado boolean,
                                             p_drogueria uuid, p_codigo_cuenta text,
                                             p_codigo_interno text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app.es_mesa() THEN RAISE EXCEPTION 'Solo administrador o transferencista' USING ERRCODE = '42501'; END IF;
  INSERT INTO map_cliente_drogueria (drogueria_id, cliente_id, codigo_cuenta)
  VALUES (p_drogueria, p_cliente, p_codigo_cuenta)
  ON CONFLICT (drogueria_id, cliente_id) DO UPDATE SET codigo_cuenta = excluded.codigo_cuenta, deleted_at = NULL;
  UPDATE dim_clientes
     SET rif_verificado = p_rif_verificado, rif_verificado_por = auth.uid(), rif_verificado_en = now(),
         codigo_interno = coalesce(p_codigo_interno, codigo_interno),
         estado_validacion = 'activo'
   WHERE id = p_cliente AND estado_validacion = 'prospecto_pendiente';
  IF NOT FOUND THEN RAISE EXCEPTION 'El prospecto no existe o ya fue procesado' USING ERRCODE = 'P0002'; END IF;
  -- Libera los pedidos retenidos únicamente por cliente sin validar.
  UPDATE fact_pedidos SET estado = 'enviado_teletransferencia', motivos_revision = '[]'::jsonb
   WHERE cliente_id = p_cliente AND estado = 'en_revision' AND NOT requiere_revision_especial AND parent_pedido_id IS NULL;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION rechazar_prospecto(p_cliente uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app.es_mesa() THEN RAISE EXCEPTION 'Solo administrador o transferencista' USING ERRCODE = '42501'; END IF;
  UPDATE dim_clientes SET estado_validacion = 'inactivo', motivo_rechazo = p_motivo,
         validado_por = auth.uid(), validado_en = now()
   WHERE id = p_cliente AND estado_validacion = 'prospecto_pendiente';
END $$;

-- Regla 5: historial de pedidos transferidos de una farmacia, visible para todo vendedor asignado.
CREATE OR REPLACE FUNCTION historial_cliente_cruzado(p_cliente uuid, p_dias integer DEFAULT 90)
RETURNS TABLE (pedido_id uuid, correlativo text, fecha timestamptz, estado estado_pedido, drogueria text,
               vendedor text, equipo text, sku text, producto text, unidades_solicitadas integer,
               unidades_confirmadas integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app.puede_ver_cliente(p_cliente) THEN RAISE EXCEPTION 'Sin acceso a este cliente' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT p.id, p.correlativo, p.created_at, p.estado, dr.nombre, u.nombre_completo, e.nombre,
         pr.sku, pr.nombre_comercial, d.unidades_solicitadas, d.unidades_confirmadas
    FROM fact_pedidos p
    JOIN fact_pedido_detalles d ON d.pedido_id = p.id
    JOIN dim_productos pr ON pr.id = d.producto_id
    JOIN dim_droguerias dr ON dr.id = p.drogueria_id
    JOIN dim_usuarios u ON u.id = p.vendedor_id
    LEFT JOIN dim_equipos e ON e.id = p.equipo_id
   WHERE p.cliente_id = p_cliente
     AND p.created_at >= now() - make_interval(days => p_dias)
     AND p.estado NOT IN ('borrador','cancelado')
   ORDER BY p.created_at DESC, d.linea;
END $$;

-- ------------------------------------------------------------------------------
-- 12. ANALÍTICA COMERCIAL: SEGMENTOS Y ALERTAS (regla 6). Ejecutar a diario (pg_cron / Edge Function).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalcular_segmentos_clientes() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  WITH act AS (
    SELECT p.cliente_id, count(DISTINCT p.id) AS pedidos, coalesce(sum(d.unidades_confirmadas), 0) AS unidades
      FROM fact_pedidos p LEFT JOIN fact_pedido_detalles d ON d.pedido_id = p.id
     WHERE p.created_at >= now() - interval '6 months' AND p.estado IN ('procesado_parcial','procesado_total','facturado')
     GROUP BY p.cliente_id
  ), nuevo AS (
    SELECT c.id,
           CASE WHEN a.pedidos >= app.cfg_num('vip_min_pedidos_6m', 6) AND a.unidades >= app.cfg_num('vip_min_unidades_6m', 1000) THEN 'vip'
                WHEN a.pedidos >= app.cfg_num('recurrente_min_pedidos_6m', 3) THEN 'recurrente'
                ELSE 'estandar' END::segmento_cliente AS seg
      FROM dim_clientes c LEFT JOIN act a ON a.cliente_id = c.id
     WHERE c.estado_validacion = 'activo' AND c.deleted_at IS NULL
  )
  UPDATE dim_clientes c SET segmento = n.seg FROM nuevo n WHERE c.id = n.id AND c.segmento IS DISTINCT FROM n.seg;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION generar_alertas_comerciales() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dias integer := app.cfg_num('dias_sku_hueso', 60)::integer;
        v_factor numeric := app.cfg_num('churn_factor', 1.5);
        v_hueso integer; v_terr integer; v_churn integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;

  -- Se cierran las alertas abiertas; las que sigan vigentes se reabren en el upsert de abajo.
  UPDATE alertas_comerciales SET resuelta_en = now() WHERE resuelta_en IS NULL;

  -- SKU hueso global: producto activo sin colocarse en ningún cliente en X días.
  WITH ultima AS (
    SELECT d.producto_id, max(p.created_at) AS ultima
      FROM fact_pedido_detalles d JOIN fact_pedidos p ON p.id = d.pedido_id
     WHERE p.estado NOT IN ('borrador','rechazado','cancelado') GROUP BY d.producto_id
  ), ins AS (
    INSERT INTO alertas_comerciales (tipo, producto_id, equipo_id, severidad, detalle)
    SELECT 'sku_hueso', pr.id, pr.equipo_id, 2,
           jsonb_build_object('dias_sin_colocar', coalesce(extract(day FROM now() - u.ultima)::int, NULL), 'umbral_dias', v_dias)
      FROM dim_productos pr LEFT JOIN ultima u ON u.producto_id = pr.id
     WHERE pr.activo AND pr.deleted_at IS NULL AND (u.ultima IS NULL OR u.ultima < now() - make_interval(days => v_dias))
    ON CONFLICT (tipo, COALESCE(cliente_id,'00000000-0000-0000-0000-000000000000'::uuid),
                       COALESCE(producto_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(territorio,''))
      WHERE resuelta_en IS NULL DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_hueso FROM ins;

  -- SKU hueso por territorio (brick): productos que se colocan en otros bricks pero no en este.
  WITH bricks AS (SELECT DISTINCT brick FROM dim_clientes WHERE brick IS NOT NULL AND estado_validacion = 'activo'),
  activos AS (
    SELECT DISTINCT d.producto_id FROM fact_pedido_detalles d JOIN fact_pedidos p ON p.id = d.pedido_id
     WHERE p.created_at >= now() - make_interval(days => v_dias) AND p.estado NOT IN ('borrador','rechazado','cancelado')
  ), ventas AS (
    SELECT DISTINCT c.brick, d.producto_id
      FROM fact_pedido_detalles d JOIN fact_pedidos p ON p.id = d.pedido_id JOIN dim_clientes c ON c.id = p.cliente_id
     WHERE p.created_at >= now() - make_interval(days => v_dias) AND p.estado NOT IN ('borrador','rechazado','cancelado')
  ), ins AS (
    INSERT INTO alertas_comerciales (tipo, producto_id, equipo_id, territorio, severidad, detalle)
    SELECT 'sku_hueso', a.producto_id, pr.equipo_id, b.brick, 1,
           jsonb_build_object('umbral_dias', v_dias, 'ambito', 'territorio')
      FROM bricks b CROSS JOIN activos a JOIN dim_productos pr ON pr.id = a.producto_id
     WHERE NOT EXISTS (SELECT 1 FROM ventas v WHERE v.brick = b.brick AND v.producto_id = a.producto_id)
    ON CONFLICT (tipo, COALESCE(cliente_id,'00000000-0000-0000-0000-000000000000'::uuid),
                       COALESCE(producto_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(territorio,''))
      WHERE resuelta_en IS NULL DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_terr FROM ins;

  -- Abandono de cliente: superó su ciclo habitual (frecuencia_dias x factor) sin emitir pedidos.
  WITH ult AS (
    SELECT cliente_id, max(created_at) AS ultimo FROM fact_pedidos
     WHERE estado NOT IN ('borrador','cancelado') GROUP BY cliente_id
  ), ins AS (
    INSERT INTO alertas_comerciales (tipo, cliente_id, severidad, detalle)
    SELECT 'churn_riesgo', c.id,
           CASE WHEN coalesce(u.ultimo, c.created_at) < now() - make_interval(days => (c.frecuencia_dias * v_factor * 2)::int) THEN 3 ELSE 2 END,
           jsonb_build_object('dias_sin_pedido', extract(day FROM now() - coalesce(u.ultimo, c.created_at))::int,
                              'frecuencia_dias', c.frecuencia_dias)
      FROM dim_clientes c LEFT JOIN ult u ON u.cliente_id = c.id
     WHERE c.estado_validacion = 'activo' AND c.deleted_at IS NULL AND c.frecuencia_dias IS NOT NULL
       AND coalesce(u.ultimo, c.created_at) < now() - make_interval(days => (c.frecuencia_dias * v_factor)::int)
    ON CONFLICT (tipo, COALESCE(cliente_id,'00000000-0000-0000-0000-000000000000'::uuid),
                       COALESCE(producto_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(territorio,''))
      WHERE resuelta_en IS NULL DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_churn FROM ins;

  RETURN jsonb_build_object('sku_hueso', v_hueso, 'sku_hueso_territorio', v_terr, 'churn_riesgo', v_churn);
END $$;

-- ------------------------------------------------------------------------------
-- 13. SEGURIDAD A NIVEL DE FILA (RLS)
-- ------------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dim_equipos','dim_usuarios','dim_clientes','rel_cliente_vendedor','dim_droguerias',
    'dim_productos','map_producto_drogueria','map_cliente_drogueria','precios_drogueria_producto',
    'config_reglas_comerciales','config_sistema','secretos_sistema','fact_pedidos','fact_pedido_detalles',
    'pedido_bloqueos','crm_visitas','plantillas_reposicion','plantilla_items','notificaciones',
    'alertas_comerciales','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Catálogos de solo lectura para cualquier usuario autenticado; escritura solo del administrador.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dim_equipos','dim_droguerias','dim_productos','config_reglas_comerciales',
                           'precios_drogueria_producto','config_sistema']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_lectura', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || '_lectura', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_admin', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (app.es_admin()) WITH CHECK (app.es_admin())',
                   t || '_admin', t);
  END LOOP;
END $$;

-- Homologaciones: las lee todo el que opera; las escribe la mesa.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['map_producto_drogueria','map_cliente_drogueria']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_lectura', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || '_lectura', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_mesa', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (app.es_mesa()) WITH CHECK (app.es_mesa())',
                   t || '_mesa', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS usuarios_lectura ON dim_usuarios;
CREATE POLICY usuarios_lectura ON dim_usuarios FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR app.es_staff());
DROP POLICY IF EXISTS usuarios_admin ON dim_usuarios;
CREATE POLICY usuarios_admin ON dim_usuarios FOR ALL TO authenticated
  USING (app.es_admin()) WITH CHECK (app.es_admin());

DROP POLICY IF EXISTS clientes_lectura ON dim_clientes;
-- creado_por se evalúa sobre la propia fila: INSERT ... ON CONFLICT exige poder "leer" la fila nueva.
CREATE POLICY clientes_lectura ON dim_clientes FOR SELECT TO authenticated
  USING (creado_por = (SELECT auth.uid()) OR app.puede_ver_cliente(id));
DROP POLICY IF EXISTS clientes_alta_campo ON dim_clientes;
CREATE POLICY clientes_alta_campo ON dim_clientes FOR INSERT TO authenticated
  WITH CHECK (app.rol() = 'vendedor' OR app.es_mesa());
DROP POLICY IF EXISTS clientes_edicion ON dim_clientes;
CREATE POLICY clientes_edicion ON dim_clientes FOR UPDATE TO authenticated
  USING (app.es_mesa() OR (creado_por = (SELECT auth.uid()) AND estado_validacion = 'prospecto_pendiente'))
  WITH CHECK (app.es_mesa() OR creado_por = (SELECT auth.uid()));
DROP POLICY IF EXISTS clientes_baja ON dim_clientes;
CREATE POLICY clientes_baja ON dim_clientes FOR DELETE TO authenticated USING (app.es_admin());

DROP POLICY IF EXISTS relcv_lectura ON rel_cliente_vendedor;
CREATE POLICY relcv_lectura ON rel_cliente_vendedor FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()) OR app.es_staff());
DROP POLICY IF EXISTS relcv_admin ON rel_cliente_vendedor;
CREATE POLICY relcv_admin ON rel_cliente_vendedor FOR ALL TO authenticated
  USING (app.es_mesa()) WITH CHECK (app.es_mesa());
DROP POLICY IF EXISTS relcv_propio ON rel_cliente_vendedor;
CREATE POLICY relcv_propio ON rel_cliente_vendedor FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = (SELECT auth.uid())
              AND EXISTS (SELECT 1 FROM dim_clientes c WHERE c.id = cliente_id AND c.creado_por = (SELECT auth.uid())));

-- Pedidos: lectura cruzada entre equipos por farmacia asignada (regla 5); edición del vendedor solo mientras es editable.
DROP POLICY IF EXISTS pedidos_lectura ON fact_pedidos;
CREATE POLICY pedidos_lectura ON fact_pedidos FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()) OR app.puede_ver_cliente(cliente_id));
DROP POLICY IF EXISTS pedidos_alta ON fact_pedidos;
CREATE POLICY pedidos_alta ON fact_pedidos FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = (SELECT auth.uid()) OR app.es_admin());
DROP POLICY IF EXISTS pedidos_edicion_vendedor ON fact_pedidos;
CREATE POLICY pedidos_edicion_vendedor ON fact_pedidos FOR UPDATE TO authenticated
  USING (vendedor_id = (SELECT auth.uid()) AND estado IN ('borrador','enviado_teletransferencia','en_revision'))
  WITH CHECK (vendedor_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS pedidos_edicion_mesa ON fact_pedidos;
CREATE POLICY pedidos_edicion_mesa ON fact_pedidos FOR UPDATE TO authenticated
  USING (app.es_mesa()) WITH CHECK (app.es_mesa());

DROP POLICY IF EXISTS detalles_lectura ON fact_pedido_detalles;
CREATE POLICY detalles_lectura ON fact_pedido_detalles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM fact_pedidos p WHERE p.id = pedido_id));   -- hereda la RLS del pedido
DROP POLICY IF EXISTS detalles_vendedor ON fact_pedido_detalles;
CREATE POLICY detalles_vendedor ON fact_pedido_detalles FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM fact_pedidos p WHERE p.id = pedido_id AND p.vendedor_id = (SELECT auth.uid())
                 AND p.estado IN ('borrador','enviado_teletransferencia','en_revision')))
  WITH CHECK (EXISTS (SELECT 1 FROM fact_pedidos p WHERE p.id = pedido_id AND p.vendedor_id = (SELECT auth.uid())
                 AND p.estado IN ('borrador','enviado_teletransferencia','en_revision')));
DROP POLICY IF EXISTS detalles_mesa ON fact_pedido_detalles;
CREATE POLICY detalles_mesa ON fact_pedido_detalles FOR ALL TO authenticated
  USING (app.es_mesa()) WITH CHECK (app.es_mesa());

DROP POLICY IF EXISTS bloqueos_lectura ON pedido_bloqueos;
CREATE POLICY bloqueos_lectura ON pedido_bloqueos FOR SELECT TO authenticated USING (app.es_staff());

DROP POLICY IF EXISTS visitas_propias ON crm_visitas;
CREATE POLICY visitas_propias ON crm_visitas FOR ALL TO authenticated
  USING (vendedor_id = (SELECT auth.uid())) WITH CHECK (vendedor_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS visitas_staff ON crm_visitas;
CREATE POLICY visitas_staff ON crm_visitas FOR SELECT TO authenticated USING (app.es_staff());

DROP POLICY IF EXISTS plantillas_propias ON plantillas_reposicion;
CREATE POLICY plantillas_propias ON plantillas_reposicion FOR ALL TO authenticated
  USING (vendedor_id = (SELECT auth.uid())) WITH CHECK (vendedor_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS plantilla_items_propios ON plantilla_items;
CREATE POLICY plantilla_items_propios ON plantilla_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM plantillas_reposicion pl WHERE pl.id = plantilla_id AND pl.vendedor_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM plantillas_reposicion pl WHERE pl.id = plantilla_id AND pl.vendedor_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS notif_propias ON notificaciones;
CREATE POLICY notif_propias ON notificaciones FOR SELECT TO authenticated USING (usuario_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS notif_leer ON notificaciones;
CREATE POLICY notif_leer ON notificaciones FOR UPDATE TO authenticated
  USING (usuario_id = (SELECT auth.uid())) WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS alertas_lectura ON alertas_comerciales;
CREATE POLICY alertas_lectura ON alertas_comerciales FOR SELECT TO authenticated
  USING (app.es_staff()
         OR equipo_id IS NULL AND cliente_id IS NOT NULL AND app.puede_ver_cliente(cliente_id)
         OR equipo_id = (SELECT equipo_id FROM dim_usuarios WHERE id = (SELECT auth.uid())));

DROP POLICY IF EXISTS audit_admin ON audit_log;
CREATE POLICY audit_admin ON audit_log FOR SELECT TO authenticated USING (app.es_admin());

-- Permisos: nada para anon; las funciones internas no se exponen por la API.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON SCHEMA app FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO authenticated;

-- ------------------------------------------------------------------------------
-- 14. TIEMPO REAL (Supabase Realtime): bandeja del transferencista, notificaciones y presencia de bloqueos
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE fact_pedidos;      EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE pedido_bloqueos;   EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE dim_clientes;      EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 15. MANTENIMIENTO Y PRUEBAS: PURGA SEGURA DE DATOS DE PRUEBA
-- ------------------------------------------------------------------------------
-- Define o cambia la clave de purga (solo administrador). Se guarda cifrada con bcrypt.
CREATE OR REPLACE FUNCTION configurar_password_purga(p_nueva text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  IF length(coalesce(p_nueva, '')) < 12 THEN RAISE EXCEPTION 'La clave debe tener al menos 12 caracteres' USING ERRCODE = '22023'; END IF;
  INSERT INTO secretos_sistema (clave, hash) VALUES ('purga_admin', crypt(p_nueva, gen_salt('bf', 10)))
  ON CONFLICT (clave) DO UPDATE SET hash = excluded.hash, updated_at = now();
  INSERT INTO audit_log (usuario_id, accion) VALUES (auth.uid(), 'purga_password_configurada');
END $$;

-- Borra datos de prueba. Requiere: rol admin + purga_habilitada=true (solo entornos de prueba) +
-- clave correcta + máximo 5 intentos fallidos cada 15 minutos. Cada uso queda en audit_log.
--   solo_transaccional = true  -> pedidos, detalles, visitas, plantillas, notificaciones y alertas.
--   solo_transaccional = false -> además catálogos, homologaciones, reglas y clientes.
-- Nunca se tocan usuarios, equipos, configuración, secretos ni auditoría.
CREATE OR REPLACE FUNCTION purgar_base_datos_pruebas(admin_pass text, solo_transaccional boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_hash text; v_fallos integer;
BEGIN
  IF NOT app.es_admin() THEN
    RAISE EXCEPTION 'Permiso denegado' USING ERRCODE = '42501';
  END IF;
  IF coalesce((SELECT (valor #>> '{}')::boolean FROM config_sistema WHERE clave = 'purga_habilitada'), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'La purga está deshabilitada en este entorno' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_fallos FROM audit_log
   WHERE usuario_id = auth.uid() AND accion = 'purga_intento_fallido' AND created_at > now() - interval '15 minutes';
  IF v_fallos >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'demasiados_intentos');
  END IF;

  SELECT hash INTO v_hash FROM secretos_sistema WHERE clave = 'purga_admin';
  IF v_hash IS NULL OR admin_pass IS NULL OR crypt(admin_pass, v_hash) <> v_hash THEN
    INSERT INTO audit_log (usuario_id, accion) VALUES (auth.uid(), 'purga_intento_fallido');
    RETURN jsonb_build_object('ok', false, 'error', 'credenciales_invalidas');
  END IF;

  TRUNCATE fact_pedido_detalles, pedido_bloqueos, notificaciones, crm_visitas, plantilla_items,
           plantillas_reposicion, alertas_comerciales, fact_pedidos RESTART IDENTITY CASCADE;
  PERFORM setval('seq_correlativo_pedido', 1001, false);

  IF NOT solo_transaccional THEN
    TRUNCATE map_producto_drogueria, map_cliente_drogueria, precios_drogueria_producto, rel_cliente_vendedor,
             config_reglas_comerciales, dim_clientes, dim_productos, dim_droguerias RESTART IDENTITY CASCADE;
  END IF;

  INSERT INTO audit_log (usuario_id, accion, detalle)
  VALUES (auth.uid(), 'purga_ejecutada', jsonb_build_object('solo_transaccional', solo_transaccional));
  RETURN jsonb_build_object('ok', true, 'solo_transaccional', solo_transaccional);
END $$;

REVOKE ALL ON FUNCTION purgar_base_datos_pruebas(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION purgar_base_datos_pruebas(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION configurar_password_purga(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION configurar_password_purga(text) TO authenticated;
REVOKE ALL ON FUNCTION recalcular_segmentos_clientes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION generar_alertas_comerciales() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION recalcular_segmentos_clientes(), generar_alertas_comerciales() TO authenticated;

-- Programación diaria (si pg_cron está habilitado en el proyecto):
--   SELECT cron.schedule('nova-analitica', '0 5 * * *',
--          $$SELECT recalcular_segmentos_clientes(); SELECT generar_alertas_comerciales();$$);
