-- Código de farmacia desde el pedido, plantillas, comunicados por zona, registro de accesos y metas.
-- Se ejecuta tras 60_cargas.sql (usuarios admin, t1, v1 y v2 activos).
\set ON_ERROR_STOP on
\set QUIET on
\set admin '''a0000000-0000-0000-0000-000000000001'''
\set t1    '''a0000000-0000-0000-0000-0000000000b1'''
\set v1    '''a0000000-0000-0000-0000-0000000000c1'''
\set v2    '''a0000000-0000-0000-0000-0000000000c2'''

RESET ROLE; SET ROLE authenticated;
SELECT t.como(:admin);
DO $$
BEGIN
  INSERT INTO dim_droguerias (id, codigo, nombre) VALUES ('d0000000-0000-0000-0000-0000000000a1', 'NOV', 'Novedades');
  INSERT INTO dim_clientes (id, codigo_interno, razon_social, nombre_comercial, rif, rif_verificado, estado_validacion, estado_geografico, municipio) VALUES
    ('c0000000-0000-0000-0000-0000000000a1', 'N-1', 'N1 C.A.', 'Farmacia Norte', 'J-40000001-1', true, 'activo', 'Zulia', 'Maracaibo'),
    ('c0000000-0000-0000-0000-0000000000a2', 'N-2', 'N2 C.A.', 'Farmacia Sur', 'J-40000002-2', true, 'activo', 'Lara', 'Barquisimeto');
  PERFORM asignar_clientes_vendedor('a0000000-0000-0000-0000-0000000000c1', ARRAY['N-1'], 'agregar');
END $$;

-- ---------------------------------------------------------------- 36. código de la farmacia registrado desde el pedido
SELECT t.como(:v1);
DO $$
DECLARE r jsonb; r2 jsonb;
BEGIN
  r := sync_registrar_codigo_farmacia('{"id":"0a000000-0000-0000-0000-000000000001","cliente_id":"c0000000-0000-0000-0000-0000000000a1","drogueria_id":"d0000000-0000-0000-0000-0000000000a1","codigo":" 5501 "}');
  ASSERT r->>'codigo_cuenta' = '5501' AND (r->>'es_principal')::boolean AND r->>'origen' = 'manual', 'registrado: ' || r::text;
  r2 := sync_registrar_codigo_farmacia('{"id":"0a000000-0000-0000-0000-000000000001","cliente_id":"c0000000-0000-0000-0000-0000000000a1","drogueria_id":"d0000000-0000-0000-0000-0000000000a1","codigo":"5501"}');
  ASSERT r2->>'id' = r->>'id', 'reintento idempotente';
  r2 := sync_registrar_codigo_farmacia('{"id":"0a000000-0000-0000-0000-000000000002","cliente_id":"c0000000-0000-0000-0000-0000000000a1","drogueria_id":"d0000000-0000-0000-0000-0000000000a1","codigo":"5501"}');
  ASSERT r2->>'id' = r->>'id', 'el mismo código devuelve la fila existente';
  ASSERT (SELECT count(*) FROM map_cliente_drogueria WHERE drogueria_id = 'd0000000-0000-0000-0000-0000000000a1') = 1;
  BEGIN
    PERFORM sync_registrar_codigo_farmacia('{"cliente_id":"c0000000-0000-0000-0000-0000000000a2","drogueria_id":"d0000000-0000-0000-0000-0000000000a1","codigo":"9"}');
    ASSERT false, 'N-2 no está en su fichero';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM sync_registrar_codigo_farmacia('{"cliente_id":"c0000000-0000-0000-0000-0000000000a1","drogueria_id":"d0000000-0000-0000-0000-0000000000a1","codigo":"  "}'); ASSERT false; EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
END $$;
SELECT t.como(:t1);
DO $$
DECLARE r jsonb;
BEGIN
  BEGIN
    PERFORM sync_registrar_codigo_farmacia('{"cliente_id":"c0000000-0000-0000-0000-0000000000a2","drogueria_id":"d0000000-0000-0000-0000-0000000000a1","codigo":"5501"}');
    ASSERT false, 'el código ya es de Farmacia Norte';
  EXCEPTION WHEN sqlstate '23505' THEN ASSERT SQLERRM LIKE '%Farmacia Norte%', SQLERRM; END;
  -- Un segundo código de la misma farmacia pasa a ser el principal; el anterior queda como alterno.
  r := sync_registrar_codigo_farmacia('{"cliente_id":"c0000000-0000-0000-0000-0000000000a1","drogueria_id":"d0000000-0000-0000-0000-0000000000a1","codigo":"5502"}');
  ASSERT (SELECT count(*) FILTER (WHERE es_principal) = 1 AND bool_or(codigo_cuenta = '5502' AND es_principal)
            FROM map_cliente_drogueria WHERE cliente_id = 'c0000000-0000-0000-0000-0000000000a1' AND drogueria_id = 'd0000000-0000-0000-0000-0000000000a1');
  RAISE NOTICE 'OK 36: código de la farmacia en la droguería (idempotente, único por droguería, solo quien atiende la farmacia o la mesa)';
