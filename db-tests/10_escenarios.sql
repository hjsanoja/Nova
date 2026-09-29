-- Escenarios de negocio sobre nova_produccion_v3.sql. Cada ASSERT que falla aborta la corrida.
-- Ejecutar: psql -v ON_ERROR_STOP=1 -d nova -f db-tests/00_stub_supabase.sql -f src/sql/nova_produccion_v3.sql -f db-tests/10_escenarios.sql
\set ON_ERROR_STOP on
\set QUIET on

-- ---------------------------------------------------------------- datos base (como superusuario)
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001','admin@nova.test'),
  ('a0000000-0000-0000-0000-0000000000b1','t1@nova.test'),
  ('a0000000-0000-0000-0000-0000000000b2','t2@nova.test'),
  ('a0000000-0000-0000-0000-0000000000c1','v1@nova.test'),
  ('a0000000-0000-0000-0000-0000000000c2','v2@nova.test');
INSERT INTO dim_equipos (id, codigo, nombre, linea) VALUES
  ('e0000000-0000-0000-0000-000000000001','ETICO','Equipo Ético','etico'),
  ('e0000000-0000-0000-0000-000000000002','OTC','Equipo Consumo/OTC','otc');
INSERT INTO dim_usuarios (id, nombre_completo, email, rol, equipo_id) VALUES
  ('a0000000-0000-0000-0000-000000000001','Admin','admin@nova.test','admin',NULL),
  ('a0000000-0000-0000-0000-0000000000b1','Transferencista 1','t1@nova.test','transferencista',NULL),
  ('a0000000-0000-0000-0000-0000000000b2','Transferencista 2','t2@nova.test','transferencista',NULL),
  ('a0000000-0000-0000-0000-0000000000c1','Vendedor Ético','v1@nova.test','vendedor','e0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000c2','Vendedor OTC','v2@nova.test','vendedor','e0000000-0000-0000-0000-000000000002');
INSERT INTO dim_droguerias (id, codigo, nombre) VALUES
  ('d0000000-0000-0000-0000-000000000001','COBECA','Cobeca'),
  ('d0000000-0000-0000-0000-000000000002','NENA','Nena');
INSERT INTO dim_productos (id, sku, ean13, nombre_comercial, categoria) VALUES
  ('f0000000-0000-0000-0000-000000000001','SKU-1','7590000000011','Losartán 50mg','cardio'),
  ('f0000000-0000-0000-0000-000000000002','SKU-2','7590000000028','Atorvastatina 20mg','cardio'),
  ('f0000000-0000-0000-0000-000000000003','SKU-3','7590000000035','Omeprazol 20mg','gastro');
INSERT INTO dim_clientes (id, codigo_interno, razon_social, nombre_comercial, rif, rif_verificado, estado_validacion,
                          ubicacion, frecuencia_dias, brick, creado_por)
VALUES ('c0000000-0000-0000-0000-000000000001','CLI-1001','Farmacia La Paz C.A.','La Paz','J-30489218-4',true,'activo',
        ST_SetSRID(ST_MakePoint(-66.8500, 10.5000),4326)::geography, 7, 'CCS-01', NULL);
INSERT INTO map_cliente_drogueria (drogueria_id, cliente_id, codigo_cuenta) VALUES
  ('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','COB-1001'),
  ('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','NEN-77');
INSERT INTO rel_cliente_vendedor (cliente_id, vendedor_id, equipo_id) VALUES   -- regla 5: dos equipos atienden la misma farmacia
  ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000c1','e0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000c2','e0000000-0000-0000-0000-000000000002');
INSERT INTO config_reglas_comerciales (nombre, alcance, descuento_max_pct) VALUES ('Base', 'linea', 5);
INSERT INTO config_reglas_comerciales (nombre, alcance, descuento_max_pct, min_skus_distintos) VALUES ('Mix 3 SKUs', 'linea', 12, 3);

CREATE SCHEMA t;
CREATE FUNCTION t.como(p_usuario uuid) RETURNS void LANGUAGE sql AS
  $$ SELECT set_config('request.jwt.claim.sub', p_usuario::text, false) $$;
GRANT USAGE ON SCHEMA t TO authenticated, anon;

\set admin   '''a0000000-0000-0000-0000-000000000001'''
\set t1      '''a0000000-0000-0000-0000-0000000000b1'''
\set t2      '''a0000000-0000-0000-0000-0000000000b2'''
\set v1      '''a0000000-0000-0000-0000-0000000000c1'''
\set v2      '''a0000000-0000-0000-0000-0000000000c2'''

