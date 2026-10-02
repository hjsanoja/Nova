-- Fase 3 (v10.0): médicos, visitas con reporte, tareas y registro de cambios. Se ejecuta tras 80_fase2.sql.
\set ON_ERROR_STOP on
\set QUIET on
\set admin '''a0000000-0000-0000-0000-000000000001'''
\set v1    '''a0000000-0000-0000-0000-0000000000c1'''
\set v2    '''a0000000-0000-0000-0000-0000000000c2'''

-- ---------------------------------------------------------------- 49. médicos: carga por archivo y cartera
SET ROLE authenticated;
SELECT t.como(:admin);
DO $$
DECLARE r jsonb;
BEGIN
  r := cargar_medicos('[
    {"codigo":"MED-1","nombre":"Ana Pérez","especialidad":"Cardiología","categoria":"a","visitas_mes":"2","lat":"10.5","lon":"-66.9","representante":"V1@nova.test"},
    {"codigo":"MED-2","nombre":"Luis Mora","representante":"nadie@nova.test"},
    {"nombre":"Sin código","representante":"v2@nova.test"},
    {"codigo":"MED-X","nombre":"  "}
  ]');
  ASSERT (r->>'insertados')::int = 3 AND (r->>'actualizados')::int = 0 AND r->'correos_sin_cuenta' = '["nadie@nova.test"]', r::text;
  r := cargar_medicos('[{"codigo":"MED-1","nombre":"Ana Pérez de León","telefono":"0414"},{"codigo":"MED-2","nombre":"Luis Mora","representante":"v1@nova.test"}]');
  ASSERT (r->>'insertados')::int = 0 AND (r->>'actualizados')::int = 2, r::text;
  ASSERT (SELECT nombre = 'Ana Pérez de León' AND especialidad = 'Cardiología' AND categoria = 'A' AND telefono = '0414'
            AND vendedor_id = 'a0000000-0000-0000-0000-0000000000c1' FROM dim_medicos WHERE codigo = 'MED-1'), 'actualiza sin borrar lo que no viene';
  ASSERT (SELECT vendedor_id = 'a0000000-0000-0000-0000-0000000000c1' FROM dim_medicos WHERE codigo = 'MED-2'), 'asigna representante en la segunda carga';
END $$;
SELECT t.como(:v1);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM dim_medicos) = 2, 'v1 ve solo su cartera';
  BEGIN PERFORM cargar_medicos('[{"nombre":"X"}]'); ASSERT false, 'la carga es de la gerencia'; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  INSERT INTO dim_medicos (id, nombre, vendedor_id) VALUES ('f1000000-0000-0000-0000-000000000001', 'Médico propio', 'a0000000-0000-0000-0000-0000000000c1');
  UPDATE dim_medicos SET especialidad = 'Pediatría' WHERE id = 'f1000000-0000-0000-0000-000000000001';
  BEGIN
    INSERT INTO dim_medicos (nombre, vendedor_id) VALUES ('Para otro', 'a0000000-0000-0000-0000-0000000000c2');
    ASSERT false, 'no puede crear médicos para otro';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE dim_medicos SET nombre = 'cambiado' WHERE codigo = 'MED-1';   -- no lo creó él: no cambia
  ASSERT (SELECT nombre FROM dim_medicos WHERE codigo = 'MED-1') = 'Ana Pérez de León';
  RAISE NOTICE 'OK 49: médicos (carga por archivo con representante por correo, cartera propia, el visitador agrega los suyos)';
END $$;

