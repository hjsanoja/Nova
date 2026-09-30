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
-- Uso: ejecutar completo en el SQL Editor de Supabase. Es re-ejecutable (IF NOT EXISTS).
-- Si el proyecto tiene tablas de una versión anterior con los mismos nombres pero otra estructura, o triggers
-- antiguos sobre auth.users, el script se detiene con un aviso claro antes de tocar nada. En ese caso, ejecutar
-- antes src/sql/00_reiniciar_esquema_anterior.sql (aparta lo anterior en un esquema de respaldo, sin borrarlo).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 00. GUARDA: tablas de una versión anterior con los mismos nombres
-- ------------------------------------------------------------------------------
DO $$
DECLARE v_tablas text; v_triggers text;
BEGIN
  -- Tablas de v3 que ya existen en public pero sin la estructura de v3 (sin row_version, o dim_clientes sin codigo_interno).
  SELECT string_agg(t.nombre, ', ' ORDER BY t.nombre) INTO v_tablas
    FROM unnest(ARRAY['dim_equipos','dim_usuarios','dim_clientes','rel_cliente_vendedor','dim_droguerias','dim_productos',
                      'map_producto_drogueria','map_cliente_drogueria','precios_drogueria_producto','config_reglas_comerciales',
                      'fact_pedidos','fact_pedido_detalles','fact_compras_mensual','crm_visitas',
                      'notificaciones','alertas_comerciales']) AS t(nombre)
   WHERE to_regclass('public.' || t.nombre) IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                      WHERE c.table_schema = 'public' AND c.table_name = t.nombre
                        AND c.column_name = CASE t.nombre WHEN 'dim_clientes' THEN 'codigo_interno' ELSE 'row_version' END);
  -- Triggers de otras versiones sobre auth.users (hacen fallar "Add user": Database error creating new user).
  SELECT string_agg(tgname, ', ') INTO v_triggers
    FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal AND tgname <> 'on_auth_user_created';

  IF v_tablas IS NOT NULL OR v_triggers IS NOT NULL THEN
    RAISE EXCEPTION 'Este proyecto tiene restos de una version anterior de NOVA (tablas: %; triggers en auth.users: %). No se cambio nada. Ejecuta primero src/sql/00_reiniciar_esquema_anterior.sql (aparta lo anterior en un esquema de respaldo, sin borrarlo) y despues este script. Alternativa: usar un proyecto de Supabase nuevo.',
      coalesce(v_tablas, 'ninguna'), coalesce(v_triggers, 'ninguno')
      USING ERRCODE = '55000',
            HINT = 'Para ver lo que hay: select table_name from information_schema.tables where table_schema = ''public'' order by 1;';
  END IF;
END $$;

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

