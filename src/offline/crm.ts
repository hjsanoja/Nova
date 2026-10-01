// CRM sin conexión: visitas con reporte (a farmacias o médicos) y tareas. Igual que los pedidos, cada cambio se guarda en
// el dispositivo junto con su mutación en la cola (outbox) y el servidor la aplica de forma idempotente.
import type { NovaDB } from './db';
import { encolar } from './outbox';
import { distanciaMetros } from './pedidos';
import type { LocalTarea, LocalVisita, MuestraVisita, ResultadoVisita } from './types';

export interface ReporteVisita {
  /** Farmacia o médico visitado (uno de los dos). */
  cliente_id?: string | null;
  medico_id?: string | null;
  lat?: number | null;
  lon?: number | null;
  precision_gps_m?: number | null;
  resultado?: ResultadoVisita | null;
  pedido_id?: string | null;
  notas?: string | null;
  objetivo?: string | null;
  productos?: string[];
  muestras?: MuestraVisita[];
  /** Próxima acción: con fecha, crea una tarea de seguimiento. */
  proxima_accion?: string | null;
  proxima_fecha?: string | null;
}

const hoyTexto = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const texto = (t?: string | null) => (t ?? '').trim() || null;

/**
 * Registra la visita (check-in con GPS y su reporte). Si trae próxima acción con fecha, también crea la tarea de
 * seguimiento, que se envía después de la visita (depende de ella).
 */
export async function registrarVisita(db: NovaDB, datos: ReporteVisita, vendedorId: string, ahora = new Date()): Promise<{ visita: LocalVisita; tarea: LocalTarea | null }> {
  if (!datos.cliente_id === !datos.medico_id) throw new Error('La visita debe ser a una farmacia o a un médico.');
  const punto = datos.cliente_id ? await db.clientes.get(datos.cliente_id) : await db.medicos.get(datos.medico_id as string);
  const muestras = (datos.muestras ?? []).filter((m) => m.producto_id && m.cantidad > 0).map((m) => ({ producto_id: m.producto_id, cantidad: Math.floor(m.cantidad) }));
  const visita: LocalVisita = {
    id: crypto.randomUUID(),
    cliente_id: datos.cliente_id ?? null,
    medico_id: datos.medico_id ?? null,
    vendedor_id: vendedorId,
    checkin_en: ahora.toISOString(),
    lat: datos.lat ?? null,
    lon: datos.lon ?? null,
    precision_gps_m: datos.precision_gps_m ?? null,
    resultado: datos.resultado ?? null,
    pedido_id: datos.pedido_id ?? null,
    notas: texto(datos.notas),
    objetivo: texto(datos.objetivo),
    productos: Array.from(new Set(datos.productos ?? [])),
    muestras,
    proxima_accion: texto(datos.proxima_accion),
    proxima_fecha: datos.proxima_fecha || null,
    // Estimación local para avisar al instante; el valor oficial llega cuando el servidor confirma.
    distancia_metros:
      punto?.lat != null && punto?.lon != null && datos.lat != null && datos.lon != null ? Math.round(distanciaMetros(punto.lat, punto.lon, datos.lat, datos.lon)) : null,
    dentro_de_radio: null,
    sync_estado: 'pendiente',
  };
  visita.dentro_de_radio = visita.distancia_metros == null ? null : visita.distancia_metros <= 100;

  const tarea: LocalTarea | null =
    visita.proxima_accion && visita.proxima_fecha
      ? {
          id: crypto.randomUUID(),
          vendedor_id: vendedorId,
          cliente_id: visita.cliente_id,
          medico_id: visita.medico_id,
          visita_id: visita.id,
          titulo: visita.proxima_accion,
          notas: null,
          vence_en: visita.proxima_fecha,
          estado: 'pendiente',
          origen: 'visita',
          updated_at: ahora.toISOString(),
          sync_estado: 'pendiente',
        }
      : null;

  await db.transaction('rw', [db.visitas, db.tareas, db.outbox], async () => {
    await db.visitas.add(visita);
    await encolar(db, {
      tipo: 'visita.registrar',
      entidad_id: visita.id,
      payload: {
        id: visita.id,
        cliente_id: visita.cliente_id,
        medico_id: visita.medico_id,
        checkin_en: visita.checkin_en,
        precision_gps_m: visita.precision_gps_m,
        resultado: visita.resultado,
        pedido_id: visita.pedido_id,
        notas: visita.notas,
        objetivo: visita.objetivo,
        productos: visita.productos,
        muestras: visita.muestras,
        proxima_accion: visita.proxima_accion,
        proxima_fecha: visita.proxima_fecha,
        ...(datos.lat != null && datos.lon != null ? { lat: datos.lat, lon: datos.lon } : {}),
      },
    });
    if (tarea) {
      await db.tareas.add(tarea);
      await encolar(db, { tipo: 'tarea.guardar', entidad_id: tarea.id, depende_de: visita.id, payload: payloadTarea(tarea) });
    }
  });
  return { visita, tarea };
}