-- ---------------------------------------------------------------- 50. visitas a médicos con reporte
DO $$
DECLARE r jsonb; v_med uuid := (SELECT id FROM dim_medicos WHERE codigo = 'MED-1');
BEGIN
  r := sync_registrar_visita(jsonb_build_object('id', 'f2000000-0000-0000-0000-000000000001', 'medico_id', v_med, 'checkin_en', now(),
         'lat', 10.5003, 'lon', -66.9, 'resultado', 'realizada', 'objetivo', 'Presentar', 'productos', '["f0000000-0000-0000-0000-0000000000a1"]'::jsonb,
         'muestras', '[{"producto_id":"f0000000-0000-0000-0000-0000000000a1","cantidad":3}]'::jsonb, 'proxima_accion', 'Volver', 'proxima_fecha', current_date + 7));
  ASSERT (r->>'dentro_de_radio')::boolean AND (r->>'distancia_metros')::numeric BETWEEN 30 AND 40, 'distancia al consultorio: ' || r::text;
  ASSERT (SELECT cliente_id IS NULL AND resultado = 'realizada' AND productos = '{f0000000-0000-0000-0000-0000000000a1}'
            AND muestras->0->>'cantidad' = '3' AND proxima_fecha = current_date + 7 FROM crm_visitas WHERE id = 'f2000000-0000-0000-0000-000000000001');
  r := sync_registrar_visita(jsonb_build_object('id', 'f2000000-0000-0000-0000-000000000001', 'medico_id', v_med, 'checkin_en', now(), 'resultado', 'realizada', 'notas', 'reintento'));
  ASSERT (SELECT count(*) FROM crm_visitas WHERE id = 'f2000000-0000-0000-0000-000000000001') = 1, 'idempotente';
  BEGIN
    PERFORM sync_registrar_visita(jsonb_build_object('id', gen_random_uuid(), 'checkin_en', now()));
    ASSERT false, 'sin farmacia ni médico';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT t.como(:v2);
DO $$ BEGIN
  BEGIN
    PERFORM sync_registrar_visita(jsonb_build_object('id', gen_random_uuid(), 'medico_id', (SELECT id FROM dim_medicos WHERE codigo IS NULL AND nombre = 'Sin código'), 'checkin_en', now()));
  EXCEPTION WHEN OTHERS THEN ASSERT false, 'v2 visita a su propio médico: ' || SQLERRM; END;
  BEGIN
    PERFORM sync_registrar_visita('{"id":"f2000000-0000-0000-0000-000000000009","medico_id":"f1000000-0000-0000-0000-000000000001","checkin_en":"2026-10-01T10:00:00Z"}');
    ASSERT false, 'no visita médicos de otra cartera';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  RAISE NOTICE 'OK 50: visitas a médicos (distancia al consultorio, productos, muestras, próxima acción; idempotente; solo su cartera)';
END $$;

-- ---------------------------------------------------------------- 51. tareas y recordatorios
SELECT t.como(:v1);
DO $$
DECLARE r jsonb;
BEGIN
  r := sync_guardar_tarea(jsonb_build_object('id', 'f3000000-0000-0000-0000-000000000001', 'titulo', 'Volver con el estudio', 'vence_en', '2026-10-05',
         'medico_id', (SELECT id FROM dim_medicos WHERE codigo = 'MED-1'), 'visita_id', 'f2000000-0000-0000-0000-000000000001', 'origen', 'visita'));
  ASSERT r->>'estado' = 'pendiente';
  r := sync_guardar_tarea('{"id":"f3000000-0000-0000-0000-000000000002","titulo":"Llamar","vence_en":"2026-10-03"}');
  r := sync_guardar_tarea('{"id":"f3000000-0000-0000-0000-000000000002","titulo":"Llamar","vence_en":"2026-10-03","estado":"hecha"}');
  ASSERT (SELECT hecha_en IS NOT NULL FROM crm_tareas WHERE id = 'f3000000-0000-0000-0000-000000000002'), 'hecha con fecha';
  ASSERT (SELECT vendedor_id = 'a0000000-0000-0000-0000-0000000000c1' FROM crm_tareas WHERE id = 'f3000000-0000-0000-0000-000000000001'), 'responsable: quien la crea';
  BEGIN PERFORM sync_guardar_tarea('{"id":"f3000000-0000-0000-0000-000000000003","titulo":"x","vence_en":"2026-10-03","vendedor_id":"a0000000-0000-0000-0000-0000000000c2"}'); ASSERT false, 'no asigna a otros'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT t.como(:v2);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM crm_tareas WHERE vendedor_id = 'a0000000-0000-0000-0000-0000000000c1') = 0, 'v2 no ve las de v1';
  BEGIN PERFORM sync_guardar_tarea('{"id":"f3000000-0000-0000-0000-000000000001","titulo":"robada","vence_en":"2026-10-05"}'); ASSERT false; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
