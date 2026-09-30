import { useState } from 'react';
import { ArrowUpCircle, Sparkles, X } from 'lucide-react';
import { Sheet } from '../capture/Sheet';
import { Boton, Etiqueta } from '../ui/kit';
import { CREDITOS, NOVEDADES, VERSION, compararVersiones } from '../../version';
import { actualizarApp, useVersionPublicada } from '../../pwa/versionPublicada';

const fechaLarga = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * "NOVA v7.0 · Hernando Sanoja · Dubralis Fajardo": la versión que corre en este equipo y quienes hacen NOVA.
 * Tocarla abre las novedades. `variante`: 'completa' (dos líneas, con roles), 'linea' (una línea) o 'minima' (solo "v7.0").
 */
export function FirmaVersion({ variante = 'completa', className = '' }: { variante?: 'completa' | 'linea' | 'minima'; className?: string }) {
  const [abierta, setAbierta] = useState(false);
  const { hayNueva } = useVersionPublicada();
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label={`NOVA versión ${VERSION}${hayNueva ? ', hay una versión nueva' : ''}. Hecho por ${CREDITOS.map((c) => c.nombre).join(' y ')}. Ver novedades`}
        className={`rounded-lg text-left text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${className}`}
      >
        {variante === 'minima' ? (
          <span className="relative inline-flex items-center font-semibold tabular-nums">
            v{VERSION}
            {hayNueva && <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full bg-amber-500" aria-hidden />}
          </span>
        ) : variante === 'linea' ? (
          <span>
            <span className="font-semibold text-slate-600 dark:text-slate-300">NOVA v{VERSION}</span> · {CREDITOS.map((c) => c.nombre).join(' · ')}
          </span>
        ) : (
          <span className="block leading-snug">
            <span className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
              NOVA v{VERSION}
              {hayNueva && <Etiqueta tono="aviso">Nueva versión</Etiqueta>}
            </span>
            {CREDITOS.map((c) => (
              <span key={c.nombre} className="block truncate">
                {c.nombre}
                {c.rol ? <span className="text-slate-400 dark:text-slate-500"> · {c.rol}</span> : null}
              </span>
            ))}
          </span>
        )}
      </button>
      <NovedadesHoja abierta={abierta} onCerrar={() => setAbierta(false)} />
    </>
  );
}

