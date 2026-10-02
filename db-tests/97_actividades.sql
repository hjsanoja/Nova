-- Fase 5 (v12.0): otras actividades y días libres con aprobación del gerente. Se ejecuta tras 95_ciclos.sql.
-- G1 es el gerente de v1; v2 no tiene gerente (aprueba la administración); G2 es otro gerente.
\set ON_ERROR_STOP on
\set QUIET on
\set admin '''a0000000-0000-0000-0000-000000000001'''
\set v1    '''a0000000-0000-0000-0000-0000000000c1'''
\set v2    '''a0000000-0000-0000-0000-0000000000c2'''
\set g1    '''a0000000-0000-0000-0000-0000000000d1'''
\set g2    '''a0000000-0000-0000-0000-0000000000d2'''

INSERT INTO auth.users (id, email) VALUES (:g1, 'g1@nova.test'), (:g2, 'g2@nova.test');
INSERT INTO dim_usuarios (id, nombre_completo, email, rol) VALUES (:g1, 'Gerente Uno', 'g1@nova.test', 'gerente'), (:g2, 'Gerente Dos', 'g2@nova.test', 'gerente')
ON CONFLICT (id) DO UPDATE SET nombre_completo = excluded.nombre_completo, rol = excluded.rol, activo = true;
UPDATE dim_usuarios SET gerente_id = :g1, estado_geografico = 'Zulia' WHERE id = :v1;

-- ---------------------------------------------------------------- 57. motivos y reporte del representante
DO $$ BEGIN
  BEGIN UPDATE dim_usuarios SET gerente_id = id WHERE id = 'a0000000-0000-0000-0000-0000000000d1'; ASSERT false, 'nadie es su propio gerente'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET ROLE authenticated;
SELECT t.como(:admin);
DO $$ BEGIN
  ASSERT (SELECT string_agg(nombre, ', ' ORDER BY orden) FROM motivos_actividad) = 'Reunión de Ciclo, Vacaciones, Impulso', 'motivos iniciales';
  INSERT INTO motivos_actividad (id, nombre, requiere_aprobacion, orden) VALUES ('b5000000-0000-0000-0000-000000000004', 'Día producto', false, 4);
  INSERT INTO motivos_actividad (id, nombre, descuenta, orden) VALUES ('b5000000-0000-0000-0000-000000000005', 'Capacitación', false, 5);
  BEGIN INSERT INTO motivos_actividad (nombre) VALUES (' vacaciones '); ASSERT false, 'nombre repetido'; EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SELECT t.como(:v1);
