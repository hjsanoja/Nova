import { describe, expect, it } from 'vitest';
import { crearVocabulario, elegirTranscripcion, extraerDrogueriaYPlantilla, fonetica, interpretarDictado, palabrasANumeros, parecido, separarFrase } from './dictado';
import { normalizar, tokensProducto } from '../offline/busqueda';

const prod = (id: string, nombre: string, presentacion = '', principio = '') => ({
  id, sku: id, nombre_comercial: nombre, presentacion, principio_activo: principio, empaque_minimo: 1, activo: true,
  tokens: tokensProducto({ sku: id, nombre_comercial: nombre, presentacion, principio_activo: principio }),
});
const cli = (id: string, nombre: string, razon = nombre) => ({ id, nombre_comercial: nombre, razon_social: razon, codigo_interno: id, busqueda: normalizar(`${nombre} ${razon} ${id}`) });

const PRODUCTOS = [
  prod('LOS50', 'Losartan 50 mg', 'Caja x 30 tabletas', 'Losartan potasico'),
  prod('LOS100', 'Losartan 100 mg', 'Caja x 30 tabletas', 'Losartan potasico'),
  prod('ATO20', 'Atorvastatina 20 mg', 'Caja x 30', 'Atorvastatina'),
  prod('OME20', 'Omeprazol 20 mg', 'Caja x 28 capsulas', 'Omeprazol'),
  prod('ATA500', 'Atamel 500 mg', 'Caja x 20', 'Acetaminofen'),
];
const CLIENTES = [cli('CLI-1', 'Farmacia La Paz', 'Drogueria y Farmacia La Paz C.A.'), cli('CLI-2', 'Farmatodo Las Mercedes'), cli('CLI-3', 'Farmacia San Rafael')];

describe('números dichos con palabras', () => {
  it('convierte cifras en palabras', () => {
    expect(palabrasANumeros('treinta y cinco cajas'.split(' '))).toEqual(['35', 'cajas']);
    expect(palabrasANumeros('ciento veinte losartan'.split(' '))).toEqual(['120', 'losartan']);
    expect(palabrasANumeros('media docena de omeprazol'.split(' '))).toEqual(['6', 'de', 'omeprazol']);
    expect(palabrasANumeros('un atamel y dos mil omeprazol'.split(' '))).toEqual(['1', 'atamel', 'y', '2000', 'omeprazol']);
    expect(palabrasANumeros('veintidos'.split(' '))).toEqual(['22']);
  });
});

describe('estructura de la frase', () => {
  const siempreCliente = (n: number) => (p: string[]) => (p.length === n ? 0.9 : 0.5);
  it('cantidad antes o después; la concentración no es cantidad', () => {
    expect(separarFrase('Farmacia La Paz, diez losartán de cincuenta, cinco atorvastatina', siempreCliente(3))).toEqual({
      cliente: ['farmacia', 'la', 'paz'],
      lineas: [{ palabras: ['losartan', 'de', '50'], unidades: 10 }, { palabras: ['atorvastatina'], unidades: 5 }],
    });
    expect(separarFrase('la paz losartan 50 mg 10 omeprazol 3', siempreCliente(2)).lineas).toEqual([
      { palabras: ['losartan', '50', 'mg'], unidades: 10 },
      { palabras: ['omeprazol'], unidades: 3 },
    ]);
    expect(separarFrase('pedido para la paz 12 cajas de atamel 500 y 4 unidades omeprazol', siempreCliente(2)).lineas).toEqual([
      { palabras: ['atamel', '500'], unidades: 12 },
      { palabras: ['omeprazol'], unidades: 4 },
    ]);
  });
});

describe('interpretar un pedido dictado', () => {
  it('reconoce la farmacia, los productos y las unidades', () => {
    const r = interpretarDictado('Farmacia La Paz, diez losartán cincuenta, cinco atorvastatina y tres omeprazol', CLIENTES, PRODUCTOS);
    expect(r.cliente?.id).toBe('CLI-1');
    expect(r.lineas.map((l) => [l.producto?.id, l.unidades])).toEqual([['LOS50', 10], ['ATO20', 5], ['OME20', 3]]);
    expect(r.lineas[0].alternativas.map((p) => p.id)).toContain('LOS100');
  });

  it('tolera errores del reconocimiento de voz y la concentración distingue presentaciones', () => {
    const r = interpretarDictado('para farmatodo las mercedes 20 losartan 100 y 6 atorbastatina', CLIENTES, PRODUCTOS);
    expect(r.cliente?.id).toBe('CLI-2');
    expect(r.lineas.map((l) => [l.producto?.id, l.unidades])).toEqual([['LOS100', 20], ['ATO20', 6]]);
  });

  it('lo que no entiende queda sin producto para que el vendedor lo elija', () => {
    const r = interpretarDictado('san rafael 4 aspirina', CLIENTES, PRODUCTOS);
    expect(r.cliente?.id).toBe('CLI-3');
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]).toMatchObject({ texto: 'aspirina', unidades: 4, producto: null });
  });

  it('sin farmacia reconocible devuelve cliente nulo y aun así las líneas', () => {
    const r = interpretarDictado('8 omeprazol', CLIENTES, PRODUCTOS);
    expect(r.cliente).toBeNull();
    expect(r.lineas.map((l) => [l.producto?.id, l.unidades])).toEqual([['OME20', 8]]);
  });

  it('parecido: los números deben coincidir y las palabras vacías no cuentan', () => {
    expect(parecido(['losartan', '50'], PRODUCTOS[0].tokens)).toBe(1);
    expect(parecido(['losartan', '50'], PRODUCTOS[1].tokens)).toBe(0.5);
    expect(parecido(['farmacia', 'la'], CLIENTES[0].busqueda.split(' '))).toBe(0);
  });
});

