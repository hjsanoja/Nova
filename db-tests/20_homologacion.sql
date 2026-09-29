-- Homologación de códigos y nombres por droguería, ventas reportadas y consolidado mensual.
-- Se ejecuta a continuación de 10_escenarios.sql (reutiliza sus usuarios, droguerías, productos y farmacia CLI-1001).
\set ON_ERROR_STOP on
\set QUIET on

\set admin   '''a0000000-0000-0000-0000-000000000001'''
\set t1      '''a0000000-0000-0000-0000-0000000000b1'''
\set v1      '''a0000000-0000-0000-0000-0000000000c1'''
\set v2      '''a0000000-0000-0000-0000-0000000000c2'''

-- Una segunda farmacia que la droguería Cobeca conoce por otro código y con otro nombre.
INSERT INTO dim_clientes (id, codigo_interno, razon_social, nombre_comercial, rif, rif_verificado, estado_validacion, brick)
VALUES ('c0000000-0000-0000-0000-0000000000a2', 'CLI-2002', 'Inversiones San José C.A.', 'Farmacia San José', 'J-11111111-1', true, 'activo', 'CCS-02');
INSERT INTO rel_cliente_vendedor (cliente_id, vendedor_id, equipo_id) VALUES
  ('c0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------- 12. varios códigos por producto, uno principal
SET ROLE authenticated;
SELECT t.como(:t1);
DO $$
DECLARE a uuid; b uuid; n integer;
BEGIN
  -- Producto SKU-1 en Cobeca: el primer código queda principal; el segundo (código reemplazado) no.
  a := homologar_producto('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'COB-LOS', 'LOSARTAN POTASICO 50MG');
  b := homologar_producto('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'COB-LOS-OLD', 'LOSARTAN 50 MG X30');
  ASSERT (SELECT es_principal FROM map_producto_drogueria WHERE id = a), 'el primero es principal';
  ASSERT NOT (SELECT es_principal FROM map_producto_drogueria WHERE id = b), 'el segundo no lo es';
  -- Un código de la droguería identifica un solo producto.
  BEGIN PERFORM homologar_producto('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'COB-LOS');
        ASSERT false, 'el mismo código no puede apuntar a dos productos';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  -- Cambiar el principal deja siempre uno solo.
  PERFORM homologar_producto('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'COB-LOS-OLD', NULL, true);
  SELECT count(*) INTO n FROM map_producto_drogueria WHERE drogueria_id = 'd0000000-0000-0000-0000-000000000001'
     AND producto_id = 'f0000000-0000-0000-0000-000000000001' AND es_principal AND deleted_at IS NULL;
  ASSERT n = 1, 'un solo principal, hay ' || n;
  ASSERT (SELECT es_principal FROM map_producto_drogueria WHERE id = b), 'el nuevo principal es COB-LOS-OLD';
  PERFORM homologar_producto('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'COB-LOS', NULL, true);
  -- Mismo producto en otra droguería: código propio, sin relación con el de Cobeca.
  PERFORM homologar_producto('d0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'NEN-9001', 'LOSARTAN 50MG');
  ASSERT (SELECT count(*) FROM map_producto_drogueria WHERE producto_id = 'f0000000-0000-0000-0000-000000000001' AND es_principal) = 2,
         'un principal por droguería';
  -- Farmacia: el código de cuenta también es único por droguería.
  BEGIN PERFORM homologar_cliente('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000a2', 'COB-1001');
        ASSERT false, 'COB-1001 ya es de la farmacia CLI-1001';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  RAISE NOTICE 'OK 12: varios códigos por producto y un principal por droguería';
END $$;

-- ---------------------------------------------------------------- 13. importación de ventas con lo pendiente aparte
DO $$
DECLARE r jsonb; r2 jsonb;
  filas jsonb := '[
    {"n":1,"fecha":"2026-03-05","drogueria":"COBECA","cod_cliente":"COB-1001","nombre_cliente":"FARMACIA LA PAZ","cod_producto":"COB-LOS","nombre_producto":"LOSARTAN POTASICO 50MG","unidades":12},
    {"n":2,"fecha":"2026-03-19","drogueria":"cobeca","cod_cliente":"COB-1001","nombre_cliente":"FARMACIA LA PAZ","cod_producto":"COB-LOS-OLD","nombre_producto":"LOSARTAN 50 MG X30","unidades":6},
    {"n":3,"fecha":"2026-03-07","drogueria":"COBECA","cod_cliente":"COB-777","nombre_cliente":"FARMACIA SAN JOSE, C.A.","cod_producto":"COB-LOS","nombre_producto":"LOSARTAN POTASICO 50MG","unidades":20},
    {"n":4,"fecha":"2026-03-08","drogueria":"COBECA","cod_cliente":"COB-1001","nombre_cliente":"FARMACIA LA PAZ","cod_producto":"COB-XYZ","nombre_producto":"PRODUCTO NUEVO","unidades":4},
    {"n":5,"fecha":"2026-03-09","drogueria":"COBECA","cod_cliente":"COB-1001","nombre_cliente":"FARMACIA LA PAZ","cod_producto":"COB-LOS","nombre_producto":"LOSARTAN POTASICO 50MG","unidades":-2},
    {"n":6,"fecha":"2026-03-09","drogueria":"DROGUERIA FANTASMA","cod_cliente":"X","nombre_cliente":"X","cod_producto":"Y","unidades":1}]';
BEGIN
  r := importar_ventas_drogueria('{"archivo":"ventas_marzo.csv","checksum":"chk-marzo"}', filas);
  ASSERT (r->>'insertadas')::int = 5, 'se guardan las 5 filas de droguerías conocidas: ' || r::text;
  ASSERT r->'droguerias_desconocidas' = '["DROGUERIA FANTASMA"]'::jsonb, 'la droguería desconocida se reporta: ' || r::text;
  -- Homologadas: filas 1, 2 y 5 (farmacia La Paz + Losartán, dos códigos distintos del mismo SKU).
  ASSERT (SELECT count(*) FROM fact_ventas_drogueria WHERE cliente_id IS NOT NULL AND producto_id IS NOT NULL) = 3, 'tres filas completas';
  ASSERT (SELECT unidades FROM fact_compras_mensual WHERE cliente_id = 'c0000000-0000-0000-0000-000000000001'
            AND producto_id = 'f0000000-0000-0000-0000-000000000001' AND periodo = '2026-03-01') = 16,
         '12 + 6 - 2 devolución = 16 en el consolidado';
  -- Pendientes: la farmacia COB-777 y el producto COB-XYZ, con su volumen.
  ASSERT (SELECT unidades FROM vw_pendientes_clientes WHERE cod_cliente_drogueria = 'COB-777') = 20;
  ASSERT (SELECT unidades FROM vw_pendientes_productos WHERE cod_producto_drogueria = 'COB-XYZ') = 4;
  -- Reenviar el mismo archivo no duplica nada.
  r2 := importar_ventas_drogueria('{"archivo":"ventas_marzo.csv","checksum":"chk-marzo"}', filas);
  ASSERT (r2->>'insertadas')::int = 0, 'idempotente: ' || r2::text;
  ASSERT (SELECT count(*) FROM fact_ventas_drogueria) = 5, 'sin duplicados';
  RAISE NOTICE 'OK 13: importación, pendientes y reenvío idempotente';
END $$;

-- ---------------------------------------------------------------- 14. homologar una vez enlaza todo el histórico
DO $$
BEGIN
  PERFORM homologar_cliente('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000a2', 'COB-777', 'FARMACIA SAN JOSE, C.A.');
  ASSERT (SELECT count(*) FROM vw_pendientes_clientes) = 0, 'ya no quedan farmacias pendientes';
  ASSERT (SELECT unidades FROM fact_compras_mensual WHERE cliente_id = 'c0000000-0000-0000-0000-0000000000a2'
            AND producto_id = 'f0000000-0000-0000-0000-000000000001') = 20, 'la venta histórica se enlazó sola';
  PERFORM homologar_producto('d0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'COB-XYZ', 'PRODUCTO NUEVO');
  ASSERT (SELECT count(*) FROM vw_pendientes_productos) = 0, 'ya no quedan productos pendientes';
  ASSERT (SELECT unidades FROM fact_compras_mensual WHERE cliente_id = 'c0000000-0000-0000-0000-000000000001'
            AND producto_id = 'f0000000-0000-0000-0000-000000000002') = 4;
  ASSERT (SELECT pct_homologado FROM vw_estado_homologacion WHERE drogueria = 'Cobeca') = 100.0, 'tablero al 100 %';
  RAISE NOTICE 'OK 14: la homologación se aplica retroactivamente';
END $$;

-- ---------------------------------------------------------------- 15. droguería que solo envía nombres + Cod SAP
DO $$
DECLARE r jsonb;
BEGIN
  -- Nena no manda código de farmacia: se reconoce por el nombre normalizado (sin tildes, mayúsculas, signos).
  PERFORM homologar_cliente('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', NULL, 'FARMACIA "LA PAZ" (Sucursal Centro)');
  r := importar_ventas_drogueria('{"archivo":"nena_marzo.csv","checksum":"chk-nena"}', '[
    {"n":1,"fecha":"2026-03-10","drogueria":"Nena","nombre_cliente":"farmacia la paz  sucursal centro","cod_producto":"NEN-9001","nombre_producto":"LOSARTAN 50MG","unidades":30},
    {"n":2,"fecha":"2026-03-11","drogueria":"Nena","nombre_cliente":"Farmacia Desconocida","cod_producto":"NEN-5555","nombre_producto":"OMEPRAZOL","cod_sap":"SKU-3","unidades":9}]');
  ASSERT (SELECT cliente_id FROM fact_ventas_drogueria WHERE lote_id = (r->>'lote_id')::uuid AND fila = 1) = 'c0000000-0000-0000-0000-000000000001',
         'reconocida por nombre, tolerando tildes/signos/espacios';
  ASSERT (SELECT cliente_id FROM fact_ventas_drogueria WHERE lote_id = (r->>'lote_id')::uuid AND fila = 2) IS NULL, 'farmacia desconocida queda pendiente';
  -- El Cod SAP del reporte enseña el código: NEN-5555 -> SKU-3, sin intervención.
  ASSERT (SELECT producto_id FROM fact_ventas_drogueria WHERE lote_id = (r->>'lote_id')::uuid AND fila = 2) = 'f0000000-0000-0000-0000-000000000003',
         'producto enlazado por Cod SAP';
  ASSERT (SELECT origen FROM map_producto_drogueria WHERE drogueria_id = 'd0000000-0000-0000-0000-000000000002' AND codigo_drogueria = 'NEN-5555') = 'importacion',
         'el mapeo se aprendió del reporte';
  RAISE NOTICE 'OK 15: nombres normalizados y aprendizaje por Cod SAP';
END $$;

-- ---------------------------------------------------------------- 16. corregir un mapeo equivocado
DO $$
DECLARE m uuid; n integer;
BEGIN
  -- Se había asignado mal COB-777 (era otra farmacia): se corrige y se reprocesa el histórico.
  SELECT id INTO m FROM map_cliente_drogueria WHERE codigo_cuenta = 'COB-777' AND drogueria_id = 'd0000000-0000-0000-0000-000000000001';
  UPDATE map_cliente_drogueria SET cliente_id = 'c0000000-0000-0000-0000-000000000001' WHERE id = m;
  PERFORM reprocesar_homologacion('d0000000-0000-0000-0000-000000000001');
  SELECT unidades INTO n FROM fact_compras_mensual WHERE cliente_id = 'c0000000-0000-0000-0000-000000000001' AND producto_id = 'f0000000-0000-0000-0000-000000000001' AND periodo = '2026-03-01' AND deleted_at IS NULL;
  ASSERT n = 66, 'La Paz suma 16 + 20 (Cobeca) + 30 (Nena) = 66, tiene ' || coalesce(n::text, 'NULL');
  ASSERT (SELECT count(*) FROM fact_compras_mensual WHERE cliente_id = 'c0000000-0000-0000-0000-0000000000a2' AND deleted_at IS NULL) = 0,
         'lo de San José se retiró del consolidado';
  UPDATE map_cliente_drogueria SET cliente_id = 'c0000000-0000-0000-0000-0000000000a2' WHERE id = m;
  PERFORM reprocesar_homologacion('d0000000-0000-0000-0000-000000000001');
  RAISE NOTICE 'OK 16: corrección + reprocesado';
END $$;

-- ---------------------------------------------------------------- 17. importar homologaciones por clave natural
DO $$
DECLARE r jsonb;
BEGIN
  r := importar_homologacion('{"clientes":[
      {"drogueria":"NENA","codigo_interno":"CLI-2002","codigo_cuenta":"NEN-88","nombre":"SAN JOSE"},
      {"drogueria":"NENA","codigo_interno":"CLI-9999","codigo_cuenta":"NEN-99"},
      {"drogueria":"NENA","codigo_interno":"CLI-2002","codigo_cuenta":"NEN-77"}],
    "productos":[
      {"drogueria":"NENA","sku":"SKU-2","codigo":"NEN-20","descripcion":"ATORVASTATINA 20"},
      {"drogueria":"NENA","sku":"SKU-404","codigo":"NEN-404"},
      {"drogueria":"Cobeca","sku":"SKU-3","codigo":"COB-LOS"}]}');
  ASSERT (r->>'clientes')::int = 1, 'una farmacia nueva: ' || r::text;
  ASSERT (r->>'productos')::int = 1, 'un producto nuevo: ' || r::text;
  ASSERT jsonb_array_length(r->'omitidos') = 4, 'CLI-9999 y SKU-404 inexistentes; NEN-77 y COB-LOS ya son de otros: ' || r::text;
  ASSERT (SELECT es_principal FROM map_cliente_drogueria WHERE codigo_cuenta = 'NEN-88'), 'primera cuenta de San José en Nena = principal';
  RAISE NOTICE 'OK 17: importación de homologaciones con reporte de omitidos';
END $$;

-- ---------------------------------------------------------------- 17b. reimportar no le quita el principal a nadie
DO $$
DECLARE r jsonb;
BEGIN
  r := importar_homologacion('{"productos":[{"drogueria":"COBECA","sku":"SKU-1","codigo":"COB-LOS-OLD","principal":true}],
                               "clientes":[{"drogueria":"COBECA","codigo_interno":"CLI-1001","codigo_cuenta":"COB-1001","principal":true}]}');
  ASSERT (r->>'productos')::int = 0 AND (r->>'clientes')::int = 0, 'nada nuevo: ' || r::text;
  ASSERT (SELECT codigo_drogueria FROM map_producto_drogueria WHERE drogueria_id = 'd0000000-0000-0000-0000-000000000001'
            AND producto_id = 'f0000000-0000-0000-0000-000000000001' AND es_principal AND deleted_at IS NULL) = 'COB-LOS', 'el principal del producto no cambió';
  ASSERT (SELECT codigo_cuenta FROM map_cliente_drogueria WHERE drogueria_id = 'd0000000-0000-0000-0000-000000000001'
            AND cliente_id = 'c0000000-0000-0000-0000-000000000001' AND es_principal AND deleted_at IS NULL) = 'COB-1001', 'el principal de la farmacia no cambió';
  RAISE NOTICE 'OK 17b: un reimport idempotente no altera los códigos principales';
END $$;

-- ---------------------------------------------------------------- 18. permisos
RESET ROLE; SET ROLE authenticated;
SELECT t.como(:v2);
DO $$
DECLARE n integer;
BEGIN
  BEGIN PERFORM importar_ventas_drogueria('{"checksum":"z"}', '[]'); ASSERT false, 'el vendedor no importa';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM homologar_cliente('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'ZZ'); ASSERT false, 'el vendedor no homologa';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  SELECT count(*) INTO n FROM fact_ventas_drogueria;
  ASSERT n = 0, 'el vendedor no lee las ventas crudas';
  -- Pero sí ve el consolidado de las farmacias que atiende (v2 atiende solo CLI-1001).
  ASSERT (SELECT count(*) FROM fact_compras_mensual WHERE cliente_id = 'c0000000-0000-0000-0000-000000000001') > 0, 've compras de su farmacia';
  ASSERT (SELECT count(*) FROM fact_compras_mensual WHERE cliente_id = 'c0000000-0000-0000-0000-0000000000a2') = 0, 'no ve las de otra farmacia';
  RAISE NOTICE 'OK 18: permisos de importación y lectura';
END $$;

-- ---------------------------------------------------------------- 19. catálogos: el RIF compartido por una cadena es válido
SELECT t.como(:admin);
DO $$
DECLARE n integer;
BEGIN
  n := importar_catalogo_clientes('[
    {"codigo_interno":"FT-001","razon_social":"Farmatodo C.A.","nombre_comercial":"Farmatodo Altamira","rif":"J-00000001-0","brick":"CCS-03","lat":10.5,"lon":-66.85,"frecuencia_dias":7},
    {"codigo_interno":"FT-002","razon_social":"Farmatodo C.A.","nombre_comercial":"Farmatodo Chacao","rif":"J-00000001-0","brick":"CCS-03"}]');
  ASSERT n = 2, 'dos locales con el mismo RIF';
  ASSERT (SELECT locales FROM vw_clientes_rif_repetido WHERE rif_normalizado = 'J000000010') = 2, 'el aviso de RIF repetido los lista';
  ASSERT (SELECT lat FROM dim_clientes WHERE codigo_interno = 'FT-001') = 10.5, 'coordenadas guardadas';
  n := importar_catalogo_productos('[{"sku":"SKU-9","nombre_comercial":"Producto Nuevo","empaque_minimo":6,"categoria":"otc"}]');
  ASSERT n = 1;
  n := importar_catalogo_productos('[{"sku":"SKU-9","nombre_comercial":"Producto Nuevo 2","empaque_minimo":12}]');
  ASSERT (SELECT nombre_comercial FROM dim_productos WHERE sku = 'SKU-9') = 'Producto Nuevo 2', 'reimportar actualiza, no duplica';
  RAISE NOTICE 'OK 19: catálogos por clave natural y RIF compartido';
END $$;

-- ---------------------------------------------------------------- 20. borrar un lote retira sus compras
DO $$
DECLARE l uuid;
BEGIN
  SELECT id INTO l FROM import_lotes WHERE checksum = 'chk-nena';
  PERFORM borrar_lote_ventas(l);
  ASSERT (SELECT count(*) FROM fact_ventas_drogueria WHERE lote_id = l) = 0;
  ASSERT (SELECT count(*) FROM fact_compras_mensual WHERE cliente_id = 'c0000000-0000-0000-0000-000000000001'
            AND producto_id = 'f0000000-0000-0000-0000-000000000001' AND periodo = '2026-03-01' AND deleted_at IS NULL AND unidades = 16) = 1,
         'el consolidado de marzo conserva lo de Cobeca (lote distinto)';
  ASSERT (SELECT count(*) FROM fact_compras_mensual WHERE producto_id = 'f0000000-0000-0000-0000-000000000003' AND deleted_at IS NULL) = 0,
         'lo de Omeprazol (solo estaba en el lote borrado) se dio de baja';
  RAISE NOTICE 'OK 20: borrar lote y recalcular';
END $$;

-- ---------------------------------------------------------------- 21. las compras reportadas cuentan para alertas
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM importar_ventas_drogueria('{"archivo":"reciente.csv","checksum":"chk-reciente"}', jsonb_build_array(
    jsonb_build_object('n',1,'fecha',current_date::text,'drogueria','COBECA','cod_cliente','COB-1001','nombre_cliente','LA PAZ','cod_producto','COB-XYZ','unidades',3)));
  r := generar_alertas_comerciales();
  ASSERT NOT EXISTS (SELECT 1 FROM alertas_comerciales WHERE tipo = 'sku_hueso' AND producto_id = 'f0000000-0000-0000-0000-000000000002'
                       AND resuelta_en IS NULL AND territorio IS NULL),
         'un producto vendido esta semana (según la droguería) no es SKU hueso';
  RAISE NOTICE 'OK 21: alertas consideran compras reportadas %', r;
END $$;

-- ---------------------------------------------------------------- 22. alta de usuarios sin escalada de privilegios
RESET ROLE;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-0000-0000-0000000000e1', 'intruso@nova.test', '{"rol":"admin","equipo":"A","nombre_completo":"Intruso"}');
SET ROLE authenticated;
SELECT t.como('a0000000-0000-0000-0000-0000000000e1');
DO $$
BEGIN
  ASSERT (SELECT rol FROM dim_usuarios WHERE id = 'a0000000-0000-0000-0000-0000000000e1') = 'vendedor', 'el rol de los metadatos se ignora';
  ASSERT NOT (SELECT activo FROM dim_usuarios WHERE id = 'a0000000-0000-0000-0000-0000000000e1'), 'nace inactivo';
  ASSERT app.rol() IS NULL, 'sin fila activa no tiene rol';
  BEGIN PERFORM admin_configurar_usuario('a0000000-0000-0000-0000-0000000000e1', 'admin'); ASSERT false, 'no puede autopromoverse';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:admin);
DO $$
BEGIN
  PERFORM admin_configurar_usuario('a0000000-0000-0000-0000-0000000000e1', 'vendedor', 'ETICO', true, 'Nuevo Vendedor');
  ASSERT (SELECT activo AND rol = 'vendedor' AND equipo_id IS NOT NULL FROM dim_usuarios WHERE id = 'a0000000-0000-0000-0000-0000000000e1');
  PERFORM admin_configurar_usuario('a0000000-0000-0000-0000-0000000000e1', 'vendedor', 'b', true);   -- el equipo B no existía: se crea
  ASSERT (SELECT e.codigo FROM dim_usuarios u JOIN dim_equipos e ON e.id = u.equipo_id WHERE u.id = 'a0000000-0000-0000-0000-0000000000e1') = 'B';
  PERFORM admin_configurar_usuario('a0000000-0000-0000-0000-0000000000e1', 'gerente', 'TODOS', true);
  ASSERT (SELECT equipo_id IS NULL AND rol = 'gerente' FROM dim_usuarios WHERE id = 'a0000000-0000-0000-0000-0000000000e1'), 'TODOS = sin equipo';
  BEGIN PERFORM admin_configurar_usuario('a0000000-0000-0000-0000-000000000001', 'vendedor'); ASSERT false, 'el admin no se degrada a sí mismo';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  RAISE NOTICE 'OK 22: alta de usuarios: mínimo privilegio, inactivo hasta que un admin lo configure';
END $$;

-- ---------------------------------------------------------------- 23. anon no llega a lo nuevo; un correo repetido no bloquea el registro
RESET ROLE;
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-0000000000e2', 'INTRUSO@nova.test');   -- mismo correo (otra capitalización) que ya existe en dim_usuarios
SET ROLE anon;
DO $$
BEGIN
  BEGIN PERFORM count(*) FROM vw_pendientes_clientes; ASSERT false, 'anon no lee vistas';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM count(*) FROM fact_compras_mensual; ASSERT false, 'anon no lee compras';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM importar_ventas_drogueria('{"checksum":"x"}', '[]'); ASSERT false, 'anon no ejecuta RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM homologar_cliente('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'X'); ASSERT false;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'OK 23: anon sin acceso a lo nuevo; el registro con correo repetido no falla';
END $$;
RESET ROLE;
\echo HOMOLOGACION: TODOS LOS ESCENARIOS PASARON
