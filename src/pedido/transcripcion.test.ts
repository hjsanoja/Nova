import { describe, expect, it } from 'vitest';
import { agregarTrozo, sinRepeticiones, unirTrozos } from './transcripcion';

describe('unir lo que devuelve el reconocimiento de voz', () => {
  it('resultados acumulados de Android no se repiten', () => {
    expect(unirTrozos(['pedido', 'pedido para', 'pedido para farmacia', 'pedido para farmacia la paz'])).toBe('pedido para farmacia la paz');
  });

  it('trozos consecutivos, repetidos o solapados', () => {
    expect(unirTrozos(['farmacia la paz', 'diez losartán', 'cinco omeprazol'])).toBe('farmacia la paz diez losartán cinco omeprazol');
    expect(agregarTrozo('farmacia la paz diez losartán', 'diez losartán')).toBe('farmacia la paz diez losartán');
    expect(agregarTrozo('farmacia la paz diez', 'Diez losartán 50')).toBe('farmacia la paz diez losartán 50');
    expect(agregarTrozo('hola', '')).toBe('hola');
  });

  it('palabras duplicadas seguidas se colapsan; los números no', () => {
    expect(sinRepeticiones('pedido pedido pedido para farmacia farmacia la paz')).toBe('pedido para farmacia la paz');
    expect(sinRepeticiones('losartán 10 10 omeprazol')).toBe('losartán 10 10 omeprazol');
  });
});
