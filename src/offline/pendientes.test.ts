import { describe, expect, it } from 'vitest';
import { antiguedad, describirPendientes, hayQueAvisar } from './pendientes';
import type { OutboxItem } from './types';

const item = (seq: number, tipo: OutboxItem['tipo'], payload: Record<string, unknown>, extra: Partial<OutboxItem> = {}): OutboxItem =>
  ({ seq, id: `i${seq}`, tipo, entidad_id: String(payload.id ?? `e${seq}`), payload, estado: 'pendiente', intentos: 0, proximo_intento: 0, created_at: 1_000_000, ...extra });

describe('cambios guardados solo en el dispositivo', () => {
  it('se describen en palabras y en orden', () => {
    const l = describirPendientes(
      [item(2, 'farmacia.codigo', { cliente_id: 'c1', codigo: '55' }), item(1, 'pedido.crear', { id: 'p1', cliente_id: 'c1' })],
      (id) => (id === 'c1' ? 'La Paz' : undefined),
      (id) => (id === 'p1' ? { correlativo: 'L-1', cliente_id: 'c1' } : undefined)
    );
    expect(l.map((x) => [x.que, x.detalle])).toEqual([['Pedido nuevo', 'L-1 · La Paz'], ['Código de farmacia en droguería', 'La Paz: 55']]);
  });

  it('antigüedad y cuándo avisar', () => {
    expect(antiguedad(0, 5 * 60_000)).toBe('hace 5 min');
    expect(antiguedad(0, 3 * 3_600_000)).toBe('hace 3 h');
    const base = describirPendientes([item(1, 'visita.registrar', { cliente_id: 'c' })], () => 'X', () => undefined);
    expect(hayQueAvisar(base, 1_000_000 + 60_000)).toBe(false);
    expect(hayQueAvisar(base, 1_000_000 + 11 * 60_000)).toBe(true);
    expect(hayQueAvisar(describirPendientes([item(1, 'visita.registrar', { cliente_id: 'c' }, { estado: 'error' })], () => 'X', () => undefined), 1_000_000)).toBe(true);
  });
});