END $$;

-- ---------------------------------------------------------------- 37. plantillas de pedido
SELECT t.como(:v1);
DO $$
DECLARE r jsonb;
BEGIN
  r := sync_guardar_plantilla('{"id":"0b000000-0000-0000-0000-000000000001","cliente_id":"c0000000-0000-0000-0000-0000000000a1","drogueria_id":"d0000000-0000-0000-0000-0000000000a1","nombre":"Semanal","lineas":[{"producto_id":"x","unidades":10}]}');
  ASSERT (SELECT nombre = 'Semanal' AND vendedor_id = 'a0000000-0000-0000-0000-0000000000c1' AND jsonb_array_length(lineas) = 1 FROM plantillas_pedido WHERE id = '0b000000-0000-0000-0000-000000000001');
  r := sync_guardar_plantilla('{"id":"0b000000-0000-0000-0000-000000000001","cliente_id":"c0000000-0000-0000-0000-0000000000a1","nombre":"Semanal","lineas":[]}');
  ASSERT (SELECT jsonb_array_length(lineas) = 0 AND drogueria_id IS NULL FROM plantillas_pedido WHERE id = '0b000000-0000-0000-0000-000000000001'), 'actualizada';
END $$;
SELECT t.como(:v2);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM plantillas_pedido) = 0, 'v2 no ve las plantillas de v1';
  BEGIN
    PERFORM sync_guardar_plantilla('{"id":"0b000000-0000-0000-0000-000000000001","cliente_id":"c0000000-0000-0000-0000-0000000000a1","nombre":"Mía"}');
    ASSERT false, 'no puede pisar la plantilla de otro';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:v1);
DO $$
BEGIN
  PERFORM sync_guardar_plantilla('{"id":"0b000000-0000-0000-0000-000000000001","cliente_id":"c0000000-0000-0000-0000-0000000000a1","nombre":"Semanal","eliminar":true}');
  ASSERT (SELECT deleted_at IS NOT NULL FROM plantillas_pedido WHERE id = '0b000000-0000-0000-0000-000000000001'), 'borrada';
  RAISE NOTICE 'OK 37: plantillas (solo las propias; se actualizan y se borran por id)';
END $$;

-- ---------------------------------------------------------------- 38. comunicados por rol, equipo, estado, ciudad y región
SELECT t.como(:admin);
DO $$
BEGIN
  UPDATE dim_usuarios SET region = 'Occidente', equipo_id = 'e0000000-0000-0000-0000-000000000002' WHERE id = 'a0000000-0000-0000-0000-0000000000c2';
  INSERT INTO comunicados (id, titulo, tipo) VALUES ('0c000000-0000-0000-0000-000000000001', 'Para todos', 'anuncio');
  INSERT INTO comunicados (id, titulo, tipo, roles, estados) VALUES ('0c000000-0000-0000-0000-000000000002', 'Vendedores del Zulia', 'descuento', '{vendedor}', '{zulia}');
  INSERT INTO comunicados (id, titulo, regiones) VALUES ('0c000000-0000-0000-0000-000000000003', 'Occidente', '{Occidente}');
  INSERT INTO comunicados (id, titulo, equipos) VALUES ('0c000000-0000-0000-0000-000000000004', 'Equipo OTC', '{e0000000-0000-0000-0000-000000000002}');
  INSERT INTO comunicados (id, titulo, ciudades) VALUES ('0c000000-0000-0000-0000-000000000005', 'Barquisimeto', '{Barquisimeto}');
  ASSERT (SELECT count(*) FROM comunicados) = 5, 'la gerencia ve todos';
  ASSERT (SELECT count(*) FROM comunicados c WHERE para_mi(c)) = 1, 'pero al admin solo le va dirigido el general';
  ASSERT zonas_disponibles()->'estados' ? 'Zulia' AND zonas_disponibles()->'regiones' ? 'Occidente', zonas_disponibles()::text;
