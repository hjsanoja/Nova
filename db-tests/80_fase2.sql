-- Fase 2 (v9.0): metas con alertas y farmacias en riesgo. Se ejecuta tras 70_novedades.sql
-- (usuarios admin, t1, v1 y v2; Farmacia Norte en el fichero de v1, Farmacia Sur sin representante).
\set ON_ERROR_STOP on
\set QUIET on
\set admin '''a0000000-0000-0000-0000-000000000001'''
\set v1    '''a0000000-0000-0000-0000-0000000000c1'''
\set v2    '''a0000000-0000-0000-0000-0000000000c2'''

-- Datos: pedidos de marzo de 2025 (fechas fijas para que la prueba no dependa del día en que corre).
RESET ROLE;
DO $$
DECLARE
  v_norte uuid := 'c0000000-0000-0000-0000-0000000000a1';
  v_sur   uuid := 'c0000000-0000-0000-0000-0000000000a2';
  v_drog  uuid := 'd0000000-0000-0000-0000-0000000000a1';
  v_prod  uuid := 'f0000000-0000-0000-0000-0000000000a2';
  v_v1    uuid := 'a0000000-0000-0000-0000-0000000000c1';
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('e0000000-0000-0000-0000-000000000001'::uuid, v_norte, v_v1, timestamptz '2025-03-03 10:00-04', 'procesado_total', 10),
      ('e0000000-0000-0000-0000-000000000002'::uuid, v_norte, v_v1, timestamptz '2025-03-10 10:00-04', 'enviado_teletransferencia', 5),
      ('e0000000-0000-0000-0000-000000000003'::uuid, v_norte, v_v1, timestamptz '2025-03-17 10:00-04', 'borrador', 500),
      ('e0000000-0000-0000-0000-000000000004'::uuid, v_norte, v_v1, timestamptz '2025-03-31 23:30-04', 'rechazado', 500),
      ('e0000000-0000-0000-0000-000000000005'::uuid, v_sur,   'a0000000-0000-0000-0000-0000000000c2'::uuid, timestamptz '2025-03-04 10:00-04', 'procesado_total', 8)
    ) AS t(id, cliente, vendedor, fecha, estado, uds) LOOP
    INSERT INTO fact_pedidos (id, correlativo, cliente_id, drogueria_id, vendedor_id, estado)
    VALUES (r.id, 'pendiente', r.cliente, v_drog, r.vendedor, r.estado::estado_pedido);
    UPDATE fact_pedidos SET created_at = r.fecha WHERE id = r.id;
    INSERT INTO fact_pedido_detalles (pedido_id, linea, producto_id, unidades_solicitadas) VALUES (r.id, 1, v_prod, r.uds);
  END LOOP;
  INSERT INTO metas (id, periodo, vendedor_id, indicador, objetivo) VALUES
    ('e1000000-0000-0000-0000-000000000001', '2025-03-01', v_v1, 'unidades', 100),
    ('e1000000-0000-0000-0000-000000000002', '2025-03-01', v_v1, 'pedidos', 2),
    ('e1000000-0000-0000-0000-000000000003', '2025-03-01', NULL, 'farmacias', 2);
END $$;

-- ---------------------------------------------------------------- 46. avance y ritmo de las metas
DO $$
DECLARE r record;
BEGIN
  -- 20 de marzo: 19 días completos de 31 → se esperaba el 61,29 % del objetivo.
  SELECT * INTO r FROM app.avance_metas('2025-03-01', '2025-03-20') WHERE meta_id = 'e1000000-0000-0000-0000-000000000001';
  ASSERT r.valor = 15 AND r.esperado = 61.29 AND r.dias_restantes = 12 AND r.nivel = 'en_riesgo', 'unidades: ' || row_to_json(r)::text;
  SELECT * INTO r FROM app.avance_metas('2025-03-01', '2025-03-20') WHERE meta_id = 'e1000000-0000-0000-0000-000000000002';
  ASSERT r.valor = 2 AND r.nivel = 'cumplida', 'pedidos (sin borradores ni rechazados): ' || row_to_json(r)::text;
  SELECT * INTO r FROM app.avance_metas('2025-03-01', '2025-03-20') WHERE meta_id = 'e1000000-0000-0000-0000-000000000003';
  ASSERT r.valor = 2 AND r.nivel = 'cumplida', 'farmacias distintas de toda la empresa: ' || row_to_json(r)::text;
  ASSERT (SELECT nivel FROM app.avance_metas('2025-03-01', '2025-03-03') WHERE meta_id = 'e1000000-0000-0000-0000-000000000001') = 'inicio', 'los primeros días no se juzga';
  -- 13 de 100 el día 8 (7 días completos: se esperaban 22,58): 66 % → en riesgo; con 19 sería 84 % → atención.
  ASSERT (SELECT nivel FROM app.avance_metas('2025-03-01', '2025-03-08') WHERE meta_id = 'e1000000-0000-0000-0000-000000000001') = 'en_riesgo';
  UPDATE fact_pedido_detalles SET unidades_solicitadas = 14 WHERE pedido_id = 'e0000000-0000-0000-0000-000000000001';
  ASSERT (SELECT nivel FROM app.avance_metas('2025-03-01', '2025-03-08') WHERE meta_id = 'e1000000-0000-0000-0000-000000000001') = 'atencion';
  UPDATE fact_pedido_detalles SET unidades_solicitadas = 10 WHERE pedido_id = 'e0000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'OK 46: avance y ritmo de las metas (mismo cálculo que la app: en camino, atención, en riesgo, cumplida)';
