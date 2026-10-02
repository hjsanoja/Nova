-- Fase 4 (v11.0): feriados, ciclos por equipo y metas por ciclo. Se ejecuta tras 90_crm.sql.
-- Equipos: ETICO (v1) y OTC (v2). Fechas de agosto de 2026 (ya pasadas) para poder cerrar el ciclo.
\set ON_ERROR_STOP on
\set QUIET on
\set admin '''a0000000-0000-0000-0000-000000000001'''
\set v1    '''a0000000-0000-0000-0000-0000000000c1'''
\set v2    '''a0000000-0000-0000-0000-0000000000c2'''

-- ---------------------------------------------------------------- 53. feriados y días hábiles
SET ROLE authenticated;
SELECT t.como(:admin);
DO $$
BEGIN
  INSERT INTO feriados (fecha, nombre) VALUES ('2027-01-01', 'Año Nuevo');
  INSERT INTO feriados (fecha, nombre, alcance, estados) VALUES ('2027-01-15', 'Feria regional', 'regional', '{Zulia}');
  BEGIN INSERT INTO feriados (fecha, nombre, alcance) VALUES ('2027-01-20', 'Sin estados', 'regional'); ASSERT false, 'regional sin estados'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO feriados (fecha, nombre) VALUES ('2027-01-01', 'Repetido'); ASSERT false, 'un feriado nacional por día'; EXCEPTION WHEN unique_violation THEN NULL; END;
  ASSERT dias_habiles('2027-01-01', '2027-01-31') = 20, 'enero 2027: 21 días de semana menos el 1 de enero';
  ASSERT dias_habiles('2027-01-01', '2027-01-31', ' zulia ') = 19, 'en Zulia también el feriado regional';
  ASSERT dias_habiles('2027-01-31', '2027-01-01') = 0;
END $$;
SELECT t.como(:v1);
DO $$ BEGIN
  BEGIN INSERT INTO feriados (fecha, nombre) VALUES ('2027-02-01', 'X'); ASSERT false, 'solo la administración'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT (SELECT count(*) FROM feriados) = 2, 'todos los ven';
  RAISE NOTICE 'OK 53: feriados nacionales y regionales, y días hábiles (lunes a viernes sin feriados)';
END $$;

-- ---------------------------------------------------------------- 54. ciclos por equipo
SELECT t.como(:admin);
DO $$
DECLARE v_etico uuid := 'e0000000-0000-0000-0000-000000000001'; v_otc uuid := 'e0000000-0000-0000-0000-000000000002';
BEGIN
  INSERT INTO ciclos (id, equipo_id, nombre, inicio, fin) VALUES ('c1000000-0000-0000-0000-000000000001', v_etico, 'C8-2026', '2026-08-03', '2026-08-28');
  BEGIN INSERT INTO ciclos (equipo_id, nombre, inicio, fin) VALUES (v_etico, 'X', '2027-01-01', '2027-01-29'); ASSERT false;
  EXCEPTION WHEN sqlstate '22023' THEN ASSERT SQLERRM LIKE '%empezar en un día hábil: el 01/01/2027 es feriado%', SQLERRM; END;
  BEGIN INSERT INTO ciclos (equipo_id, nombre, inicio, fin) VALUES (v_etico, 'X', '2027-01-04', '2027-01-30'); ASSERT false;
  EXCEPTION WHEN sqlstate '22023' THEN ASSERT SQLERRM LIKE '%terminar en un día hábil: el 30/01/2027 es fin de semana%', SQLERRM; END;
  BEGIN INSERT INTO ciclos (equipo_id, nombre, inicio, fin) VALUES (v_etico, 'X', '2026-08-24', '2026-09-18'); ASSERT false;
  EXCEPTION WHEN sqlstate '23P01' THEN ASSERT SQLERRM LIKE '%C8-2026%', SQLERRM; END;
  BEGIN INSERT INTO ciclos (equipo_id, nombre, inicio, fin) VALUES (v_etico, 'X', '2026-08-28', '2026-08-03'); ASSERT false; EXCEPTION WHEN check_violation THEN NULL; END;
  -- Otro equipo (y el ciclo general) pueden tener fechas distintas o iguales.
  INSERT INTO ciclos (id, equipo_id, nombre, inicio, fin) VALUES ('c1000000-0000-0000-0000-000000000002', v_otc, 'OTC-8', '2026-08-10', '2026-09-04');
  INSERT INTO ciclos (id, nombre, inicio, fin) VALUES ('c1000000-0000-0000-0000-000000000003', 'General 8', '2026-08-03', '2026-08-28');
  UPDATE ciclos SET nombre = 'C8 · 2026' WHERE id = 'c1000000-0000-0000-0000-000000000001';   -- sin cambiar fechas
  ASSERT (SELECT nombre FROM ciclos WHERE id = 'c1000000-0000-0000-0000-000000000001') = 'C8 · 2026';