-- ---------------------------------------------------------------- 1. crear pedidos (vendedor Ético)
SET ROLE authenticated;
SELECT t.como(:v1);
DO $$
DECLARE r jsonb; r2 jsonb;
  ped1 jsonb := '{"id":"b0000000-0000-0000-0000-000000000001","folio_local":"L-1","cliente_id":"c0000000-0000-0000-0000-000000000001",
    "drogueria_id":"d0000000-0000-0000-0000-000000000001","observaciones":"urgente",
    "detalles":[{"id":"aa000000-0000-0000-0000-000000000001","producto_id":"f0000000-0000-0000-0000-000000000001","unidades_solicitadas":10,"descuento_pct":10},
                {"id":"aa000000-0000-0000-0000-000000000002","producto_id":"f0000000-0000-0000-0000-000000000002","unidades_solicitadas":8},
                {"id":"aa000000-0000-0000-0000-000000000003","producto_id":"f0000000-0000-0000-0000-000000000003","unidades_solicitadas":6}]}';
BEGIN
  r := sync_crear_pedido(ped1);
  ASSERT r->>'correlativo' = 'PED-1001', 'correlativo raíz: ' || (r->>'correlativo');
  ASSERT r->>'estado' = 'enviado_teletransferencia', 'con 3 SKUs el 10% está permitido (tope 12%): ' || (r->>'estado');
  r2 := sync_crear_pedido(ped1);
  ASSERT (r2->>'ya_existia')::boolean, 'reintento idempotente';
  ASSERT r2->>'correlativo' = 'PED-1001', 'mismo correlativo al reintentar';

  -- Un solo SKU con 10% supera el tope base (5%): queda en revisión especial (regla 3).
  r := sync_crear_pedido('{"id":"b0000000-0000-0000-0000-000000000002","cliente_id":"c0000000-0000-0000-0000-000000000001",
      "drogueria_id":"d0000000-0000-0000-0000-000000000001",
      "detalles":[{"producto_id":"f0000000-0000-0000-0000-000000000001","unidades_solicitadas":4,"descuento_pct":10}]}');
  ASSERT r->>'estado' = 'en_revision' AND (r->>'requiere_revision_especial')::boolean, 'descuento fuera de rango -> revisión especial';
  ASSERT r->'motivos_revision'->0->>'tipo' = 'descuento_linea_excedido';
  RAISE NOTICE 'OK 1: creación idempotente y validación de políticas';
END $$;

-- ---------------------------------------------------------------- 2. visibilidad cruzada (regla 5)
SELECT t.como(:v2);
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM fact_pedidos WHERE cliente_id = 'c0000000-0000-0000-0000-000000000001';
  ASSERT n = 2, 'el vendedor OTC ve los pedidos del vendedor Ético en la farmacia común: ' || n;
  SELECT count(*) INTO n FROM historial_cliente_cruzado('c0000000-0000-0000-0000-000000000001');
  ASSERT n = 4, 'historial cruzado devuelve las 4 líneas: ' || n;
  UPDATE fact_pedidos SET observaciones = 'hack' WHERE id = 'b0000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'pero no puede modificarlos';
  RAISE NOTICE 'OK 2: visibilidad cruzada entre equipos';
END $$;

-- ---------------------------------------------------------------- 3. prospecto (regla 4)
SELECT t.como(:v1);
DO $$
DECLARE r jsonb; est estado_validacion_cliente;
BEGIN
  r := sync_crear_prospecto('{"id":"c0000000-0000-0000-0000-0000000000f1","razon_social":"Farmacia Nueva C.A.","rif":"J-11111111-1","lat":10.5,"lon":-66.85}');
  ASSERT r->>'estado_validacion' = 'prospecto_pendiente';
  UPDATE dim_clientes SET estado_validacion = 'activo', rif_verificado = true WHERE id = 'c0000000-0000-0000-0000-0000000000f1';
  SELECT estado_validacion INTO est FROM dim_clientes WHERE id = 'c0000000-0000-0000-0000-0000000000f1';
  ASSERT est = 'prospecto_pendiente', 'el vendedor no puede auto-aprobar a su prospecto';
  r := sync_crear_pedido('{"id":"b0000000-0000-0000-0000-000000000003","cliente_id":"c0000000-0000-0000-0000-0000000000f1",
      "drogueria_id":"d0000000-0000-0000-0000-000000000001",
      "detalles":[{"producto_id":"f0000000-0000-0000-0000-000000000001","unidades_solicitadas":5}]}');
  ASSERT r->>'estado' = 'en_revision' AND r->'motivos_revision'->0->>'tipo' = 'cliente_no_validado',
         'pedido de prospecto retenido: ' || r::text;
  RAISE NOTICE 'OK 3: prospecto retenido';
