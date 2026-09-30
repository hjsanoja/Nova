import { useEffect, useRef } from 'react';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import type { LocalComunicado, LocalNotificacion, LocalPedido } from '../offline/types';
import { paraMostrar } from '../comunicados/logica';
import type { RolUsuario } from '../types/pharmacy';
import { mostrarAviso, permisoAvisos } from './avisosTelefono';

const CLAVE = 'avisados';

/**
 * Con la app abierta o en segundo plano: lo nuevo que llega por la sincronización (notificaciones de pedidos, comunicados
 * y, para la mesa, pedidos por procesar) se muestra como aviso del sistema si la app no está a la vista. Usa la misma
 * etiqueta que el aviso del servidor, así el teléfono no lo muestra dos veces.
 */
export function AvisosLocales({ usuarioId, rol }: { usuarioId: string; rol: RolUsuario }) {
  const db = obtenerDb();
  const notificaciones = useLive(() => db.notificaciones.filter((n) => !n.leida).toArray(), [], [] as LocalNotificacion[]);
  const comunicados = useLive(() => db.comunicados.toArray(), [], [] as LocalComunicado[]);
  const esMesa = rol === 'teletransferencista' || rol === 'admin';
  const porProcesar = useLive(
    () => (esMesa ? db.pedidos.where('estado').anyOf('enviado_teletransferencia', 'en_revision').toArray() : Promise.resolve([] as LocalPedido[])),
    [esMesa],
    [] as LocalPedido[]
  );
  const vistos = useRef<Set<string> | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const candidatos = [
        ...notificaciones.map((n) => ({ tag: `notif-${n.id}`, titulo: n.titulo, cuerpo: n.cuerpo ?? '', url: './#/pedidos' })),
        ...paraMostrar(comunicados).map((c) => ({ tag: `comunicado-${c.id}`, titulo: c.titulo, cuerpo: c.mensaje.slice(0, 180), url: './#/inicio' })),
        ...porProcesar.filter((p) => p.vendedor_id !== usuarioId).map((p) => ({ tag: `pedido-${p.id}`, titulo: `${p.estado === 'en_revision' ? 'Pedido en revisión' : 'Pedido nuevo'} ${p.correlativo}`, cuerpo: 'Por procesar', url: './#/por_procesar' })),
      ];
      if (vistos.current === null) {
        // Primera lectura: lo que ya estaba no se avisa (solo lo que llegue desde ahora).
        const guardados = new Set(await db.leerMeta<string[]>(CLAVE, []));
        const primeraVez = guardados.size === 0;
        vistos.current = guardados;
        if (primeraVez) {
          candidatos.forEach((c) => guardados.add(c.tag));
          await db.guardarMeta(CLAVE, [...guardados].slice(-500));
          return;
        }
      }
      const nuevos = candidatos.filter((c) => !vistos.current!.has(c.tag));
      if (!vivo || nuevos.length === 0) return;
      nuevos.forEach((c) => vistos.current!.add(c.tag));
      await db.guardarMeta(CLAVE, [...vistos.current].slice(-500));
      if (permisoAvisos() !== 'granted' || document.visibilityState === 'visible') return;
      for (const c of nuevos.slice(0, 5)) await mostrarAviso(c.titulo, c.cuerpo, c.tag, c.url);
    })();
    return () => {
      vivo = false;
    };
  }, [notificaciones, comunicados, porProcesar, usuarioId, db]);

  return null;
}
