-- Datos representativos del esquema de fase 1 (ya cargado desde fixtures/esquema_fase1_anterior.sql).
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@nova.test'),
  ('a0000000-0000-0000-0000-0000000000b1', 'tele@nova.test'),
  ('a0000000-0000-0000-0000-0000000000c1', 'vend@nova.test'),
  ('a0000000-0000-0000-0000-0000000000c2', 'vend2@nova.test');
-- Nota: el trigger de la fase 1 (on_auth_user_created) ya creó sus filas; se ajustan como las dejaría el administrador.
INSERT INTO dim_usuarios (id, email, nombre_completo, rol, equipo) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin@nova.test', 'Admin', 'admin', 'TODOS'),
  ('a0000000-0000-0000-0000-0000000000b1', 'tele@nova.test', 'Tele', 'teletransferencista', 'TODOS'),
  ('a0000000-0000-0000-0000-0000000000c1', 'vend@nova.test', 'Vendedor A', 'vendedor', 'A'),
  ('a0000000-0000-0000-0000-0000000000c2', 'vend2@nova.test', 'Vendedor La Sante', 'vendedor', 'La Sante')
ON CONFLICT (id) DO UPDATE SET rol = excluded.rol, equipo = excluded.equipo;

-- El script de fase 1 ya sembró 17 droguerías (COBECA, NENA, ...) y 10 productos. Se personaliza el layout de Cobeca.
UPDATE dim_droguerias SET tiempo_entrega_promedio_dias = 2, formato_csv_config = '{
     "delimitador": "|", "incluir_encabezados": false, "entrecomillado": "nunca", "codificacion": "ISO-8859-1",
     "salto_linea": "\r\n", "formato_decimal": "punto",
     "columnas": [
       {"campo_origen": "numero_pedido", "nombre_encabezado": "ORDEN", "orden": 1, "formato": "texto"},
       {"campo_origen": "codigo_cliente", "nombre_encabezado": "CUENTA", "orden": 2, "formato": "texto"},
       {"campo_origen": "sku", "nombre_encabezado": "ARTICULO", "orden": 3, "formato": "texto"},
       {"campo_origen": "cantidad_confirmada", "nombre_encabezado": "UNIDADES", "orden": 4, "formato": "entero"},
       {"campo_origen": "descuento_porcentaje", "nombre_encabezado": "DESC", "orden": 5, "formato": "decimal_coma"}]}'::jsonb
 WHERE codigo_drogueria = 'DROG-COBECA';
UPDATE dim_productos SET clasificacion_portafolio = 'Cardio' WHERE sku = 'SKU-LOS-50';

INSERT INTO dim_clientes (id, ident01, rif, razon_social, nombre_fantasia, brick, municipio_ciudad, estado, direccion, frecuencia, bandera, local_gps_lat, local_gps_lon, telefono) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'CLI-1001', 'J-30489218-4', 'Droguería La Paz S.R.L.', 'Farmacia La Paz', 'CCS-01', 'Chacao', 'Miranda', 'Calle Bolívar', 'F2', 'Independiente', 10.5, -66.85, '0212-1'),
  ('c0000000-0000-0000-0000-000000000002', 'CLI-1002', 'J-00000001-0', 'Farmatodo C.A.', 'Farmatodo Altamira', 'CCS-02', 'Chacao', 'Miranda', 'Av. Luis Roche', 'Semanal', 'Farmatodo', 0, 0, NULL),
  ('c0000000-0000-0000-0000-000000000003', 'CLI-1003', 'J-00000001-0', 'Farmatodo C.A.', 'Farmatodo Chacao', 'CCS-02', 'Chacao', 'Miranda', 'Av. Francisco de Miranda', 'Mensual', 'Farmatodo', 10.49, -66.86, NULL),
  ('c0000000-0000-0000-0000-000000000004', 'CLI-1004', 'J-00000000-0', 'Botiquería El Valle', 'Botiquería El Valle', NULL, 'Caracas', 'Distrito Capital', 'Sin direccion fiscal', 'Semanal', 'Independiente', NULL, NULL, NULL);
