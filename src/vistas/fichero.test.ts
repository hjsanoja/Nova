import { describe, expect, it } from 'vitest';
import { parsearCodigos, parsearFichero } from './fichero';

describe('carga de fichero por CSV', () => {
  it('agrupa las farmacias por vendedor, con o sin encabezado, con ; o ,', () => {
    const r = parsearFichero('codigo_cliente;correo_vendedor\nCLI-1;Ana@Nova.com\nCLI-2;ana@nova.com\nCLI-1;ana@nova.com\nCLI-3;luis@nova.com\n');
    expect([...r.porVendedor]).toEqual([['ana@nova.com', ['CLI-1', 'CLI-2']], ['luis@nova.com', ['CLI-3']]]);
    expect(r.errores).toEqual([]);
    expect([...parsearFichero('"CLI-9","x@y.com"').porVendedor]).toEqual([['x@y.com', ['CLI-9']]]);
  });
  it('avisa de las filas incompletas sin descartar el resto', () => {
    const r = parsearFichero('CLI-1;a@b.com\nCLI-2;\n;c@d.com\nCLI-3;no-es-correo');
    expect([...r.porVendedor]).toEqual([['a@b.com', ['CLI-1']]]);
    expect(r.errores).toHaveLength(3);
    expect(parsearFichero('').errores).toEqual(['El archivo está vacío.']);
  });
  it('códigos pegados a mano', () => {
    expect(parsearCodigos('CLI-1\nCLI-2, CLI-3;CLI-1\n\n')).toEqual(['CLI-1', 'CLI-2', 'CLI-3']);
  });
});
