-- ==============================================================================
-- MIGRACIÓN 2/2 · COPIAR LOS DATOS DE LA FASE 1 AL MODELO v3
-- Ejecutar UNA vez, DESPUÉS de 1_archivar_esquema_anterior.sql y de nova_produccion_v3.sql.
-- Es re-ejecutable: no duplica nada (claves naturales, ON CONFLICT DO NOTHING) y conserva los UUID originales.
--
-- Qué se migra (de legacy.* a public.*):
--   dim_usuarios                  -> dim_usuarios (+ dim_equipos según los equipos usados; teletransferencista -> transferencista)
--   dim_droguerias                -> dim_droguerias (formato_csv_config -> formato_export)
--   dim_productos                 -> dim_productos (sin precios ni stock: la fase 1 de v3 trabaja solo con unidades)
--   dim_clientes                  -> dim_clientes (ident01 -> codigo_interno; GPS -> geography; frecuencia -> días)
--   rel_cliente_vendedor          -> rel_cliente_vendedor
--   rel_cliente_drogueria_codigos + dim_cliente_drogueria_alias + nombres/códigos de fact_historico_ventas
--                                 -> map_cliente_drogueria   (N cuentas/nombres por farmacia, una principal)
--   dim_producto_drogueria_mapeo  -> map_producto_drogueria  (N códigos por producto, uno principal)
--   fact_historico_ventas         -> import_lotes + fact_ventas_drogueria (se enlaza a farmacia/producto con los mapeos)
-- Lo demás (pedidos_cabecera/detalle, historico_pedidos_*, inventario_drogueria) queda archivado en `legacy`.
-- Al terminar se imprime un resumen; con todo verificado puede borrarse con:  DROP SCHEMA legacy CASCADE;
-- ==============================================================================

-- Conversión del layout CSV de la fase 1 al de v3 (vocabulario de origen de columnas de exportacionDrogueria.ts).
CREATE OR REPLACE FUNCTION legacy.convertir_formato_csv(c jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'formato', 'csv',
    'delimitador', CASE WHEN c->>'delimitador' IN (';', ',', '|') THEN c->>'delimitador'
                        WHEN c->>'delimitador' IN (E'\t', 'tab', '\t') THEN E'\t' ELSE ';' END,
    'encabezado', coalesce((c->>'incluir_encabezados')::boolean, true),
    'entrecomillado', CASE c->>'entrecomillado' WHEN 'siempre' THEN 'siempre' WHEN 'nunca' THEN 'nunca' ELSE 'solo_texto' END,
    'salto_linea', CASE WHEN c->>'salto_linea' = E'\n' THEN E'\n' ELSE E'\r\n' END,
    'codificacion', CASE lower(coalesce(c->>'codificacion', 'utf-8'))
                      WHEN 'iso-8859-1' THEN 'iso-8859-1' WHEN 'latin1' THEN 'iso-8859-1'
                      WHEN 'windows-1252' THEN 'windows-1252' ELSE 'utf-8' END,
    'bom', false, 'extension', 'csv',
    'decimal', CASE c->>'formato_decimal' WHEN 'coma' THEN 'coma' ELSE 'punto' END,
    'formato_fecha', 'YYYYMMDD',
    'nombre_archivo', '{correlativo}_{fecha}.{extension}',
    'columnas', (
      SELECT coalesce(jsonb_agg(
        CASE col->>'campo_origen'
          WHEN 'codigo_cliente'        THEN jsonb_build_object('encabezado', col->>'nombre_encabezado', 'origen', 'codigo_cliente_drogueria')
          WHEN 'rif_cliente'           THEN jsonb_build_object('encabezado', col->>'nombre_encabezado', 'origen', 'rif_cliente')
          WHEN 'nombre_cliente'        THEN jsonb_build_object('encabezado', col->>'nombre_encabezado', 'origen', 'nombre_cliente')
          -- En la fase 1 "sku" era el código interno; la droguería espera SU código de artículo.
          WHEN 'sku'                   THEN jsonb_build_object('encabezado', col->>'nombre_encabezado', 'origen', 'codigo_producto_drogueria')
          WHEN 'cantidad_confirmada'   THEN jsonb_build_object('encabezado', col->>'nombre_encabezado', 'origen', 'unidades_confirmadas', 'formato', 'entero')
          WHEN 'cantidad_solicitada'   THEN jsonb_build_object('encabezado', col->>'nombre_encabezado', 'origen', 'unidades_solicitadas', 'formato', 'entero')
          WHEN 'numero_pedido'         THEN jsonb_build_object('encabezado', col->>'nombre_encabezado', 'origen', 'correlativo')
          WHEN 'fecha_pedido'          THEN jsonb_build_object('encabezado', col->>'nombre_encabezado', 'origen', 'fecha_pedido')
          -- Columnas sin equivalente (p. ej. descuento, sin precios en la fase 1): se conservan vacías para no mover el layout.
          ELSE jsonb_build_object('encabezado', col->>'nombre_encabezado', 'origen', 'constante', 'valor', '')
        END ORDER BY coalesce((col->>'orden')::integer, 0)), '[]'::jsonb)
      FROM jsonb_array_elements(coalesce(c->'columnas', '[]'::jsonb)) col
      WHERE coalesce(col->>'nombre_encabezado', '') <> '')
  )
