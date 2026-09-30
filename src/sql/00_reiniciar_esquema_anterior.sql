-- ==============================================================================
-- NOVA · PREPARAR UN PROYECTO QUE TIENE UNA VERSIÓN ANTERIOR
-- Ejecutar en el SQL Editor de Supabase SOLO si nova_produccion_v3.sql se detuvo con el aviso
-- "Este proyecto tiene tablas de una version anterior de NOVA".
--
-- Qué hace (todo o nada: si algo falla, no cambia nada):
--   1. Quita los triggers antiguos de auth.users (causa de "Database error creating new user").
--   2. Mueve TODO lo que haya en el esquema public (tablas con sus datos, vistas, funciones y tipos)
--      a un esquema de respaldo nuevo: nova_anterior_AAAAMMDD_HHMMSS. No borra datos.
--   3. Muestra al final la lista de lo que hizo.
--
-- Qué NO toca: los usuarios de Supabase (auth.users), storage, las extensiones ni los demás esquemas de Supabase.
--
-- Se niega a actuar si public ya tiene el esquema v3 (para no apartar una base en uso por error).
-- Después: ejecutar nova_produccion_v3.sql.
-- Cuando confirmes que no necesitas lo anterior, puedes borrar el respaldo (irreversible):
--   DROP SCHEMA nova_anterior_AAAAMMDD_HHMMSS CASCADE;     -- usa el nombre que muestra el resultado
-- ==============================================================================

CREATE TEMP TABLE IF NOT EXISTS _nova_reinicio (paso int, objeto text, accion text);
TRUNCATE _nova_reinicio;

DO $$
DECLARE
  v_respaldo text := 'nova_anterior_' || to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS');
  v_paso     int  := 0;
  r          record;
BEGIN
  -- 0) Protección: si public ya es NOVA v3, no se aparta nada.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'dim_clientes' AND column_name = 'codigo_interno') THEN
    RAISE EXCEPTION 'Este proyecto ya tiene NOVA v3 instalado: no hace falta este script. Ejecuta directamente nova_produccion_v3.sql.'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE format('CREATE SCHEMA %I', v_respaldo);
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', v_respaldo);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM anon, authenticated', v_respaldo);
  END IF;
  INSERT INTO _nova_reinicio VALUES (v_paso, v_respaldo, 'esquema de respaldo creado');

  -- 1) Triggers antiguos sobre auth.users. NOVA v3 crea el suyo (on_auth_user_created) al instalarse.
  v_paso := 1;
  FOR r IN SELECT t.tgname, t.tgfoid::regprocedure::text AS funcion
             FROM pg_trigger t
            WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal
  LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER %I ON auth.users', r.tgname);
      INSERT INTO _nova_reinicio VALUES (v_paso, 'auth.users: ' || r.tgname || ' -> ' || r.funcion, 'trigger eliminado');
    EXCEPTION WHEN insufficient_privilege THEN
      -- Sin permiso para quitarlo: se deja inofensivo (su función ya no hace nada) para que el alta no falle.
      EXECUTE format('CREATE OR REPLACE FUNCTION %s RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$', r.funcion);
      INSERT INTO _nova_reinicio VALUES (v_paso, 'auth.users: ' || r.tgname || ' -> ' || r.funcion,
                                         'sin permiso para eliminarlo: su función quedó vacía (ya no falla)');
    END;
  END LOOP;

  -- 2) Tablas del publicador de Realtime (se sacan antes de moverlas).
  v_paso := 2;
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOR r IN SELECT schemaname, tablename FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
    LOOP
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I', r.schemaname, r.tablename);
      INSERT INTO _nova_reinicio VALUES (v_paso, r.tablename, 'retirada de Realtime');
    END LOOP;
  END IF;

  -- 3) Tablas, vistas, vistas materializadas, tablas foráneas y secuencias sueltas (las de columnas serial viajan
  --    con su tabla). Se omite lo que pertenece a una extensión (p. ej. spatial_ref_sys de PostGIS).
  v_paso := 3;
  FOR r IN SELECT c.oid, c.relname, c.relkind
             FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace
              AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
              AND NOT c.relispartition
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
              AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d
                                                    WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                                                      AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')))
            ORDER BY c.relkind, c.relname
  LOOP
    EXECUTE format('ALTER %s public.%I SET SCHEMA %I',
                   CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                                  WHEN 'f' THEN 'FOREIGN TABLE' WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
                   r.relname, v_respaldo);
    INSERT INTO _nova_reinicio VALUES (v_paso, r.relname,
      CASE r.relkind WHEN 'v' THEN 'vista' WHEN 'm' THEN 'vista materializada' WHEN 'f' THEN 'tabla foránea'
                     WHEN 'S' THEN 'secuencia' ELSE 'tabla' END || ' movida al respaldo');
  END LOOP;
  -- Particiones sueltas que hubieran quedado (su tabla madre ya se movió).
  FOR r IN SELECT c.relname FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND c.relispartition
  LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA %I', r.relname, v_respaldo);
    INSERT INTO _nova_reinicio VALUES (v_paso, r.relname, 'partición movida al respaldo');
  END LOOP;

  -- 4) Funciones y procedimientos (salvo los de extensiones).
  v_paso := 4;
  FOR r IN SELECT p.oid::regprocedure::text AS firma, p.prokind
             FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
            ORDER BY 1
  LOOP
    EXECUTE format('ALTER %s %s SET SCHEMA %I',
                   CASE r.prokind WHEN 'a' THEN 'AGGREGATE' WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, r.firma, v_respaldo);
    INSERT INTO _nova_reinicio VALUES (v_paso, r.firma, 'función movida al respaldo');
  END LOOP;

  -- 5) Tipos propios (enums, dominios, tipos compuestos y rangos). Los tipos fila de las tablas ya viajaron con ellas.
  v_paso := 5;
  FOR r IN SELECT t.typname, t.typtype
             FROM pg_type t
             LEFT JOIN pg_class c ON c.oid = t.typrelid
            WHERE t.typnamespace = 'public'::regnamespace
              AND t.typtype IN ('e', 'd', 'c', 'r')
              AND (t.typrelid = 0 OR c.relkind = 'c')
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
            ORDER BY 1
  LOOP
    EXECUTE format('ALTER %s public.%I SET SCHEMA %I', CASE r.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, r.typname, v_respaldo);
    INSERT INTO _nova_reinicio VALUES (v_paso, r.typname, 'tipo movido al respaldo');
  END LOOP;

  -- 6) Tareas programadas (pg_cron) que llamen funciones antiguas: solo se listan, no se tocan.
  v_paso := 6;
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR r IN EXECUTE 'SELECT jobid, jobname, command FROM cron.job ORDER BY jobid' LOOP
      INSERT INTO _nova_reinicio VALUES (v_paso, format('cron #%s %s: %s', r.jobid, coalesce(r.jobname, ''), left(r.command, 120)),
                                         'REVISAR: si llama algo antiguo, quítala con SELECT cron.unschedule(' || r.jobid || ')');
    END LOOP;
  END IF;
END $$;

SELECT paso, objeto, accion FROM _nova_reinicio
UNION ALL
SELECT 99, 'Listo', 'Siguiente paso: ejecutar nova_produccion_v3.sql en una consulta nueva'
ORDER BY 1, 2;