describe('droguería y plantilla dichas en el pedido', () => {
  const DROG = [{ id: 'd1', nombre: 'Cobeca', codigo: 'COBECA' }, { id: 'd2', nombre: 'Drocerca', codigo: 'DRO' }, { id: 'd3', nombre: 'Nena', codigo: 'NEN' }];

  it('cliente, droguería, productos y unidades; y guardar como plantilla con nombre', () => {
    const r = interpretarDictado('Farmacia La Paz por Cobeca, diez losartán 50 y cinco omeprazol, guárdalo como plantilla semanal', CLIENTES, PRODUCTOS, DROG);
    expect(r.cliente?.id).toBe('CLI-1');
    expect(r.drogueria?.id).toBe('d1');
    expect(r.lineas.map((l) => [l.producto?.id, l.unidades])).toEqual([['LOS50', 10], ['OME20', 5]]);
    expect(r.plantilla).toEqual({ nombre: 'Semanal' });
  });

  it('la droguería puede ir al final y la plantilla sin nombre', () => {
    const r = interpretarDictado('san rafael 4 atamel droguería drocerca, es una plantilla', CLIENTES, PRODUCTOS, DROG);
    expect(r.cliente?.id).toBe('CLI-3');
    expect(r.drogueria?.id).toBe('d2');
    expect(r.lineas.map((l) => [l.producto?.id, l.unidades])).toEqual([['ATA500', 4]]);
    expect(r.plantilla).toEqual({ nombre: '' });
  });

  it('el nombre de la farmacia puede llevar números si se separa con una pausa', () => {
    const clientes = [...CLIENTES, cli('CLI-24', 'Farmacia 24 Horas'), cli('CLI-12', 'Farmacia 12')];
    const r = interpretarDictado('Farmacia 12 por Drocerca, 3 losartán 50 y 4 omeprazol', clientes, PRODUCTOS, DROG);
    expect(r.cliente?.id).toBe('CLI-12');
    expect(r.lineas.map((l) => [l.producto?.id, l.unidades])).toEqual([['LOS50', 3], ['OME20', 4]]);
    expect(interpretarDictado('farmacia 24 horas, 2 atamel', clientes, PRODUCTOS, DROG).cliente?.id).toBe('CLI-24');
  });

  it('sin droguería ni plantilla no cambia nada; un nombre corto solo cuenta si se dice "droguería" o "por"', () => {
    const r = interpretarDictado('la paz 3 omeprazol', CLIENTES, PRODUCTOS, DROG);
    expect(r.drogueria).toBeNull();
    expect(r.plantilla).toBeNull();
    expect(extraerDrogueriaYPlantilla('farmacia nena 3 omeprazol', [{ id: 'x', nombre: 'Ne', codigo: 'NE' }]).drogueria).toBeNull();
    expect(extraerDrogueriaYPlantilla('3 omeprazol por nena', DROG).drogueria?.id).toBe('d3');
  });
});

describe('más precisión', () => {
  it('compara cómo suenan las palabras (b/v, c/s/z, ll/y, h muda, qu/k)', () => {
    expect(fonetica('atorvastatina')).toBe(fonetica('atorbastatina'));
    expect(fonetica('cetirizina')).toBe(fonetica('setirisina'));
    expect(fonetica('hidroclorotiazida')).toBe(fonetica('idroclorotiasida'));
    expect(fonetica('quetiapina')).toBe(fonetica('ketiapina'));
    expect(parecido(['setirisina'], ['cetirizina'])).toBeGreaterThanOrEqual(0.9);
    const r = interpretarDictado('farmacia la paz 4 omeprasol y 2 atamell', CLIENTES, PRODUCTOS);
    expect(r.lineas.map((l) => l.producto?.id)).toEqual(['OME20', 'ATA500']);
  });

  it('de las versiones que da el reconocimiento elige la que más se parece al catálogo', () => {
    const v = crearVocabulario([...PRODUCTOS.map((p) => p.nombre_comercial), ...CLIENTES.map((c) => c.nombre_comercial)]);
    expect(elegirTranscripcion(['farmacia la paz 10 lo sartan', 'farmacia la paz 10 losartan'], v)).toBe('farmacia la paz 10 losartan');
    expect(elegirTranscripcion(['10 omeprazol', '10 o me prazol'], v)).toBe('10 omeprazol');
  });

  it('prefiere lo que la farmacia ya compra y respeta la concentración dicha', () => {
    const historial = () => new Map([['LOS100', 1]]);
    expect(interpretarDictado('la paz 10 losartan', CLIENTES, PRODUCTOS).lineas[0].producto?.id).toBe('LOS50');
    expect(interpretarDictado('la paz 10 losartan', CLIENTES, PRODUCTOS, [], { historial }).lineas[0].producto?.id).toBe('LOS100');
    expect(interpretarDictado('la paz 10 losartan 50', CLIENTES, PRODUCTOS, [], { historial }).lineas[0].producto?.id).toBe('LOS50');
    // Sin farmacia en la frase: la del carrito abierto aporta su historial.
    expect(interpretarDictado('10 losartan', CLIENTES, PRODUCTOS, [], { historial, clientePorDefecto: CLIENTES[0] }).lineas[0].producto?.id).toBe('LOS100');
  });
});
