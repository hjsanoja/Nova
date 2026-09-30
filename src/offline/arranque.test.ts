import { afterEach, describe, expect, it } from 'vitest';
import { iniciarOffline } from './arranque';
import { arrancarMotor, detenerMotor, hayMotorEnMarcha } from './motor';
import { crearDbTemporal, crearRemotoFalso } from './testing/utiles';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => detenerMotor());

describe('arranque del motor de sincronización', () => {
  it('detener un motor viejo no apaga al que lo reemplazó', () => {
    const db = crearDbTemporal();
    const viejo = arrancarMotor(db, null);
    arrancarMotor(db, null);
    detenerMotor(viejo);
    expect(hayMotorEnMarcha()).toBe(true);
  });

  it('un arranque cancelado no deja la app sin motor (dos arranques seguidos, el primero más lento)', async () => {
    const lento = new AbortController();
    const primero = iniciarOffline(async () => { await esperar(40); return crearRemotoFalso(); }, 'u1', lento.signal);
    const segundo = iniciarOffline(async () => crearRemotoFalso(), 'u1', new AbortController().signal);
    lento.abort(); // la pantalla se volvió a montar: el primer arranque ya no hace falta
    const [pararPrimero, pararSegundo] = await Promise.all([primero, segundo]);
    pararPrimero();
    expect(hayMotorEnMarcha()).toBe(true); // el motor del segundo arranque sigue enviando la cola
    pararSegundo();
    expect(hayMotorEnMarcha()).toBe(false);
  });
});
