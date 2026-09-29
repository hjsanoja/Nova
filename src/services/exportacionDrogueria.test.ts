import { describe, expect, it } from 'vitest';
import { codificar, generarArchivoDrogueria } from './exportacionDrogueria';
import type { EntradaExportacion } from './exportacionDrogueria';
import { FORMATO_CSV, cliente, drogueria, producto } from '../offline/testing/utiles';
import type { FormatoExport, LocalDetalle } from '../offline/types';

const det = (id: string, linea: number, prod: string, sol: number, conf: number | null): LocalDetalle => ({
  id, pedido_id: 'p', linea, producto_id: prod, unidades_solicitadas: sol, unidades_confirmadas: conf,
  unidades_pendientes: Math.max(sol - (conf ?? 0), 0), motivo_ajuste: 'sin_quiebre',
});

function entrada(formato: FormatoExport = FORMATO_CSV, extra: Partial<EntradaExportacion> = {}): EntradaExportacion {
  return {
    pedido: { correlativo: 'PED-1045-R1', created_at: '2026-09-30T10:00:00', observaciones: null, estado: 'enviado_teletransferencia' },
    detalles: [det('a', 1, '1', 10, null), det('b', 2, '2', 5, null)],
    cliente: cliente('c1'),
    drogueria: drogueria('cobeca', formato),
    productos: [producto('1', 'Losartán 50mg'), producto('2', 'Atorvastatina "20" mg')],
    mapProductos: [
      { id: 'm1', drogueria_id: 'cobeca', producto_id: '1', codigo_drogueria: 'COB-LOS', descripcion_drogueria: 'LOSARTAN POTASICO 50MG' },
      { id: 'm2', drogueria_id: 'cobeca', producto_id: '2', codigo_drogueria: 'COB-ATO', descripcion_drogueria: 'ATORVASTATINA; "20"' },
      { id: 'mx', drogueria_id: 'nena', producto_id: '1', codigo_drogueria: 'NEN-LOS' },
    ],
    mapClientes: [{ id: 'k1', drogueria_id: 'cobeca', cliente_id: 'c1', codigo_cuenta: 'COB-1001' }, { id: 'k2', drogueria_id: 'nena', cliente_id: 'c1', codigo_cuenta: 'NEN-77' }],
    ...extra,
  };
}

