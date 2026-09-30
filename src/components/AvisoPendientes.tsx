import { useEffect, useMemo, useState } from 'react';
import { CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import { Sheet } from './capture/Sheet';
import { Boton, Etiqueta } from './ui/kit';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import { useEstadoSync } from '../offline/syncStore';
import { reintentarItem } from '../offline/outbox';
import { sincronizarYa } from '../offline/motor';
import { antiguedad, describirPendientes, hayQueAvisar } from '../offline/pendientes';
import type { Pendiente } from '../offline/pendientes';
import type { LocalCliente, LocalPedido, OutboxItem } from '../offline/types';

/** Lista de lo guardado solo en este dispositivo, con el motivo si el servidor lo rechazó. */
export function usePendientes(): Pendiente[] {
  const db = obtenerDb();
  const items = useLive(() => db.outbox.toArray(), [], [] as OutboxItem[]);
  const ids = useMemo(() => [...new Set(items.flatMap((o) => [o.entidad_id, String((o.payload as { p_pedido?: string }).p_pedido ?? '')]))], [items]);
  const pedidos = useLive(() => (ids.length ? db.pedidos.bulkGet(ids) : Promise.resolve([])), [ids.join(',')], [] as (LocalPedido | undefined)[]);
  const clientesIds = useMemo(() => [...new Set(items.map((o) => String((o.payload as { cliente_id?: string }).cliente_id ?? '')).concat(pedidos.map((p) => p?.cliente_id ?? '')).filter(Boolean))], [items, pedidos]);
  const clientes = useLive(() => (clientesIds.length ? db.clientes.bulkGet(clientesIds) : Promise.resolve([])), [clientesIds.join(',')], [] as (LocalCliente | undefined)[]);
  return useMemo(() => {
    const ped = new Map(pedidos.filter((p): p is LocalPedido => !!p).map((p) => [p.id, p]));
    const cli = new Map(clientes.filter((c): c is LocalCliente => !!c).map((c) => [c.id, c.nombre_comercial]));
    return describirPendientes(items, (id) => cli.get(id), (id) => ped.get(id));
  }, [items, pedidos, clientes]);
}

export function ListaPendientes({ lista }: { lista: Pendiente[] }) {
  if (lista.length === 0) return <p className="text-sm text-slate-500">Todo está guardado en la nube.</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {lista.map((p) => (
        <li key={p.seq} className="flex flex-wrap items-start justify-between gap-2 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{p.que}</p>
            <p className="truncate text-xs text-slate-500">{[p.detalle, `guardado ${antiguedad(p.desde)}`, p.intentos ? `${p.intentos} intento${p.intentos === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</p>
            {p.error && <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">{p.error}</p>}
          </div>
          {p.estado === 'pendiente' ? (
            <Etiqueta tono="aviso">Por enviar</Etiqueta>
          ) : (
            <Boton tamano="sm" icono={RefreshCw} onClick={() => void reintentarItem(obtenerDb(), p.seq).then(() => sincronizarYa())}>Reintentar</Boton>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Aviso visible mientras haya cambios que solo están en este dispositivo (pedidos, códigos, plantillas…).
 * Además, el navegador pide confirmación si se intenta cerrar la página con cambios sin subir.
 */
export function AvisoPendientes() {
  const lista = usePendientes();
  const s = useEstadoSync();
  const [abierto, setAbierto] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (lista.length === 0) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [lista.length]);

  if (lista.length === 0) return null;
  const errores = lista.filter((p) => p.estado !== 'pendiente').length;
  const fuerte = errores > 0 || !s.online || hayQueAvisar(lista, ahora);
  const Icono = s.online ? CloudUpload : CloudOff;
  const texto = errores
    ? `${errores} cambio${errores === 1 ? '' : 's'} no se pudo guardar en la nube`
    : `${lista.length} cambio${lista.length === 1 ? '' : 's'} guardado${lista.length === 1 ? '' : 's'} solo en este teléfono`;
  const nota = !s.online
    ? 'Sin conexión: se enviarán solos al volver la señal. No cierres sesión ni borres los datos del navegador.'
    : s.necesitaLogin
      ? 'Tu sesión venció: vuelve a entrar para enviarlos.'
      : errores
        ? 'Toca "Ver" para saber el motivo y reintentar.'
        : s.sincronizando
          ? 'Enviando…'
          : 'Se están enviando a la nube.';

  return (
    <>
      <section
        aria-live="polite"
        className={`animate-in mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
          errores ? 'border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/50' : fuerte ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
        }`}
      >
        <Icono className={`h-5 w-5 shrink-0 ${errores ? 'text-rose-700 dark:text-rose-300' : fuerte ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{texto}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">{nota}</p>
        </div>
        <div className="flex gap-2">
          <Boton tamano="sm" onClick={() => setAbierto(true)}>Ver</Boton>
          {s.online && !s.necesitaLogin && <Boton tamano="sm" variante="primario" icono={RefreshCw} disabled={s.sincronizando} onClick={() => void sincronizarYa()}>Enviar ahora</Boton>}
        </div>
      </section>
      <Sheet abierto={abierto} titulo="Guardado solo en este teléfono" onCerrar={() => setAbierto(false)}>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">Estos cambios aún no están en la nube. Mientras tanto nadie más los ve (tampoco la mesa de transferencias).</p>
        <ListaPendientes lista={lista} />
      </Sheet>
    </>
  );
}
