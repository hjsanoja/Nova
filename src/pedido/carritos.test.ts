import { describe, expect, it } from 'vitest';
import { SIN_CARRITOS, faltaParaEnviar, reductorCarritos, totales } from './carritos';
import type { AccionCarritos, EstadoCarritos } from './carritos';

const aplicar = (...acciones: AccionCarritos[]) => acciones.reduce<EstadoCarritos>(reductorCarritos, SIN_CARRITOS);

describe('varios carritos (uno por farmacia)', () => {
  it('abrir crea el carrito de la farmacia una sola vez y lo activa', () => {
    const s = aplicar(
      { tipo: 'abrir', cliente_id: 'F1', drogueria_id: 'D1', id: 'c1' },
      { tipo: 'abrir', cliente_id: 'F2', id: 'c2' },
      { tipo: 'abrir', cliente_id: 'F1', id: 'otro' }
    );
    expect(s.carritos.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(s.activo).toBe('c1');
    expect(s.carritos[0].drogueria_id).toBe('D1');
  });

  it('agregar suma al carrito activo; sin carrito activo no hace nada', () => {
    expect(aplicar({ tipo: 'agregar', producto_id: 'P1', unidades: 2 })).toEqual(SIN_CARRITOS);
    const s = aplicar(
      { tipo: 'abrir', cliente_id: 'F1', id: 'c1' },
      { tipo: 'agregar', producto_id: 'P1', unidades: 2 },
      { tipo: 'agregar', producto_id: 'P1', unidades: 3 },
      { tipo: 'agregar', producto_id: 'P2', unidades: 0 },
      { tipo: 'abrir', cliente_id: 'F2', id: 'c2' },
      { tipo: 'agregar', producto_id: 'P2', unidades: 4 }
    );
    expect(s.carritos[0].lineas).toEqual([{ producto_id: 'P1', unidades: 5 }]);
    expect(s.carritos[1].lineas).toEqual([{ producto_id: 'P2', unidades: 4 }]);
    expect(totales(s.carritos[0])).toEqual({ productos: 1, unidades: 5 });
  });

  it('agregar varios (dictado) abre el carrito de esa farmacia y suma a lo que ya tenía', () => {
    const s = aplicar(
      { tipo: 'abrir', cliente_id: 'F1', id: 'c1' },
      { tipo: 'agregar', producto_id: 'P1', unidades: 1 },
      { tipo: 'agregar_varios', cliente_id: 'F1', lineas: [{ producto_id: 'P1', unidades: 9 }, { producto_id: 'P3', unidades: 2 }] },
      { tipo: 'agregar_varios', cliente_id: 'F9', id: 'c9', lineas: [{ producto_id: 'P1', unidades: 1 }] }
    );
    expect(s.carritos.find((c) => c.id === 'c1')?.lineas).toEqual([{ producto_id: 'P1', unidades: 10 }, { producto_id: 'P3', unidades: 2 }]);
    expect(s.activo).toBe('c9');
  });

  it('cambiar unidades a 0 quita la línea; quitar y enviados reubican el activo', () => {
    let s = aplicar(
      { tipo: 'abrir', cliente_id: 'F1', id: 'c1' },
      { tipo: 'agregar', producto_id: 'P1', unidades: 2 },
      { tipo: 'unidades', carrito_id: 'c1', producto_id: 'P1', unidades: 0 },
      { tipo: 'abrir', cliente_id: 'F2', id: 'c2' },
      { tipo: 'abrir', cliente_id: 'F3', id: 'c3' }
    );
    expect(s.carritos[0].lineas).toEqual([]);
    s = reductorCarritos(s, { tipo: 'quitar', carrito_id: 'c3' });
    expect(s.activo).toBe('c2');
    s = reductorCarritos(s, { tipo: 'enviados', ids: ['c1', 'c2'] });
    expect(s).toEqual({ activo: null, carritos: [] });
  });

  it('dice qué falta para enviar', () => {
    const s = aplicar({ tipo: 'abrir', cliente_id: 'F1', id: 'c1' });
    expect(faltaParaEnviar(s.carritos[0])).toEqual(['Agrega al menos un producto', 'Elige la droguería']);
    const listo = aplicar({ tipo: 'abrir', cliente_id: 'F1', id: 'c1', drogueria_id: 'D' }, { tipo: 'agregar', producto_id: 'P', unidades: 1 });
    expect(faltaParaEnviar(listo.carritos[0])).toEqual([]);
  });
});