DO $$
DECLARE v_vac uuid := (SELECT id FROM motivos_actividad WHERE nombre = 'Vacaciones'); r jsonb;
BEGIN
  BEGIN INSERT INTO motivos_actividad (nombre) VALUES ('Mío'); ASSERT false, 'solo la administración'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO actividades (vendedor_id, motivo_id, desde, hasta) VALUES ('a0000000-0000-0000-0000-0000000000c1', v_vac, '2027-01-04', '2027-01-04'); ASSERT false, 'solo con la función';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  r := sync_guardar_actividad(jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000001', 'motivo_id', v_vac, 'desde', '2027-01-11', 'hasta', '2027-01-15', 'notas', 'Viaje familiar'));
  ASSERT r->>'estado' = 'pendiente', r::text;
  r := sync_guardar_actividad(jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000001', 'motivo_id', v_vac, 'desde', '2027-01-11', 'hasta', '2027-01-15', 'notas', 'Viaje familiar'));
  ASSERT (SELECT count(*) FROM actividades) = 1, 'reenviar no duplica';
  BEGIN PERFORM sync_guardar_actividad(jsonb_build_object('id', gen_random_uuid(), 'motivo_id', v_vac, 'desde', '2027-01-14', 'hasta', '2027-01-18')); ASSERT false;
  EXCEPTION WHEN sqlstate '23P01' THEN ASSERT SQLERRM LIKE 'Ya reportaste Vacaciones del 11/01 al 15/01%', SQLERRM; END;
  BEGIN PERFORM sync_guardar_actividad(jsonb_build_object('id', gen_random_uuid(), 'motivo_id', v_vac, 'desde', '2027-01-25', 'hasta', '2027-01-26', 'jornada', 'media')); ASSERT false;
  EXCEPTION WHEN sqlstate '22023' THEN ASSERT SQLERRM LIKE '%media jornada es de un solo día%'; END;
  BEGIN PERFORM sync_guardar_actividad(jsonb_build_object('id', gen_random_uuid(), 'motivo_id', v_vac, 'desde', '2027-01-25', 'vendedor_id', 'a0000000-0000-0000-0000-0000000000c2')); ASSERT false;
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  -- Otra pendiente que luego anula él mismo.
  PERFORM sync_guardar_actividad(jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000002', 'motivo_id', (SELECT id FROM motivos_actividad WHERE nombre = 'Impulso'), 'desde', '2027-02-01'));
  ASSERT sync_guardar_actividad(jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000002', 'anular', true))->>'estado' = 'anulada';
END $$;
SELECT t.como(:v2);
DO $$ BEGIN
  PERFORM sync_guardar_actividad(jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000003', 'motivo_id', (SELECT id FROM motivos_actividad WHERE nombre = 'Reunión de Ciclo'), 'desde', '2027-01-12'));
  ASSERT (SELECT count(*) FROM actividades) = 1, 'cada quien ve solo las suyas';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT titulo || ' | ' || cuerpo FROM notificaciones WHERE clave = 'actividad:b6000000-0000-0000-0000-000000000001:solicitud' AND usuario_id = 'a0000000-0000-0000-0000-0000000000d1')
         = 'Por aprobar: Vacaciones de Vendedor Ético | Del 11/01 al 15/01 · Viaje familiar', 'aviso a su gerente';
  ASSERT (SELECT count(*) FROM notificaciones WHERE clave = 'actividad:b6000000-0000-0000-0000-000000000001:solicitud') = 1, 'solo a su gerente';
  ASSERT EXISTS (SELECT 1 FROM notificaciones WHERE clave = 'actividad:b6000000-0000-0000-0000-000000000003:solicitud' AND usuario_id = 'a0000000-0000-0000-0000-000000000001'), 'sin gerente: a la administración';
  RAISE NOTICE 'OK 57: motivos (editables por la administración) y reporte del representante (sin cruces, idempotente, aviso a su gerente)';
END $$;

-- ---------------------------------------------------------------- 58. aprobación del gerente o la administración
SET ROLE authenticated;
SELECT t.como(:g2);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM actividades) = 3, 'la gerencia ve todas';
  BEGIN PERFORM decidir_actividades(ARRAY['b6000000-0000-0000-0000-000000000001']::uuid[], true); ASSERT false, 'no es su gerente';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:v1);
DO $$ BEGIN
  BEGIN PERFORM decidir_actividades(ARRAY['b6000000-0000-0000-0000-000000000001']::uuid[], true); ASSERT false, 'el representante no aprueba'; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
END $$;
SELECT t.como(:g1);
DO $$ BEGIN
  BEGIN PERFORM decidir_actividades(ARRAY['b6000000-0000-0000-0000-000000000001']::uuid[], false); ASSERT false; EXCEPTION WHEN sqlstate '22023' THEN NULL; END;
  -- Aprueba la de su representante; la de v2 (sin gerente) no le corresponde y queda pendiente.
  ASSERT decidir_actividades(ARRAY['b6000000-0000-0000-0000-000000000001', 'b6000000-0000-0000-0000-000000000003']::uuid[], true, 'Disfruta') = 1;
  ASSERT (SELECT estado FROM actividades WHERE id = 'b6000000-0000-0000-0000-000000000003') = 'pendiente';
END $$;
SELECT t.como(:admin);
DO $$ BEGIN
  ASSERT decidir_actividades(ARRAY['b6000000-0000-0000-0000-000000000003']::uuid[], false, 'Ese día hay reunión nacional') = 1;
END $$;
SELECT t.como(:v1);
DO $$ DECLARE r jsonb; BEGIN
  ASSERT (SELECT estado || '|' || comentario FROM actividades WHERE id = 'b6000000-0000-0000-0000-000000000001') = 'aprobada|Disfruta';
  r := sync_guardar_actividad(jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000001', 'motivo_id', (SELECT id FROM motivos_actividad WHERE nombre = 'Vacaciones'), 'desde', '2027-01-11', 'hasta', '2027-01-20'));
  ASSERT r->>'estado' = 'aprobada' AND (SELECT hasta FROM actividades WHERE id = 'b6000000-0000-0000-0000-000000000001') = '2027-01-15', 'decidida: ya no se cambia';
  BEGIN PERFORM sync_guardar_actividad(jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000001', 'anular', true)); ASSERT false;
  EXCEPTION WHEN sqlstate '42501' THEN ASSERT SQLERRM LIKE '%pide a tu gerente que la anule%'; END;
  ASSERT (SELECT titulo FROM notificaciones WHERE clave = 'actividad:b6000000-0000-0000-0000-000000000001:decision') = 'Aprobada: Vacaciones del 11/01 al 15/01';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT titulo || ' | ' || cuerpo FROM notificaciones WHERE clave = 'actividad:b6000000-0000-0000-0000-000000000003:decision')
         = 'Rechazada: Reunión de Ciclo el 12/01 | Ese día hay reunión nacional', 'el representante sabe por qué';
  ASSERT (SELECT bool_and(leida) FROM notificaciones WHERE clave LIKE 'actividad:%:solicitud'), 'decidida o anulada: el aviso por aprobar queda leído';
  RAISE NOTICE 'OK 58: aprueba su gerente o la administración (varias a la vez); el rechazo lleva comentario y avisa al representante';
END $$;

-- ---------------------------------------------------------------- 59. motivos sin aprobación y días efectivos
SET ROLE authenticated;
SELECT t.como(:v1);
DO $$ BEGIN
  ASSERT sync_guardar_actividad(jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000004', 'motivo_id', 'b5000000-0000-0000-0000-000000000004', 'desde', '2027-01-20', 'jornada', 'media'))->>'estado' = 'aprobada', 'sin aprobación';
  PERFORM sync_guardar_actividad(jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000005', 'motivo_id', 'b5000000-0000-0000-0000-000000000005', 'desde', '2027-01-21'));
  -- Enero 2027 en Zulia: 19 días hábiles. Vacaciones 11-15 (el 15 ya es feriado regional: 4 días), media jornada el 20,
  -- y la capacitación (pendiente y que no descuenta) no cambia nada.
  ASSERT dias_efectivos('a0000000-0000-0000-0000-0000000000c1', '2027-01-01', '2027-01-31') = 14.5, dias_efectivos('a0000000-0000-0000-0000-0000000000c1', '2027-01-01', '2027-01-31')::text;
END $$;
SELECT t.como(:v2);
DO $$ BEGIN
  BEGIN PERFORM dias_efectivos('a0000000-0000-0000-0000-0000000000c1', '2027-01-01', '2027-01-31'); ASSERT false, 'los de otro, no'; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  ASSERT dias_efectivos('a0000000-0000-0000-0000-0000000000c2', '2027-01-01', '2027-01-31') = 20, 'v2: rechazada no descuenta';
END $$;
SELECT t.como(:admin);
DO $$ BEGIN
  -- La administración anula una ya aprobada: vuelve a contar.
  ASSERT sync_guardar_actividad(jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000001', 'vendedor_id', 'a0000000-0000-0000-0000-0000000000c1', 'anular', true))->>'estado' = 'anulada';
  ASSERT dias_efectivos('a0000000-0000-0000-0000-0000000000c1', '2027-01-01', '2027-01-31') = 18.5;
  RAISE NOTICE 'OK 59: motivos sin aprobación, que no descuentan, media jornada y días efectivos (con feriados regionales)';
END $$;
RESET ROLE;
\echo ACTIVIDADES: TODOS LOS ESCENARIOS PASARON