-- Normaliza nombres para cruzar reportes de droguería: mayúsculas, sin tildes ni signos, espacios simples.
-- 'Farmacia  "San José", C.A.' -> 'FARMACIA SAN JOSE C A'. Inmutable: se usa en columnas generadas e índices.
CREATE OR REPLACE FUNCTION app.norm_texto(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nullif(btrim(regexp_replace(
           upper(translate(coalesce(t, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^A-Z0-9]+', ' ', 'g')), '')
$$;

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_equipos_codigo_ci ON dim_equipos (upper(codigo));   -- 'La Sante' y 'LA SANTE' son el mismo equipo

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
-- El RIF NO es único: las cadenas comparten razón social/RIF entre muchos locales. La identidad de cada
-- local es su código interno (ident01) y, mientras es prospecto, su id. Se indexa el RIF normalizado para
-- buscar y detectar posibles duplicados (vw_clientes_rif_repetido).
DROP INDEX IF EXISTS uq_clientes_rif;
CREATE INDEX IF NOT EXISTS idx_clientes_rif
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
  nombre_normalizado text GENERATED ALWAYS AS (app.norm_texto(nombre)) STORED,
  CONSTRAINT ck_formato_export CHECK (
    jsonb_typeof(formato_export->'columnas') = 'array'
    AND jsonb_array_length(formato_export->'columnas') > 0
    AND coalesce(formato_export->>'delimitador','') IN (';', ',', '|', E'\t', '')
    AND coalesce(formato_export->>'formato','csv') IN ('csv','txt')
    AND coalesce(formato_export->>'codificacion','utf-8') IN ('utf-8','iso-8859-1','windows-1252'))
);

-- Bases creadas con una versión anterior de este script: el nombre normalizado permite reconocer la droguería en sus reportes.
ALTER TABLE dim_droguerias ADD COLUMN IF NOT EXISTS nombre_normalizado text GENERATED ALWAYS AS (app.norm_texto(nombre)) STORED;

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
-- Fotos (URL pública en Supabase Storage u otra dirección). Opcionales: sin foto se muestran las iniciales.
ALTER TABLE dim_productos ADD COLUMN IF NOT EXISTS foto_url text;
ALTER TABLE dim_clientes  ADD COLUMN IF NOT EXISTS foto_url text;
ALTER TABLE dim_usuarios  ADD COLUMN IF NOT EXISTS foto_url text;
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
  deleted_at             timestamptz
);
-- Una droguería puede tener varios códigos para el mismo producto (presentaciones, códigos reemplazados):
--   * el código de la droguería identifica un solo producto (para leer sus reportes de venta);
--   * un producto tiene UN código principal por droguería (el que se escribe en el archivo de pedido).
ALTER TABLE map_producto_drogueria ADD COLUMN IF NOT EXISTS nombre_normalizado text
  GENERATED ALWAYS AS (app.norm_texto(descripcion_drogueria)) STORED;
ALTER TABLE map_producto_drogueria ADD COLUMN IF NOT EXISTS es_principal boolean NOT NULL DEFAULT true;
ALTER TABLE map_producto_drogueria ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';
ALTER TABLE map_producto_drogueria DROP CONSTRAINT IF EXISTS map_producto_drogueria_drogueria_id_producto_id_key;
ALTER TABLE map_producto_drogueria DROP CONSTRAINT IF EXISTS map_producto_drogueria_drogueria_id_codigo_drogueria_key;
DO $$ BEGIN
  ALTER TABLE map_producto_drogueria ADD CONSTRAINT ck_mapprod_origen
    CHECK (origen IN ('manual','importacion','sugerencia','migracion'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mapprod_codigo ON map_producto_drogueria (drogueria_id, codigo_drogueria)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mapprod_principal ON map_producto_drogueria (drogueria_id, producto_id)
  WHERE es_principal AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mapprod_producto ON map_producto_drogueria (producto_id);
CREATE INDEX IF NOT EXISTS idx_mapprod_updated ON map_producto_drogueria (updated_at);

-- Igual para las farmacias: una droguería puede tener varias cuentas (o nombres) para una misma farmacia.
-- El código puede faltar cuando el reporte de la droguería solo trae el nombre.
CREATE TABLE IF NOT EXISTS map_cliente_drogueria (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drogueria_id          uuid NOT NULL REFERENCES dim_droguerias(id) ON DELETE CASCADE,
  cliente_id            uuid NOT NULL REFERENCES dim_clientes(id) ON DELETE CASCADE,
  codigo_cuenta         text,
  nombre_en_drogueria   text,
  verificado            boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version           integer NOT NULL DEFAULT 1,
  deleted_at            timestamptz
);
ALTER TABLE map_cliente_drogueria ALTER COLUMN codigo_cuenta DROP NOT NULL;
ALTER TABLE map_cliente_drogueria ADD COLUMN IF NOT EXISTS nombre_normalizado text
  GENERATED ALWAYS AS (app.norm_texto(nombre_en_drogueria)) STORED;
ALTER TABLE map_cliente_drogueria ADD COLUMN IF NOT EXISTS es_principal boolean NOT NULL DEFAULT true;
ALTER TABLE map_cliente_drogueria ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';
ALTER TABLE map_cliente_drogueria DROP CONSTRAINT IF EXISTS map_cliente_drogueria_drogueria_id_cliente_id_key;
ALTER TABLE map_cliente_drogueria DROP CONSTRAINT IF EXISTS map_cliente_drogueria_drogueria_id_codigo_cuenta_key;
DO $$ BEGIN
  ALTER TABLE map_cliente_drogueria ADD CONSTRAINT ck_mapcli_origen
    CHECK (origen IN ('manual','importacion','sugerencia','migracion'));
  ALTER TABLE map_cliente_drogueria ADD CONSTRAINT ck_mapcli_identificable
    CHECK (codigo_cuenta IS NOT NULL OR nombre_normalizado IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mapcli_cuenta ON map_cliente_drogueria (drogueria_id, codigo_cuenta)
  WHERE codigo_cuenta IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mapcli_nombre ON map_cliente_drogueria (drogueria_id, nombre_normalizado)
  WHERE codigo_cuenta IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mapcli_principal ON map_cliente_drogueria (drogueria_id, cliente_id)
  WHERE es_principal AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mapcli_cliente ON map_cliente_drogueria (cliente_id);
CREATE INDEX IF NOT EXISTS idx_mapcli_nombre_trgm ON map_cliente_drogueria USING gin (nombre_normalizado gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mapcli_updated ON map_cliente_drogueria (updated_at);

-- Regla del código principal (el que se escribe en el archivo de pedido). Siempre hay uno por (droguería, producto)
-- y por (droguería, farmacia) mientras exista al menos un código:
--   * el primer código queda como principal; si se marca otro, el anterior deja de serlo;
--   * un código MOVIDO a otra farmacia/producto no le quita el principal al destino;
--   * si se da de baja o se mueve el principal, se promueve el código más antiguo que quede.
CREATE OR REPLACE FUNCTION app.mantener_principal() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_otro boolean; v_movido boolean;
BEGIN
  IF current_setting('nova.degradando', true) = '1' THEN RETURN NEW; END IF;  -- evita la recursión al degradar
  IF NEW.deleted_at IS NOT NULL THEN NEW.es_principal := false; RETURN NEW; END IF;
  -- Un INSERT que va a chocar con un código ya registrado (ON CONFLICT DO NOTHING/UPDATE, o error) no debe tocar a nadie:
  -- este trigger corre ANTES de que la fila sea descartada y sus efectos sobre otras filas no se revertirían.
  IF TG_OP = 'INSERT' THEN
    IF TG_TABLE_NAME = 'map_producto_drogueria' THEN
      IF EXISTS (SELECT 1 FROM map_producto_drogueria m WHERE m.drogueria_id = NEW.drogueria_id
                 AND m.codigo_drogueria = NEW.codigo_drogueria AND m.deleted_at IS NULL) THEN RETURN NEW; END IF;
    ELSIF EXISTS (SELECT 1 FROM map_cliente_drogueria m WHERE m.drogueria_id = NEW.drogueria_id AND m.deleted_at IS NULL
                  AND ((NEW.codigo_cuenta IS NOT NULL AND m.codigo_cuenta = NEW.codigo_cuenta)
                       OR (NEW.codigo_cuenta IS NULL AND m.codigo_cuenta IS NULL
                           AND m.nombre_normalizado = app.norm_texto(NEW.nombre_en_drogueria)))) THEN
      RETURN NEW;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'map_producto_drogueria' THEN
    v_movido := TG_OP = 'UPDATE' AND (NEW.producto_id IS DISTINCT FROM OLD.producto_id OR NEW.drogueria_id IS DISTINCT FROM OLD.drogueria_id);
    SELECT EXISTS (SELECT 1 FROM map_producto_drogueria m WHERE m.drogueria_id = NEW.drogueria_id
                   AND m.producto_id = NEW.producto_id AND m.es_principal AND m.deleted_at IS NULL AND m.id <> NEW.id) INTO v_otro;
    IF v_movido THEN
      NEW.es_principal := NOT v_otro;
    ELSIF NEW.es_principal AND v_otro THEN
      PERFORM set_config('nova.degradando', '1', true);
      UPDATE map_producto_drogueria SET es_principal = false
       WHERE drogueria_id = NEW.drogueria_id AND producto_id = NEW.producto_id AND es_principal AND deleted_at IS NULL AND id <> NEW.id;
      PERFORM set_config('nova.degradando', '', true);
    ELSIF NOT NEW.es_principal AND NOT v_otro THEN
      NEW.es_principal := true;
    END IF;
  ELSE
    v_movido := TG_OP = 'UPDATE' AND (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.drogueria_id IS DISTINCT FROM OLD.drogueria_id);
    SELECT EXISTS (SELECT 1 FROM map_cliente_drogueria m WHERE m.drogueria_id = NEW.drogueria_id
                   AND m.cliente_id = NEW.cliente_id AND m.es_principal AND m.deleted_at IS NULL AND m.id <> NEW.id) INTO v_otro;
    IF v_movido THEN
      NEW.es_principal := NOT v_otro;
    ELSIF NEW.es_principal AND v_otro THEN
      PERFORM set_config('nova.degradando', '1', true);
      UPDATE map_cliente_drogueria SET es_principal = false
       WHERE drogueria_id = NEW.drogueria_id AND cliente_id = NEW.cliente_id AND es_principal AND deleted_at IS NULL AND id <> NEW.id;
      PERFORM set_config('nova.degradando', '', true);
    ELSIF NOT NEW.es_principal AND NOT v_otro THEN
      NEW.es_principal := true;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Si el principal se dio de baja o se movió, el grupo de origen no debe quedar sin principal.
CREATE OR REPLACE FUNCTION app.reponer_principal() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT OLD.es_principal OR current_setting('nova.degradando', true) = '1' THEN RETURN NULL; END IF;  -- traspaso en curso
  IF TG_TABLE_NAME = 'map_producto_drogueria' THEN
    IF NOT EXISTS (SELECT 1 FROM map_producto_drogueria m WHERE m.drogueria_id = OLD.drogueria_id AND m.producto_id = OLD.producto_id
                   AND m.es_principal AND m.deleted_at IS NULL) THEN
      UPDATE map_producto_drogueria SET es_principal = true
       WHERE id = (SELECT m.id FROM map_producto_drogueria m WHERE m.drogueria_id = OLD.drogueria_id AND m.producto_id = OLD.producto_id
                    AND m.deleted_at IS NULL ORDER BY m.created_at, m.id LIMIT 1);
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM map_cliente_drogueria m WHERE m.drogueria_id = OLD.drogueria_id AND m.cliente_id = OLD.cliente_id
                   AND m.es_principal AND m.deleted_at IS NULL) THEN
      UPDATE map_cliente_drogueria SET es_principal = true
       WHERE id = (SELECT m.id FROM map_cliente_drogueria m WHERE m.drogueria_id = OLD.drogueria_id AND m.cliente_id = OLD.cliente_id
                    AND m.deleted_at IS NULL ORDER BY m.created_at, m.id LIMIT 1);
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_principal ON map_producto_drogueria;
CREATE TRIGGER trg_principal BEFORE INSERT OR UPDATE OF es_principal, deleted_at, producto_id, drogueria_id ON map_producto_drogueria
  FOR EACH ROW EXECUTE FUNCTION app.mantener_principal();
DROP TRIGGER IF EXISTS trg_reponer ON map_producto_drogueria;
CREATE TRIGGER trg_reponer AFTER UPDATE OF es_principal, deleted_at, producto_id, drogueria_id ON map_producto_drogueria
  FOR EACH ROW WHEN (OLD.es_principal) EXECUTE FUNCTION app.reponer_principal();
DROP TRIGGER IF EXISTS trg_principal ON map_cliente_drogueria;
CREATE TRIGGER trg_principal BEFORE INSERT OR UPDATE OF es_principal, deleted_at, cliente_id, drogueria_id ON map_cliente_drogueria
  FOR EACH ROW EXECUTE FUNCTION app.mantener_principal();
DROP TRIGGER IF EXISTS trg_reponer ON map_cliente_drogueria;
CREATE TRIGGER trg_reponer AFTER UPDATE OF es_principal, deleted_at, cliente_id, drogueria_id ON map_cliente_drogueria
  FOR EACH ROW WHEN (OLD.es_principal) EXECUTE FUNCTION app.reponer_principal();

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
-- 5B. HECHOS: VENTAS REPORTADAS POR LAS DROGUERÍAS (sell-out) Y COMPRAS MENSUALES
-- Cada droguería reporta a su manera: sus códigos y nombres de farmacia y de producto. La fila se guarda
-- TAL CUAL LLEGÓ (códigos y nombres de la droguería) y se enlaza a la farmacia y al producto maestros
-- (cliente_id / producto_id) mediante map_cliente_drogueria y map_producto_drogueria. Lo que aún no se
-- reconoce queda con FK nula y aparece en vw_pendientes_*; al homologarlo, las filas históricas se enlazan solas.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_lotes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo       text NOT NULL,
  checksum      text NOT NULL UNIQUE,            -- identidad del archivo: subirlo dos veces no duplica filas
  periodo_desde date,
  periodo_hasta date,
  filas         integer NOT NULL DEFAULT 0,
  creado_por    uuid REFERENCES dim_usuarios(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fact_ventas_drogueria (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id                   uuid NOT NULL REFERENCES import_lotes(id) ON DELETE CASCADE,
  fila                      integer NOT NULL,             -- posición en el archivo: reenviar un lote no duplica
  fecha                     date NOT NULL,
  periodo                   date GENERATED ALWAYS AS (date_trunc('month', fecha::timestamp)::date) STORED,
  drogueria_id              uuid NOT NULL REFERENCES dim_droguerias(id),
  cliente_id                uuid REFERENCES dim_clientes(id),    -- NULL = farmacia sin homologar
  producto_id               uuid REFERENCES dim_productos(id),   -- NULL = producto sin homologar
  cod_cliente_drogueria     text,
  nombre_cliente_drogueria  text NOT NULL,
  cod_producto_drogueria    text NOT NULL,
  nombre_producto_drogueria text,
  cod_sap_reportado         text,                                -- si el reporte ya traía el Cod SAP
  unidades                  integer NOT NULL,                    -- negativo = devolución / nota de crédito
  UNIQUE (lote_id, fila)
);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente_prod ON fact_ventas_drogueria (cliente_id, producto_id, periodo)
  WHERE cliente_id IS NOT NULL AND producto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_sin_cliente ON fact_ventas_drogueria (drogueria_id, cod_cliente_drogueria)
  WHERE cliente_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_sin_producto ON fact_ventas_drogueria (drogueria_id, cod_producto_drogueria)
  WHERE producto_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON fact_ventas_drogueria USING brin (fecha);

-- Consolidado por farmacia, producto y mes: es lo que baja al dispositivo (pedido sugerido) y lo que
-- alimenta segmentos y alertas. Se recalcula a partir de fact_ventas_drogueria (app.refrescar_compras).
CREATE TABLE IF NOT EXISTS fact_compras_mensual (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid NOT NULL REFERENCES dim_clientes(id) ON DELETE CASCADE,
  producto_id    uuid NOT NULL REFERENCES dim_productos(id) ON DELETE CASCADE,
  periodo        date NOT NULL,
  unidades       integer NOT NULL CHECK (unidades > 0),
  n_compras      integer NOT NULL DEFAULT 1,
  ultima_compra  date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version    integer NOT NULL DEFAULT 1,
  deleted_at     timestamptz,
  UNIQUE (cliente_id, producto_id, periodo)
);
CREATE INDEX IF NOT EXISTS idx_compras_updated ON fact_compras_mensual (updated_at);
CREATE INDEX IF NOT EXISTS idx_compras_producto ON fact_compras_mensual (producto_id, periodo);

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

-- Plantillas de reposición: retiradas (las reemplazan los carritos guardados en el dispositivo y el pedido sugerido).
DROP FUNCTION IF EXISTS sync_guardar_plantilla(jsonb);
DROP TABLE IF EXISTS plantilla_items, plantillas_reposicion CASCADE;

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
    'config_reglas_comerciales','fact_pedidos','fact_pedido_detalles','crm_visitas',
    'notificaciones','alertas_comerciales','fact_compras_mensual']
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

-- Farmacias visibles para un vendedor (su fichero + las que él creó), como conjunto: las políticas lo usan con
-- `x IN (SELECT app.mis_clientes())`, que se calcula una vez por consulta y no una vez por fila.
CREATE OR REPLACE FUNCTION app.mis_clientes() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.cliente_id FROM rel_cliente_vendedor r WHERE r.vendedor_id = auth.uid() AND r.activo AND r.deleted_at IS NULL
  UNION
  SELECT c.id FROM dim_clientes c WHERE c.creado_por = auth.uid()
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
                   WHERE m.cliente_id = NEW.cliente_id AND m.drogueria_id = NEW.drogueria_id
                     AND m.es_principal AND m.codigo_cuenta IS NOT NULL AND m.deleted_at IS NULL) THEN
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
      IF NOT EXISTS (SELECT 1 FROM map_cliente_drogueria WHERE cliente_id = NEW.id AND codigo_cuenta IS NOT NULL AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Asigna la homologación (código de cuenta) con al menos una droguería antes de activar' USING ERRCODE = 'P0001';
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
  IF coalesce(btrim(p_codigo_cuenta), '') = '' THEN
    RAISE EXCEPTION 'Indica el código de cuenta que la droguería asignó a la farmacia' USING ERRCODE = '22023';
  END IF;
  -- Lanza 23505 si ese código ya pertenece a otra farmacia; el primer código de la droguería queda como principal.
  PERFORM homologar_cliente(p_drogueria, p_cliente, p_codigo_cuenta, NULL, NULL);
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
-- 11B. HOMOLOGACIÓN E IMPORTACIÓN (códigos y nombres propios de cada droguería)
-- ------------------------------------------------------------------------------
-- Resolución = función pura de (códigos/nombres reportados + tablas map_*): por eso se puede recalcular
-- (reprocesar_homologacion) y se completa sola cuando se agrega un mapeo (triggers de más abajo).

-- Consolida fact_ventas_drogueria -> fact_compras_mensual desde un mes en adelante (NULL = todo).
-- Firma anterior (solo p_desde): se retira para que las llamadas de un argumento no sean ambiguas.
DROP FUNCTION IF EXISTS app.refrescar_compras(date);
CREATE OR REPLACE FUNCTION app.refrescar_compras(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer; v_baja integer;
BEGIN
  WITH agg AS (
    SELECT cliente_id, producto_id, periodo, sum(unidades)::integer AS unidades, count(*)::integer AS n, max(fecha) AS ultima
      FROM fact_ventas_drogueria
     WHERE cliente_id IS NOT NULL AND producto_id IS NOT NULL AND (p_desde IS NULL OR periodo >= p_desde)
       AND (p_hasta IS NULL OR periodo <= p_hasta)
     GROUP BY cliente_id, producto_id, periodo
    HAVING sum(unidades) > 0)
  INSERT INTO fact_compras_mensual (cliente_id, producto_id, periodo, unidades, n_compras, ultima_compra)
  SELECT cliente_id, producto_id, periodo, unidades, n, ultima FROM agg
  ON CONFLICT (cliente_id, producto_id, periodo) DO UPDATE
     SET unidades = excluded.unidades, n_compras = excluded.n_compras,
         ultima_compra = excluded.ultima_compra, deleted_at = NULL
   WHERE (fact_compras_mensual.unidades, fact_compras_mensual.n_compras, fact_compras_mensual.ultima_compra)
           IS DISTINCT FROM (excluded.unidades, excluded.n_compras, excluded.ultima_compra)
      OR fact_compras_mensual.deleted_at IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Combinaciones que dejaron de existir (lote borrado, homologación corregida): baja lógica para que el dispositivo las retire.
  UPDATE fact_compras_mensual c SET deleted_at = now()
   WHERE c.deleted_at IS NULL AND (p_desde IS NULL OR c.periodo >= p_desde) AND (p_hasta IS NULL OR c.periodo <= p_hasta)
     AND NOT EXISTS (SELECT 1 FROM fact_ventas_drogueria v
                      WHERE v.cliente_id = c.cliente_id AND v.producto_id = c.producto_id AND v.periodo = c.periodo
                     HAVING sum(v.unidades) > 0);
  GET DIAGNOSTICS v_baja = ROW_COUNT;
  RETURN v_n + v_baja;
END $$;

-- Enlaza las filas de venta pendientes con la farmacia/producto maestro usando los mapeos vigentes.
--   1) aprende códigos de producto cuando el reporte trae el Cod SAP (solo si el código apunta a un único SKU);
--   2) farmacia por código de cuenta; si el reporte no trae código, por nombre normalizado inequívoco;
--   3) producto por código de la droguería;
--   4) actualiza el consolidado mensual de los meses afectados.
--   p_refrescar = false y un rango de filas: lo usa la importación por trozos (solo enlaza el trozo recién insertado; el
--   consolidado se calcula una vez al final con finalizar_lote_ventas).
DROP FUNCTION IF EXISTS app.homologar_ventas(uuid, uuid);
CREATE OR REPLACE FUNCTION app.homologar_ventas(p_drogueria uuid DEFAULT NULL, p_lote uuid DEFAULT NULL,
                                                p_refrescar boolean DEFAULT true,
                                                p_fila_desde integer DEFAULT NULL, p_fila_hasta integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_aprendidos bigint := 0; v_cli bigint := 0; v_cli_n bigint := 0; v_prod bigint := 0; v_x bigint;
        v_desde date; v_hasta date; v_m date; v_mx date;
BEGIN
  IF current_setting('nova.homologando', true) = '1' THEN RETURN '{}'::jsonb; END IF;
  PERFORM set_config('nova.homologando', '1', true);

  WITH cand AS (
    SELECT v.drogueria_id, v.cod_producto_drogueria AS codigo,
           (array_agg(DISTINCT p.id))[1] AS producto_id,
           (array_agg(v.nombre_producto_drogueria))[1] AS descripcion,
           count(DISTINCT p.id) AS n
      FROM fact_ventas_drogueria v
      JOIN dim_productos p ON p.sku = v.cod_sap_reportado AND p.deleted_at IS NULL
     WHERE v.producto_id IS NULL AND v.cod_sap_reportado IS NOT NULL
       AND (p_drogueria IS NULL OR v.drogueria_id = p_drogueria) AND (p_lote IS NULL OR v.lote_id = p_lote)
       AND (p_fila_desde IS NULL OR v.fila BETWEEN p_fila_desde AND p_fila_hasta)
     GROUP BY v.drogueria_id, v.cod_producto_drogueria),
  ins AS (
    INSERT INTO map_producto_drogueria (drogueria_id, producto_id, codigo_drogueria, descripcion_drogueria, es_principal, origen)
    SELECT drogueria_id, producto_id, codigo, descripcion, false, 'importacion' FROM cand WHERE n = 1
    ON CONFLICT (drogueria_id, codigo_drogueria) WHERE deleted_at IS NULL DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_aprendidos FROM ins;

  WITH u AS (
    UPDATE fact_ventas_drogueria v SET cliente_id = m.cliente_id
      FROM map_cliente_drogueria m
     WHERE v.cliente_id IS NULL AND m.deleted_at IS NULL AND m.drogueria_id = v.drogueria_id
       AND m.codigo_cuenta IS NOT NULL AND m.codigo_cuenta = v.cod_cliente_drogueria
       AND (p_drogueria IS NULL OR v.drogueria_id = p_drogueria) AND (p_lote IS NULL OR v.lote_id = p_lote)
       AND (p_fila_desde IS NULL OR v.fila BETWEEN p_fila_desde AND p_fila_hasta)
    RETURNING v.periodo)
  SELECT count(*), min(periodo), max(periodo) INTO v_cli, v_m, v_mx FROM u;
  v_desde := v_m; v_hasta := v_mx;

  WITH unico AS (
    SELECT drogueria_id, nombre_normalizado, (array_agg(DISTINCT cliente_id))[1] AS cliente_id
      FROM map_cliente_drogueria
     WHERE deleted_at IS NULL AND nombre_normalizado IS NOT NULL
       AND (p_drogueria IS NULL OR drogueria_id = p_drogueria)
     GROUP BY drogueria_id, nombre_normalizado HAVING count(DISTINCT cliente_id) = 1),
  u AS (
    UPDATE fact_ventas_drogueria v SET cliente_id = un.cliente_id
      FROM unico un
     WHERE v.cliente_id IS NULL AND v.cod_cliente_drogueria IS NULL
       AND un.drogueria_id = v.drogueria_id AND un.nombre_normalizado = app.norm_texto(v.nombre_cliente_drogueria)
       AND (p_drogueria IS NULL OR v.drogueria_id = p_drogueria) AND (p_lote IS NULL OR v.lote_id = p_lote)
       AND (p_fila_desde IS NULL OR v.fila BETWEEN p_fila_desde AND p_fila_hasta)
    RETURNING v.periodo)
  SELECT count(*), min(periodo), max(periodo) INTO v_cli_n, v_m, v_mx FROM u;
  v_desde := least(v_desde, v_m); v_hasta := greatest(v_hasta, v_mx);

  WITH u AS (
    UPDATE fact_ventas_drogueria v SET producto_id = m.producto_id
      FROM map_producto_drogueria m
     WHERE v.producto_id IS NULL AND m.deleted_at IS NULL AND m.drogueria_id = v.drogueria_id
       AND m.codigo_drogueria = v.cod_producto_drogueria
       AND (p_drogueria IS NULL OR v.drogueria_id = p_drogueria) AND (p_lote IS NULL OR v.lote_id = p_lote)
       AND (p_fila_desde IS NULL OR v.fila BETWEEN p_fila_desde AND p_fila_hasta)
    RETURNING v.periodo)
  SELECT count(*), min(periodo), max(periodo) INTO v_prod, v_m, v_mx FROM u;
  v_desde := least(v_desde, v_m); v_hasta := greatest(v_hasta, v_mx);

  IF p_refrescar AND v_desde IS NOT NULL THEN PERFORM app.refrescar_compras(v_desde, v_hasta); END IF;
  PERFORM set_config('nova.homologando', '', true);
  RETURN jsonb_build_object('clientes_enlazados', v_cli + v_cli_n, 'productos_enlazados', v_prod, 'codigos_aprendidos', v_aprendidos);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('nova.homologando', '', true);
  RAISE;
END $$;

-- Al agregar o cambiar mapeos, las ventas históricas de esa droguería se enlazan solas (una pasada por sentencia).
CREATE OR REPLACE FUNCTION app.tg_homologar_map() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d uuid;
BEGIN
  IF current_setting('nova.homologando', true) = '1' OR current_setting('nova.degradando', true) = '1' THEN RETURN NULL; END IF;
  FOR d IN SELECT DISTINCT drogueria_id FROM nuevas LOOP
    PERFORM app.homologar_ventas(d);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_homologar_ins ON map_producto_drogueria;
CREATE TRIGGER trg_homologar_ins AFTER INSERT ON map_producto_drogueria
  REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION app.tg_homologar_map();
DROP TRIGGER IF EXISTS trg_homologar_upd ON map_producto_drogueria;
CREATE TRIGGER trg_homologar_upd AFTER UPDATE ON map_producto_drogueria
  REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION app.tg_homologar_map();
DROP TRIGGER IF EXISTS trg_homologar_ins ON map_cliente_drogueria;
CREATE TRIGGER trg_homologar_ins AFTER INSERT ON map_cliente_drogueria
  REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION app.tg_homologar_map();
DROP TRIGGER IF EXISTS trg_homologar_upd ON map_cliente_drogueria;
CREATE TRIGGER trg_homologar_upd AFTER UPDATE ON map_cliente_drogueria
  REFERENCING NEW TABLE AS nuevas FOR EACH STATEMENT EXECUTE FUNCTION app.tg_homologar_map();

-- Corregir un mapeo equivocado: se borra el enlace de esa droguería y se recalcula con los mapeos vigentes.
CREATE OR REPLACE FUNCTION reprocesar_homologacion(p_drogueria uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res jsonb;
BEGIN
  IF NOT app.es_mesa() THEN RAISE EXCEPTION 'Solo administrador o transferencista' USING ERRCODE = '42501'; END IF;
  UPDATE fact_ventas_drogueria SET cliente_id = NULL, producto_id = NULL
   WHERE p_drogueria IS NULL OR drogueria_id = p_drogueria;
  v_res := app.homologar_ventas(p_drogueria);
  PERFORM app.refrescar_compras(NULL);
  RETURN v_res;
END $$;

-- Un solo mapeo de farmacia (pantalla "Homologar"). El primero de la droguería queda como principal.
CREATE OR REPLACE FUNCTION homologar_cliente(p_drogueria uuid, p_cliente uuid, p_codigo text DEFAULT NULL,
                                             p_nombre text DEFAULT NULL, p_principal boolean DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_otro uuid; v_norm text := app.norm_texto(p_nombre);
BEGIN
  IF NOT app.es_mesa() THEN RAISE EXCEPTION 'Solo administrador o transferencista' USING ERRCODE = '42501'; END IF;
  p_codigo := nullif(btrim(p_codigo), '');
  IF p_codigo IS NULL AND v_norm IS NULL THEN
    RAISE EXCEPTION 'Indica el código de cuenta o el nombre que usa la droguería' USING ERRCODE = '22023';
  END IF;
  SELECT id, cliente_id INTO v_id, v_otro FROM map_cliente_drogueria
   WHERE drogueria_id = p_drogueria AND deleted_at IS NULL
     AND ((p_codigo IS NOT NULL AND codigo_cuenta = p_codigo) OR (p_codigo IS NULL AND codigo_cuenta IS NULL AND nombre_normalizado = v_norm));
  IF v_id IS NOT NULL AND v_otro <> p_cliente THEN
    RAISE EXCEPTION 'Ese código/nombre ya está asignado a otra farmacia en esta droguería' USING ERRCODE = '23505';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO map_cliente_drogueria (drogueria_id, cliente_id, codigo_cuenta, nombre_en_drogueria, es_principal, origen)
    VALUES (p_drogueria, p_cliente, p_codigo, nullif(btrim(p_nombre), ''),
            coalesce(p_principal, NOT EXISTS (SELECT 1 FROM map_cliente_drogueria m WHERE m.drogueria_id = p_drogueria
                                                AND m.cliente_id = p_cliente AND m.es_principal AND m.deleted_at IS NULL)),
            'manual')
    RETURNING id INTO v_id;
  ELSE
    UPDATE map_cliente_drogueria SET nombre_en_drogueria = coalesce(nullif(btrim(p_nombre), ''), nombre_en_drogueria),
           es_principal = coalesce(p_principal, es_principal) WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION homologar_producto(p_drogueria uuid, p_producto uuid, p_codigo text,
                                              p_descripcion text DEFAULT NULL, p_principal boolean DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_otro uuid;
BEGIN
  IF NOT app.es_mesa() THEN RAISE EXCEPTION 'Solo administrador o transferencista' USING ERRCODE = '42501'; END IF;
  p_codigo := nullif(btrim(p_codigo), '');
  IF p_codigo IS NULL THEN RAISE EXCEPTION 'Indica el código que usa la droguería' USING ERRCODE = '22023'; END IF;
  SELECT id, producto_id INTO v_id, v_otro FROM map_producto_drogueria
   WHERE drogueria_id = p_drogueria AND codigo_drogueria = p_codigo AND deleted_at IS NULL;
  IF v_id IS NOT NULL AND v_otro <> p_producto THEN
    RAISE EXCEPTION 'Ese código ya está asignado a otro producto en esta droguería' USING ERRCODE = '23505';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO map_producto_drogueria (drogueria_id, producto_id, codigo_drogueria, descripcion_drogueria, es_principal, origen)
    VALUES (p_drogueria, p_producto, p_codigo, nullif(btrim(p_descripcion), ''),
            coalesce(p_principal, NOT EXISTS (SELECT 1 FROM map_producto_drogueria m WHERE m.drogueria_id = p_drogueria
                                                AND m.producto_id = p_producto AND m.es_principal AND m.deleted_at IS NULL)),
            'manual')
    RETURNING id INTO v_id;
  ELSE
    UPDATE map_producto_drogueria SET descripcion_drogueria = coalesce(nullif(btrim(p_descripcion), ''), descripcion_drogueria),
           es_principal = coalesce(p_principal, es_principal) WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

-- Candidatos para un nombre que la droguería escribe a su manera (similitud de trigramas sobre nombres normalizados).
CREATE OR REPLACE FUNCTION sugerir_farmacias(p_nombre text, p_limite integer DEFAULT 5)
RETURNS TABLE (cliente_id uuid, codigo_interno text, nombre_comercial text, razon_social text, brick text, score real)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT c.id, c.codigo_interno, c.nombre_comercial, c.razon_social, c.brick,
         greatest(similarity(app.norm_texto(c.nombre_comercial), app.norm_texto(p_nombre)),
                  similarity(app.norm_texto(c.razon_social), app.norm_texto(p_nombre)))::real AS score
    FROM dim_clientes c
   WHERE c.estado_validacion = 'activo' AND c.deleted_at IS NULL
   ORDER BY score DESC, c.nombre_comercial LIMIT greatest(p_limite, 1)
$$;

CREATE OR REPLACE FUNCTION sugerir_productos(p_nombre text, p_limite integer DEFAULT 5)
RETURNS TABLE (producto_id uuid, sku text, nombre_comercial text, presentacion text, score real)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT p.id, p.sku, p.nombre_comercial, p.presentacion,
         similarity(app.norm_texto(p.nombre_comercial || ' ' || coalesce(p.presentacion, '')), app.norm_texto(p_nombre))::real AS score
    FROM dim_productos p
   WHERE p.activo AND p.deleted_at IS NULL
   ORDER BY score DESC, p.nombre_comercial LIMIT greatest(p_limite, 1)
$$;

-- Lo que falta por homologar, agrupado y ordenado por volumen: se resuelve primero lo que más pesa.
CREATE OR REPLACE VIEW vw_pendientes_clientes WITH (security_invoker = true) AS
SELECT v.drogueria_id, d.nombre AS drogueria, v.cod_cliente_drogueria,
       mode() WITHIN GROUP (ORDER BY v.nombre_cliente_drogueria) AS nombre_cliente_drogueria,
       count(*)::integer AS filas, sum(v.unidades)::integer AS unidades, min(v.fecha) AS desde, max(v.fecha) AS hasta
  FROM fact_ventas_drogueria v JOIN dim_droguerias d ON d.id = v.drogueria_id
 WHERE v.cliente_id IS NULL
 GROUP BY v.drogueria_id, d.nombre, v.cod_cliente_drogueria,
          CASE WHEN v.cod_cliente_drogueria IS NULL THEN app.norm_texto(v.nombre_cliente_drogueria) END;

CREATE OR REPLACE VIEW vw_pendientes_productos WITH (security_invoker = true) AS
SELECT v.drogueria_id, d.nombre AS drogueria, v.cod_producto_drogueria,
       mode() WITHIN GROUP (ORDER BY v.nombre_producto_drogueria) AS nombre_producto_drogueria,
       mode() WITHIN GROUP (ORDER BY v.cod_sap_reportado) AS cod_sap_reportado,
       count(*)::integer AS filas, sum(v.unidades)::integer AS unidades, min(v.fecha) AS desde, max(v.fecha) AS hasta
  FROM fact_ventas_drogueria v JOIN dim_droguerias d ON d.id = v.drogueria_id
 WHERE v.producto_id IS NULL
 GROUP BY v.drogueria_id, d.nombre, v.cod_producto_drogueria;

-- Salud de la homologación por droguería (para el tablero del administrador).
CREATE OR REPLACE VIEW vw_estado_homologacion WITH (security_invoker = true) AS
SELECT d.id AS drogueria_id, d.nombre AS drogueria, count(v.id)::integer AS filas,
       count(*) FILTER (WHERE v.cliente_id IS NULL)::integer AS filas_sin_farmacia,
       count(*) FILTER (WHERE v.producto_id IS NULL)::integer AS filas_sin_producto,
       round(100.0 * count(*) FILTER (WHERE v.cliente_id IS NOT NULL AND v.producto_id IS NOT NULL)
             / nullif(count(v.id), 0), 1) AS pct_homologado
  FROM dim_droguerias d LEFT JOIN fact_ventas_drogueria v ON v.drogueria_id = d.id
 WHERE d.deleted_at IS NULL
 GROUP BY d.id, d.nombre;

-- Locales que comparten RIF (normal en cadenas; útil para detectar duplicados reales).
CREATE OR REPLACE VIEW vw_clientes_rif_repetido WITH (security_invoker = true) AS
SELECT upper(regexp_replace(rif, '[^0-9A-Za-z]', '', 'g')) AS rif_normalizado, count(*)::integer AS locales,
       array_agg(coalesce(codigo_interno, id::text) ORDER BY nombre_comercial) AS codigos,
       array_agg(nombre_comercial ORDER BY nombre_comercial) AS nombres
  FROM dim_clientes WHERE rif IS NOT NULL AND deleted_at IS NULL
 GROUP BY 1 HAVING count(*) > 1;

-- Importación de reportes de venta de las droguerías (lotes de ~1000 filas; idempotente por checksum + fila).
--   p_lote  = {"archivo": "...", "checksum": "..."}
--   p_filas = [{"n":1,"fecha":"2026-03-05","drogueria":"COBECA","cod_cliente":"C-88","nombre_cliente":"...",
--               "cod_producto":"P-1","nombre_producto":"...","unidades":12,"cod_sap":"SKU-1"}, ...]
CREATE OR REPLACE FUNCTION importar_ventas_drogueria(p_lote jsonb, p_filas jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lote uuid; v_ins integer; v_desconocidas jsonb; v_homo jsonb; v_diferir boolean;
        v_fmin integer; v_fmax integer;
BEGIN
  IF NOT app.es_mesa() THEN RAISE EXCEPTION 'Solo administrador o transferencista' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_lote->>'checksum', '') = '' OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'Lote inválido: falta checksum o filas' USING ERRCODE = '22023';
  END IF;
  -- diferir = true: el archivo llega en varios trozos; el consolidado mensual se calcula UNA vez al final
  -- (finalizar_lote_ventas). Sin diferir, cada llamada deja todo al día (compatibilidad).
  v_diferir := coalesce((p_lote->>'diferir')::boolean, false);

  INSERT INTO import_lotes (archivo, checksum, creado_por)
  VALUES (coalesce(p_lote->>'archivo', 'sin_nombre'), p_lote->>'checksum', auth.uid())
  ON CONFLICT (checksum) DO UPDATE SET archivo = import_lotes.archivo
  RETURNING id INTO v_lote;

  WITH src AS (
    SELECT (r->>'n')::integer AS fila, (r->>'fecha')::date AS fecha, r->>'drogueria' AS drogueria,
           nullif(btrim(r->>'cod_cliente'), '') AS cod_cliente, coalesce(nullif(btrim(r->>'nombre_cliente'), ''), 'SIN NOMBRE') AS nombre_cliente,
           btrim(r->>'cod_producto') AS cod_producto, r->>'nombre_producto' AS nombre_producto,
           nullif(btrim(r->>'cod_sap'), '') AS cod_sap, (r->>'unidades')::integer AS unidades
      FROM jsonb_array_elements(p_filas) r),
  -- La droguería se resuelve una vez por nombre distinto (no por fila).
  drog AS (
    SELECT x.drogueria, d.id AS drogueria_id
      FROM (SELECT DISTINCT drogueria FROM src) x
      LEFT JOIN LATERAL (SELECT dd.id FROM dim_droguerias dd
                          WHERE dd.deleted_at IS NULL
                            AND (app.norm_texto(dd.codigo) = app.norm_texto(x.drogueria) OR dd.nombre_normalizado = app.norm_texto(x.drogueria))
                          ORDER BY dd.activo DESC LIMIT 1) d ON true),
  res AS (
    SELECT s.*, dr.drogueria_id FROM src s LEFT JOIN drog dr ON dr.drogueria IS NOT DISTINCT FROM s.drogueria),
  ins AS (
    INSERT INTO fact_ventas_drogueria (lote_id, fila, fecha, drogueria_id, cod_cliente_drogueria, nombre_cliente_drogueria,
                                       cod_producto_drogueria, nombre_producto_drogueria, cod_sap_reportado, unidades)
    SELECT v_lote, fila, fecha, drogueria_id, cod_cliente, nombre_cliente, cod_producto, nombre_producto, cod_sap, unidades
      FROM res WHERE drogueria_id IS NOT NULL AND cod_producto <> ''
    ON CONFLICT (lote_id, fila) DO NOTHING
    RETURNING fila, fecha)
  SELECT (SELECT count(*) FROM ins),
         (SELECT coalesce(jsonb_agg(DISTINCT drogueria), '[]'::jsonb) FROM drog WHERE drogueria_id IS NULL),
         (SELECT min(fila) FROM ins), (SELECT max(fila) FROM ins)
    INTO v_ins, v_desconocidas, v_fmin, v_fmax;

  IF v_diferir THEN
    -- Solo las filas de este trozo: el costo no crece con el tamaño del archivo ni del historial.
    UPDATE import_lotes l SET filas = coalesce(l.filas, 0) + v_ins,
           periodo_desde = least(l.periodo_desde, x.d1), periodo_hasta = greatest(l.periodo_hasta, x.d2)
      FROM (SELECT min(fecha) AS d1, max(fecha) AS d2 FROM fact_ventas_drogueria
             WHERE lote_id = v_lote AND fila BETWEEN v_fmin AND v_fmax) x
     WHERE l.id = v_lote AND v_ins > 0;
    v_homo := CASE WHEN v_ins > 0 THEN app.homologar_ventas(NULL, v_lote, false, v_fmin, v_fmax) ELSE '{}'::jsonb END;
  ELSE
    UPDATE import_lotes l SET filas = x.n, periodo_desde = x.d1, periodo_hasta = x.d2
      FROM (SELECT count(*)::integer AS n, min(fecha) AS d1, max(fecha) AS d2 FROM fact_ventas_drogueria WHERE lote_id = v_lote) x
     WHERE l.id = v_lote;
    v_homo := app.homologar_ventas(NULL, v_lote);
    INSERT INTO audit_log (usuario_id, accion, detalle)
    VALUES (auth.uid(), 'importar_ventas', jsonb_build_object('lote', v_lote, 'insertadas', v_ins));
  END IF;
  RETURN jsonb_build_object('lote_id', v_lote, 'insertadas', v_ins, 'recibidas', jsonb_array_length(p_filas),
                            'droguerias_desconocidas', v_desconocidas, 'homologacion', v_homo);
END $$;

-- Cierre de una importación por trozos: consolidado mensual de los meses del archivo y resumen del lote.
CREATE OR REPLACE FUNCTION finalizar_lote_ventas(p_lote uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l import_lotes; v_sin_cli integer; v_sin_prod integer;
BEGIN
  IF NOT app.es_mesa() THEN RAISE EXCEPTION 'Solo administrador o transferencista' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM import_lotes WHERE id = p_lote;
  IF NOT FOUND THEN RAISE EXCEPTION 'El lote no existe' USING ERRCODE = 'P0002'; END IF;
  IF l.periodo_desde IS NOT NULL THEN
    PERFORM app.refrescar_compras(date_trunc('month', l.periodo_desde::timestamp)::date,
                                  date_trunc('month', l.periodo_hasta::timestamp)::date);
  END IF;
  SELECT count(*) FILTER (WHERE cliente_id IS NULL), count(*) FILTER (WHERE producto_id IS NULL)
    INTO v_sin_cli, v_sin_prod FROM fact_ventas_drogueria WHERE lote_id = p_lote;
  INSERT INTO audit_log (usuario_id, accion, detalle)
  VALUES (auth.uid(), 'importar_ventas', jsonb_build_object('lote', p_lote, 'filas', l.filas));
  RETURN jsonb_build_object('lote_id', p_lote, 'filas', coalesce(l.filas, 0), 'sin_farmacia', v_sin_cli, 'sin_producto', v_sin_prod,
                            'desde', l.periodo_desde, 'hasta', l.periodo_hasta);
END $$;

-- Resumen para "Verificar en Supabase": una sola consulta en el servidor (contar con la RLS fila a fila podía
-- pasar el límite de tiempo de Supabase en tablas grandes).
CREATE OR REPLACE FUNCTION resumen_ventas_nube() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app.es_staff() THEN RAISE EXCEPTION 'Solo personal autorizado' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object('filas', count(*), 'sin_farmacia', count(*) FILTER (WHERE cliente_id IS NULL),
                                    'sin_producto', count(*) FILTER (WHERE producto_id IS NULL),
                                    'lotes', (SELECT count(*) FROM import_lotes),
                                    'desde', min(fecha), 'hasta', max(fecha))
            FROM fact_ventas_drogueria);
END $$;

CREATE OR REPLACE FUNCTION borrar_lote_ventas(p_lote uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_desde date; v_n integer;
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  SELECT date_trunc('month', periodo_desde::timestamp)::date INTO v_desde FROM import_lotes WHERE id = p_lote;  -- inicio del mes
  SELECT count(*) INTO v_n FROM fact_ventas_drogueria WHERE lote_id = p_lote;
  DELETE FROM import_lotes WHERE id = p_lote;
  PERFORM app.refrescar_compras(v_desde);
  INSERT INTO audit_log (usuario_id, accion, detalle) VALUES (auth.uid(), 'borrar_lote_ventas', jsonb_build_object('lote', p_lote, 'filas', v_n));
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION refrescar_compras_mensual(p_desde date DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  RETURN app.refrescar_compras(p_desde);
END $$;

-- Catálogos maestros por clave natural (código interno / SKU): el navegador no necesita conocer UUID.
CREATE OR REPLACE FUNCTION importar_catalogo_productos(p jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  WITH ins AS (
    INSERT INTO dim_productos (sku, ean13, nombre_comercial, presentacion, principio_activo, clase_terapeutica, categoria,
                               laboratorio, equipo_id, empaque_minimo, es_prioritario, activo, foto_url)
    SELECT btrim(r->>'sku'), nullif(r->>'ean13', ''), coalesce(nullif(r->>'nombre_comercial', ''), r->>'sku'), nullif(r->>'presentacion', ''),
           nullif(r->>'principio_activo', ''), nullif(r->>'clase_terapeutica', ''), nullif(r->>'categoria', ''),
           nullif(r->>'laboratorio', ''), (SELECT e.id FROM dim_equipos e WHERE e.codigo = r->>'equipo'),
           greatest(coalesce((r->>'empaque_minimo')::integer, 1), 1), coalesce((r->>'es_prioritario')::boolean, false),
           coalesce((r->>'activo')::boolean, true), nullif(btrim(r->>'foto_url'), '')
      FROM jsonb_array_elements(p) r WHERE coalesce(btrim(r->>'sku'), '') <> ''
    ON CONFLICT (sku) DO UPDATE SET ean13 = excluded.ean13, nombre_comercial = excluded.nombre_comercial,
        presentacion = excluded.presentacion, principio_activo = excluded.principio_activo,
        clase_terapeutica = excluded.clase_terapeutica, categoria = excluded.categoria, laboratorio = excluded.laboratorio,
        equipo_id = coalesce(excluded.equipo_id, dim_productos.equipo_id), empaque_minimo = excluded.empaque_minimo,
        es_prioritario = excluded.es_prioritario, activo = excluded.activo, deleted_at = NULL,
        foto_url = coalesce(excluded.foto_url, dim_productos.foto_url)
    RETURNING 1)
  SELECT count(*) INTO v_n FROM ins;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION importar_catalogo_clientes(p jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  WITH ins AS (
    INSERT INTO dim_clientes (codigo_interno, razon_social, nombre_comercial, rif, rif_verificado, brick, municipio, estado_geografico,
                              direccion, telefono, bandera, ubicacion, frecuencia_dias, estado_validacion, origen)
    SELECT btrim(r->>'codigo_interno'), coalesce(nullif(r->>'razon_social', ''), r->>'nombre_comercial', r->>'codigo_interno'),
           coalesce(nullif(r->>'nombre_comercial', ''), r->>'razon_social', r->>'codigo_interno'), nullif(r->>'rif', ''), true,
           nullif(r->>'brick', ''), nullif(r->>'municipio', ''), nullif(r->>'estado_geografico', ''), nullif(r->>'direccion', ''),
           nullif(r->>'telefono', ''), nullif(r->>'bandera', ''),
           CASE WHEN r->>'lat' IS NOT NULL AND r->>'lon' IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint((r->>'lon')::float8, (r->>'lat')::float8), 4326)::geography END,
           (r->>'frecuencia_dias')::smallint, 'activo', 'oficina'
      FROM jsonb_array_elements(p) r WHERE coalesce(btrim(r->>'codigo_interno'), '') <> ''
    ON CONFLICT (codigo_interno) DO UPDATE SET razon_social = excluded.razon_social, nombre_comercial = excluded.nombre_comercial,
        rif = coalesce(excluded.rif, dim_clientes.rif), brick = excluded.brick, municipio = excluded.municipio,
        estado_geografico = excluded.estado_geografico, direccion = excluded.direccion, telefono = coalesce(excluded.telefono, dim_clientes.telefono),
        bandera = excluded.bandera, ubicacion = coalesce(excluded.ubicacion, dim_clientes.ubicacion),
        frecuencia_dias = coalesce(excluded.frecuencia_dias, dim_clientes.frecuencia_dias), deleted_at = NULL
    RETURNING 1)
  SELECT count(*) INTO v_n FROM ins;
  RETURN v_n;
END $$;

-- Droguerías desde archivo, por código: una celda vacía NO borra lo que ya había; el formato de exportación no se toca
-- (una droguería nueva recibe el de la base; una existente conserva el que se configuró).
CREATE OR REPLACE FUNCTION importar_catalogo_droguerias(p jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  WITH ins AS (
    INSERT INTO dim_droguerias (codigo, nombre, rif, email_pedidos, telefono, dias_entrega, activo)
    SELECT DISTINCT ON (upper(btrim(r->>'codigo'))) upper(btrim(r->>'codigo')), btrim(r->>'nombre'), nullif(btrim(r->>'rif'), ''),
           nullif(btrim(r->>'email_pedidos'), ''), nullif(btrim(r->>'telefono'), ''), (r->>'dias_entrega')::smallint,
           coalesce((r->>'activo')::boolean, true)
      FROM jsonb_array_elements(p) r
     WHERE coalesce(btrim(r->>'codigo'), '') <> '' AND coalesce(btrim(r->>'nombre'), '') <> ''
    ON CONFLICT (codigo) DO UPDATE SET nombre = excluded.nombre, rif = coalesce(excluded.rif, dim_droguerias.rif),
        email_pedidos = coalesce(excluded.email_pedidos, dim_droguerias.email_pedidos),
        telefono = coalesce(excluded.telefono, dim_droguerias.telefono),
        dias_entrega = coalesce(excluded.dias_entrega, dim_droguerias.dias_entrega), activo = excluded.activo, deleted_at = NULL
    RETURNING 1)
  SELECT count(*) INTO v_n FROM ins;
  -- Separador del archivo de pedidos (formulario de la droguería): solo si viene y es válido.
  UPDATE dim_droguerias d SET formato_export = jsonb_set(d.formato_export, '{delimitador}', to_jsonb(r->>'delimitador'))
    FROM jsonb_array_elements(p) r
   WHERE d.codigo = upper(btrim(r->>'codigo')) AND r->>'delimitador' IN (';', ',', '|', E'\t')
     AND d.formato_export->>'delimitador' IS DISTINCT FROM r->>'delimitador';
  RETURN v_n;
END $$;

-- Homologaciones por clave natural:
--   {"clientes":  [{"drogueria":"COBECA","codigo_interno":"CLI-001","codigo_cuenta":"C-88","nombre":"FARMACIA SAN JOSE","principal":false}],
--    "productos": [{"drogueria":"COBECA","sku":"SKU-1","codigo":"P-1","descripcion":"LOSARTAN 50 MG","principal":false}]}
-- Lo que no se puede resolver (droguería, farmacia o SKU inexistente; código ya usado por otra farmacia/producto) se
-- devuelve en "omitidos" para que el usuario lo corrija; el resto se guarda.
CREATE OR REPLACE FUNCTION importar_homologacion(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cli integer := 0; v_prod integer := 0; v_omit jsonb := '[]'::jsonb; v_omit2 jsonb;
BEGIN
  IF NOT app.es_mesa() THEN RAISE EXCEPTION 'Solo administrador o transferencista' USING ERRCODE = '42501'; END IF;

  -- Farmacias ------------------------------------------------------------------
  WITH src AS (
    SELECT t.ord, t.r->>'drogueria' AS drogueria, btrim(t.r->>'codigo_interno') AS codigo_interno,
           nullif(btrim(t.r->>'codigo_cuenta'), '') AS codigo_cuenta, nullif(btrim(t.r->>'nombre'), '') AS nombre,
           coalesce((t.r->>'principal')::boolean, false) AS principal
      FROM jsonb_array_elements(coalesce(p->'clientes', '[]'::jsonb)) WITH ORDINALITY AS t(r, ord)),
  res AS (
    SELECT s.*, d.id AS drogueria_id, c.id AS cliente_id
      FROM src s
      LEFT JOIN LATERAL (SELECT dd.id FROM dim_droguerias dd WHERE dd.deleted_at IS NULL
                          AND (app.norm_texto(dd.codigo) = app.norm_texto(s.drogueria) OR dd.nombre_normalizado = app.norm_texto(s.drogueria))
                          ORDER BY dd.activo DESC LIMIT 1) d ON true
      LEFT JOIN dim_clientes c ON c.codigo_interno = s.codigo_interno AND c.deleted_at IS NULL),
  mala AS (
    SELECT r.* FROM res r
     WHERE r.drogueria_id IS NULL OR r.cliente_id IS NULL OR (r.codigo_cuenta IS NULL AND app.norm_texto(r.nombre) IS NULL)
        OR EXISTS (SELECT 1 FROM map_cliente_drogueria m WHERE m.drogueria_id = r.drogueria_id AND m.deleted_at IS NULL
                    AND m.cliente_id <> r.cliente_id
                    AND ((r.codigo_cuenta IS NOT NULL AND m.codigo_cuenta = r.codigo_cuenta)
                         OR (r.codigo_cuenta IS NULL AND m.codigo_cuenta IS NULL AND m.nombre_normalizado = app.norm_texto(r.nombre))))),
  ins AS (
    INSERT INTO map_cliente_drogueria (drogueria_id, cliente_id, codigo_cuenta, nombre_en_drogueria, es_principal, origen)
    SELECT DISTINCT ON (r.drogueria_id, coalesce(r.codigo_cuenta, app.norm_texto(r.nombre)))
           r.drogueria_id, r.cliente_id, r.codigo_cuenta, r.nombre, r.principal, 'importacion'
      FROM res r
     WHERE r.drogueria_id IS NOT NULL AND r.cliente_id IS NOT NULL
       AND (r.codigo_cuenta IS NOT NULL OR app.norm_texto(r.nombre) IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM mala x WHERE x.ord = r.ord)
     ORDER BY r.drogueria_id, coalesce(r.codigo_cuenta, app.norm_texto(r.nombre)), r.principal DESC, r.ord
    ON CONFLICT DO NOTHING
    RETURNING 1)
  SELECT (SELECT count(*) FROM ins),
         (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', 'cliente', 'drogueria', drogueria, 'codigo_interno', codigo_interno,
                                                        'codigo_cuenta', codigo_cuenta, 'nombre', nombre)), '[]'::jsonb) FROM mala)
    INTO v_cli, v_omit;

  -- Productos ------------------------------------------------------------------
  WITH src AS (
    SELECT t.ord, t.r->>'drogueria' AS drogueria, btrim(t.r->>'sku') AS sku, btrim(t.r->>'codigo') AS codigo,
           nullif(btrim(t.r->>'descripcion'), '') AS descripcion, coalesce((t.r->>'principal')::boolean, false) AS principal
      FROM jsonb_array_elements(coalesce(p->'productos', '[]'::jsonb)) WITH ORDINALITY AS t(r, ord)),
  res AS (
    SELECT s.*, d.id AS drogueria_id, pr.id AS producto_id
      FROM src s
      LEFT JOIN LATERAL (SELECT dd.id FROM dim_droguerias dd WHERE dd.deleted_at IS NULL
                          AND (app.norm_texto(dd.codigo) = app.norm_texto(s.drogueria) OR dd.nombre_normalizado = app.norm_texto(s.drogueria))
                          ORDER BY dd.activo DESC LIMIT 1) d ON true
      LEFT JOIN dim_productos pr ON pr.sku = s.sku AND pr.deleted_at IS NULL),
  mala AS (
    SELECT r.* FROM res r
     WHERE r.drogueria_id IS NULL OR r.producto_id IS NULL OR coalesce(r.codigo, '') = ''
        OR EXISTS (SELECT 1 FROM map_producto_drogueria m WHERE m.drogueria_id = r.drogueria_id AND m.deleted_at IS NULL
                    AND m.codigo_drogueria = r.codigo AND m.producto_id <> r.producto_id)),
  ins AS (
    INSERT INTO map_producto_drogueria (drogueria_id, producto_id, codigo_drogueria, descripcion_drogueria, es_principal, origen)
    SELECT DISTINCT ON (r.drogueria_id, r.codigo) r.drogueria_id, r.producto_id, r.codigo, r.descripcion, r.principal, 'importacion'
      FROM res r
     WHERE r.drogueria_id IS NOT NULL AND r.producto_id IS NOT NULL AND coalesce(r.codigo, '') <> ''
       AND NOT EXISTS (SELECT 1 FROM mala x WHERE x.ord = r.ord)
     ORDER BY r.drogueria_id, r.codigo, r.principal DESC, r.ord
    ON CONFLICT DO NOTHING
    RETURNING 1)
  SELECT (SELECT count(*) FROM ins),
         (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', 'producto', 'drogueria', drogueria, 'sku', sku, 'codigo', codigo)), '[]'::jsonb) FROM mala)
    INTO v_prod, v_omit2;

  RETURN jsonb_build_object('clientes', v_cli, 'productos', v_prod, 'omitidos', v_omit || v_omit2);
END $$;

-- ------------------------------------------------------------------------------
-- 12. ANALÍTICA COMERCIAL: SEGMENTOS Y ALERTAS (regla 6). Ejecutar a diario (pg_cron / Edge Function).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalcular_segmentos_clientes() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  -- Ocasiones de compra = pedidos de Nova + meses con compras reportadas por las droguerías; unidades = ambas fuentes.
  WITH nova AS (
    SELECT p.cliente_id, count(DISTINCT p.id) AS pedidos, coalesce(sum(d.unidades_confirmadas), 0) AS unidades
      FROM fact_pedidos p LEFT JOIN fact_pedido_detalles d ON d.pedido_id = p.id
     WHERE p.created_at >= now() - interval '6 months' AND p.estado IN ('procesado_parcial','procesado_total','facturado')
     GROUP BY p.cliente_id
  ), sellout AS (
    SELECT cliente_id, count(DISTINCT periodo) AS pedidos, sum(unidades) AS unidades
      FROM fact_compras_mensual
     WHERE deleted_at IS NULL AND periodo >= date_trunc('month', now() - interval '6 months')::date
     GROUP BY cliente_id
  ), act AS (
    SELECT coalesce(n.cliente_id, o.cliente_id) AS cliente_id,
           coalesce(n.pedidos, 0) + coalesce(o.pedidos, 0) AS pedidos,
           coalesce(n.unidades, 0) + coalesce(o.unidades, 0) AS unidades
      FROM nova n FULL JOIN sellout o ON o.cliente_id = n.cliente_id
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
    SELECT producto_id, max(ultima) AS ultima FROM (
      SELECT d.producto_id, p.created_at AS ultima
        FROM fact_pedido_detalles d JOIN fact_pedidos p ON p.id = d.pedido_id
       WHERE p.estado NOT IN ('borrador','rechazado','cancelado')
      UNION ALL
      SELECT producto_id, ultima_compra::timestamptz FROM fact_compras_mensual WHERE deleted_at IS NULL) x
     GROUP BY producto_id
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
  colocado AS (
    SELECT p.cliente_id, d.producto_id
      FROM fact_pedido_detalles d JOIN fact_pedidos p ON p.id = d.pedido_id
     WHERE p.created_at >= now() - make_interval(days => v_dias) AND p.estado NOT IN ('borrador','rechazado','cancelado')
    UNION
    SELECT cliente_id, producto_id FROM fact_compras_mensual
     WHERE deleted_at IS NULL AND ultima_compra >= (now() - make_interval(days => v_dias))::date
  ), activos AS (
    SELECT DISTINCT producto_id FROM colocado
  ), ventas AS (
    SELECT DISTINCT c.brick, k.producto_id FROM colocado k JOIN dim_clientes c ON c.id = k.cliente_id
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
    SELECT cliente_id, max(ultimo) AS ultimo FROM (
      SELECT cliente_id, created_at AS ultimo FROM fact_pedidos WHERE estado NOT IN ('borrador','cancelado')
      UNION ALL
      SELECT cliente_id, ultima_compra::timestamptz FROM fact_compras_mensual WHERE deleted_at IS NULL) x
     GROUP BY cliente_id
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
    'pedido_bloqueos','crm_visitas','notificaciones',
    'alertas_comerciales','audit_log','import_lotes','fact_ventas_drogueria','fact_compras_mensual']
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
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING ((SELECT app.es_admin())) WITH CHECK ((SELECT app.es_admin()))',
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
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING ((SELECT app.es_mesa())) WITH CHECK ((SELECT app.es_mesa()))',
                   t || '_mesa', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS usuarios_lectura ON dim_usuarios;
CREATE POLICY usuarios_lectura ON dim_usuarios FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT app.es_staff()));
DROP POLICY IF EXISTS usuarios_admin ON dim_usuarios;
CREATE POLICY usuarios_admin ON dim_usuarios FOR ALL TO authenticated
  USING ((SELECT app.es_admin())) WITH CHECK ((SELECT app.es_admin()));

DROP POLICY IF EXISTS clientes_lectura ON dim_clientes;
-- creado_por se evalúa sobre la propia fila: INSERT ... ON CONFLICT exige poder "leer" la fila nueva.
CREATE POLICY clientes_lectura ON dim_clientes FOR SELECT TO authenticated
  USING ((SELECT app.es_staff()) OR creado_por = (SELECT auth.uid()) OR id IN (SELECT app.mis_clientes()));
DROP POLICY IF EXISTS clientes_alta_campo ON dim_clientes;
CREATE POLICY clientes_alta_campo ON dim_clientes FOR INSERT TO authenticated
  WITH CHECK ((SELECT app.rol()) = 'vendedor' OR (SELECT app.es_mesa()));
DROP POLICY IF EXISTS clientes_edicion ON dim_clientes;
CREATE POLICY clientes_edicion ON dim_clientes FOR UPDATE TO authenticated
  USING ((SELECT app.es_mesa()) OR (creado_por = (SELECT auth.uid()) AND estado_validacion = 'prospecto_pendiente'))
  WITH CHECK ((SELECT app.es_mesa()) OR creado_por = (SELECT auth.uid()));
DROP POLICY IF EXISTS clientes_baja ON dim_clientes;
CREATE POLICY clientes_baja ON dim_clientes FOR DELETE TO authenticated USING ((SELECT app.es_admin()));

DROP POLICY IF EXISTS relcv_lectura ON rel_cliente_vendedor;
CREATE POLICY relcv_lectura ON rel_cliente_vendedor FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()) OR (SELECT app.es_staff()));
DROP POLICY IF EXISTS relcv_admin ON rel_cliente_vendedor;
CREATE POLICY relcv_admin ON rel_cliente_vendedor FOR ALL TO authenticated
  USING ((SELECT app.es_mesa())) WITH CHECK ((SELECT app.es_mesa()));
DROP POLICY IF EXISTS relcv_propio ON rel_cliente_vendedor;
CREATE POLICY relcv_propio ON rel_cliente_vendedor FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = (SELECT auth.uid())
              AND EXISTS (SELECT 1 FROM dim_clientes c WHERE c.id = cliente_id AND c.creado_por = (SELECT auth.uid())));

-- Pedidos: lectura cruzada entre equipos por farmacia asignada (regla 5); edición del vendedor solo mientras es editable.
DROP POLICY IF EXISTS pedidos_lectura ON fact_pedidos;
CREATE POLICY pedidos_lectura ON fact_pedidos FOR SELECT TO authenticated
  USING (vendedor_id = (SELECT auth.uid()) OR (SELECT app.es_staff()) OR cliente_id IN (SELECT app.mis_clientes()));
DROP POLICY IF EXISTS pedidos_alta ON fact_pedidos;
CREATE POLICY pedidos_alta ON fact_pedidos FOR INSERT TO authenticated
  WITH CHECK (vendedor_id = (SELECT auth.uid()) OR (SELECT app.es_admin()));
DROP POLICY IF EXISTS pedidos_edicion_vendedor ON fact_pedidos;
CREATE POLICY pedidos_edicion_vendedor ON fact_pedidos FOR UPDATE TO authenticated
  USING (vendedor_id = (SELECT auth.uid()) AND estado IN ('borrador','enviado_teletransferencia','en_revision'))
  WITH CHECK (vendedor_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS pedidos_edicion_mesa ON fact_pedidos;
CREATE POLICY pedidos_edicion_mesa ON fact_pedidos FOR UPDATE TO authenticated
  USING ((SELECT app.es_mesa())) WITH CHECK ((SELECT app.es_mesa()));

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
  USING ((SELECT app.es_mesa())) WITH CHECK ((SELECT app.es_mesa()));

DROP POLICY IF EXISTS bloqueos_lectura ON pedido_bloqueos;
CREATE POLICY bloqueos_lectura ON pedido_bloqueos FOR SELECT TO authenticated USING ((SELECT app.es_staff()));

DROP POLICY IF EXISTS visitas_propias ON crm_visitas;
CREATE POLICY visitas_propias ON crm_visitas FOR ALL TO authenticated
  USING (vendedor_id = (SELECT auth.uid())) WITH CHECK (vendedor_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS visitas_staff ON crm_visitas;
CREATE POLICY visitas_staff ON crm_visitas FOR SELECT TO authenticated USING ((SELECT app.es_staff()));


DROP POLICY IF EXISTS notif_propias ON notificaciones;
CREATE POLICY notif_propias ON notificaciones FOR SELECT TO authenticated USING (usuario_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS notif_leer ON notificaciones;
CREATE POLICY notif_leer ON notificaciones FOR UPDATE TO authenticated
  USING (usuario_id = (SELECT auth.uid())) WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS alertas_lectura ON alertas_comerciales;
CREATE POLICY alertas_lectura ON alertas_comerciales FOR SELECT TO authenticated
  USING ((SELECT app.es_staff())
         OR equipo_id IS NULL AND cliente_id IS NOT NULL AND cliente_id IN (SELECT app.mis_clientes())
         OR equipo_id = (SELECT equipo_id FROM dim_usuarios WHERE id = (SELECT auth.uid())));

-- Ventas reportadas por las droguerías: solo lectura para el personal (se escriben con importar_ventas_drogueria).
DROP POLICY IF EXISTS lotes_lectura ON import_lotes;
CREATE POLICY lotes_lectura ON import_lotes FOR SELECT TO authenticated USING ((SELECT app.es_staff()));
DROP POLICY IF EXISTS ventas_lectura ON fact_ventas_drogueria;
CREATE POLICY ventas_lectura ON fact_ventas_drogueria FOR SELECT TO authenticated USING ((SELECT app.es_staff()));
-- El consolidado mensual baja al dispositivo del vendedor solo para las farmacias que atiende (todos los equipos).
DROP POLICY IF EXISTS compras_lectura ON fact_compras_mensual;
CREATE POLICY compras_lectura ON fact_compras_mensual FOR SELECT TO authenticated
  USING ((SELECT app.es_staff()) OR cliente_id IN (SELECT app.mis_clientes()));

DROP POLICY IF EXISTS audit_admin ON audit_log;
CREATE POLICY audit_admin ON audit_log FOR SELECT TO authenticated USING ((SELECT app.es_admin()));

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
-- 14B. ALTA DE USUARIOS
-- Toda cuenta nueva de Supabase Auth recibe su fila en dim_usuarios con el MÍNIMO privilegio y DESACTIVADA:
-- el rol y el equipo NUNCA se toman de los metadatos del registro (los fija quien se registra). Un administrador
-- la activa y le asigna rol/equipo con admin_configurar_usuario(). Sin fila activa, el usuario no ve datos (RLS).
-- El primer administrador se promueve una sola vez desde el SQL Editor (ver docs/ARQUITECTURA_OFFLINE_FIRST.md).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.nuevo_usuario_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO dim_usuarios (id, nombre_completo, email, rol, activo)
    VALUES (NEW.id,
            coalesce(nullif(btrim(NEW.raw_user_meta_data->>'nombre_completo'), ''), split_part(coalesce(NEW.email, 'usuario'), '@', 1)),
            coalesce(NEW.email, NEW.id::text || '@sin-correo.local'), 'vendedor', false)
    ON CONFLICT DO NOTHING;   -- cualquier choque (id o correo ya existente) no debe impedir el registro en Supabase Auth
  EXCEPTION WHEN OTHERS THEN
    -- Nunca bloquear el alta en Supabase Auth ("Database error creating new user"). Sin fila en dim_usuarios la cuenta
    -- no ve datos; un administrador la completa con app.promover_administrador o desde Configuración → Usuarios.
    RAISE WARNING 'NOVA: no se pudo crear dim_usuarios para % (%): %', NEW.id, NEW.email, SQLERRM;
  END;
  RETURN NEW;
END $$;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION app.nuevo_usuario_auth();
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sin permiso para crear el trigger en auth.users: créalo desde el SQL Editor con el rol postgres.';
END $$;

-- Primer administrador (o recuperación): se ejecuta desde el SQL Editor con el rol postgres. Crea la fila de
-- dim_usuarios si falta (cuenta creada antes de instalar v3) y la deja activa como admin.
--   SELECT app.promover_administrador('correo@ejemplo.com', 'Nombre Apellido');
CREATE OR REPLACE FUNCTION app.promover_administrador(p_email text, p_nombre text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_email text;
BEGIN
  SELECT id, email INTO v_id, v_email FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No existe una cuenta con el correo %. Créala primero en Authentication → Users → Add user.', p_email
      USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO dim_usuarios (id, nombre_completo, email, rol, activo)
  VALUES (v_id, coalesce(nullif(btrim(p_nombre), ''), split_part(v_email, '@', 1)), v_email, 'admin', true)
  ON CONFLICT (id) DO UPDATE
    SET rol = 'admin', activo = true, deleted_at = NULL,
        nombre_completo = coalesce(nullif(btrim(p_nombre), ''), dim_usuarios.nombre_completo);
  RETURN 'Listo: ' || v_email || ' es administrador activo.';
END $$;
REVOKE ALL ON FUNCTION app.promover_administrador(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION admin_configurar_usuario(p_usuario uuid, p_rol rol_usuario, p_equipo_codigo text DEFAULT NULL,
                                                    p_activo boolean DEFAULT true, p_nombre text DEFAULT NULL,
                                                    p_telefono text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_equipo uuid;
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  -- El equipo se identifica por su código ('A', 'ETICO'...). Si aún no existe se crea (solo lo hace un administrador);
  -- 'TODOS'/'AMBOS' significan sin equipo (visión completa).
  IF nullif(btrim(p_equipo_codigo), '') IS NOT NULL AND upper(btrim(p_equipo_codigo)) NOT IN ('TODOS', 'AMBOS') THEN
    INSERT INTO dim_equipos (codigo, nombre, linea) VALUES (upper(btrim(p_equipo_codigo)), 'Equipo ' || btrim(p_equipo_codigo), 'otro')
    ON CONFLICT (upper(codigo)) DO NOTHING;
    SELECT id INTO v_equipo FROM dim_equipos WHERE upper(codigo) = upper(btrim(p_equipo_codigo));
  END IF;
  -- No se permite quedarse sin administradores activos.
  IF p_usuario = auth.uid() AND (p_rol <> 'admin' OR NOT p_activo) THEN
    RAISE EXCEPTION 'No puedes quitarte a ti mismo el rol de administrador' USING ERRCODE = '42501';
  END IF;
  -- Activar a alguien dado de baja lo restaura.
  UPDATE dim_usuarios SET rol = p_rol, equipo_id = v_equipo, activo = p_activo, deleted_at = CASE WHEN p_activo THEN NULL ELSE deleted_at END,
         nombre_completo = coalesce(nullif(btrim(p_nombre), ''), nombre_completo), telefono = coalesce(p_telefono, telefono)
   WHERE id = p_usuario;
  IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no existe' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO audit_log (usuario_id, accion, detalle)
  VALUES (auth.uid(), 'usuario_configurado', jsonb_build_object('usuario', p_usuario, 'rol', p_rol, 'activo', p_activo));
END $$;
REVOKE ALL ON FUNCTION admin_configurar_usuario(uuid, rol_usuario, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_configurar_usuario(uuid, rol_usuario, text, boolean, text, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- 14C. FICHERO: qué farmacias atiende cada vendedor
-- Un vendedor solo ve las farmacias que tiene asignadas (RLS); la mesa y la gerencia ven todas.
-- ------------------------------------------------------------------------------
--   p_modo = 'agregar'    -> suma las farmacias indicadas al fichero del vendedor
--            'quitar'     -> retira esas farmacias de su fichero
--            'reemplazar' -> su fichero pasa a ser exactamente esa lista
-- Las farmacias se indican por código interno (ident01). Devuelve cuántas se asignaron/retiraron y cuáles no existen.
CREATE OR REPLACE FUNCTION asignar_clientes_vendedor(p_vendedor uuid, p_codigos text[], p_modo text DEFAULT 'agregar')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_equipo uuid; v_rol rol_usuario; v_asig integer := 0; v_quit integer := 0; v_faltan jsonb;
        v_codigos text[] := ARRAY(SELECT DISTINCT btrim(c) FROM unnest(coalesce(p_codigos, ARRAY[]::text[])) c WHERE btrim(c) <> '');
BEGIN
  -- El administrador asigna a cualquiera; un vendedor solo agrega o quita farmacias de SU propio fichero.
  IF NOT app.es_admin() AND NOT (p_vendedor = auth.uid() AND app.rol() = 'vendedor' AND p_modo IN ('agregar', 'quitar')) THEN
    RAISE EXCEPTION 'Solo el administrador, o el propio vendedor en su fichero' USING ERRCODE = '42501';
  END IF;
  IF p_modo NOT IN ('agregar', 'quitar', 'reemplazar') THEN RAISE EXCEPTION 'Modo inválido: %', p_modo USING ERRCODE = '22023'; END IF;
  SELECT rol, equipo_id INTO v_rol, v_equipo FROM dim_usuarios WHERE id = p_vendedor AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no existe' USING ERRCODE = 'P0002'; END IF;
  IF v_rol <> 'vendedor' THEN RAISE EXCEPTION 'Solo se asigna fichero a usuarios con rol vendedor' USING ERRCODE = '22023'; END IF;

  SELECT coalesce(jsonb_agg(c), '[]'::jsonb) INTO v_faltan
    FROM unnest(v_codigos) c WHERE NOT EXISTS (SELECT 1 FROM dim_clientes d WHERE d.codigo_interno = c AND d.deleted_at IS NULL);

  IF p_modo = 'reemplazar' THEN
    UPDATE rel_cliente_vendedor r SET activo = false, deleted_at = now()
     WHERE r.vendedor_id = p_vendedor AND r.deleted_at IS NULL
       AND r.cliente_id NOT IN (SELECT d.id FROM dim_clientes d WHERE d.codigo_interno = ANY (v_codigos));
    GET DIAGNOSTICS v_quit = ROW_COUNT;
  END IF;

  IF p_modo IN ('agregar', 'reemplazar') THEN
    INSERT INTO rel_cliente_vendedor (cliente_id, vendedor_id, equipo_id, es_titular, activo)
    SELECT d.id, p_vendedor, v_equipo, true, true FROM dim_clientes d WHERE d.codigo_interno = ANY (v_codigos) AND d.deleted_at IS NULL
    ON CONFLICT (cliente_id, vendedor_id) DO UPDATE SET activo = true, deleted_at = NULL, equipo_id = excluded.equipo_id
      WHERE NOT rel_cliente_vendedor.activo OR rel_cliente_vendedor.deleted_at IS NOT NULL OR rel_cliente_vendedor.equipo_id IS DISTINCT FROM excluded.equipo_id;
    GET DIAGNOSTICS v_asig = ROW_COUNT;
  ELSE
    UPDATE rel_cliente_vendedor r SET activo = false, deleted_at = now()
     WHERE r.vendedor_id = p_vendedor AND r.deleted_at IS NULL
       AND r.cliente_id IN (SELECT d.id FROM dim_clientes d WHERE d.codigo_interno = ANY (v_codigos));
    GET DIAGNOSTICS v_quit = ROW_COUNT;
  END IF;

  INSERT INTO audit_log (usuario_id, accion, detalle)
  VALUES (auth.uid(), 'fichero_asignado', jsonb_build_object('vendedor', p_vendedor, 'modo', p_modo, 'asignados', v_asig, 'retirados', v_quit));
  RETURN jsonb_build_object('asignados', v_asig, 'retirados', v_quit, 'no_encontrados', v_faltan);
END $$;
REVOKE ALL ON FUNCTION asignar_clientes_vendedor(uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION asignar_clientes_vendedor(uuid, text[], text) TO authenticated;

-- Farmacias activas que el vendedor que pregunta AÚN NO tiene en su fichero (para "Agregar farmacias" sin duplicar).
-- Muestra solo datos de identificación; la ficha completa se ve cuando la farmacia ya es suya (RLS).
CREATE OR REPLACE FUNCTION farmacias_disponibles(p_busqueda text DEFAULT NULL, p_limite integer DEFAULT 50)
RETURNS TABLE (codigo_interno text, nombre_comercial text, razon_social text, rif text, municipio text,
               estado_geografico text, bandera text, vendedores integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q text := app.norm_texto(p_busqueda);
BEGIN
  IF app.rol() IS NULL THEN RAISE EXCEPTION 'Usuario sin acceso' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT c.codigo_interno, c.nombre_comercial, c.razon_social, c.rif, c.municipio, c.estado_geografico, c.bandera,
         (SELECT count(*)::integer FROM rel_cliente_vendedor r2 WHERE r2.cliente_id = c.id AND r2.activo AND r2.deleted_at IS NULL)
    FROM dim_clientes c
   WHERE c.deleted_at IS NULL AND c.estado_validacion = 'activo' AND c.codigo_interno IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM rel_cliente_vendedor r
                      WHERE r.cliente_id = c.id AND r.vendedor_id = auth.uid() AND r.activo AND r.deleted_at IS NULL)
     AND (v_q IS NULL OR app.norm_texto(c.nombre_comercial || ' ' || c.razon_social || ' ' || c.codigo_interno || ' ' ||
                                        coalesce(c.rif, '') || ' ' || coalesce(c.municipio, '')) LIKE '%' || v_q || '%')
   ORDER BY c.nombre_comercial
   LIMIT least(greatest(coalesce(p_limite, 50), 1), 200);
END $$;
REVOKE ALL ON FUNCTION farmacias_disponibles(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION farmacias_disponibles(text, integer) TO authenticated;

-- ------------------------------------------------------------------------------
-- 14D. BAJA DE VARIOS REGISTROS A LA VEZ (selección múltiple en las pantallas del administrador)
-- Baja lógica (deleted_at): los pedidos e historial que los mencionan se conservan y los dispositivos los retiran al
-- sincronizar. Volver a cargar el mismo código (archivo o formulario) lo reactiva.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION eliminar_registros(p_tipo text, p_claves text[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer := 0;
        v_claves text[] := ARRAY(SELECT DISTINCT btrim(c) FROM unnest(coalesce(p_claves, ARRAY[]::text[])) c WHERE btrim(c) <> '');
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  IF p_tipo = 'clientes' THEN
    UPDATE dim_clientes SET deleted_at = now() WHERE deleted_at IS NULL AND codigo_interno = ANY (v_claves);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE rel_cliente_vendedor r SET activo = false, deleted_at = now()
      FROM dim_clientes c WHERE c.id = r.cliente_id AND c.codigo_interno = ANY (v_claves) AND r.deleted_at IS NULL;
  ELSIF p_tipo = 'productos' THEN
    UPDATE dim_productos SET deleted_at = now() WHERE deleted_at IS NULL AND sku = ANY (v_claves);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF p_tipo = 'droguerias' THEN
    UPDATE dim_droguerias SET deleted_at = now() WHERE deleted_at IS NULL AND codigo = ANY (v_claves);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF p_tipo = 'reglas' THEN
    UPDATE config_reglas_comerciales SET deleted_at = now(), activo = false WHERE deleted_at IS NULL AND id::text = ANY (v_claves);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Tipo inválido: %', p_tipo USING ERRCODE = '22023';
  END IF;
  INSERT INTO audit_log (usuario_id, accion, detalle)
  VALUES (auth.uid(), 'registros_eliminados', jsonb_build_object('tipo', p_tipo, 'cantidad', v_n, 'claves', to_jsonb(v_claves[1:50])));
  RETURN v_n;
END $$;

-- Usuarios: se desactivan y dan de baja (no pueden entrar ni ven datos). La cuenta de Supabase Auth se conserva: se borra,
-- si hace falta, desde Authentication → Users. Nadie puede darse de baja a sí mismo.
CREATE OR REPLACE FUNCTION admin_eliminar_usuarios(p_ids uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  IF auth.uid() = ANY (p_ids) THEN RAISE EXCEPTION 'No puedes eliminar tu propia cuenta' USING ERRCODE = '42501'; END IF;
  UPDATE dim_usuarios SET activo = false, deleted_at = now() WHERE id = ANY (p_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE rel_cliente_vendedor SET activo = false, deleted_at = now() WHERE vendedor_id = ANY (p_ids) AND deleted_at IS NULL;
  INSERT INTO audit_log (usuario_id, accion, detalle) VALUES (auth.uid(), 'usuarios_eliminados', jsonb_build_object('cantidad', v_n));
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION eliminar_registros(text, text[]), admin_eliminar_usuarios(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION eliminar_registros(text, text[]), admin_eliminar_usuarios(uuid[]) TO authenticated;

-- ------------------------------------------------------------------------------
-- 15. MANTENIMIENTO: BORRADO DE DATOS CON CLAVE
-- ------------------------------------------------------------------------------
-- Protecciones: rol administrador + "borrado habilitado" (interruptor de config_sistema) + clave propia (bcrypt, distinta de
-- la de inicio de sesión) + máximo 5 intentos fallidos cada 15 minutos. Cada uso queda en audit_log.
-- Nunca se tocan usuarios, equipos, configuración, secretos ni auditoría.
--   alcance 'historial'       -> ventas reportadas por las droguerías, sus lotes y el consolidado mensual
--   alcance 'pedidos'         -> pedidos, detalles, visitas, notificaciones y alertas (el correlativo reinicia)
--   alcance 'homologaciones'  -> códigos de farmacias y productos por droguería; las ventas vuelven a "sin homologar"
--   alcance 'fichero'         -> asignación de farmacias a vendedores
--   alcance 'clientes'        -> farmacias + pedidos (dependen de ellas), fichero y homologaciones de farmacias;
--                                las ventas se conservan sin farmacia
--   alcance 'productos'       -> productos + pedidos (dependen de ellos) y homologaciones de productos;
--                                las ventas se conservan sin producto
--   alcance 'droguerias'      -> droguerías + pedidos, ventas, homologaciones, precios y reglas de esa droguería
--   alcance 'todo'            -> todo lo anterior y las reglas comerciales
CREATE OR REPLACE FUNCTION configurar_password_purga(p_nueva text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  IF length(coalesce(p_nueva, '')) < 6 THEN RAISE EXCEPTION 'La clave debe tener al menos 6 caracteres' USING ERRCODE = '22023'; END IF;
  INSERT INTO secretos_sistema (clave, hash) VALUES ('purga_admin', crypt(p_nueva, gen_salt('bf', 10)))
  ON CONFLICT (clave) DO UPDATE SET hash = excluded.hash, updated_at = now();
  INSERT INTO audit_log (usuario_id, accion) VALUES (auth.uid(), 'purga_password_configurada');
END $$;

-- Interruptor: el borrado solo funciona con esto activo (déjalo apagado en producción).
CREATE OR REPLACE FUNCTION habilitar_borrado(p_habilitar boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  UPDATE config_sistema SET valor = to_jsonb(p_habilitar), updated_at = clock_timestamp() WHERE clave = 'purga_habilitada';
  INSERT INTO audit_log (usuario_id, accion, detalle) VALUES (auth.uid(), 'borrado_habilitado', jsonb_build_object('habilitado', p_habilitar));
END $$;

CREATE OR REPLACE FUNCTION estado_borrado() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Solo administrador' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'clave_definida', EXISTS (SELECT 1 FROM secretos_sistema WHERE clave = 'purga_admin'),
    'habilitado', coalesce((SELECT (valor #>> '{}')::boolean FROM config_sistema WHERE clave = 'purga_habilitada'), false));
END $$;

CREATE OR REPLACE FUNCTION borrar_datos(p_clave text, p_alcance text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_hash text; v_fallos integer;
BEGIN
  IF NOT app.es_admin() THEN RAISE EXCEPTION 'Permiso denegado' USING ERRCODE = '42501'; END IF;
  IF p_alcance NOT IN ('historial', 'pedidos', 'homologaciones', 'fichero', 'clientes', 'productos', 'droguerias', 'todo') THEN
    RAISE EXCEPTION 'Alcance inválido: %', p_alcance USING ERRCODE = '22023';
  END IF;
  IF coalesce((SELECT (valor #>> '{}')::boolean FROM config_sistema WHERE clave = 'purga_habilitada'), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'El borrado está deshabilitado: actívalo primero en Configuración' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_fallos FROM audit_log
   WHERE usuario_id = auth.uid() AND accion = 'purga_intento_fallido' AND created_at > now() - interval '15 minutes';
  IF v_fallos >= 5 THEN RETURN jsonb_build_object('ok', false, 'error', 'demasiados_intentos'); END IF;

  SELECT hash INTO v_hash FROM secretos_sistema WHERE clave = 'purga_admin';
  IF v_hash IS NULL OR p_clave IS NULL OR crypt(p_clave, v_hash) <> v_hash THEN
    INSERT INTO audit_log (usuario_id, accion) VALUES (auth.uid(), 'purga_intento_fallido');
    RETURN jsonb_build_object('ok', false, 'error', 'credenciales_invalidas');
  END IF;

  IF p_alcance IN ('historial', 'droguerias', 'todo') THEN
    TRUNCATE fact_compras_mensual, fact_ventas_drogueria, import_lotes RESTART IDENTITY CASCADE;
  END IF;
  IF p_alcance IN ('pedidos', 'clientes', 'productos', 'droguerias', 'todo') THEN
    TRUNCATE fact_pedido_detalles, pedido_bloqueos, notificaciones, crm_visitas, alertas_comerciales,
             fact_pedidos RESTART IDENTITY CASCADE;
    PERFORM setval('seq_correlativo_pedido', 1001, false);
  END IF;
  IF p_alcance = 'homologaciones' THEN
    TRUNCATE map_producto_drogueria, map_cliente_drogueria;
    UPDATE fact_ventas_drogueria SET cliente_id = NULL, producto_id = NULL WHERE cliente_id IS NOT NULL OR producto_id IS NOT NULL;
    TRUNCATE fact_compras_mensual;
  END IF;
  IF p_alcance = 'fichero' THEN
    TRUNCATE rel_cliente_vendedor;
  END IF;
  IF p_alcance = 'clientes' THEN
    UPDATE fact_ventas_drogueria SET cliente_id = NULL WHERE cliente_id IS NOT NULL;
    TRUNCATE fact_compras_mensual;
    DELETE FROM dim_clientes;                -- en cascada: fichero y homologaciones de farmacias
  END IF;
  IF p_alcance = 'productos' THEN
    UPDATE fact_ventas_drogueria SET producto_id = NULL WHERE producto_id IS NOT NULL;
    TRUNCATE fact_compras_mensual;
    DELETE FROM dim_productos;               -- en cascada: homologaciones y precios de productos
  END IF;
  IF p_alcance = 'droguerias' THEN
    DELETE FROM config_reglas_comerciales WHERE drogueria_id IS NOT NULL;
    DELETE FROM dim_droguerias;              -- en cascada: homologaciones y precios de cada droguería
  END IF;
  IF p_alcance = 'todo' THEN
    TRUNCATE map_producto_drogueria, map_cliente_drogueria, precios_drogueria_producto, rel_cliente_vendedor,
             config_reglas_comerciales, dim_clientes, dim_productos, dim_droguerias RESTART IDENTITY CASCADE;
  END IF;

  INSERT INTO audit_log (usuario_id, accion, detalle) VALUES (auth.uid(), 'purga_ejecutada', jsonb_build_object('alcance', p_alcance));
  RETURN jsonb_build_object('ok', true, 'alcance', p_alcance);
END $$;

-- Firma original (solo_transaccional): se conserva y usa el mismo mecanismo.
CREATE OR REPLACE FUNCTION purgar_base_datos_pruebas(admin_pass text, solo_transaccional boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT borrar_datos(admin_pass, CASE WHEN solo_transaccional THEN 'pedidos' ELSE 'todo' END)
$$;

REVOKE ALL ON FUNCTION purgar_base_datos_pruebas(text, boolean), borrar_datos(text, text), habilitar_borrado(boolean), estado_borrado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION purgar_base_datos_pruebas(text, boolean), borrar_datos(text, text), habilitar_borrado(boolean), estado_borrado() TO authenticated;
REVOKE ALL ON FUNCTION configurar_password_purga(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION configurar_password_purga(text) TO authenticated;
REVOKE ALL ON FUNCTION finalizar_lote_ventas(uuid), resumen_ventas_nube(), importar_catalogo_droguerias(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finalizar_lote_ventas(uuid), resumen_ventas_nube(), importar_catalogo_droguerias(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION importar_ventas_drogueria(jsonb, jsonb), borrar_lote_ventas(uuid), refrescar_compras_mensual(date),
  importar_catalogo_productos(jsonb), importar_catalogo_clientes(jsonb), importar_homologacion(jsonb),
  reprocesar_homologacion(uuid), homologar_cliente(uuid, uuid, text, text, boolean),
  homologar_producto(uuid, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION importar_ventas_drogueria(jsonb, jsonb), borrar_lote_ventas(uuid), refrescar_compras_mensual(date),
  importar_catalogo_productos(jsonb), importar_catalogo_clientes(jsonb), importar_homologacion(jsonb),
  reprocesar_homologacion(uuid), homologar_cliente(uuid, uuid, text, text, boolean),
  homologar_producto(uuid, uuid, text, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION recalcular_segmentos_clientes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION generar_alertas_comerciales() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION recalcular_segmentos_clientes(), generar_alertas_comerciales() TO authenticated;

-- Programación diaria (si pg_cron está habilitado en el proyecto):
--   SELECT cron.schedule('nova-analitica', '0 5 * * *',
--          $$SELECT recalcular_segmentos_clientes(); SELECT generar_alertas_comerciales();$$);

-- ------------------------------------------------------------------------------
-- 16. NOVEDADES: código de la farmacia desde el pedido, plantillas, comunicados, accesos, metas y tiempo real
-- ------------------------------------------------------------------------------

-- 16.1 Código de la farmacia en una droguería, registrado UNA vez por quien toma el pedido (o por la mesa).
-- Sin ese código la droguería no reconoce al cliente y el pedido no puede transferirse; la app no deja enviarlo sin él.
-- Idempotente (el id lo genera el dispositivo): reintentar no duplica. Un código pertenece a una sola farmacia por droguería.
CREATE OR REPLACE FUNCTION sync_registrar_codigo_farmacia(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id      uuid := coalesce(nullif(p->>'id','')::uuid, gen_random_uuid());
  v_cliente uuid := nullif(p->>'cliente_id','')::uuid;
  v_drog    uuid := nullif(p->>'drogueria_id','')::uuid;
  v_codigo  text := nullif(btrim(p->>'codigo'), '');
  v_fila    map_cliente_drogueria;
  v_otro_id uuid; v_otro_cliente uuid; v_otro_nombre text;
BEGIN
  IF app.rol() IS NULL THEN RAISE EXCEPTION 'Sesión no válida' USING ERRCODE = '42501'; END IF;
  IF v_cliente IS NULL OR v_drog IS NULL THEN RAISE EXCEPTION 'Faltan la farmacia o la droguería' USING ERRCODE = '22023'; END IF;
  IF v_codigo IS NULL THEN RAISE EXCEPTION 'Escribe el código de la farmacia en la droguería' USING ERRCODE = '22023'; END IF;
  IF length(v_codigo) > 60 THEN RAISE EXCEPTION 'El código es demasiado largo' USING ERRCODE = '22023'; END IF;
  IF NOT (app.es_mesa() OR app.puede_ver_cliente(v_cliente)) THEN
    RAISE EXCEPTION 'Solo puedes registrar códigos de las farmacias que atiendes' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fila FROM map_cliente_drogueria WHERE id = v_id;
  IF FOUND THEN RETURN to_jsonb(v_fila); END IF;   -- reintento de la misma operación

  SELECT m.id, m.cliente_id, c.nombre_comercial INTO v_otro_id, v_otro_cliente, v_otro_nombre
    FROM map_cliente_drogueria m JOIN dim_clientes c ON c.id = m.cliente_id
   WHERE m.drogueria_id = v_drog AND m.codigo_cuenta = v_codigo AND m.deleted_at IS NULL;
  IF v_otro_id IS NOT NULL THEN
    IF v_otro_cliente <> v_cliente THEN
      RAISE EXCEPTION 'El código % ya es de otra farmacia en esa droguería (%)', v_codigo, v_otro_nombre USING ERRCODE = '23505';
    END IF;
    UPDATE map_cliente_drogueria SET es_principal = true, verificado = true WHERE id = v_otro_id RETURNING * INTO v_fila;
    RETURN to_jsonb(v_fila);
  END IF;

  -- El nuevo código pasa a ser el principal (el trigger degrada el anterior, que queda como alterno).
  INSERT INTO map_cliente_drogueria (id, drogueria_id, cliente_id, codigo_cuenta, verificado, es_principal, origen)
  VALUES (v_id, v_drog, v_cliente, v_codigo, true, true, 'manual')
  RETURNING * INTO v_fila;
  RETURN to_jsonb(v_fila);
END $$;
REVOKE ALL ON FUNCTION sync_registrar_codigo_farmacia(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_registrar_codigo_farmacia(jsonb) TO authenticated;

-- 16.2 Plantillas de pedido: lo que una farmacia pide siempre (se guardan al dictar o desde el carrito).
CREATE TABLE IF NOT EXISTS plantillas_pedido (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES dim_usuarios(id) ON DELETE CASCADE,
  cliente_id   uuid NOT NULL REFERENCES dim_clientes(id) ON DELETE CASCADE,
  drogueria_id uuid REFERENCES dim_droguerias(id) ON DELETE SET NULL,
  nombre       text NOT NULL CHECK (btrim(nombre) <> ''),
  lineas       jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(lineas) = 'array'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version  integer NOT NULL DEFAULT 1,
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_plantillas_vendedor ON plantillas_pedido (vendedor_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_plantillas_updated ON plantillas_pedido (updated_at);

-- Guardar o borrar una plantilla desde el dispositivo (cola Outbox): idempotente por id; solo las propias.
CREATE OR REPLACE FUNCTION sync_guardar_plantilla(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_row plantillas_pedido;
BEGIN
  INSERT INTO plantillas_pedido (id, vendedor_id, cliente_id, drogueria_id, nombre, lineas, deleted_at)
  VALUES ((p->>'id')::uuid, auth.uid(), (p->>'cliente_id')::uuid, nullif(p->>'drogueria_id','')::uuid,
          coalesce(nullif(btrim(p->>'nombre'),''), 'Plantilla'), coalesce(p->'lineas', '[]'::jsonb),
          CASE WHEN (p->>'eliminar')::boolean THEN now() END)
  ON CONFLICT (id) DO UPDATE
    SET nombre = excluded.nombre, drogueria_id = excluded.drogueria_id, lineas = excluded.lineas,
        deleted_at = excluded.deleted_at
    WHERE plantillas_pedido.vendedor_id = auth.uid()
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Esa plantilla no es tuya' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('id', v_row.id, 'row_version', v_row.row_version);
END $$;
REVOKE ALL ON FUNCTION sync_guardar_plantilla(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_guardar_plantilla(jsonb) TO authenticated;

-- 16.3 Comunicados: anuncios, descuentos, estrategias o alertas para todos o por rol, equipo, estado, ciudad o región.
-- Listas vacías = sin filtro. Estado y ciudad coinciden con los datos del usuario o con las farmacias de su fichero.
ALTER TABLE dim_usuarios ADD COLUMN IF NOT EXISTS estado_geografico text;
ALTER TABLE dim_usuarios ADD COLUMN IF NOT EXISTS ciudad text;
ALTER TABLE dim_usuarios ADD COLUMN IF NOT EXISTS region text;

CREATE TABLE IF NOT EXISTS comunicados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        text NOT NULL CHECK (btrim(titulo) <> ''),
  mensaje       text NOT NULL DEFAULT '',
  tipo          text NOT NULL DEFAULT 'anuncio' CHECK (tipo IN ('anuncio','descuento','estrategia','alerta')),
  roles         text[] NOT NULL DEFAULT '{}',
  equipos       uuid[] NOT NULL DEFAULT '{}',
  estados       text[] NOT NULL DEFAULT '{}',
  ciudades      text[] NOT NULL DEFAULT '{}',
  regiones      text[] NOT NULL DEFAULT '{}',
  vigente_desde timestamptz NOT NULL DEFAULT now(),
  vigente_hasta timestamptz,
  creado_por    uuid DEFAULT auth.uid() REFERENCES dim_usuarios(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version   integer NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_comunicados_updated ON comunicados (updated_at);

-- ¿Este comunicado es para quien consulta? (se evalúa en la política y como columna calculada `para_mi`).
CREATE OR REPLACE FUNCTION app.comunicado_visible(p_roles text[], p_equipos uuid[], p_estados text[], p_ciudades text[], p_regiones text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (
    SELECT rol::text AS rol, equipo_id, app.norm_texto(estado_geografico) AS estado, app.norm_texto(ciudad) AS ciudad,
           app.norm_texto(region) AS region
      FROM dim_usuarios WHERE id = auth.uid() AND activo AND deleted_at IS NULL
  ),
  f AS (SELECT DISTINCT app.norm_texto(c.estado_geografico) AS estado, app.norm_texto(c.municipio) AS ciudad
          FROM dim_clientes c WHERE c.id IN (SELECT app.mis_clientes()))
  SELECT EXISTS (
    SELECT 1 FROM u
     WHERE (cardinality(p_roles) = 0 OR u.rol = ANY (p_roles))
       AND (cardinality(p_equipos) = 0 OR u.equipo_id = ANY (p_equipos))
       AND (cardinality(p_regiones) = 0 OR u.region IN (SELECT app.norm_texto(x) FROM unnest(p_regiones) x))
       AND (cardinality(p_estados) = 0
            OR u.estado IN (SELECT app.norm_texto(x) FROM unnest(p_estados) x)
            OR EXISTS (SELECT 1 FROM f WHERE f.estado IN (SELECT app.norm_texto(x) FROM unnest(p_estados) x)))
       AND (cardinality(p_ciudades) = 0
            OR u.ciudad IN (SELECT app.norm_texto(x) FROM unnest(p_ciudades) x)
            OR EXISTS (SELECT 1 FROM f WHERE f.ciudad IN (SELECT app.norm_texto(x) FROM unnest(p_ciudades) x)))
  )
$$;

-- Columna calculada para la API: GET /comunicados?select=*,para_mi
CREATE OR REPLACE FUNCTION para_mi(c comunicados) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT app.comunicado_visible(c.roles, c.equipos, c.estados, c.ciudades, c.regiones)
$$;
GRANT EXECUTE ON FUNCTION para_mi(comunicados) TO authenticated;

-- Opciones para dirigir un comunicado: estados y ciudades de las farmacias y de los usuarios, y regiones de los usuarios.
CREATE OR REPLACE FUNCTION zonas_disponibles() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN coalesce(app.rol()::text, '') IN ('admin','gerente') THEN jsonb_build_object(
    'estados', (SELECT coalesce(jsonb_agg(x ORDER BY x), '[]') FROM (
                  SELECT DISTINCT btrim(estado_geografico) x FROM dim_clientes WHERE deleted_at IS NULL AND btrim(coalesce(estado_geografico,'')) <> ''
                  UNION SELECT DISTINCT btrim(estado_geografico) FROM dim_usuarios WHERE btrim(coalesce(estado_geografico,'')) <> '') e),
    'ciudades', (SELECT coalesce(jsonb_agg(x ORDER BY x), '[]') FROM (
                  SELECT DISTINCT btrim(municipio) x FROM dim_clientes WHERE deleted_at IS NULL AND btrim(coalesce(municipio,'')) <> ''
                  UNION SELECT DISTINCT btrim(ciudad) FROM dim_usuarios WHERE btrim(coalesce(ciudad,'')) <> '') c),
    'regiones', (SELECT coalesce(jsonb_agg(DISTINCT btrim(region)), '[]') FROM dim_usuarios WHERE btrim(coalesce(region,'')) <> ''),
    'equipos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', coalesce(nombre, codigo)) ORDER BY codigo), '[]') FROM dim_equipos))
  ELSE '{}'::jsonb END
$$;
REVOKE ALL ON FUNCTION zonas_disponibles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zonas_disponibles() TO authenticated;

-- 16.4 Registro de accesos: quién entra a la app y cuántas veces (inicio de sesión o apertura con la sesión guardada).
CREATE TABLE IF NOT EXISTS registro_accesos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES dim_usuarios(id) ON DELETE CASCADE,
  evento      text NOT NULL CHECK (evento IN ('inicio_sesion','apertura')),
  dispositivo text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accesos_usuario ON registro_accesos (usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accesos_fecha ON registro_accesos (created_at);

-- Una apertura se cuenta como máximo una vez cada 30 minutos por persona (recargar la página no infla el conteo).
CREATE OR REPLACE FUNCTION registrar_acceso(p_evento text, p_dispositivo text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM dim_usuarios WHERE id = auth.uid()) THEN RETURN; END IF;
  IF p_evento NOT IN ('inicio_sesion','apertura') THEN RAISE EXCEPTION 'Evento no válido' USING ERRCODE = '22023'; END IF;
  IF p_evento = 'apertura' AND EXISTS (SELECT 1 FROM registro_accesos WHERE usuario_id = auth.uid()
                                        AND created_at > now() - interval '30 minutes') THEN
    RETURN;
  END IF;
  INSERT INTO registro_accesos (usuario_id, evento, dispositivo) VALUES (auth.uid(), p_evento, left(p_dispositivo, 200));
END $$;

-- Resumen por persona (incluye a quien no entró). Solo administración y gerencia.
CREATE OR REPLACE FUNCTION reporte_accesos(p_desde date, p_hasta date)
RETURNS TABLE (usuario_id uuid, nombre text, email text, rol text, inicios_sesion integer, aperturas integer,
               dias_activos integer, ultimo_acceso timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(app.rol()::text, '') NOT IN ('admin','gerente') THEN
    RAISE EXCEPTION 'Solo administración y gerencia ven los accesos' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT u.id, u.nombre_completo, u.email, u.rol::text,
         count(*) FILTER (WHERE a.evento = 'inicio_sesion')::integer,
         count(*) FILTER (WHERE a.evento = 'apertura')::integer,
         count(DISTINCT (a.created_at AT TIME ZONE 'America/Caracas')::date)::integer,
         (SELECT max(x.created_at) FROM registro_accesos x WHERE x.usuario_id = u.id)
    FROM dim_usuarios u
    LEFT JOIN registro_accesos a ON a.usuario_id = u.id
         AND a.created_at >= p_desde AND a.created_at < p_hasta + 1
   WHERE u.deleted_at IS NULL
   GROUP BY u.id
   ORDER BY count(a.id) DESC, u.nombre_completo;
END $$;
REVOKE ALL ON FUNCTION registrar_acceso(text, text), reporte_accesos(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registrar_acceso(text, text), reporte_accesos(date, date) TO authenticated;

-- 16.5 Metas del mes: por representante, por farmacia, por droguería, o cualquier combinación de las tres.
-- Mide unidades, pedidos o farmacias con pedido. El avance se calcula en la app con los pedidos del mes.
CREATE TABLE IF NOT EXISTS metas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo      date NOT NULL CHECK (date_trunc('month', periodo)::date = periodo),
  vendedor_id  uuid REFERENCES dim_usuarios(id) ON DELETE CASCADE,
  cliente_id   uuid REFERENCES dim_clientes(id) ON DELETE CASCADE,
  drogueria_id uuid REFERENCES dim_droguerias(id) ON DELETE CASCADE,
  indicador    text NOT NULL DEFAULT 'unidades' CHECK (indicador IN ('unidades','pedidos','farmacias')),
  objetivo     numeric(14,2) NOT NULL CHECK (objetivo > 0),
  creado_por   uuid DEFAULT auth.uid() REFERENCES dim_usuarios(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version  integer NOT NULL DEFAULT 1,
  deleted_at   timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_metas ON metas (periodo, indicador,
  coalesce(vendedor_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(drogueria_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_metas_updated ON metas (updated_at);

-- Totales por mes para el Resumen (todo el historial, no solo lo que guarda el dispositivo). Respeta la seguridad por
-- filas de quien consulta; un vendedor pasa su propio id para ver solo lo suyo.
CREATE OR REPLACE FUNCTION resumen_pedidos_mensual(p_meses integer DEFAULT 12, p_vendedor uuid DEFAULT NULL)
RETURNS TABLE (mes date, pedidos bigint, unidades bigint, farmacias bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT date_trunc('month', p.created_at AT TIME ZONE 'America/Caracas')::date,
         count(DISTINCT p.id), coalesce(sum(d.unidades_solicitadas), 0)::bigint, count(DISTINCT p.cliente_id)
    FROM fact_pedidos p
    LEFT JOIN fact_pedido_detalles d ON d.pedido_id = p.id AND d.deleted_at IS NULL
   WHERE p.deleted_at IS NULL
     AND p.estado::text NOT IN ('borrador','cancelado','rechazado')
     AND p.created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Caracas') - make_interval(months => greatest(p_meses, 1) - 1)) AT TIME ZONE 'America/Caracas'
     AND (p_vendedor IS NULL OR p.vendedor_id = p_vendedor)
   GROUP BY 1
   ORDER BY 1
$$;
REVOKE ALL ON FUNCTION resumen_pedidos_mensual(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resumen_pedidos_mensual(integer, uuid) TO authenticated;

-- 16.6 Marcas de tiempo, seguridad por filas y tiempo real de las tablas nuevas.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plantillas_pedido','comunicados','metas'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_touch BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.touch()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['plantillas_pedido','comunicados','metas','registro_accesos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS plantillas_propias ON plantillas_pedido;
CREATE POLICY plantillas_propias ON plantillas_pedido FOR ALL TO authenticated
  USING (vendedor_id = (SELECT auth.uid()))
  WITH CHECK (vendedor_id = (SELECT auth.uid()) AND ((SELECT app.es_staff()) OR cliente_id IN (SELECT app.mis_clientes())));
DROP POLICY IF EXISTS plantillas_staff ON plantillas_pedido;
CREATE POLICY plantillas_staff ON plantillas_pedido FOR SELECT TO authenticated USING ((SELECT app.es_staff()));

-- La gerencia y la administración ven y publican todos; el resto solo recibe los que le corresponden.
DROP POLICY IF EXISTS comunicados_lectura ON comunicados;
CREATE POLICY comunicados_lectura ON comunicados FOR SELECT TO authenticated
  USING ((SELECT app.rol())::text IN ('admin','gerente') OR app.comunicado_visible(roles, equipos, estados, ciudades, regiones));
DROP POLICY IF EXISTS comunicados_gestion ON comunicados;
CREATE POLICY comunicados_gestion ON comunicados FOR ALL TO authenticated
  USING ((SELECT app.rol())::text IN ('admin','gerente')) WITH CHECK ((SELECT app.rol())::text IN ('admin','gerente'));

DROP POLICY IF EXISTS accesos_lectura ON registro_accesos;
CREATE POLICY accesos_lectura ON registro_accesos FOR SELECT TO authenticated
  USING ((SELECT app.rol())::text IN ('admin','gerente'));

-- Un representante ve sus metas y las de las farmacias de su fichero que no son de otro representante.
DROP POLICY IF EXISTS metas_lectura ON metas;
CREATE POLICY metas_lectura ON metas FOR SELECT TO authenticated
  USING ((SELECT app.es_staff()) OR vendedor_id = (SELECT auth.uid())
         OR (vendedor_id IS NULL AND cliente_id IN (SELECT app.mis_clientes())));
DROP POLICY IF EXISTS metas_gestion ON metas;
CREATE POLICY metas_gestion ON metas FOR ALL TO authenticated
  USING ((SELECT app.rol())::text IN ('admin','gerente')) WITH CHECK ((SELECT app.rol())::text IN ('admin','gerente'));

REVOKE ALL ON plantillas_pedido, comunicados, metas, registro_accesos FROM anon;

-- Tiempo real: la app se actualiza sola cuando cambian estas tablas (además consulta cada pocos segundos por si acaso).
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['fact_pedidos','fact_pedido_detalles','notificaciones','comunicados','metas','plantillas_pedido',
                             'config_reglas_comerciales','map_cliente_drogueria','map_producto_drogueria','dim_droguerias',
                             'rel_cliente_vendedor'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