describe('exportación por droguería', () => {
  it('cruza el pedido con los códigos homologados de ESA droguería', () => {
    const r = generarArchivoDrogueria(entrada(), { ahora: new Date('2026-09-30T12:00:00') });
    expect(r.ok).toBe(true);
    expect(r.nombre_archivo).toBe('COBECA_PED-1045-R1.csv');
    expect(r.texto.split('\r\n')).toEqual([
      '"COD_CLIENTE";"COD_PRODUCTO";"DESCRIPCION";"CANTIDAD";"PEDIDO"',
      '"COB-1001";"COB-LOS";"LOSARTAN POTASICO 50MG";10;"PED-1045-R1"',
      '"COB-1001";"COB-ATO";"ATORVASTATINA; ""20""";5;"PED-1045-R1"', // delimitador y comillas dentro del texto
      '',
    ]);
    expect(r.texto).not.toContain('NEN-'); // nada de otra droguería
    expect(r.lineas).toBe(2);
  });

  it('respeta delimitador, orden, entrecomillado "nunca" y decimales', () => {
    const f: FormatoExport = { ...FORMATO_CSV, delimitador: '|', entrecomillado: 'nunca', salto_linea: '\n', encabezado: false, decimal: 'coma',
      columnas: [{ encabezado: 'P', origen: 'correlativo' }, { encabezado: 'C', origen: 'unidades_solicitadas', formato: 'decimal' }, { encabezado: 'X', origen: 'codigo_producto_drogueria' }, { encabezado: 'F', origen: 'fecha_pedido' }] };
    const r = generarArchivoDrogueria(entrada(f));
    expect(r.texto).toBe('PED-1045-R1|10|COB-LOS|20260930\nPED-1045-R1|5|COB-ATO|20260930\n');
  });

  it('usa unidades confirmadas cuando el pedido ya fue procesado y omite lo no despachado', () => {
    const r = generarArchivoDrogueria(entrada(FORMATO_CSV, {
      pedido: { correlativo: 'PED-1', created_at: '2026-09-30T10:00:00', observaciones: null, estado: 'procesado_parcial' },
      detalles: [det('a', 1, '1', 10, 8), det('b', 2, '2', 5, 0)],
    }));
    expect(r.lineas).toBe(1);
    expect(r.texto).toContain(';8;');
  });

  it('bloquea la exportación si falta la homologación (cliente, producto) o el cliente no está validado', () => {
    const sinProd = generarArchivoDrogueria(entrada(FORMATO_CSV, { mapProductos: [] }));
    expect(sinProd.ok).toBe(false);
    expect(sinProd.errores.map((e) => [e.codigo, e.sku])).toEqual([['producto_sin_homologar', 'SKU-1'], ['producto_sin_homologar', 'SKU-2']]);
    expect(generarArchivoDrogueria(entrada(FORMATO_CSV, { mapClientes: [] })).errores[0].codigo).toBe('cliente_sin_homologar');
    expect(generarArchivoDrogueria(entrada(FORMATO_CSV, { cliente: cliente('c1', { estado_validacion: 'prospecto_pendiente' }) })).errores[0].codigo).toBe('cliente_no_validado');
  });

  it('con permitirFaltantes omite las líneas sin homologar y lo advierte', () => {
    const r = generarArchivoDrogueria(entrada(FORMATO_CSV, { mapProductos: [{ id: 'm1', drogueria_id: 'cobeca', producto_id: '1', codigo_drogueria: 'COB-LOS' }] }), { permitirFaltantes: true });
    expect(r.ok).toBe(true);
    expect(r.lineas).toBe(1);
    expect(r.advertencias[0]).toMatch(/SKU-2/);
  });

  it('TXT posicional: ancho fijo con relleno de ceros y alineación', () => {
    const f: FormatoExport = { ...FORMATO_CSV, formato: 'txt', delimitador: '', encabezado: false, extension: 'txt', salto_linea: '\r\n',
      columnas: [{ encabezado: 'C', origen: 'codigo_cliente_drogueria', ancho: 10, relleno: '0', alineacion: 'der' }, { encabezado: 'P', origen: 'codigo_producto_drogueria', ancho: 8 }, { encabezado: 'Q', origen: 'unidades_solicitadas', ancho: 5 }] };
    const r = generarArchivoDrogueria(entrada(f));
    expect(r.texto.split('\r\n')[0]).toBe('00COB-1001COB-LOS 00010');
    expect(r.mime).toContain('text/plain');
    expect(generarArchivoDrogueria(entrada({ ...f, columnas: [{ encabezado: 'C', origen: 'correlativo' }] })).errores[0].codigo).toBe('ancho_requerido');
  });

  it('codifica en ISO-8859-1 / Windows-1252 y avisa de los caracteres imposibles', () => {
    const f: FormatoExport = { ...FORMATO_CSV, codificacion: 'iso-8859-1', entrecomillado: 'nunca', columnas: [{ encabezado: 'D', origen: 'descripcion_producto_drogueria' }] };
    const r = generarArchivoDrogueria(entrada(f, { mapProductos: [{ id: 'm1', drogueria_id: 'cobeca', producto_id: '1', codigo_drogueria: 'A', descripcion_drogueria: 'Ñandú € Ω' }, { id: 'm2', drogueria_id: 'cobeca', producto_id: '2', codigo_drogueria: 'B', descripcion_drogueria: 'x' }] }));
    const bytes = Array.from(r.bytes);
    expect(bytes).toContain(0xd1); // Ñ
    expect(bytes).toContain(0xfa); // ú
    expect(r.advertencias[0]).toMatch(/2 carácter/); // € y Ω no existen en ISO-8859-1
    expect(Array.from(codificar('€', 'windows-1252').bytes)).toEqual([0x80]);
    expect(Array.from(codificar('a', 'utf-8', true).bytes)).toEqual([0xef, 0xbb, 0xbf, 0x61]);
  });

  it('neutraliza fórmulas de Excel en textos libres', () => {
    const r = generarArchivoDrogueria(entrada(FORMATO_CSV, { mapProductos: [{ id: 'm1', drogueria_id: 'cobeca', producto_id: '1', codigo_drogueria: 'A', descripcion_drogueria: '=HYPERLINK("x")' }, { id: 'm2', drogueria_id: 'cobeca', producto_id: '2', codigo_drogueria: 'B', descripcion_drogueria: 'ok' }] }));
    expect(r.texto).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