END $$;

SELECT t.como(:t1);
DO $$
DECLARE r jsonb;
BEGIN
  r := tomar_pedido('b0000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM confirmar_pedido('b0000000-0000-0000-0000-000000000003',
      '[{"detalle_id":null,"unidades_confirmadas":1}]'::jsonb);
    ASSERT false, 'no debió permitir transferir a un prospecto';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL; END;
  -- Sin homologación con droguería no se puede activar.
  BEGIN
    UPDATE dim_clientes SET rif_verificado = true, estado_validacion = 'activo' WHERE id = 'c0000000-0000-0000-0000-0000000000f1';
    ASSERT false, 'no debió activar sin homologación';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL; END;
  PERFORM aprobar_prospecto('c0000000-0000-0000-0000-0000000000f1', true, 'd0000000-0000-0000-0000-000000000001', 'COB-NEW', 'CLI-2000');
  ASSERT (SELECT estado FROM fact_pedidos WHERE id = 'b0000000-0000-0000-0000-000000000003') = 'enviado_teletransferencia',
         'al aprobar, sus pedidos retenidos pasan a la bandeja';
  PERFORM liberar_pedido('b0000000-0000-0000-0000-000000000003');
  RAISE NOTICE 'OK 3b: aprobación de prospecto libera pedidos';
END $$;

-- ---------------------------------------------------------------- 4. bloqueo + confirmación parcial (regla 2)
SELECT t.como(:t1);
DO $$
DECLARE r jsonb;
BEGIN
  r := tomar_pedido('b0000000-0000-0000-0000-000000000001');
  ASSERT (r->>'ok')::boolean, 'T1 toma el pedido';
END $$;
SELECT t.como(:t2);
DO $$
DECLARE r jsonb;
BEGIN
  r := tomar_pedido('b0000000-0000-0000-0000-000000000001');
  ASSERT NOT (r->>'ok')::boolean AND r->>'nombre' = 'Transferencista 1', 'T2 ve quién lo tiene: ' || r::text;
  BEGIN
    PERFORM confirmar_pedido('b0000000-0000-0000-0000-000000000001', '[]'::jsonb);
    ASSERT false, 'T2 no puede confirmar un pedido bloqueado por T1';
  EXCEPTION WHEN sqlstate 'P0001' THEN NULL; END;
  RAISE NOTICE 'OK 4a: bloqueo optimista';
END $$;
SELECT t.como(:t1);
DO $$
DECLARE r jsonb;
BEGIN
  r := confirmar_pedido('b0000000-0000-0000-0000-000000000001', '[
     {"detalle_id":"aa000000-0000-0000-0000-000000000001","unidades_confirmadas":10},
     {"detalle_id":"aa000000-0000-0000-0000-000000000002","unidades_confirmadas":3,"motivo":"quiebre_stock_drogueria"},
     {"detalle_id":"aa000000-0000-0000-0000-000000000003","unidades_confirmadas":0,"motivo":"quiebre_stock_drogueria"}]', 'FAC-1');
  ASSERT r->>'estado' = 'procesado_parcial' AND (r->>'lineas_pendientes')::int = 2, 'parcial: ' || r::text;
  RAISE NOTICE 'OK 4b: procesado_parcial';
END $$;

