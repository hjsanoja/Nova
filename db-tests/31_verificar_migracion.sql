-- Verifica el resultado de migrar el esquema de fase 1 (db-tests/30_datos_fase1.sql) al modelo v3.
-- Se ejecuta tras correr la migración DOS veces: los totales no deben cambiar (re-ejecutable).
\set ON_ERROR_STOP on
\set QUIET on
DO $$
DECLARE r record; n integer;
BEGIN
  -- Usuarios y equipos
  ASSERT (SELECT rol FROM dim_usuarios WHERE email = 'tele@nova.test') = 'transferencista', 'teletransferencista -> transferencista';
  ASSERT (SELECT count(*) FROM dim_usuarios WHERE rol = 'admin' AND activo) = 1, 'el admin conserva su acceso';
  ASSERT (SELECT e.codigo FROM dim_usuarios u JOIN dim_equipos e ON e.id = u.equipo_id WHERE u.email = 'vend@nova.test') = 'A', 'equipo A';
  ASSERT (SELECT equipo_id FROM dim_usuarios WHERE email = 'admin@nova.test') IS NULL, 'TODOS -> sin equipo';
  ASSERT (SELECT array_agg(codigo ORDER BY codigo) FROM dim_equipos) = ARRAY['A', 'LA SANTE'], 'solo los equipos realmente usados, en mayúsculas';
  ASSERT (SELECT e.codigo FROM dim_usuarios u JOIN dim_equipos e ON e.id = u.equipo_id WHERE u.email = 'vend2@nova.test') = 'LA SANTE';
  ASSERT (SELECT count(*) FROM dim_usuarios) = 4;

  -- Droguerías: layout convertido
  SELECT formato_export INTO r FROM dim_droguerias WHERE codigo = 'DROG-COBECA';
  ASSERT (r.formato_export->>'delimitador') = '|' AND (r.formato_export->>'encabezado') = 'false'
     AND (r.formato_export->>'codificacion') = 'iso-8859-1' AND (r.formato_export->>'entrecomillado') = 'nunca', 'layout de Cobeca: ' || r.formato_export::text;
  ASSERT (SELECT array_agg(c->>'origen' ORDER BY o) FROM jsonb_array_elements(r.formato_export->'columnas') WITH ORDINALITY x(c, o))
         = ARRAY['correlativo','codigo_cliente_drogueria','codigo_producto_drogueria','unidades_confirmadas','constante'],
         'columnas en el orden original, con el vocabulario de v3';
  ASSERT (SELECT count(*) FROM dim_droguerias) = 17, '17 droguerías';

  -- Productos y farmacias
  ASSERT (SELECT count(*) FROM dim_productos) = 10, '10 productos';
  ASSERT (SELECT categoria FROM dim_productos WHERE sku = 'SKU-LOS-50') = 'Cardio', 'categoría desde la clasificación de portafolio';
  ASSERT (SELECT count(*) FROM dim_clientes) = 4, '4 farmacias';
  ASSERT (SELECT frecuencia_dias FROM dim_clientes WHERE codigo_interno = 'CLI-1001') = 15, 'F2 = 15 días';
  ASSERT (SELECT lat FROM dim_clientes WHERE codigo_interno = 'CLI-1001') = 10.5, 'GPS convertido a geography';
  ASSERT (SELECT ubicacion FROM dim_clientes WHERE codigo_interno = 'CLI-1002') IS NULL, 'GPS 0,0 se descarta';
  ASSERT (SELECT count(*) FROM dim_clientes WHERE rif = 'J-00000001-0') = 2, 'dos locales de la cadena comparten RIF';
  ASSERT (SELECT rif IS NULL AND estado_validacion = 'inactivo' AND direccion IS NULL FROM dim_clientes WHERE codigo_interno = 'CLI-1004'),
         'RIF placeholder y dirección genérica -> nulos; inactivo se conserva';
  ASSERT (SELECT count(*) FROM dim_clientes WHERE estado_validacion = 'activo' AND rif_verificado) = 3;
  ASSERT (SELECT count(*) FROM rel_cliente_vendedor) = 1, 'el mismo par en dos equipos queda una vez';

  -- Homologación de farmacias: N cuentas por droguería, una principal
  SELECT count(*) INTO n FROM map_cliente_drogueria m JOIN dim_droguerias d ON d.id = m.drogueria_id
   WHERE d.codigo = 'DROG-COBECA' AND m.cliente_id = (SELECT id FROM dim_clientes WHERE codigo_interno = 'CLI-1001');
  ASSERT n = 2, 'La Paz tiene 2 cuentas en Cobeca';
  ASSERT (SELECT codigo_cuenta FROM map_cliente_drogueria m JOIN dim_droguerias d ON d.id = m.drogueria_id
           WHERE d.codigo = 'DROG-COBECA' AND m.cliente_id = (SELECT id FROM dim_clientes WHERE codigo_interno = 'CLI-1001') AND m.es_principal) = 'COB-1001',
         'la principal es la que venía en rel_cliente_drogueria_codigos';
  ASSERT (SELECT count(*) FROM map_cliente_drogueria WHERE codigo_cuenta IS NULL AND nombre_normalizado = 'LA PAZ CHACAO') = 1, 'Nena: mapeo solo por nombre';
  ASSERT NOT EXISTS (SELECT 1 FROM map_cliente_drogueria WHERE codigo_cuenta = 'COB-9'), 'un alias sin verificar no se migra';
  ASSERT (SELECT count(*) FROM map_cliente_drogueria) = 3;

  -- Homologación de productos
  ASSERT (SELECT count(*) FROM map_producto_drogueria m JOIN dim_droguerias d ON d.id = m.drogueria_id
           WHERE d.codigo = 'DROG-COBECA' AND m.producto_id = (SELECT id FROM dim_productos WHERE sku = 'SKU-LOS-50')) = 2, 'dos códigos de Cobeca para Losartán';
  ASSERT (SELECT count(*) FROM map_producto_drogueria m JOIN dim_droguerias d ON d.id = m.drogueria_id
           WHERE d.codigo = 'DROG-COBECA' AND m.producto_id = (SELECT id FROM dim_productos WHERE sku = 'SKU-LOS-50') AND m.es_principal) = 1, 'uno solo principal';
  ASSERT (SELECT count(*) FROM map_producto_drogueria) = 5;

  -- Ventas históricas: lotes por archivo, enlazadas con los mapeos
  ASSERT (SELECT count(*) FROM import_lotes) = 2, 'un lote por archivo';
  ASSERT (SELECT count(*) FROM fact_ventas_drogueria) = 7, 'se omite solo la droguería inexistente (FANTASMA)';
  ASSERT (SELECT count(*) FROM fact_ventas_drogueria WHERE cliente_id IS NOT NULL AND producto_id IS NOT NULL) = 6;
  ASSERT (SELECT unidades FROM vw_pendientes_clientes WHERE cod_cliente_drogueria = 'COB-555') = 7, 'COB-555 queda pendiente con su volumen';
  ASSERT (SELECT count(*) FROM vw_pendientes_productos) = 0;
  ASSERT (SELECT unidades FROM fact_compras_mensual WHERE cliente_id = (SELECT id FROM dim_clientes WHERE codigo_interno = 'CLI-1001')
            AND producto_id = (SELECT id FROM dim_productos WHERE sku = 'SKU-LOS-50') AND periodo = '2026-01-01') = 13, '10 + 5 - 2 devolución';
  ASSERT (SELECT unidades FROM fact_compras_mensual WHERE cliente_id = (SELECT id FROM dim_clientes WHERE codigo_interno = 'CLI-1001')
            AND producto_id = (SELECT id FROM dim_productos WHERE sku = 'SKU-LOS-50') AND periodo = '2026-02-01') = 30, 'Nena por nombre -> La Paz';
  ASSERT (SELECT count(*) FROM fact_compras_mensual WHERE deleted_at IS NULL) = 4, 'losartán ene y feb, atorvastatina y omeprazol';

  -- Archivo y limpieza
  ASSERT to_regclass('legacy.fact_historico_ventas') IS NOT NULL AND (SELECT count(*) FROM legacy.fact_historico_ventas) = 8, 'nada se borró: quedó archivado';
  ASSERT to_regclass('public.pedidos_cabecera') IS NULL AND to_regclass('public.fact_historico_ventas') IS NULL, 'public queda solo con v3';
  ASSERT (SELECT p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE t.tgname = 'on_auth_user_created') = 'nuevo_usuario_auth',
         'el trigger de alta inseguro fue reemplazado';
  RAISE NOTICE 'OK: migración verificada (datos, mapeos N:1 con principal, ventas enlazadas, consolidado)';
END $$;
\echo MIGRACION: TODAS LAS VERIFICACIONES PASARON
