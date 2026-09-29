-- ==============================================================================
-- MIGRACIÓN 1/2 · ARCHIVAR EL ESQUEMA DE FASE 1
-- Ejecutar UNA vez en el SQL Editor de Supabase, ANTES de nova_produccion_v3.sql.
--
-- Qué hace: mueve las tablas de la fase 1 (dim_clientes con ident01, dim_productos, fact_historico_ventas,
-- alias, mapeos, pedidos_*, etc.) al esquema `legacy`, sin borrar nada, para que v3 pueda crear sus tablas
-- con los mismos nombres. También retira el trigger de alta de usuarios de la fase 1, que tomaba el ROL de
-- los metadatos del registro (cualquiera podía registrarse como admin).
--
-- Es seguro re-ejecutarlo: si ya no queda esquema anterior en `public`, no hace nada.
-- Después: ejecutar nova_produccion_v3.sql y luego 2_migrar_datos_anteriores.sql.
-- ==============================================================================
DO $$
DECLARE t text; v text; f record;
BEGIN
  -- ¿Es el esquema de fase 1? (dim_clientes con la columna ident01)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'dim_clientes' AND column_name = 'ident01') THEN
    RAISE NOTICE 'No hay esquema de fase 1 en public: nada que archivar.';
    RETURN;
  END IF;

  CREATE SCHEMA IF NOT EXISTS legacy;
  REVOKE ALL ON SCHEMA legacy FROM PUBLIC, anon, authenticated;   -- solo el rol postgres lo consulta

  -- 1) Trigger de alta de usuarios (escalada de privilegios por user_metadata).
  BEGIN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'No se pudo retirar on_auth_user_created de auth.users; elimínalo manualmente.';
  END;

  -- 2) Vistas de la fase 1 (dependen de las tablas).
  FOREACH v IN ARRAY ARRAY['vw_productos_pendientes_sap', 'vw_farmacias_pendientes_homologar', 'vw_historico_ventas_homologado'] LOOP
    EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', v);
  END LOOP;

  -- 3) Funciones de la fase 1 (las políticas antiguas las usan: CASCADE retira esas políticas, que no aplican en legacy).
  FOR f IN SELECT p.oid::regprocedure AS firma FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN
              ('fn_resolver_fact_historico_ventas', 'fn_actualizar_updated_at', 'fn_validar_descuento_producto',
               'fn_recalcular_totales_pedido', 'calcular_pedido_sugerido', 'auth_user_role', 'auth_user_equipo',
               'handle_new_auth_user')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', f.firma);
  END LOOP;

  -- 4) Tablas: se mueven con sus índices, datos y restricciones.
  FOREACH t IN ARRAY ARRAY['inventario_drogueria', 'pedidos_detalle', 'pedidos_cabecera', 'fact_historico_ventas',
                           'historico_pedidos_resumen', 'historico_pedidos_previos', 'dim_producto_drogueria_mapeo',
                           'dim_cliente_drogueria_alias', 'rel_cliente_drogueria_codigos', 'rel_cliente_vendedor',
                           'dim_productos', 'dim_droguerias', 'dim_clientes', 'dim_usuarios'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA legacy', t);
    END IF;
  END LOOP;
  RAISE NOTICE 'Esquema de fase 1 archivado en el esquema legacy. Siguiente paso: nova_produccion_v3.sql';
END $$;