-- ---------------------------------------------------------------- 5. re-ruteo del remanente -> PED-1001-R1
SELECT t.como(:v1);
DO $$
DECLARE n integer; r jsonb; r2 jsonb; hijo fact_pedidos; u integer;
BEGIN
  SELECT count(*) INTO n FROM notificaciones WHERE usuario_id = 'a0000000-0000-0000-0000-0000000000c1' AND tipo = 'pedido_parcial';
  ASSERT n = 1, 'el vendedor recibió la notificación';
  BEGIN
    PERFORM rerutear_remanente('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001');
    ASSERT false, 'no debió permitir la misma droguería';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;

  r := rerutear_remanente('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
                          'b0000000-0000-0000-0000-0000000000a1');
  ASSERT r->>'correlativo' = 'PED-1001-R1' AND r->>'estado' = 'en_revision', 'hijo: ' || r::text;
  SELECT * INTO hijo FROM fact_pedidos WHERE id = 'b0000000-0000-0000-0000-0000000000a1';
  ASSERT hijo.parent_pedido_id = 'b0000000-0000-0000-0000-000000000001' AND hijo.drogueria_id = 'd0000000-0000-0000-0000-000000000002';
  SELECT sum(unidades_solicitadas) INTO u FROM fact_pedido_detalles WHERE pedido_id = hijo.id;
  ASSERT u = 5 + 6, 'solo lo pendiente (5 + 6): ' || u;   -- SKU-2: 8-3=5, SKU-3: 6-0=6, SKU-1 completo no viaja
  r2 := rerutear_remanente('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
                           'b0000000-0000-0000-0000-0000000000a1');
  ASSERT (r2->>'ya_existia')::boolean AND jsonb_array_length(r2->'detalles') = 2, 'idempotente por id del hijo, con sus líneas';
  ASSERT jsonb_array_length(r->'detalles') = 2, 'el ack trae las líneas del hijo';
  BEGIN
    PERFORM rerutear_remanente('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002');
    ASSERT false, 'ya no hay remanente';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  RAISE NOTICE 'OK 5: split order PED-1001 -> PED-1001-R1';
END $$;

-- El hijo (R1) también sale parcial y se re-rutea otra vez: PED-1001-R2 con parent = R1.
SELECT t.como(:t1);
DO $$
DECLARE r jsonb; det record;
BEGIN
  PERFORM tomar_pedido('b0000000-0000-0000-0000-0000000000a1');
  SELECT jsonb_agg(jsonb_build_object('detalle_id', id, 'unidades_confirmadas', 1)) INTO r
    FROM fact_pedido_detalles WHERE pedido_id = 'b0000000-0000-0000-0000-0000000000a1';
  ASSERT (confirmar_pedido('b0000000-0000-0000-0000-0000000000a1', r)->>'estado') = 'procesado_parcial';
END $$;
SELECT t.como(:v1);
DO $$
DECLARE r jsonb;
BEGIN
  r := rerutear_remanente('b0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000001',
                          'b0000000-0000-0000-0000-0000000000a2');
  ASSERT r->>'correlativo' = 'PED-1001-R2', 'la numeración sigue la raíz: ' || (r->>'correlativo');
  ASSERT (SELECT parent_pedido_id FROM fact_pedidos WHERE id = 'b0000000-0000-0000-0000-0000000000a2') = 'b0000000-0000-0000-0000-0000000000a1';
  RAISE NOTICE 'OK 5b: cadena de derivados';
END $$;

-- ---------------------------------------------------------------- 6. concurrencia optimista al modificar
SELECT t.como(:v1);
DO $$
DECLARE r jsonb;
BEGIN
  r := sync_modificar_pedido('{"id":"b0000000-0000-0000-0000-000000000002","base_version":999,"observaciones":"x"}');
  ASSERT (r->>'conflicto')::boolean, 'versión vieja -> conflicto';
  r := sync_modificar_pedido('{"id":"b0000000-0000-0000-0000-000000000001","base_version":1,"observaciones":"x"}');
  ASSERT (r->>'conflicto')::boolean AND r->>'estado' = 'procesado_parcial', 'pedido ya procesado no se modifica';
  RAISE NOTICE 'OK 6: conflictos de edición';
END $$;

-- ---------------------------------------------------------------- 7. geofencing
SELECT t.como(:v1);
DO $$
DECLARE r jsonb;
BEGIN
  r := sync_registrar_visita('{"id":"91000000-0000-0000-0000-000000000001","cliente_id":"c0000000-0000-0000-0000-000000000001",
       "checkin_en":"2026-09-30T10:00:00Z","lat":10.50030,"lon":-66.8500}');       -- ~33 m
  ASSERT (r->>'dentro_de_radio')::boolean AND (r->>'distancia_metros')::numeric < 100, 'dentro: ' || r::text;
  r := sync_registrar_visita('{"id":"91000000-0000-0000-0000-000000000002","cliente_id":"c0000000-0000-0000-0000-000000000001",
       "checkin_en":"2026-09-30T11:00:00Z","lat":10.5050,"lon":-66.8500}');        -- ~555 m
  ASSERT NOT (r->>'dentro_de_radio')::boolean AND (r->>'distancia_metros')::numeric > 500, 'fuera: ' || r::text;
  RAISE NOTICE 'OK 7: geofencing';