UPDATE dim_clientes SET activo = false WHERE ident01 = 'CLI-1004';

INSERT INTO rel_cliente_vendedor (cliente_id, vendedor_id, equipo, rol_asignacion) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'A', 'titular'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'B', 'compartido');   -- mismo par en dos equipos

INSERT INTO rel_cliente_drogueria_codigos (cliente_id, drogueria_id, codigo_cliente_drogueria)
  SELECT 'c0000000-0000-0000-0000-000000000001', id, 'COB-1001' FROM dim_droguerias WHERE codigo_drogueria = 'DROG-COBECA';
INSERT INTO dim_cliente_drogueria_alias (cliente_ident01, drogueria, cod_cliente_drogueria, nombre_cliente_drogueria, verificado) VALUES
  ('CLI-1001', 'Cobeca', 'COB-1001', 'FARMACIA LA PAZ', true),
  ('CLI-1001', 'Cobeca', 'COB-1001-B', 'LA PAZ SUCURSAL', true),          -- segunda cuenta de la misma farmacia en Cobeca
  ('CLI-1001', 'NENA', NULL, 'LA PAZ CHACAO', true),            -- Nena solo envía nombre
  ('CLI-1002', 'Cobeca', 'COB-9', 'FARMATODO ALTAMIRA', false);           -- sin verificar: no se migra
INSERT INTO dim_producto_drogueria_mapeo (cod_sap, drogueria, codigo_producto_drogueria, nombre_producto_drogueria) VALUES
  ('SKU-LOS-50', 'Cobeca', 'COB-LOS', 'LOSARTAN POTASICO 50MG'),
  ('SKU-LOS-50', 'Cobeca', 'COB-LOS-OLD', 'LOSARTAN 50 X30'),             -- código reemplazado
  ('SKU-ATO-20', 'Cobeca', 'COB-ATO', 'ATORVASTATINA 20MG'),
  ('SKU-LOS-50', 'NENA', 'NEN-100', 'LOSARTAN');

INSERT INTO fact_historico_ventas (fecha, mes_periodo, archivo_origen, cod_cliente, nombre_cliente, drogueria, codigo_producto, nombre_producto, unidades, cod_sap, cliente_ident01) VALUES
  ('2026-01-10', '2026-01', 'ventas_enero.csv', 'COB-1001',  'FARMACIA LA PAZ',   'Cobeca', 'COB-LOS',     'LOSARTAN POTASICO 50MG', 10, NULL, NULL),
  ('2026-01-20', '2026-01', 'ventas_enero.csv', 'COB-1001',  'FARMACIA LA PAZ',   'Cobeca', 'COB-LOS-OLD', 'LOSARTAN 50 X30',         5, NULL, NULL),
  ('2026-01-21', '2026-01', 'ventas_enero.csv', 'COB-1001',  'FARMACIA LA PAZ',   'Cobeca', 'COB-ATO',     'ATORVASTATINA 20MG',      8, NULL, NULL),
  ('2026-01-22', '2026-01', 'ventas_enero.csv', 'COB-555',   'BOTICA DESCONOCIDA','Cobeca', 'COB-LOS',     'LOSARTAN POTASICO 50MG',  7, NULL, NULL),
  ('2026-01-23', '2026-01', 'ventas_enero.csv', 'COB-1001',  'FARMACIA LA PAZ',   'Cobeca', 'COB-OME',     'OMEPRAZOL',               4, 'SKU-OME-20', NULL),
  ('2026-01-24', '2026-01', 'ventas_enero.csv', 'COB-1001',  'FARMACIA LA PAZ',   'Cobeca', 'COB-LOS',     'LOSARTAN POTASICO 50MG', -2, NULL, NULL),
  ('2026-02-02', '2026-02', 'ventas_febrero.csv', '',        'la paz - chacao',   'NENA', 'NEN-100', 'LOSARTAN',            30, NULL, NULL),
  ('2026-02-03', '2026-02', 'ventas_febrero.csv', 'X-1',     'OTRA',              'FANTASMA', 'F-1',       'NADA',                     1, NULL, NULL);