END $$;

-- ---------------------------------------------------------------- 47. avisos de metas (sin repetir)
SET ROLE authenticated;
SELECT t.como(:v1);
DO $$ BEGIN
  BEGIN PERFORM revisar_metas('2025-03-20'); ASSERT false, 'solo la administración elige la fecha'; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  PERFORM revisar_metas();   -- sin fecha, cualquiera puede pedir la revisión del día
END $$;
SELECT t.como(:admin);
DO $$
DECLARE r jsonb; r2 jsonb;
BEGIN
  r := revisar_metas('2025-03-20');
  r2 := revisar_metas('2025-03-20');
  ASSERT (r->>'avisos_riesgo')::int >= 2 AND (r->>'avisos_cumplidas')::int >= 3, 'avisos: ' || r::text;
  ASSERT (r2->>'avisos_riesgo')::int = 0 AND (r2->>'avisos_cumplidas')::int = 0, 'la misma semana no se repite: ' || r2::text;
  -- La semana siguiente vuelve a avisar el riesgo; la cumplida nunca se repite.
  r2 := revisar_metas('2025-03-27');
  ASSERT (r2->>'avisos_riesgo')::int >= 2 AND (r2->>'avisos_cumplidas')::int = 0, 'semana siguiente: ' || r2::text;
END $$;
SELECT t.como(:v1);
DO $$
DECLARE n record;
BEGIN
  SELECT * INTO n FROM notificaciones WHERE clave = 'meta_riesgo:e1000000-0000-0000-0000-000000000001:2025-12';
  ASSERT n.titulo LIKE 'Meta en riesgo: %', 'título: ' || coalesce(n.titulo, '(sin aviso)');
  ASSERT n.cuerpo = 'Va en 15 de 100 unidades. A esta fecha debería llevar 61. Faltan 8 por día en los 12 días que quedan.', 'cuerpo: ' || n.cuerpo;
  ASSERT (SELECT count(*) FROM notificaciones WHERE tipo = 'meta_cumplida' AND clave LIKE '%e1000000%') = 1, 'v1 recibe solo su meta cumplida (la de empresa va a la gerencia)';
END $$;
SELECT t.como(:v2);
DO $$ BEGIN ASSERT (SELECT count(*) FROM notificaciones WHERE clave LIKE '%e1000000%') = 0, 'v2 no recibe avisos de metas ajenas'; END $$;
SELECT t.como(:admin);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM notificaciones WHERE tipo = 'meta_cumplida' AND clave LIKE '%e1000000%') = 2, 'la administración recibe la de v1 y la de empresa';
  RAISE NOTICE 'OK 47: avisos de metas en riesgo (una vez por semana) y cumplidas (una vez), al representante y a la gerencia';
END $$;

-- ---------------------------------------------------------------- 48. historial de compra por farmacia
RESET ROLE;
DO $$ BEGIN
  -- Pedidos de los últimos días (dentro del año) y una compra reportada por la droguería.
  UPDATE fact_pedidos SET created_at = now() - interval '40 days' WHERE id = 'e0000000-0000-0000-0000-000000000001';
  UPDATE fact_pedidos SET created_at = now() - interval '30 days' WHERE id = 'e0000000-0000-0000-0000-000000000002';
  UPDATE fact_pedidos SET created_at = now() - interval '20 days' WHERE id = 'e0000000-0000-0000-0000-000000000005';
  INSERT INTO fact_compras_mensual (cliente_id, producto_id, periodo, unidades, ultima_compra)
  VALUES ('c0000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000a2', date_trunc('month', current_date - 60)::date, 240, current_date - 60);
END $$;
SET ROLE authenticated;
SELECT t.como(:v1);
DO $$
DECLARE r record;
BEGIN
  ASSERT (SELECT count(*) FROM historial_compra_farmacias() WHERE cliente_id = 'c0000000-0000-0000-0000-0000000000a2') = 0, 'v1 solo ve su fichero';
  SELECT * INTO r FROM historial_compra_farmacias() WHERE cliente_id = 'c0000000-0000-0000-0000-0000000000a1';
  -- Fechas: hoy (pedido de la prueba 41), hace 30, 40 y 60 días (compra reportada) → saltos de 20, 10 y 30: mediana 20.
  ASSERT r.ultima = (now() AT TIME ZONE 'America/Caracas')::date, 'última compra: ' || row_to_json(r)::text;
  ASSERT r.compras = 4 AND r.ciclo_dias = 20, 'compras y ciclo: ' || row_to_json(r)::text;
  ASSERT r.unidades_mes = 20, 'la fuente mayor (240 reportadas vs. 15 pedidas) ÷ 12: ' || row_to_json(r)::text;
END $$;
SELECT t.como(:admin);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM historial_compra_farmacias() WHERE cliente_id IN ('c0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a2')) = 2, 'la administración ve todas';
  RAISE NOTICE 'OK 48: historial de compra por farmacia (última compra, ciclo y unidades; cada quien ve las suyas)';
END $$;
RESET ROLE;
\echo FASE 2: TODOS LOS ESCENARIOS PASARON