END $$;
SELECT t.como(:v1);
DO $$ BEGIN
  BEGIN INSERT INTO ciclos (nombre, inicio, fin) VALUES ('Mío', '2026-11-02', '2026-11-27'); ASSERT false, 'solo la administración'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT (SELECT count(*) FROM ciclos) = 3, 'todos ven los ciclos';
  RAISE NOTICE 'OK 54: ciclos por equipo (empiezan y terminan en día hábil, sin cruzarse dentro del mismo equipo)';
END $$;

-- ---------------------------------------------------------------- 55. metas por ciclo y su avance
RESET ROLE;
DO $$
DECLARE
  v_norte uuid := 'c0000000-0000-0000-0000-0000000000a1';
  v_drog  uuid := 'd0000000-0000-0000-0000-0000000000a1';
  v_prod  uuid := 'f0000000-0000-0000-0000-0000000000a2';
  v_med   uuid := (SELECT id FROM dim_medicos WHERE codigo = 'MED-1');
  v_med2  uuid := (SELECT id FROM dim_medicos WHERE codigo = 'MED-2');
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('e2000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-0000000000c1'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, timestamptz '2026-08-04 10:00-04', 30),
      ('e2000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-0000000000c1'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, timestamptz '2026-08-12 10:00-04', 10),
      ('e2000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-0000000000c2'::uuid, 'e0000000-0000-0000-0000-000000000002'::uuid, timestamptz '2026-08-05 10:00-04', 99),
      ('e2000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-0000000000c1'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, timestamptz '2026-07-31 10:00-04', 99)
    ) AS t(id, vendedor, equipo, fecha, uds) LOOP
    INSERT INTO fact_pedidos (id, correlativo, cliente_id, drogueria_id, vendedor_id, equipo_id, estado)
    VALUES (r.id, 'pendiente', v_norte, v_drog, r.vendedor, r.equipo, 'procesado_total');
    UPDATE fact_pedidos SET created_at = r.fecha WHERE id = r.id;
    INSERT INTO fact_pedido_detalles (pedido_id, linea, producto_id, unidades_solicitadas) VALUES (r.id, 1, v_prod, r.uds);
  END LOOP;
  INSERT INTO crm_visitas (id, medico_id, vendedor_id, checkin_en, resultado) VALUES
    (gen_random_uuid(), v_med,  'a0000000-0000-0000-0000-0000000000c1', '2026-08-05 15:00-04', 'realizada'),
    (gen_random_uuid(), v_med,  'a0000000-0000-0000-0000-0000000000c1', '2026-08-11 15:00-04', 'realizada'),
    (gen_random_uuid(), v_med2, 'a0000000-0000-0000-0000-0000000000c1', '2026-08-06 15:00-04', 'no_atendio');
  INSERT INTO crm_visitas (id, cliente_id, vendedor_id, checkin_en, resultado) VALUES
    (gen_random_uuid(), v_norte, 'a0000000-0000-0000-0000-0000000000c1', '2026-08-07 11:00-04', 'sin_pedido'),
    (gen_random_uuid(), v_norte, 'a0000000-0000-0000-0000-0000000000c1', '2026-08-10 11:00-04', 'reprogramada');
  INSERT INTO metas (id, ciclo_id, vendedor_id, medico_id, indicador, objetivo) VALUES
    ('e3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', NULL, 'unidades', 100),
    ('e3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', NULL, 'visitas_medicos', 4),
    ('e3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', NULL, 'medicos_visitados', 2),
    ('e3000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', NULL, NULL, 'pedidos', 2),
    ('e3000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', NULL, 'visitas_farmacias', 1),
    ('e3000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000001', NULL, v_med, 'visitas_medicos', 2);
  BEGIN
    INSERT INTO metas (ciclo_id, vendedor_id, indicador, objetivo) VALUES ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'unidades', 5);
    ASSERT false, 'una meta igual por ciclo';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO metas (periodo, ciclo_id, indicador, objetivo) VALUES ('2026-08-01', 'c1000000-0000-0000-0000-000000000001', 'pedidos', 1); ASSERT false; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
