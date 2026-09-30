import { beforeEach, describe, expect, it } from 'vitest';
import type { NovaDB } from './db';
import { procesarOutbox } from './outbox';
import { codigoDeFarmacia, registrarCodigoFarmacia } from './homologacion';
import { eliminarPlantilla, guardarPlantilla } from './plantillas';
import { ErrorRemoto } from './remoto';
import { crearDbTemporal, crearRemotoFalso } from './testing/utiles';
import type { RemotoFalso } from './testing/utiles';

let db: NovaDB;
let remoto: RemotoFalso;

beforeEach(async () => {
  db = crearDbTemporal();
  remoto = crearRemotoFalso();
  await db.mapClientes.bulkPut([
    { id: 'm1', drogueria_id: 'A', cliente_id: 'c2', codigo_cuenta: '777', es_principal: true },
    { id: 'm2', drogueria_id: 'A', cliente_id: 'c1', codigo_cuenta: null, nombre_en_drogueria: 'LA PAZ', es_principal: true },
  ]);
});

describe('código de la farmacia en la droguería', () => {
  it('sin código no hay homologación; al guardarlo queda como principal y viaja en la cola', async () => {
    expect(codigoDeFarmacia(await db.mapClientes.toArray(), 'c1', 'A')).toBeNull();
    await registrarCodigoFarmacia(db, { cliente_id: 'c1', drogueria_id: 'A', codigo: ' 12345 ' });
    const map = await db.mapClientes.toArray();
    expect(codigoDeFarmacia(map, 'c1', 'A')).toBe('12345');
    expect(map.find((m) => m.id === 'm2')?.es_principal).toBe(false); // el nombre queda como alterno
    const [item] = await db.outbox.toArray();
    expect(item).toMatchObject({ tipo: 'farmacia.codigo', payload: { cliente_id: 'c1', drogueria_id: 'A', codigo: '12345' } });

    // El servidor respondió con la fila que ya tenía: reemplaza a la provisional.
    remoto.comportamiento = () => ({ id: 'srv-1', cliente_id: 'c1', drogueria_id: 'A', codigo_cuenta: '12345', es_principal: true });
    await procesarOutbox(db, remoto);
    expect(await db.outbox.count()).toBe(0);
    expect(codigoDeFarmacia(await db.mapClientes.toArray(), 'c1', 'A')).toBe('12345');
    expect(await db.mapClientes.get('srv-1')).toBeTruthy();
    expect(await db.mapClientes.get(item.entidad_id)).toBeUndefined();
  });

  it('no acepta un código vacío ni uno que ya es de otra farmacia', async () => {
    await expect(registrarCodigoFarmacia(db, { cliente_id: 'c1', drogueria_id: 'A', codigo: '  ' })).rejects.toThrow(/Escribe/);
    await expect(registrarCodigoFarmacia(db, { cliente_id: 'c1', drogueria_id: 'A', codigo: '777' }, () => 'Farmacia 2')).rejects.toThrow(/otra farmacia.*Farmacia 2/);
    expect(await db.outbox.count()).toBe(0);
  });

  it('si el servidor lo rechaza, se retira y la app lo vuelve a pedir', async () => {
    await registrarCodigoFarmacia(db, { cliente_id: 'c1', drogueria_id: 'A', codigo: '999' });
    remoto.comportamiento = () => new ErrorRemoto('permanente', 'El código 999 ya es de otra farmacia');
    await procesarOutbox(db, remoto);
    expect(codigoDeFarmacia(await db.mapClientes.toArray(), 'c1', 'A')).toBeNull();
    expect((await db.outbox.toArray())[0]).toMatchObject({ estado: 'error' });
  });
});

describe('plantillas de pedido', () => {
  it('se guardan sin conexión, se sincronizan y se borran', async () => {
    const p = await guardarPlantilla(db, { vendedor_id: 'v1', cliente_id: 'c1', drogueria_id: 'A', nombre: ' Semanal ', lineas: [{ producto_id: '1', unidades: 10 }, { producto_id: '2', unidades: 0 }] });
    expect(p).toMatchObject({ nombre: 'Semanal', lineas: [{ producto_id: '1', unidades: 10 }], sync_estado: 'pendiente' });
    await procesarOutbox(db, remoto);
    expect((await db.plantillas.get(p.id))?.sync_estado).toBe('sincronizado');
    expect(remoto.llamadas[0]).toMatchObject({ tipo: 'plantilla.guardar', payload: { id: p.id, nombre: 'Semanal' } });

    await eliminarPlantilla(db, p);
    expect(await db.plantillas.count()).toBe(0);
    expect((await db.outbox.toArray())[0].payload).toMatchObject({ id: p.id, eliminar: true });
    await expect(guardarPlantilla(db, { vendedor_id: 'v1', cliente_id: 'c1', drogueria_id: null, nombre: 'x', lineas: [] })).rejects.toThrow(/no tiene productos/);
  });
});
