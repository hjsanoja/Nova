-- Carga de ventas por trozos, resumen para "Verificar", fichero del propio vendedor y borrado por tabla.
-- Se ejecuta tras 40_gestion.sql (que dejó las tablas de datos vacías y el borrado habilitado con clave).
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
  INSERT INTO dim_droguerias (codigo, nombre) VALUES ('COBECA', 'Cobeca'), ('NENA', 'Nena');
  PERFORM importar_catalogo_clientes(jsonb_build_array(
    jsonb_build_object('codigo_interno', 'F-1', 'razon_social', 'Uno C.A.', 'nombre_comercial', 'Farmacia Uno'),
    jsonb_build_object('codigo_interno', 'F-2', 'razon_social', 'Dos C.A.', 'nombre_comercial', 'Farmacia Dos'),
    jsonb_build_object('codigo_interno', 'F-3', 'razon_social', 'Tres C.A.', 'nombre_comercial', 'Farmacia Tres')));
  PERFORM importar_catalogo_productos(jsonb_build_array(jsonb_build_object('sku', 'S-1', 'nombre_comercial', 'Uno'),
                                                        jsonb_build_object('sku', 'S-2', 'nombre_comercial', 'Dos')));
  PERFORM importar_homologacion(jsonb_build_object(
    'clientes', jsonb_build_array(jsonb_build_object('drogueria', 'COBECA', 'codigo_interno', 'F-1', 'codigo_cuenta', 'C1'),
                                  jsonb_build_object('drogueria', 'COBECA', 'codigo_interno', 'F-2', 'codigo_cuenta', 'C2')),
    'productos', jsonb_build_array(jsonb_build_object('drogueria', 'COBECA', 'sku', 'S-1', 'codigo', 'P1'),
                                   jsonb_build_object('drogueria', 'COBECA', 'sku', 'S-2', 'codigo', 'P2'))));
END $$;

-- ---------------------------------------------------------------- 31. ventas por trozos: mismo resultado que de una vez
DO $$
DECLARE r jsonb; f jsonb; v_lote uuid; v_esperado jsonb; v_obtenido jsonb;
        filas jsonb := (SELECT jsonb_agg(jsonb_build_object('n', g, 'fecha', CASE WHEN g % 2 = 0 THEN '2026-03-05' ELSE '2026-04-07' END,
                                                            'drogueria', CASE WHEN g = 7 THEN 'FANTASMA' ELSE 'cobeca' END,
                                                            'cod_cliente', 'C' || (1 + g % 3), 'nombre_cliente', 'X',
                                                            'cod_producto', 'P' || (1 + g % 2), 'unidades', g) ORDER BY g)
                          FROM generate_series(1, 30) g);
BEGIN
  -- Tres trozos diferidos (fuera de orden) y el cierre.
  r := importar_ventas_drogueria('{"archivo":"marzo.csv","checksum":"k-trozos","diferir":true}', (SELECT jsonb_agg(x) FROM jsonb_array_elements(filas) x WHERE (x->>'n')::int BETWEEN 11 AND 20));
  v_lote := (r->>'lote_id')::uuid;
  PERFORM importar_ventas_drogueria('{"archivo":"marzo.csv","checksum":"k-trozos","diferir":true}', (SELECT jsonb_agg(x) FROM jsonb_array_elements(filas) x WHERE (x->>'n')::int <= 10));
  r := importar_ventas_drogueria('{"archivo":"marzo.csv","checksum":"k-trozos","diferir":true}', (SELECT jsonb_agg(x) FROM jsonb_array_elements(filas) x WHERE (x->>'n')::int > 20));
  ASSERT r->'droguerias_desconocidas' = '[]'::jsonb, 'FANTASMA vino en el primer trozo';
  ASSERT (SELECT count(*) FROM fact_compras_mensual) = 0, 'diferido: el consolidado aún no se calcula';
  f := finalizar_lote_ventas(v_lote);
  ASSERT (f->>'filas')::int = 29, 'filas del lote (la de FANTASMA no entra): ' || f::text;
  ASSERT (f->>'sin_farmacia')::int = (SELECT count(*) FROM generate_series(1, 30) g WHERE g <> 7 AND 1 + g % 3 = 3), 'C3 no está homologada: ' || f::text;
  ASSERT (f->>'sin_producto')::int = 0;
  SELECT jsonb_agg(jsonb_build_array(cliente_id, producto_id, periodo, unidades, n_compras) ORDER BY cliente_id, producto_id, periodo)
    INTO v_obtenido FROM fact_compras_mensual WHERE deleted_at IS NULL;
  -- Lo mismo de una sola vez (modo clásico) en otro lote: el consolidado debe duplicar exactamente las unidades.
  PERFORM importar_ventas_drogueria('{"archivo":"marzo-bis.csv","checksum":"k-entero"}', filas);
  SELECT jsonb_agg(jsonb_build_array(cliente_id, producto_id, periodo, unidades / 2, n_compras / 2) ORDER BY cliente_id, producto_id, periodo)
    INTO v_esperado FROM fact_compras_mensual WHERE deleted_at IS NULL;
  ASSERT v_obtenido = v_esperado, 'trozos = de una vez: ' || v_obtenido::text || ' vs ' || v_esperado::text;
  -- Reenviar un trozo no duplica.
  r := importar_ventas_drogueria('{"archivo":"marzo.csv","checksum":"k-trozos","diferir":true}', (SELECT jsonb_agg(x) FROM jsonb_array_elements(filas) x WHERE (x->>'n')::int <= 10));
  ASSERT (r->>'insertadas')::int = 0;
  RAISE NOTICE 'OK 31: ventas por trozos diferidos + cierre = mismo consolidado; reenviar no duplica';