DO $$
DECLARE r record; a jsonb;
BEGIN
  -- 17 de agosto: 10 días hábiles completos de 20.
  SELECT jsonb_object_agg(meta_id, jsonb_build_object('v', valor, 'e', esperado, 'n', nivel, 'r', habiles_restantes))
    INTO a FROM app.avance_metas_ciclo('c1000000-0000-0000-0000-000000000001', '2026-08-17');
  ASSERT a->'e3000000-0000-0000-0000-000000000001' = '{"v": 40, "e": 50.00, "n": "atencion", "r": 10}', 'unidades (sin julio ni otro equipo): ' || (a->'e3000000-0000-0000-0000-000000000001')::text;
  ASSERT a->'e3000000-0000-0000-0000-000000000002'->>'v' = '2' AND a->'e3000000-0000-0000-0000-000000000002'->>'n' = 'en_camino', 'visitas realizadas a médicos: ' || a::text;
  ASSERT a->'e3000000-0000-0000-0000-000000000003'->>'v' = '1', 'médicos distintos con visita realizada';
  ASSERT a->'e3000000-0000-0000-0000-000000000004'->>'v' = '2' AND a->'e3000000-0000-0000-0000-000000000004'->>'n' = 'cumplida', 'pedidos del equipo ético (no el de OTC)';
  ASSERT a->'e3000000-0000-0000-0000-000000000005'->>'v' = '1', 'visitas a farmacias sin las reprogramadas';
  ASSERT a->'e3000000-0000-0000-0000-000000000006'->>'v' = '2' AND a->'e3000000-0000-0000-0000-000000000006'->>'n' = 'cumplida', 'meta de un médico';
  ASSERT (SELECT nivel FROM app.avance_metas_ciclo('c1000000-0000-0000-0000-000000000001', '2026-08-04') WHERE meta_id = 'e3000000-0000-0000-0000-000000000001') = 'inicio', 'los primeros 2 días hábiles no se juzga';
  ASSERT (SELECT nivel FROM app.avance_metas_ciclo('c1000000-0000-0000-0000-000000000001', '2026-08-31') WHERE meta_id = 'e3000000-0000-0000-0000-000000000001') = 'no_cumplida';
  RAISE NOTICE 'OK 55: metas por ciclo (unidades, pedidos del equipo, visitas a médicos y farmacias, médicos visitados, por médico) con ritmo en días hábiles';
END $$;