SELECT t.como(:admin);
DO $$
DECLARE n integer;
BEGIN
  PERFORM sync_guardar_tarea('{"id":"f3000000-0000-0000-0000-000000000004","titulo":"Asignada por la gerencia","vence_en":"2026-10-04","vendedor_id":"a0000000-0000-0000-0000-0000000000c1"}');
  ASSERT (SELECT titulo FROM crm_tareas WHERE id = 'f3000000-0000-0000-0000-000000000001') = 'Volver con el estudio', 'v2 no la cambió';
  n := revisar_tareas('2026-10-05');
  ASSERT n = 2, 'avisos: la de hoy y la vencida (no la hecha): ' || n;
  ASSERT revisar_tareas('2026-10-05') = 0, 'no se repite';
END $$;
SELECT t.como(:v1);
DO $$ BEGIN
  ASSERT (SELECT string_agg(titulo, ' | ' ORDER BY titulo) FROM notificaciones WHERE tipo = 'tarea_vence') = 'Tarea para hoy: Volver con el estudio | Tarea vencida: Asignada por la gerencia', 'avisos de v1';
  ASSERT (SELECT cuerpo FROM notificaciones WHERE titulo = 'Tarea para hoy: Volver con el estudio') = 'Dr(a). Ana Pérez de León';
  BEGIN PERFORM revisar_tareas('2026-10-05'); ASSERT false, 'la fecha la elige la administración'; EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  RAISE NOTICE 'OK 51: tareas (propias, hechas con fecha, asignadas por la gerencia) y recordatorio una sola vez el día que vencen';
END $$;

-- ---------------------------------------------------------------- 52. registro de cambios
SELECT t.como(:admin);
DO $$
DECLARE c record;
BEGIN
  UPDATE dim_clientes SET telefono = '0212-5550000' WHERE codigo_interno = 'N-1';
  SELECT * INTO c FROM registro_cambios WHERE tabla = 'dim_clientes' AND operacion = 'U' ORDER BY id DESC LIMIT 1;
  ASSERT c.usuario_id = 'a0000000-0000-0000-0000-000000000001' AND c.cambios ? 'telefono' AND NOT c.cambios ? 'updated_at', 'cambio: ' || row_to_json(c)::text;
  ASSERT c.cambios->'telefono'->>1 = '0212-5550000';
  UPDATE dim_clientes SET telefono = '0212-5550000' WHERE codigo_interno = 'N-1';   -- sin cambios reales: no se registra
  ASSERT (SELECT count(*) FROM registro_cambios WHERE id > c.id AND tabla = 'dim_clientes') = 0;
  ASSERT EXISTS (SELECT 1 FROM registro_cambios WHERE tabla = 'dim_medicos' AND operacion = 'I'), 'altas de médicos';
  ASSERT EXISTS (SELECT 1 FROM registro_cambios WHERE tabla = 'crm_tareas' AND operacion = 'U' AND cambios ? 'estado'), 'tarea marcada hecha';
END $$;
SELECT t.como(:v1);
DO $$ BEGIN ASSERT (SELECT count(*) FROM registro_cambios) = 0, 'el representante no lo ve'; END $$;
RESET ROLE;
DO $$
DECLARE r jsonb;
BEGIN
  INSERT INTO registro_cambios (tabla, operacion, created_at) VALUES ('viejo', 'U', now() - interval '19 months');
  r := revision_diaria();
  ASSERT r ? 'avisos_tareas' AND r ? 'avisos_riesgo', r::text;
  ASSERT NOT EXISTS (SELECT 1 FROM registro_cambios WHERE tabla = 'viejo'), 'se borra lo de más de 18 meses';
  RAISE NOTICE 'OK 52: registro de cambios (quién, qué campos antes → después; solo administración y gerencia; 18 meses)';
END $$;
\echo CRM: TODOS LOS ESCENARIOS PASARON
