import { describe, expect, it } from 'vitest';
import { interpretarFoto, textoDeFotoAPedido } from './leerFoto';
import { normalizar, tokensProducto } from '../offline/busqueda';

const prod = (id: string, nombre: string, presentacion = '') => ({
  id, sku: id, nombre_comercial: nombre, presentacion, principio_activo: '', empaque_minimo: 1, activo: true,
  tokens: tokensProducto({ sku: id, nombre_comercial: nombre, presentacion }),
});
const PRODUCTOS = [prod('LOS50', 'Losartan 50 mg', 'Caja x 30'), prod('OME20', 'Omeprazol 20 mg', 'Caja x 28'), prod('ATA500', 'Atamel 500 mg', 'Caja x 20')];
const CLIENTES = [{ id: 'C1', nombre_comercial: 'Farmacia La Paz', razon_social: 'Farmacia La Paz', codigo_interno: 'C1', busqueda: normalizar('Farmacia La Paz') }];

describe('pedido desde una foto', () => {
  it('una línea por producto, sin viñetas ni precios, con la cantidad al inicio', () => {
    const leido = 'Pedido Farmacia La Paz\n\n1. Losartan 50 mg x 10   $12,50\n- Omeprazol 20mg - 5\n• Atamel 500 mg 3 cajas\n|||\n';
    expect(textoDeFotoAPedido(leido)).toBe('Pedido Farmacia La Paz\n10 Losartan 50 mg\n5 Omeprazol 20mg\n3 Atamel 500 mg');
  });

  it('tabla: cantidad en su columna y el precio fuera; numeración sin punto; errores del lector en "mg"', () => {
    expect(textoDeFotoAPedido('P100      Losartan 50 mg       10 $13.70\n5 Metformina 850 mg -------- 6 cajas\nAcetaminofen 650 M8 ---- 4 cajas\nAmlodipina 10 mg: 12   l')).toBe(
      '10 P100 Losartan 50 mg\n6 Metformina 850 mg\n4 Acetaminofen 650 mg\n12 Amlodipina 10 mg'
    );
  });

  it('no toma la presentación como cantidad', () => {
    expect(textoDeFotoAPedido('6 Losartan 50 mg caja x 30')).toBe('6 Losartan 50 mg caja x 30');
  });

  it('el intérprete del dictado arma el pedido con lo leído', () => {
    const r = interpretarFoto(textoDeFotoAPedido('Farmacia La Paz\nLosartan 50 mg x 10\nOmeprazol 20 mg x 5\nAtamel 500 x 2'), CLIENTES, PRODUCTOS);
    expect(r.cliente?.id).toBe('C1');
    expect(r.lineas.map((l) => [l.producto?.id, l.unidades])).toEqual([['LOS50', 10], ['OME20', 5], ['ATA500', 2]]);
  });
});

// Textos reales del lector (tesseract, modo bloque) sobre seis imágenes de prueba: captura de WhatsApp, hoja impresa
// girada, tabla con precios, nota oscura, chat en modo oscuro y foto con sombra.
import LEIDOS from './__fixtures__/ocr-pedidos.json';

const CATALOGO = [
  prod('LOS', 'Losartan Potasico', '50 mg x 30 tab'), prod('OME', 'Omeprazol', '20 mg x 28 cap'), prod('ATA', 'Atamel', '500 mg x 20 tab'),
  prod('AML', 'Amlodipina', '10 mg x 30 tab'), prod('MET', 'Metformina', '850 mg x 30 tab'), prod('IBU', 'Ibuprofeno', '400 mg x 10 tab'),
  prod('ACE', 'Acetaminofen', '650 mg x 10 tab'), prod('LOR', 'Loratadina', '10 mg x 10 tab'),
];
const ESPERADO = [['LOS', 10], ['OME', 5], ['ATA', 3], ['AML', 12], ['MET', 6], ['IBU', 8], ['ACE', 4], ['LOR', 2]];

describe('pedido desde una foto: imágenes de prueba', () => {
  for (const [nombre, leido] of Object.entries(LEIDOS as Record<string, string>)) {
    it(`arma los 8 productos con sus unidades (${nombre})`, () => {
      const r = interpretarFoto(textoDeFotoAPedido(leido), CLIENTES, CATALOGO);
      expect(r.lineas.map((l) => [l.producto?.id, l.unidades])).toEqual(ESPERADO);
    });
  }
});
