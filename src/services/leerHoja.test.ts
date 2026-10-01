import { describe, expect, it } from 'vitest';
import { decodificarTexto, indiceColumna, leerTabla, leerTextoTabla } from './leerHoja';
import { armarXlsx, armarZip } from './xlsxPrueba';

describe('leerHoja', () => {
  it('lee un CSV con punto y coma, comillas y filas de título arriba', () => {
    const t = leerTextoTabla('Reporte de despacho\n\nPEDIDO;CODIGO;"DESCRIPCION; LARGA";DESPACHADO\nPED-1;A1;"Losartán; 50";10\n\n');
    expect(t).toEqual([['Reporte de despacho'], [], ['PEDIDO', 'CODIGO', 'DESCRIPCION; LARGA', 'DESPACHADO'], ['PED-1', 'A1', 'Losartán; 50', '10']]);
  });

  it('decodifica UTF-8 y, si no lo es, Windows (ANSI)', () => {
    expect(decodificarTexto(new TextEncoder().encode('﻿Código'))).toBe('Código');
    expect(decodificarTexto(Uint8Array.from([0x43, 0xf3, 0x64]))).toBe('Cód');
  });

  it('convierte referencias de columna', () => {
    expect(indiceColumna('A1')).toBe(0);
    expect(indiceColumna('Z9')).toBe(25);
    expect(indiceColumna('AB12')).toBe(27);
  });

  it.each([true, false])('lee un .xlsx (comprimido: %s) con texto compartido, en línea y números', async (comprimir) => {
    const bytes = await armarXlsx([['Pedido', 'Código', 'Cant. Despachada'], ['PED-1045', '7591234567890', 8], ['PED-1045', 'OME-020', 0.1 + 0.2]], comprimir);
    const t = await leerTabla('respuesta.xlsx', bytes);
    expect(t.tipo).toBe('xlsx');
    expect(t.hojas).toEqual(['Despacho']);
    expect(t.filas).toEqual([['Pedido', 'Código', 'Cant. Despachada'], ['PED-1045', '7591234567890', '8'], ['PED-1045', 'OME-020', '0.3']]);
  });

  it('respeta celdas vacías por la referencia de la celda', async () => {
    const bytes = await armarZip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="H" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="2"><c r="C2"><v>5</v></c></row></sheetData></worksheet>',
    });
    const t = await leerTabla('x.xlsx', bytes);
    expect(t.filas).toEqual([[], ['', '', '5']]);
  });

  it('rechaza el Excel antiguo (.xls) con instrucciones', async () => {
    await expect(leerTabla('viejo.xls', Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0]))).rejects.toThrow(/Excel antiguo/);
  });
});