/** Historial de versiones: cuál corre en este equipo, cuál está publicada y qué trajo cada una. */
export function NovedadesHoja({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const { publicada, hayNueva } = useVersionPublicada();
  return (
    <Sheet abierto={abierta} titulo="Versiones de NOVA" onCerrar={onCerrar} ancho="md:max-w-xl">
      <EstadoVersiones publicada={publicada} hayNueva={hayNueva} />
      <ListaNovedades publicada={publicada} className="mt-4" />
    </Sheet>
  );
}

export function ListaNovedades({ publicada, className = '' }: { publicada: string | null; className?: string }) {
  return (
    <ol className={`flex flex-col gap-4 ${className}`}>
      {NOVEDADES.map((n) => {
        const enUso = n.version === VERSION;
        const esPublicada = !!publicada && n.version === publicada;
        return (
          <li key={n.version} className={`rounded-xl border p-3 ${enUso ? 'border-marca-300 bg-marca-50/60 dark:border-marca-800 dark:bg-marca-950/40' : 'border-slate-200 dark:border-slate-800'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold text-slate-900 dark:text-white">v{n.version}</span>
              {enUso && <Etiqueta tono="marca">En uso en este equipo</Etiqueta>}
              {esPublicada && !enUso && <Etiqueta tono="aviso">Publicada</Etiqueta>}
              <span className="text-xs text-slate-500">{n.tipo === 'mayor' ? 'Versión grande' : 'Ajustes'} · {fechaLarga(n.fecha)}{n.pr ? ` · PR #${n.pr}` : ''}</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{n.titulo}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
              {n.cambios.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

/** Versión en uso, versión publicada y quienes hacen NOVA (Configuración → Acerca de y la hoja de novedades). */
export function EstadoVersiones({ publicada, hayNueva }: { publicada: string | null; hayNueva: boolean }) {
  const [actualizando, setActualizando] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
          <dt className="text-xs text-slate-500">En este equipo</dt>
          <dd className="text-xl font-bold text-slate-900 dark:text-white">v{VERSION}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
          <dt className="text-xs text-slate-500">Publicada</dt>
          <dd className="text-xl font-bold text-slate-900 dark:text-white">{publicada ? `v${publicada}` : '—'}</dd>
        </div>
      </dl>
      {hayNueva ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Hay una versión más nueva. Actualiza para usarla.</span>
          <Boton variante="primario" tamano="sm" icono={ArrowUpCircle} disabled={actualizando} onClick={() => { setActualizando(true); void actualizarApp(); }}>{actualizando ? 'Actualizando…' : `Actualizar a v${publicada}`}</Boton>
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {!publicada
            ? 'Sin conexión para comparar con la versión publicada.'
            : compararVersiones(VERSION, publicada) === 0
              ? 'Estás usando la versión más reciente.'
              : `Este equipo ya tiene la v${VERSION}; la publicación todavía muestra la v${publicada} y se pondrá al día en unos minutos.`}
        </p>
      )}
      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <p className="text-xs font-medium text-slate-500">Hecho por</p>
        <ul className="mt-1 space-y-0.5">
          {CREDITOS.map((c) => (
            <li key={c.nombre} className="text-sm">
              <span className="font-semibold text-slate-900 dark:text-white">{c.nombre}</span>
              {c.rol && <span className="text-slate-500"> · {c.rol}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const CLAVE_VISTA = 'NOVA_VERSION_VISTA';

export function marcarVersionVista(): void {
  try {
    localStorage.setItem(CLAVE_VISTA, VERSION);
  } catch {
    /* sin almacenamiento */
  }
}

function versionVista(): string | null {
  try {
    return localStorage.getItem(CLAVE_VISTA);
  } catch {
    return VERSION;
  }
}

/**
 * Aviso arriba de cada pantalla: hay una versión publicada más nueva (con botón para actualizar) o la app acaba de
 * actualizarse (con enlace a las novedades). `guiaAbierta`: con la guía de bienvenida en pantalla no se muestra.
 */
export function AvisoVersion({ guiaAbierta }: { guiaAbierta: boolean }) {
  const { publicada, hayNueva } = useVersionPublicada();
  const [vista, setVista] = useState(versionVista);
  const [novedades, setNovedades] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  if (guiaAbierta) return null;

  const cerrarNovedad = () => {
    marcarVersionVista();
    setVista(VERSION);
  };

  if (hayNueva) {
    return (
      <div role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <ArrowUpCircle className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">Hay una versión nueva de NOVA: <b>v{publicada}</b> (usas la v{VERSION}).</span>
        <Boton tamano="sm" variante="primario" disabled={actualizando} onClick={() => { setActualizando(true); void actualizarApp(); }}>{actualizando ? 'Actualizando…' : 'Actualizar'}</Boton>
      </div>
    );
  }
  // Se relee lo guardado: cerrar la guía de bienvenida también da por vista la versión.
  if (vista === VERSION || versionVista() === VERSION) return null;
  return (
    <>
      <div role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-marca-200 bg-marca-50 px-3 py-2 text-sm text-marca-900 dark:border-marca-900 dark:bg-marca-950/50 dark:text-marca-100">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">NOVA se actualizó a la <b>v{VERSION}</b>.</span>
        <Boton tamano="sm" variante="fantasma" onClick={() => setNovedades(true)}>Ver novedades</Boton>
        <button type="button" onClick={cerrarNovedad} aria-label="Cerrar aviso de versión" className="-my-1 inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-marca-100 dark:hover:bg-marca-900"><X className="h-4 w-4" /></button>
      </div>
      <NovedadesHoja abierta={novedades} onCerrar={() => { setNovedades(false); cerrarNovedad(); }} />
    </>
  );
}
