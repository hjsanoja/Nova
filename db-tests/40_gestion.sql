-- Fichero de vendedores y borrado de datos con clave. Se ejecuta tras 20_homologacion.sql.
\set ON_ERROR_STOP on
\set QUIET on
\set admin '''a0000000-0000-0000-0000-000000000001'''
\set t1    '''a0000000-0000-0000-0000-0000000000b1'''
\set v1    '''a0000000-0000-0000-0000-0000000000c1'''
\set v2    '''a0000000-0000-0000-0000-0000000000c2'''

RESET ROLE; SET ROLE authenticated;
-- ---------------------------------------------------------------- 24. fichero: cada vendedor ve solo lo suyo
SELECT t.como(:admin);
DO $$
DECLARE r jsonb;
BEGIN
  INSERT INTO dim_clientes (id, codigo_interno, razon_social, nombre_comercial, rif_verificado, estado_validacion)
  VALUES ('c0000000-0000-0000-0000-0000000000b3', 'CLI-3003', 'Tres C.A.', 'Tres', true, 'activo'),
         ('c0000000-0000-0000-0000-0000000000b4', 'CLI-4004', 'Cuatro C.A.', 'Cuatro', true, 'activo');
  -- v2 tenía CLI-1001; se reemplaza su fichero por CLI-3003 y CLI-4004 (más un código que no existe).
  r := asignar_clientes_vendedor('a0000000-0000-0000-0000-0000000000c2', ARRAY['CLI-3003', ' CLI-4004 ', 'NO-EXISTE', 'CLI-3003'], 'reemplazar');
  ASSERT (r->>'asignados')::int = 2 AND (r->>'retirados')::int >= 1, 'reemplazo: ' || r::text;
  ASSERT r->'no_encontrados' = '["NO-EXISTE"]'::jsonb, 'reporta el código inexistente';
  r := asignar_clientes_vendedor('a0000000-0000-0000-0000-0000000000c2', ARRAY['CLI-3003'], 'agregar');
  ASSERT (r->>'asignados')::int = 0, 'agregar lo ya asignado no cambia nada: ' || r::text;
  BEGIN PERFORM asignar_clientes_vendedor('a0000000-0000-0000-0000-0000000000b1', ARRAY['CLI-3003']); ASSERT false, 'a una mesa no se le asigna fichero';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
END $$;
SELECT t.como(:v2);
DO $$
BEGIN
  ASSERT (SELECT array_agg(codigo_interno ORDER BY codigo_interno) FROM dim_clientes WHERE codigo_interno IS NOT NULL) = ARRAY['CLI-3003', 'CLI-4004'],
         'el vendedor ve solo su fichero: ' || (SELECT array_agg(codigo_interno)::text FROM dim_clientes);
END $$;
SELECT t.como(:t1);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM dim_clientes) >= 5, 'la mesa ve todas las farmacias';
  BEGIN PERFORM asignar_clientes_vendedor('a0000000-0000-0000-0000-0000000000c2', ARRAY['CLI-3003']); ASSERT false, 'solo el admin asigna';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:admin);
DO $$
DECLARE r jsonb;
BEGIN
  r := asignar_clientes_vendedor('a0000000-0000-0000-0000-0000000000c2', ARRAY['CLI-4004'], 'quitar');
  ASSERT (r->>'retirados')::int = 1;
END $$;
SELECT t.como(:v2);
DO $$ BEGIN ASSERT (SELECT array_agg(codigo_interno) FROM dim_clientes) = ARRAY['CLI-3003'], 'al retirarlo deja de verlo'; RAISE NOTICE 'OK 24: fichero por vendedor (asignar, reemplazar, quitar; solo admin)'; END $$;

-- ---------------------------------------------------------------- 25. borrado con clave y por alcance
SELECT t.como(:t1);
DO $$
BEGIN
  BEGIN PERFORM borrar_datos('x', 'todo'); ASSERT false, 'solo admin'; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM estado_borrado(); ASSERT false; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:admin);
DO $$
DECLARE r jsonb;
BEGIN
  BEGIN PERFORM configurar_password_purga('corta'); ASSERT false, 'mínimo 6 caracteres'; EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  PERFORM habilitar_borrado(false);
  PERFORM configurar_password_purga('clave-borrado-26');
  ASSERT (estado_borrado()->>'clave_definida')::boolean AND NOT (estado_borrado()->>'habilitado')::boolean, 'clave definida, borrado apagado';
  BEGIN PERFORM borrar_datos('clave-borrado-26', 'historial'); ASSERT false, 'apagado por defecto'; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  PERFORM habilitar_borrado(true);
  BEGIN PERFORM borrar_datos('clave-borrado-26', 'universo'); ASSERT false; EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  r := borrar_datos('incorrecta', 'historial');
  ASSERT NOT (r->>'ok')::boolean AND r->>'error' = 'credenciales_invalidas';
  ASSERT (SELECT count(*) FROM fact_ventas_drogueria) > 0 AND (SELECT count(*) FROM dim_clientes) > 0;

  r := borrar_datos('clave-borrado-26', 'historial');
  ASSERT (r->>'ok')::boolean;
  ASSERT (SELECT count(*) FROM fact_ventas_drogueria) = 0 AND (SELECT count(*) FROM import_lotes) = 0 AND (SELECT count(*) FROM fact_compras_mensual) = 0, 'historial vacío';
  ASSERT (SELECT count(*) FROM dim_clientes) > 0 AND (SELECT count(*) FROM dim_productos) > 0, 'las dimensiones se conservan';

  r := borrar_datos('clave-borrado-26', 'todo');
  ASSERT (r->>'ok')::boolean;
  ASSERT (SELECT count(*) FROM dim_clientes) = 0 AND (SELECT count(*) FROM dim_productos) = 0 AND (SELECT count(*) FROM dim_droguerias) = 0
     AND (SELECT count(*) FROM map_cliente_drogueria) = 0 AND (SELECT count(*) FROM rel_cliente_vendedor) = 0, 'dimensiones vacías';
  ASSERT (SELECT count(*) FROM dim_usuarios) >= 5 AND (SELECT count(*) FROM dim_equipos) >= 1, 'usuarios y equipos intactos';
  ASSERT (SELECT count(*) FROM audit_log WHERE accion = 'purga_ejecutada') >= 2, 'queda auditado';
  RAISE NOTICE 'OK 25: borrado por alcance con clave (historial, todo); usuarios y equipos se conservan';
END $$;
RESET ROLE;
\echo GESTION: TODOS LOS ESCENARIOS PASARON