END $$;

-- ---------------------------------------------------------------- 32. resumen para "Verificar en Supabase"
DO $$
DECLARE r jsonb := resumen_ventas_nube();
BEGIN
  ASSERT (r->>'filas')::int = 58 AND (r->>'lotes')::int = 2 AND r->>'desde' = '2026-03-05', r::text;
END $$;
SELECT t.como(:v1);
DO $$ BEGIN
  BEGIN PERFORM resumen_ventas_nube(); ASSERT false, 'el vendedor no ve el resumen'; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  RAISE NOTICE 'OK 32: resumen de ventas en la nube (solo personal)';
END $$;

-- ---------------------------------------------------------------- 33. el vendedor arma su propio fichero
DO $$
DECLARE r jsonb;
BEGIN
  ASSERT (SELECT count(*) FROM dim_clientes) = 0, 'sin fichero no ve farmacias';
  ASSERT (SELECT array_agg(codigo_interno ORDER BY codigo_interno) FROM farmacias_disponibles()) = ARRAY['F-1', 'F-2', 'F-3'];
  ASSERT (SELECT array_agg(codigo_interno) FROM farmacias_disponibles('dos')) = ARRAY['F-2'], 'búsqueda sin tildes ni mayúsculas';
  r := asignar_clientes_vendedor('a0000000-0000-0000-0000-0000000000c1', ARRAY['F-1', 'F-2'], 'agregar');
  ASSERT (r->>'asignados')::int = 2, r::text;
  ASSERT (SELECT array_agg(codigo_interno ORDER BY codigo_interno) FROM dim_clientes) = ARRAY['F-1', 'F-2'], 'ahora las ve';
  ASSERT (SELECT array_agg(codigo_interno) FROM farmacias_disponibles()) = ARRAY['F-3'], 'las suyas ya no se ofrecen';
  r := asignar_clientes_vendedor('a0000000-0000-0000-0000-0000000000c1', ARRAY['F-2'], 'quitar');
  ASSERT (r->>'retirados')::int = 1;
  BEGIN PERFORM asignar_clientes_vendedor('a0000000-0000-0000-0000-0000000000c1', ARRAY['F-3'], 'reemplazar'); ASSERT false, 'reemplazar es del admin';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM asignar_clientes_vendedor('a0000000-0000-0000-0000-0000000000c2', ARRAY['F-3'], 'agregar'); ASSERT false, 'no asigna a otro vendedor';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:v2);
DO $$ BEGIN
  ASSERT (SELECT r.vendedores FROM farmacias_disponibles() r WHERE codigo_interno = 'F-1') = 1, 'informa cuántos vendedores la atienden';
  RAISE NOTICE 'OK 33: el vendedor agrega y quita farmacias de su fichero (solo el suyo; sin duplicar)';
END $$;

-- ---------------------------------------------------------------- 34. borrado por tabla
SELECT t.como(:admin);
DO $$
DECLARE r jsonb;
BEGIN
  INSERT INTO fact_pedidos (id, cliente_id, vendedor_id, drogueria_id, estado)
  SELECT 'e0000000-0000-0000-0000-000000000001', c.id, 'a0000000-0000-0000-0000-0000000000c1', d.id, 'borrador'
    FROM dim_clientes c, dim_droguerias d WHERE c.codigo_interno = 'F-1' AND d.codigo = 'COBECA';

  r := borrar_datos('clave-borrado-26', 'fichero');
  ASSERT (r->>'ok')::boolean AND (SELECT count(*) FROM rel_cliente_vendedor) = 0 AND (SELECT count(*) FROM fact_pedidos) = 1, 'fichero: solo el fichero';

  r := borrar_datos('clave-borrado-26', 'homologaciones');
  ASSERT (SELECT count(*) FROM map_cliente_drogueria) + (SELECT count(*) FROM map_producto_drogueria) = 0;
  ASSERT (SELECT count(*) FROM fact_ventas_drogueria WHERE cliente_id IS NOT NULL OR producto_id IS NOT NULL) = 0, 'ventas sin homologar';
  ASSERT (SELECT count(*) FROM fact_ventas_drogueria) = 58 AND (SELECT count(*) FROM fact_compras_mensual) = 0;

  r := borrar_datos('clave-borrado-26', 'clientes');
  ASSERT (SELECT count(*) FROM dim_clientes) = 0 AND (SELECT count(*) FROM fact_pedidos) = 0, 'farmacias y sus pedidos';
  ASSERT (SELECT count(*) FROM fact_ventas_drogueria) = 58 AND (SELECT count(*) FROM dim_productos) = 2, 'ventas y productos se conservan';

  r := borrar_datos('clave-borrado-26', 'productos');
  ASSERT (SELECT count(*) FROM dim_productos) = 0 AND (SELECT count(*) FROM fact_ventas_drogueria) = 58;

  r := borrar_datos('clave-borrado-26', 'droguerias');
  ASSERT (SELECT count(*) FROM dim_droguerias) = 0 AND (SELECT count(*) FROM fact_ventas_drogueria) = 0, 'droguerías y sus ventas';
  ASSERT (SELECT count(*) FROM dim_usuarios) >= 5, 'usuarios intactos';
  ASSERT (SELECT count(*) FROM audit_log WHERE accion = 'purga_ejecutada' AND detalle->>'alcance' = 'clientes') = 1, 'auditado';
  RAISE NOTICE 'OK 34: borrado por tabla (fichero, homologaciones, farmacias, productos, droguerías)';
END $$;
RESET ROLE;
\echo CARGAS: TODOS LOS ESCENARIOS PASARON