END $$;

-- ---------------------------------------------------------------- 8. máquina de estados
SELECT t.como(:t1);
DO $$
BEGIN
  BEGIN
    UPDATE fact_pedidos SET estado = 'borrador' WHERE id = 'b0000000-0000-0000-0000-000000000001';
    ASSERT false, 'transición inválida permitida';
  EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  RAISE NOTICE 'OK 8: transiciones';
END $$;

-- ---------------------------------------------------------------- 9. analítica (admin)
RESET ROLE;
INSERT INTO dim_productos (id, sku, nombre_comercial, categoria) VALUES
  ('f0000000-0000-0000-0000-000000000004','SKU-HUESO','Producto sin rotación','otros');
INSERT INTO dim_clientes (id, razon_social, nombre_comercial, rif, rif_verificado, estado_validacion, frecuencia_dias, created_at) VALUES
  ('c0000000-0000-0000-0000-000000000002','Farmacia Dormida','Dormida','J-22222222-2',true,'activo',7, now() - interval '40 days');
SET ROLE authenticated;
SELECT t.como(:admin);
DO $$
DECLARE r jsonb;
BEGIN
  r := generar_alertas_comerciales();
  ASSERT (r->>'sku_hueso')::int >= 1, 'SKU hueso detectado: ' || r::text;
  ASSERT (r->>'churn_riesgo')::int >= 1, 'abandono detectado: ' || r::text;
  ASSERT (SELECT severidad FROM alertas_comerciales WHERE tipo = 'churn_riesgo' AND resuelta_en IS NULL LIMIT 1) = 3,
         '40 días sin pedir con ciclo de 7 = severidad alta';
  r := generar_alertas_comerciales();                    -- reejecutar no duplica alertas abiertas
  ASSERT (SELECT count(*) FROM alertas_comerciales WHERE tipo = 'churn_riesgo' AND resuelta_en IS NULL) = 1;
  PERFORM recalcular_segmentos_clientes();
  RAISE NOTICE 'OK 9: alertas % ', r;
END $$;

-- ---------------------------------------------------------------- 10. purga segura
SELECT t.como(:v1);
DO $$
BEGIN
  BEGIN PERFORM purgar_base_datos_pruebas('cualquiera', true); ASSERT false, 'vendedor no debe purgar';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:admin);
DO $$
DECLARE r jsonb;
BEGIN
  BEGIN PERFORM purgar_base_datos_pruebas('x', true); ASSERT false, 'purga deshabilitada por defecto';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
RESET ROLE;
UPDATE config_sistema SET valor = 'true'::jsonb WHERE clave = 'purga_habilitada';
SET ROLE authenticated;
SELECT t.como(:admin);
DO $$
DECLARE r jsonb; n integer;
BEGIN
  PERFORM configurar_password_purga('clave-de-purga-123');
  r := purgar_base_datos_pruebas('mala', true);
  ASSERT NOT (r->>'ok')::boolean AND r->>'error' = 'credenciales_invalidas';
  r := purgar_base_datos_pruebas('clave-de-purga-123', true);
  ASSERT (r->>'ok')::boolean;
  SELECT count(*) INTO n FROM fact_pedidos;
  ASSERT n = 0, 'pedidos purgados';
  ASSERT (SELECT count(*) FROM dim_clientes) > 0, 'solo transaccional: los clientes se conservan';
  ASSERT (SELECT count(*) FROM dim_usuarios) = 5, 'usuarios intactos';
  r := sync_crear_pedido('{"id":"b0000000-0000-0000-0000-000000000009","cliente_id":"c0000000-0000-0000-0000-000000000001",
      "drogueria_id":"d0000000-0000-0000-0000-000000000001",
      "detalles":[{"producto_id":"f0000000-0000-0000-0000-000000000001","unidades_solicitadas":1}]}');
  RAISE NOTICE 'OK 10: purga; el correlativo reinicia en %', r->>'correlativo';
END $$;

-- ---------------------------------------------------------------- 11. anon no accede
RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
  BEGIN PERFORM count(*) FROM fact_pedidos; ASSERT false, 'anon no debe leer';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'OK 11: anon sin acceso';
END $$;
RESET ROLE;
\echo TODOS LOS ESCENARIOS PASARON