$$;

DO $mig$
DECLARE n bigint; v_admins integer := 0; v_sin_drog text; v_pend_cli bigint; v_pend_prod bigint; v_filas bigint := 0; v_res jsonb;
BEGIN
  IF to_regclass('legacy.dim_clientes') IS NULL THEN
    RAISE NOTICE 'No hay datos anteriores en el esquema legacy: nada que migrar.';
    RETURN;
  END IF;
  IF to_regclass('public.map_cliente_drogueria') IS NULL THEN
    RAISE EXCEPTION 'Ejecuta primero nova_produccion_v3.sql';
  END IF;
  PERFORM set_config('statement_timeout', '0', true);   -- históricos grandes: sin límite de tiempo en esta transacción

  -- 1. Equipos y usuarios -------------------------------------------------------------------------------------------
  IF to_regclass('legacy.dim_usuarios') IS NOT NULL THEN
    -- El código de equipo se guarda en mayúsculas ('La Sante' -> 'LA SANTE'); TODOS/AMBOS = sin equipo (visión completa).
    INSERT INTO dim_equipos (codigo, nombre, linea)
    SELECT DISTINCT ON (upper(u.equipo::text)) upper(u.equipo::text), 'Equipo ' || u.equipo::text, 'otro'
      FROM legacy.dim_usuarios u WHERE upper(u.equipo::text) NOT IN ('TODOS', 'AMBOS')
    ON CONFLICT (upper(codigo)) DO NOTHING;

    INSERT INTO dim_usuarios (id, nombre_completo, email, rol, equipo_id, telefono, activo)
    SELECT u.id, u.nombre_completo, u.email,
           (CASE u.rol::text WHEN 'teletransferencista' THEN 'transferencista' ELSE u.rol::text END)::rol_usuario,
           e.id, u.telefono, u.activo
      FROM legacy.dim_usuarios u LEFT JOIN dim_equipos e ON upper(e.codigo) = upper(u.equipo::text)
     WHERE EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
    ON CONFLICT (id) DO UPDATE SET rol = excluded.rol, equipo_id = excluded.equipo_id, activo = excluded.activo,
           nombre_completo = excluded.nombre_completo, telefono = excluded.telefono;
    GET DIAGNOSTICS n = ROW_COUNT;
    SELECT count(*) INTO v_admins FROM dim_usuarios WHERE rol = 'admin' AND activo;
    RAISE NOTICE 'Usuarios migrados: % (administradores activos: %)', n, v_admins;
  END IF;

  -- 2. Droguerías (conservan su UUID) -----------------------------------------------------------------------------------
  IF to_regclass('legacy.dim_droguerias') IS NOT NULL THEN
    INSERT INTO dim_droguerias (id, codigo, nombre, rif, email_pedidos, telefono, dias_entrega, activo)
    SELECT d.id, d.codigo_drogueria, d.nombre_drogueria, nullif(d.rif, 'J-00000000-0'), d.email_pedidos, d.telefono,
           d.tiempo_entrega_promedio_dias, d.activo
      FROM legacy.dim_droguerias d
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- Layout de exportación: solo en droguerías que nadie ha editado en v3 (row_version = 1), para no pisar cambios manuales al re-ejecutar.
    UPDATE dim_droguerias d SET formato_export = legacy.convertir_formato_csv(l.formato_csv_config)
      FROM legacy.dim_droguerias l
     WHERE l.id = d.id AND d.row_version = 1 AND l.formato_csv_config IS NOT NULL
       AND jsonb_array_length(legacy.convertir_formato_csv(l.formato_csv_config)->'columnas') > 0;
    RAISE NOTICE 'Droguerías migradas: %', n;
  END IF;

  -- 3. Productos (sin precio ni stock) -------------------------------------------------------------------------------
  IF to_regclass('legacy.dim_productos') IS NOT NULL THEN
    INSERT INTO dim_productos (id, sku, ean13, nombre_comercial, presentacion, principio_activo, clase_terapeutica, categoria,
                               laboratorio, empaque_minimo, es_prioritario, activo, created_at)
    SELECT p.id, p.sku, nullif(p.codigo_barras_ean13, ''), p.nombre_comercial, nullif(p.presentacion, ''), nullif(p.principio_activo, ''),
           nullif(p.clase_terapeutica, ''), coalesce(nullif(p.clasificacion_portafolio, ''), nullif(p.clase_terapeutica, '')),
           nullif(p.laboratorio, ''), greatest(coalesce(p.empaque_minimo, 1), 1), p.es_prioritario, p.activo, p.created_at
      FROM legacy.dim_productos p
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Productos migrados: %', n;
  END IF;

  -- 4. Farmacias (ident01 -> codigo_interno; GPS -> geography; frecuencia de visita -> días) ---------------------------
  INSERT INTO dim_clientes (id, codigo_interno, razon_social, nombre_comercial, rif, rif_verificado, brick, municipio,
                            estado_geografico, direccion, telefono, bandera, ubicacion, frecuencia_dias,
                            estado_validacion, origen, created_at)
  SELECT c.id, c.ident01, c.razon_social, coalesce(nullif(c.nombre_fantasia, ''), nullif(c.nombre_comercial, ''), c.razon_social),
         CASE WHEN c.rif ~ '^[A-Za-z]?-?0+-?0?$' THEN NULL ELSE nullif(btrim(c.rif), '') END,
         true,   -- cargadas por el administrador: se consideran verificadas
         nullif(c.brick, ''), coalesce(nullif(c.municipio_ciudad, ''), nullif(c.ciudad, '')), nullif(c.estado, ''),
         nullif(nullif(c.direccion, ''), 'Sin direccion fiscal'), nullif(c.telefono, ''), nullif(c.bandera, ''),
         CASE WHEN c.local_gps_lat BETWEEN -90 AND 90 AND c.local_gps_lon BETWEEN -180 AND 180
                   AND NOT (c.local_gps_lat = 0 AND c.local_gps_lon = 0)
              THEN ST_SetSRID(ST_MakePoint(c.local_gps_lon::float8, c.local_gps_lat::float8), 4326)::geography END,
         CASE upper(btrim(coalesce(c.frecuencia, '')))
           WHEN 'SEMANAL' THEN 7 WHEN 'F4' THEN 7 WHEN 'QUINCENAL' THEN 15 WHEN 'F2' THEN 15
           WHEN 'MENSUAL' THEN 30 WHEN 'F1' THEN 30 WHEN 'BIMESTRAL' THEN 60
           ELSE CASE WHEN btrim(c.frecuencia) ~ '^\d{1,3}$' THEN least(greatest(btrim(c.frecuencia)::integer, 1), 365) END END,
         CASE WHEN c.activo THEN 'activo' ELSE 'inactivo' END::estado_validacion_cliente, 'oficina', c.created_at
    FROM legacy.dim_clientes c
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Farmacias migradas: %', n;

  IF to_regclass('legacy.rel_cliente_vendedor') IS NOT NULL AND to_regclass('legacy.dim_usuarios') IS NOT NULL THEN
    INSERT INTO rel_cliente_vendedor (cliente_id, vendedor_id, equipo_id, es_titular, activo)
    SELECT r.cliente_id, r.vendedor_id, e.id, r.rol_asignacion = 'titular', r.activo
      FROM legacy.rel_cliente_vendedor r
      JOIN dim_clientes c ON c.id = r.cliente_id JOIN dim_usuarios u ON u.id = r.vendedor_id
      LEFT JOIN dim_equipos e ON upper(e.codigo) = upper(r.equipo::text)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 5. Homologación de farmacias: códigos de cuenta y nombres que cada droguería usa ------------------------------------
  IF to_regclass('legacy.rel_cliente_drogueria_codigos') IS NOT NULL THEN
    INSERT INTO map_cliente_drogueria (drogueria_id, cliente_id, codigo_cuenta, es_principal, origen)
    SELECT r.drogueria_id, r.cliente_id, nullif(btrim(r.codigo_cliente_drogueria), ''), true, 'migracion'
      FROM legacy.rel_cliente_drogueria_codigos r
      JOIN dim_droguerias d ON d.id = r.drogueria_id JOIN dim_clientes c ON c.id = r.cliente_id
     WHERE r.activo AND nullif(btrim(r.codigo_cliente_drogueria), '') IS NOT NULL
     ORDER BY r.created_at
    ON CONFLICT DO NOTHING;
  END IF;

  IF to_regclass('legacy.dim_cliente_drogueria_alias') IS NOT NULL THEN
    INSERT INTO map_cliente_drogueria (drogueria_id, cliente_id, codigo_cuenta, nombre_en_drogueria, es_principal, origen)
    SELECT DISTINCT ON (d.id, coalesce(nullif(btrim(a.cod_cliente_drogueria), ''), app.norm_texto(a.nombre_cliente_drogueria)))
           d.id, c.id, nullif(btrim(a.cod_cliente_drogueria), ''), nullif(btrim(a.nombre_cliente_drogueria), ''), false, 'migracion'
      FROM legacy.dim_cliente_drogueria_alias a
      JOIN dim_clientes c ON c.codigo_interno = a.cliente_ident01
      JOIN LATERAL (SELECT dd.id FROM dim_droguerias dd
                     WHERE app.norm_texto(dd.codigo) = app.norm_texto(a.drogueria) OR dd.nombre_normalizado = app.norm_texto(a.drogueria)
                     ORDER BY dd.activo DESC LIMIT 1) d ON true
     WHERE a.verificado AND (nullif(btrim(a.cod_cliente_drogueria), '') IS NOT NULL OR app.norm_texto(a.nombre_cliente_drogueria) IS NOT NULL)
     ORDER BY d.id, coalesce(nullif(btrim(a.cod_cliente_drogueria), ''), app.norm_texto(a.nombre_cliente_drogueria)), a.created_at
    ON CONFLICT DO NOTHING;
  END IF;

  IF to_regclass('legacy.fact_historico_ventas') IS NOT NULL THEN
    -- Farmacias que las ventas históricas ya traían homologadas (cliente_ident01) y que el diccionario no listaba.
    INSERT INTO map_cliente_drogueria (drogueria_id, cliente_id, codigo_cuenta, nombre_en_drogueria, es_principal, origen)
    WITH pares AS (
      SELECT d.id AS drogueria_id, c.id AS cliente_id, nullif(btrim(h.cod_cliente), '') AS codigo,
             (array_agg(h.nombre_cliente))[1] AS nombre
        FROM legacy.fact_historico_ventas h
        JOIN dim_clientes c ON c.codigo_interno = h.cliente_ident01
        JOIN LATERAL (SELECT dd.id FROM dim_droguerias dd
                       WHERE app.norm_texto(dd.codigo) = app.norm_texto(h.drogueria) OR dd.nombre_normalizado = app.norm_texto(h.drogueria)
                       ORDER BY dd.activo DESC LIMIT 1) d ON true
       WHERE h.cliente_ident01 IS NOT NULL AND nullif(btrim(h.cod_cliente), '') IS NOT NULL
       GROUP BY d.id, c.id, nullif(btrim(h.cod_cliente), '')),
    unicos AS (SELECT drogueria_id, codigo FROM pares GROUP BY drogueria_id, codigo HAVING count(DISTINCT cliente_id) = 1)
    SELECT p.drogueria_id, p.cliente_id, p.codigo, p.nombre, false, 'migracion'
      FROM pares p JOIN unicos u ON u.drogueria_id = p.drogueria_id AND u.codigo = p.codigo
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(*) INTO n FROM map_cliente_drogueria WHERE origen = 'migracion';
  RAISE NOTICE 'Homologaciones de farmacias: %', n;

  -- 6. Homologación de productos: Cod SAP (interno) <-> código de cada droguería ---------------------------------------
  IF to_regclass('legacy.dim_producto_drogueria_mapeo') IS NOT NULL THEN
    INSERT INTO map_producto_drogueria (drogueria_id, producto_id, codigo_drogueria, descripcion_drogueria, es_principal, origen)
    SELECT DISTINCT ON (d.id, btrim(m.codigo_producto_drogueria))
           d.id, p.id, btrim(m.codigo_producto_drogueria), nullif(btrim(m.nombre_producto_drogueria), ''), false, 'migracion'
      FROM legacy.dim_producto_drogueria_mapeo m
      JOIN dim_productos p ON p.sku = m.cod_sap
      JOIN LATERAL (SELECT dd.id FROM dim_droguerias dd
                     WHERE app.norm_texto(dd.codigo) = app.norm_texto(m.drogueria) OR dd.nombre_normalizado = app.norm_texto(m.drogueria)
                     ORDER BY dd.activo DESC LIMIT 1) d ON true
     WHERE coalesce(btrim(m.codigo_producto_drogueria), '') <> ''
     ORDER BY d.id, btrim(m.codigo_producto_drogueria), m.created_at
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(*) INTO n FROM map_producto_drogueria WHERE origen = 'migracion';
  RAISE NOTICE 'Homologaciones de productos: %', n;

  -- 7. Ventas históricas: un lote por archivo de origen; farmacia/producto se enlazan con los mapeos de arriba -----------
  IF to_regclass('legacy.fact_historico_ventas') IS NOT NULL THEN
    INSERT INTO import_lotes (archivo, checksum)
    SELECT DISTINCT coalesce(archivo_origen, 'sin_archivo'), 'legacy:' || coalesce(archivo_origen, 'sin_archivo')
      FROM legacy.fact_historico_ventas
    ON CONFLICT (checksum) DO NOTHING;

    INSERT INTO fact_ventas_drogueria (lote_id, fila, fecha, drogueria_id, cod_cliente_drogueria, nombre_cliente_drogueria,
                                       cod_producto_drogueria, nombre_producto_drogueria, cod_sap_reportado, unidades)
    SELECT l.id, h.fila, h.fecha, d.id, nullif(btrim(h.cod_cliente), ''), h.nombre_cliente, btrim(h.codigo_producto),
           h.nombre_producto, nullif(btrim(h.cod_sap), ''), h.unidades
      FROM (SELECT x.*, row_number() OVER (PARTITION BY coalesce(x.archivo_origen, 'sin_archivo') ORDER BY x.fecha, x.id)::integer AS fila
              FROM legacy.fact_historico_ventas x) h
      JOIN import_lotes l ON l.checksum = 'legacy:' || coalesce(h.archivo_origen, 'sin_archivo')
      JOIN LATERAL (SELECT dd.id FROM dim_droguerias dd
                     WHERE app.norm_texto(dd.codigo) = app.norm_texto(h.drogueria) OR dd.nombre_normalizado = app.norm_texto(h.drogueria)
                     ORDER BY dd.activo DESC LIMIT 1) d ON true
     WHERE coalesce(btrim(h.codigo_producto), '') <> ''
    ON CONFLICT (lote_id, fila) DO NOTHING;
    GET DIAGNOSTICS v_filas = ROW_COUNT;

    UPDATE import_lotes l SET filas = x.n, periodo_desde = x.d1, periodo_hasta = x.d2
      FROM (SELECT lote_id, count(*)::integer AS n, min(fecha) AS d1, max(fecha) AS d2 FROM fact_ventas_drogueria GROUP BY lote_id) x
     WHERE l.id = x.lote_id AND l.checksum LIKE 'legacy:%';

    SELECT string_agg(DISTINCT h.drogueria, ', ') INTO v_sin_drog
      FROM legacy.fact_historico_ventas h
     WHERE NOT EXISTS (SELECT 1 FROM dim_droguerias dd
                        WHERE app.norm_texto(dd.codigo) = app.norm_texto(h.drogueria) OR dd.nombre_normalizado = app.norm_texto(h.drogueria));
    RAISE NOTICE 'Filas de ventas migradas: %', v_filas;
    IF v_sin_drog IS NOT NULL THEN
      RAISE WARNING 'Ventas omitidas: droguerías que no existen en dim_droguerias: %. Créalas y vuelve a ejecutar este script.', v_sin_drog;
    END IF;
  END IF;

  -- 8. Enlazar lo histórico con los mapeos (también aprende códigos desde el Cod SAP que traían los reportes) ---------------
  v_res := app.homologar_ventas();
  SELECT count(*) INTO v_pend_cli FROM vw_pendientes_clientes;
  SELECT count(*) INTO v_pend_prod FROM vw_pendientes_productos;
  RAISE NOTICE 'Homologación automática: %', v_res;
  RAISE NOTICE 'Pendientes de homologar -> farmacias: %, productos: % (ver vw_pendientes_clientes / vw_pendientes_productos)', v_pend_cli, v_pend_prod;

  SELECT count(*) INTO v_admins FROM dim_usuarios WHERE rol = 'admin' AND activo;
  IF v_admins = 0 THEN
    RAISE WARNING 'No hay ningún administrador activo. Promueve el tuyo:  UPDATE dim_usuarios SET rol = ''admin'', activo = true WHERE email = ''tu@correo'';';
  END IF;
END
$mig$;