const payloadTarea = (t: LocalTarea, eliminar = false) => ({
  id: t.id,
  vendedor_id: t.vendedor_id,
  cliente_id: t.cliente_id ?? null,
  medico_id: t.medico_id ?? null,
  visita_id: t.visita_id ?? null,
  titulo: t.titulo,
  notas: t.notas ?? null,
  vence_en: t.vence_en,
  estado: t.estado,
  origen: t.origen,
  ...(eliminar ? { eliminar: true } : {}),
});

export interface EntradaTarea {
  id?: string;
  vendedor_id: string;
  titulo: string;
  vence_en: string;
  notas?: string | null;
  cliente_id?: string | null;
  medico_id?: string | null;
  estado?: LocalTarea['estado'];
  origen?: LocalTarea['origen'];
  visita_id?: string | null;
}

/** Crea o actualiza una tarea en el dispositivo y la encola. */
export async function guardarTarea(db: NovaDB, e: EntradaTarea, ahora = new Date()): Promise<LocalTarea> {
  const titulo = e.titulo.trim();
  if (!titulo) throw new Error('Escribe qué hay que hacer.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.vence_en)) throw new Error('Elige la fecha.');
  if (e.cliente_id && e.medico_id) throw new Error('La tarea es con una farmacia o con un médico, no con ambos.');
  const previa = e.id ? await db.tareas.get(e.id) : undefined;
  const fila: LocalTarea = {
    id: e.id ?? crypto.randomUUID(),
    vendedor_id: e.vendedor_id,
    cliente_id: e.cliente_id ?? null,
    medico_id: e.medico_id ?? null,
    visita_id: e.visita_id ?? previa?.visita_id ?? null,
    titulo,
    notas: texto(e.notas),
    vence_en: e.vence_en,
    estado: e.estado ?? previa?.estado ?? 'pendiente',
    hecha_en: (e.estado ?? previa?.estado) === 'hecha' ? previa?.hecha_en ?? ahora.toISOString() : null,
    origen: e.origen ?? previa?.origen ?? 'manual',
    updated_at: ahora.toISOString(),
    sync_estado: 'pendiente',
  };
  await db.transaction('rw', [db.tareas, db.outbox], async () => {
    await db.tareas.put(fila);
    await encolar(db, { tipo: 'tarea.guardar', entidad_id: fila.id, payload: payloadTarea(fila) });
  });
  return fila;
}

/** Marca hecha (o la reabre) con un toque. */
export async function cambiarEstadoTarea(db: NovaDB, t: LocalTarea, estado: LocalTarea['estado'], ahora = new Date()): Promise<LocalTarea> {
  return guardarTarea(db, { ...t, estado }, ahora);
}

export async function eliminarTarea(db: NovaDB, t: LocalTarea): Promise<void> {
  await db.transaction('rw', [db.tareas, db.outbox], async () => {
    await db.tareas.delete(t.id);
    await encolar(db, { tipo: 'tarea.guardar', entidad_id: t.id, payload: payloadTarea(t, true) });
  });
}

export type GrupoTarea = 'vencidas' | 'hoy' | 'proximas' | 'hechas';

/** Agrupa las tareas como se ven en "Mis tareas": vencidas, hoy, próximas (y hechas). */
export function agruparTareas(tareas: LocalTarea[], hoy = new Date()): Record<GrupoTarea, LocalTarea[]> {
  const h = hoyTexto(hoy);
  const g: Record<GrupoTarea, LocalTarea[]> = { vencidas: [], hoy: [], proximas: [], hechas: [] };
  for (const t of tareas) {
    if (t.estado === 'cancelada') continue;
    if (t.estado === 'hecha') g.hechas.push(t);
    else if (t.vence_en < h) g.vencidas.push(t);
    else if (t.vence_en === h) g.hoy.push(t);
    else g.proximas.push(t);
  }
  g.vencidas.sort((a, b) => a.vence_en.localeCompare(b.vence_en));
  g.hoy.sort((a, b) => a.titulo.localeCompare(b.titulo));
  g.proximas.sort((a, b) => a.vence_en.localeCompare(b.vence_en));
  g.hechas.sort((a, b) => (b.hecha_en ?? b.updated_at ?? '').localeCompare(a.hecha_en ?? a.updated_at ?? ''));
  return g;
}

export { hoyTexto };
