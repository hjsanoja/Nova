import { describe, expect, it } from 'vitest';
import { prepararDispositivoPara } from './aislamiento';
import { cliente, crearDbTemporal, producto } from './testing/utiles';

describe('aislamiento entre usuarios del mismo dispositivo', () => {
  it('el mismo usuario conserva sus datos; otro usuario empieza limpio', async () => {
    const db = crearDbTemporal();
    expect(await prepararDispositivoPara(db, 'vend-a')).toBe(false); // primera vez
    await db.clientes.put(cliente('c1'));
    await db.productos.put(producto('1', 'Losartán'));
    await db.guardarMeta('cursor:dim_clientes', '2026-09-01T00:00:00Z');

    expect(await prepararDispositivoPara(db, 'vend-a')).toBe(false);
    expect(await db.clientes.count()).toBe(1);

    expect(await prepararDispositivoPara(db, 'vend-b')).toBe(true);
    expect(await db.clientes.count()).toBe(0);
    expect(await db.productos.count()).toBe(0);
    expect(await db.leerMeta('cursor:dim_clientes', null)).toBeNull(); // se vuelve a descargar todo
    expect(await db.leerMeta('usuario_id', null)).toBe('vend-b');
  });
});