-- ---------------------------------------------------------------- 56. repetir, ajustar, avisar y cerrar
SET ROLE authenticated;
SELECT t.como(:admin);
DO $$
DECLARE n integer; r jsonb;
BEGIN
  INSERT INTO ciclos (id, equipo_id, nombre, inicio, fin) VALUES ('c1000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000001', 'C9-2026', '2026-08-31', '2026-09-25');
  n := copiar_metas_ciclo('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000009', 1.1);
  ASSERT n = 6, 'copia las 6 metas: ' || n;
  ASSERT copiar_metas_ciclo('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000009') = 0, 'no duplica';
  ASSERT (SELECT objetivo FROM metas WHERE ciclo_id = 'c1000000-0000-0000-0000-000000000009' AND indicador = 'unidades') = 110, '+10%';
  ASSERT ajustar_metas_ciclo('c1000000-0000-0000-0000-000000000009', 0.5) = 6;
  ASSERT (SELECT objetivo FROM metas WHERE ciclo_id = 'c1000000-0000-0000-0000-000000000009' AND indicador = 'unidades') = 55;
  ASSERT (SELECT objetivo FROM metas WHERE ciclo_id = 'c1000000-0000-0000-0000-000000000009' AND indicador = 'medicos_visitados') = 1, 'nunca menos de 1';
  n := copiar_metas_ciclo('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000009', 1, true);
  ASSERT n = 6 AND (SELECT objetivo FROM metas WHERE ciclo_id = 'c1000000-0000-0000-0000-000000000009' AND indicador = 'unidades' AND deleted_at IS NULL) = 100, 'reemplazar';
  -- Avisos de metas de un ciclo vigente (día 17 de C8).
  r := revisar_metas('2026-08-17');
  ASSERT (SELECT count(*) FROM notificaciones WHERE clave LIKE 'meta_cumplida:e3000000%') >= 2, 'avisos de cumplida en el ciclo';
END $$;
SELECT t.como(:v1);
DO $$ BEGIN
  BEGIN PERFORM copiar_metas_ciclo('c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000009'); ASSERT false; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN PERFORM cerrar_ciclo('c1000000-0000-0000-0000-000000000001'); ASSERT false, 'cerrar es de la administración'; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  ASSERT (SELECT titulo FROM notificaciones WHERE clave = 'meta_cumplida:e3000000-0000-0000-0000-000000000004') IS NULL, 'la meta del equipo va a la gerencia';
  ASSERT EXISTS (SELECT 1 FROM notificaciones WHERE tipo = 'meta_cumplida' AND titulo LIKE '%(C8 · 2026)%'), 'el aviso dice el ciclo';
  -- La revisión diaria (la pide cualquiera) cierra los ciclos terminados y guarda la foto de resultados.
  ASSERT (revision_diaria()->>'ciclos_cerrados')::int >= 2, 'cierre automático';
  ASSERT (SELECT count(*) FROM resultados_ciclo WHERE ciclo_id = 'c1000000-0000-0000-0000-000000000001') = 4, 'v1 ve sus 4 resultados (no los de equipo ni de médico)';
  ASSERT (SELECT valor || '/' || objetivo || '/' || pct FROM resultados_ciclo WHERE meta_id = 'e3000000-0000-0000-0000-000000000001') = '40/100.00/40.0', 'foto de unidades';
END $$;
SELECT t.como(:admin);
DO $$ BEGIN
  ASSERT (SELECT cerrado_en IS NOT NULL FROM ciclos WHERE id = 'c1000000-0000-0000-0000-000000000001');
  ASSERT (SELECT count(*) FROM resultados_ciclo WHERE ciclo_id = 'c1000000-0000-0000-0000-000000000001') = 6;
  BEGIN PERFORM cerrar_ciclo('c1000000-0000-0000-0000-000000000009'); EXCEPTION WHEN OTHERS THEN ASSERT false, 'C9 ya terminó: ' || SQLERRM; END;
  INSERT INTO ciclos (id, nombre, inicio, fin) VALUES ('c1000000-0000-0000-0000-000000000010', 'Futuro', '2027-03-01', '2027-03-26');
  BEGIN PERFORM cerrar_ciclo('c1000000-0000-0000-0000-000000000010'); ASSERT false; EXCEPTION WHEN sqlstate '22023' THEN ASSERT SQLERRM LIKE '%todavía no terminó%'; END;
  RAISE NOTICE 'OK 56: repetir metas de otro ciclo (con %% y sin duplicar), ajustar, avisos por ciclo y cierre con foto de resultados';
END $$;
RESET ROLE;
\echo CICLOS: TODOS LOS ESCENARIOS PASARON