END $$;
SELECT t.como(:v1);
DO $$
BEGIN
  ASSERT (SELECT array_agg(titulo ORDER BY titulo) FROM comunicados) = ARRAY['Para todos', 'Vendedores del Zulia'], 'v1: general + Zulia por su fichero';
  BEGIN INSERT INTO comunicados (titulo) VALUES ('no'); ASSERT false, 'un vendedor no publica'; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:v2);
DO $$ BEGIN
  ASSERT (SELECT array_agg(titulo ORDER BY titulo) FROM comunicados) = ARRAY['Equipo OTC', 'Occidente', 'Para todos'], 'v2: general + su región + su equipo';
END $$;
SELECT t.como(:t1);
DO $$ BEGIN
  ASSERT (SELECT array_agg(titulo) FROM comunicados) = ARRAY['Para todos'], 'la mesa: solo el general';
  RAISE NOTICE 'OK 38: comunicados dirigidos por rol, equipo, estado/ciudad (propios o del fichero) y región';
END $$;

-- ---------------------------------------------------------------- 39. registro de accesos
SELECT t.como(:v1);
DO $$
BEGIN
  PERFORM registrar_acceso('apertura', 'Android · Chrome');
  PERFORM registrar_acceso('apertura', 'Android · Chrome');   -- recargar la página no cuenta dos veces
  PERFORM registrar_acceso('inicio_sesion', 'Android · Chrome');
  ASSERT (SELECT count(*) FROM registro_accesos) = 0, 'un vendedor no ve el registro';
  BEGIN PERFORM reporte_accesos(current_date - 7, current_date); ASSERT false; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:admin);
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM reporte_accesos(current_date - 7, current_date) WHERE usuario_id = 'a0000000-0000-0000-0000-0000000000c1';
  ASSERT r.inicios_sesion = 1 AND r.aperturas = 1 AND r.dias_activos = 1 AND r.ultimo_acceso IS NOT NULL, 'v1: ' || row_to_json(r)::text;
  ASSERT (SELECT inicios_sesion + aperturas FROM reporte_accesos(current_date - 7, current_date) WHERE usuario_id = 'a0000000-0000-0000-0000-0000000000c2') = 0, 'v2 aparece con cero';
  RAISE NOTICE 'OK 39: registro de accesos (sin inflar por recargas) y reporte solo para gerencia';
END $$;

-- ---------------------------------------------------------------- 40. metas
SELECT t.como(:admin);
DO $$
BEGIN
  INSERT INTO metas (periodo, vendedor_id, indicador, objetivo) VALUES (date_trunc('month', now())::date, 'a0000000-0000-0000-0000-0000000000c1', 'unidades', 1000);
  INSERT INTO metas (periodo, vendedor_id, drogueria_id, indicador, objetivo) VALUES (date_trunc('month', now())::date, 'a0000000-0000-0000-0000-0000000000c2', 'd0000000-0000-0000-0000-0000000000a1', 'pedidos', 20);
  INSERT INTO metas (periodo, cliente_id, indicador, objetivo) VALUES (date_trunc('month', now())::date, 'c0000000-0000-0000-0000-0000000000a1', 'unidades', 300);
  INSERT INTO metas (periodo, indicador, objetivo) VALUES (date_trunc('month', now())::date, 'farmacias', 50);
  BEGIN INSERT INTO metas (periodo, vendedor_id, indicador, objetivo) VALUES (date_trunc('month', now())::date, 'a0000000-0000-0000-0000-0000000000c1', 'unidades', 5); ASSERT false, 'duplicada'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO metas (periodo, indicador, objetivo) VALUES ('2026-09-15', 'unidades', 5); ASSERT false, 'periodo = primer día del mes'; EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM * FROM resumen_pedidos_mensual(6);
END $$;
SELECT t.como(:v1);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM metas) = 2, 'v1: la suya y la de su farmacia';
  BEGIN INSERT INTO metas (periodo, indicador, objetivo) VALUES (date_trunc('month', now())::date, 'pedidos', 1); ASSERT false; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:v2);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM metas) = 1, 'v2: solo la suya';
  RAISE NOTICE 'OK 40: metas por representante, farmacia, droguería o combinadas (las ve quien corresponde; las fija la gerencia)';
END $$;
RESET ROLE;
\echo NOVEDADES: TODOS LOS ESCENARIOS PASARON
