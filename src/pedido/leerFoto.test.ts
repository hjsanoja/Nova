import { describe, expect, it } from 'vitest';
import { textoDeFotoAPedido } from './leerFoto';
import { interpretarDictado } from './dictado';
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
    expect(textoDeFotoAPedido(leido)).toBe('Pedido Farmacia La Paz, 10 Losartan 50 mg, 5 Omeprazol 20mg, 3 Atamel 500 mg');
  });

  it('no toma la presentación como cantidad', () => {
    expect(textoDeFotoAPedido('6 Losartan 50 mg caja x 30')).toBe('6 Losartan 50 mg caja x 30');
  });

  it('el intérprete del dictado arma el pedido con lo leído', () => {
    const r = interpretarDictado(textoDeFotoAPedido('Farmacia La Paz\nLosartan 50 mg x 10\nOmeprazol 20 mg x 5\nAtamel 500 x 2'), CLIENTES, PRODUCTOS);
    expect(r.cliente?.id).toBe('C1');
    expect(r.lineas.map((l) => [l.producto?.id, l.unidades])).toEqual([['LOS50', 10], ['OME20', 5], ['ATA500', 2]]);
  });
});
