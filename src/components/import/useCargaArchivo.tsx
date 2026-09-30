import { useRef, useState } from 'react';
import { DialogoCarga } from './DialogoCarga';
import type { EstadoCarga } from './DialogoCarga';
import type { Descarte } from '../../services/cargaArchivos';

export type Avance = (hechas: number, total: number, etapa?: string) => void;
export interface ResultadoCarga { ok: boolean; lineas: string[]; detalle?: string[] }

const errorTexto = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Carga de un archivo en tres pasos con la ventana DialogoCarga: confirmar (lo leído y lo descartado), progreso y
 * resultado. `pedir` muestra la confirmación; la tarea solo corre si el usuario acepta.
 */
export function useCargaArchivo() {
  const [dialogo, setDialogo] = useState<EstadoCarga | null>(null);
  const pendiente = useRef<(() => Promise<void>) | null>(null);

  const pedir = <T,>(
    datos: { titulo: string; archivo: string; unidad: string; leidas: number; prep: { registros: T[]; descartes: Descarte[]; repetidas: number }; avisos?: string[] },
    tarea: (avance: Avance) => Promise<ResultadoCarga>,
    alTerminar?: (r: ResultadoCarga) => void
  ) => {
    pendiente.current = async () => {
      const avance: Avance = (hechas, total, etapa = 'Subiendo a Supabase') => setDialogo({ fase: 'cargando', titulo: datos.titulo, hechas, total, etapa });
      avance(0, datos.prep.registros.length, 'Preparando');
      let r: ResultadoCarga;
      try {
        r = await tarea(avance);
      } catch (err: unknown) {
        r = { ok: false, lineas: ['Hubo un error y la carga no terminó.'], detalle: [errorTexto(err)] };
      }
      setDialogo({ fase: 'resultado', titulo: datos.titulo, ...r });
      alTerminar?.(r);
    };
    setDialogo({
      fase: 'confirmar', titulo: datos.titulo, archivo: datos.archivo, unidad: datos.unidad, leidas: datos.leidas,
      aCargar: datos.prep.registros.length, descartes: datos.prep.descartes, repetidas: datos.prep.repetidas, avisos: datos.avisos,
    });
  };

  const nodo = (
    <DialogoCarga
      estado={dialogo}
      onConfirmar={() => { const a = pendiente.current; pendiente.current = null; if (a) void a(); }}
      onCerrar={() => { if (dialogo?.fase === 'cargando') return; pendiente.current = null; setDialogo(null); }}
    />
  );
  return { pedir, nodo };
}

/**
 * Sube registros de un catálogo por lotes y arma las líneas del resultado: guardados, descartados y, si falla a mitad,
 * cuánto alcanzó a subir (volver a cargar el archivo no duplica).
 */
export async function subirCatalogo(
  unidad: string,
  total: number,
  descartadas: number,
  subir: (avance: (h: number, t: number) => void) => Promise<number>,
  avance: Avance
): Promise<ResultadoCarga> {
  let enviadas = 0;
  try {
    const guardadas = await subir((h, t) => { enviadas = h; avance(h, t, 'Subiendo a Supabase'); });
    return {
      ok: true,
      lineas: [
        `Guardados en Supabase: ${guardadas.toLocaleString()} ${unidad} (nuevos o actualizados).`,
        ...(descartadas ? [`Descartados por datos incompletos: ${descartadas.toLocaleString()}.`] : []),
      ],
    };
  } catch (err: unknown) {
    return {
      ok: false,
      lineas: [`Se alcanzaron a subir ${enviadas.toLocaleString()} de ${total.toLocaleString()} ${unidad} antes del error.`, 'Puedes volver a cargar el mismo archivo: lo ya guardado no se duplica.'],
      detalle: [errorTexto(err)],
    };
  }
}

/** Abre el selector de archivos y devuelve el nombre y el texto del CSV elegido. */
export function elegirArchivo(): Promise<{ nombre: string; texto: string } | null> {
  return new Promise((resolver) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.csv,.txt' });
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolver(null);
      const lector = new FileReader();
      lector.onload = () => resolver({ nombre: f.name, texto: String(lector.result ?? '') });
      lector.onerror = () => resolver(null);
      lector.readAsText(f);
    };
    input.click();
  });
}

/** Descarga un texto como archivo CSV (con BOM para que Excel respete las tildes). */
export function descargarCsv(nombre: string, contenido: string): void {
  const url = URL.createObjectURL(new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
