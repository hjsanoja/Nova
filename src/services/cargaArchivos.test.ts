import { describe, expect, it } from 'vitest';
import { fechaVenta, leerCsv, numero, prepararClientes, prepararDroguerias, prepararProductos } from './cargaArchivos';

describe('lectura de CSV', () => {
  it('detecta el separador, quita el BOM y respeta comillas', () => {
    const l = leerCsv('﻿codigo;nombre;nota\r\nA-1;"Farmacia; La Paz";"dice ""hola"""\r\n\r\n;;\r\nA-2;Otra;\r\n');
    expect(l.separador).toBe(';');
    expect(l.encabezados).toEqual(['codigo', 'nombre', 'nota']);
    expect(l.filas).toEqual([{ codigo: 'A-1', nombre: 'Farmacia; La Paz', nota: 'dice "hola"' }, { codigo: 'A-2', nombre: 'Otra', nota: '' }]);
    expect(l.lineas).toEqual([2, 5]); // las líneas vacías y ";;" no cuentan, pero el número de línea se conserva
    expect(leerCsv('a,b\n1,2').separador).toBe(',');
    expect(leerCsv('a\tb\n1\t2').filas).toEqual([{ a: '1', b: '2' }]);
    expect(leerCsv('').filas).toEqual([]);
  });

  it('números con coma o punto decimal', () => {
    expect(numero('10,5')).toBe(10.5);
    expect(numero('1.234,5')).toBe(1234.5);
    expect(numero('1,234.5')).toBe(1234.5);
    expect(numero('-12')).toBe(-12);
    expect(numero('abc')).toBeNull();
    expect(numero('')).toBeNull();
  });

  it('fechas de los reportes de ventas', () => {
    expect(fechaVenta('2026-03-05')).toBe('2026-03-05');
    expect(fechaVenta('05/03/2026 00:00:00')).toBe('2026-03-05');
    expect(fechaVenta('5-3-26')).toBe('2026-03-05');
    expect(fechaVenta('2026-03')).toBe('2026-03-15');
    expect(fechaVenta('7', '2026-04')).toBe('2026-04-07');
    expect(fechaVenta('7')).toBeNull();
    expect(fechaVenta('31/02/2026')).toBeNull();
    expect(fechaVenta('ayer')).toBeNull();
  });
});

describe('preparación sin datos inventados', () => {
  it('droguerías: el nombre es obligatorio y no se inventan correos ni páginas web', () => {
    const p = prepararDroguerias(leerCsv('NOMBRE_DROGUERIA;CODIGO_DROGUERIA;EMAIL_PEDIDOS\nCobeca;cobeca;\nDrocerca;;\n;X;\ncobeca otra vez;COBECA;p@c.com'));
    expect(p.descartes).toEqual([{ linea: 4, motivo: 'Falta el nombre de la droguería' }]);
    expect(p.repetidas).toBe(1);
    expect(p.registros.map((d) => [d.codigo_drogueria, d.nombre_drogueria, d.email_pedidos, d.pagina_web])).toEqual([
      ['COBECA', 'cobeca otra vez', 'p@c.com', ''],
      ['DROCERCA', 'Drocerca', '', ''],
    ]);
  });

  it('farmacias: sin código o sin nombre se descartan; sin RIF ni GPS quedan vacíos', () => {
    const p = prepararClientes(leerCsv('ident01;razon social;nombre de fantasia;rif;local_gps_lat;local_gps_lon\nF-1;Uno C.A.;;;;\n;Sin codigo;;;;\nF-2;;;;;\nF-3;;Tres;J-1;10,5;-66,9'));
    expect(p.descartes.map((d) => d.linea)).toEqual([3, 4]);
    expect(p.descartes[1].motivo).toMatch(/F-2 sin razón social/);
    const [uno, tres] = p.registros;
    expect(uno).toMatchObject({ ident01: 'F-1', razon_social: 'Uno C.A.', nombre_fantasia: 'Uno C.A.', rif: '', brick: '', local_gps_lat: undefined });
    expect(tres).toMatchObject({ ident01: 'F-3', razon_social: 'Tres', rif: 'J-1', local_gps_lat: 10.5, local_gps_lon: -66.9 });
  });

  it('productos: código y descripción obligatorios; sin código de barras inventado', () => {
    const p = prepararProductos(leerCsv('Codigo;Descripcion;Estado;Pack Code\nS-1;Losartan;Inactivo;\nS-2;;;\n;Algo;;'));
    expect(p.descartes.map((d) => d.motivo)).toEqual(['Producto S-2 sin descripción', 'Falta el código del producto']);
    expect(p.registros[0]).toMatchObject({ sku: 'S-1', nombre_comercial: 'Losartan', activo: false, codigo_barras_ean13: '', stock_disponible: 0 });
  });
});
