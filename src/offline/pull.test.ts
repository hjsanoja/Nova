import { describe, expect, it } from 'vitest';
import { TABLAS_PULL, traerTabla } from './pull';
import type { FilaRemota, OpcionesTraer } from './remoto';
import { crearDbTemporal, crearRemotoFalso } from './testing/utiles';

/** Servidor falso que filtra y ordena como PostgREST (updated_at, id). */
function remotoCon(filas: FilaRemota[]) {
  const ordenadas = [...filas].sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)) || String(a.id).localeCompare(String(b.id)));
  return {
    ...crearRemotoFalso(),
    async traer(_t: string, desde: string | null, limite: number, o: OpcionesTraer = {}) {
      const d = o.despuesDe;
      return ordenadas
        .filter((f) => {
          const u = String(f.updated_at);
          if (d) return u > d.updated_at || (u === d.updated_at && String(f.id) > d.id);
          return !desde || new Date(u).getTime() > new Date(desde).getTime();
        })
        .slice(0, limite);
    },
  };
}

const farmacia = (i: number, updated_at: string): FilaRemota => ({
  id: `c-${String(i).padStart(5, '0')}`, codigo_interno: `F${i}`, rif: `J-${i}`, nombre_comercial: `Farmacia ${i}`, estado_validacion: 'activo', updated_at,
});

describe('descarga por páginas', () => {
  const clientes = TABLAS_PULL.find((t) => t.remota === 'dim_clientes')!;

  it('baja todo aunque miles de filas tengan la misma hora (carga masiva)', async () => {
    const db = crearDbTemporal();
    const filas = Array.from({ length: 1800 }, (_, i) => farmacia(i, '2026-09-30T03:17:03.000000+00:00'));
    expect(await traerTabla(db, remotoCon(filas), clientes)).toBe(1800);
    expect(await db.clientes.count()).toBe(1800);
  });

  it('un dispositivo que quedó a medias completa lo que le faltaba', async () => {
    const db = crearDbTemporal();
    const filas = Array.from({ length: 1200 }, (_, i) => farmacia(i, '2026-09-30T03:17:03.000000+00:00'));
    // Antes solo bajaba la primera página y guardaba el cursor ahí.
    await db.guardarMeta('cursor:dim_clientes', '2026-09-30T03:17:03.000000+00:00');
    await traerTabla(db, remotoCon(filas), clientes);
    expect(await db.clientes.count()).toBe(1200);
  });
});
