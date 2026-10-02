import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { BarrasRanking, Medidor } from '../components/graficos/Graficos';
import { Boton, Segmentado, Subtitulo, Tarjeta, Vacio } from '../components/ui/kit';
import { aCsv, descargarTexto, nombreDeProducto } from '../vistas/logica';
import { useClientes, useProductos, useUsuariosNube } from '../vistas/useDatos';
import { textoResultado, useMedicos, useVisitas } from './datos';
import { coberturaMedicos, muestrasPorProducto, resumenCobertura, visitasPorRepresentante } from './medicos';
import type { FiltroVisitas } from './medicos';
import { useCiclos, usePeriodoDeEquipo } from '../ciclos/datos';
import { enRango } from '../ciclos/logica';
import { useAjusteCobertura } from '../actividades/datos';

const ajustada = (r: { esperadas: number; esperadasBase: number }) => (r.esperadas < r.esperadasBase ? ` (de ${r.esperadasBase}, ajustada por días libres aprobados)` : '');

type Rango = '7' | '30' | 'mes' | 'ciclo';

/**
 * Reporte de visitas: por representante, cobertura de médicos y muestras entregadas (últimos 90 días en el equipo). En
 * "Ciclo" cada representante se mide con el ciclo vigente de su equipo (o el general; sin ciclos, el mes).
 */
export function ReporteVisitas() {
  const visitas = useVisitas();
  const medicos = useMedicos();
  const productos = useProductos();
  const clientes = useClientes();
  const { usuarios } = useUsuariosNube();
  const ciclos = useCiclos();
  const [eleccion, setRango] = useState<Rango | null>(null);
  const rango: Rango = eleccion ?? (ciclos.length ? 'ciclo' : 'mes');
  const periodoDeEquipo = usePeriodoDeEquipo();
  const periodoDe = useMemo(() => {
    const equipo = new Map(usuarios.map((u) => [u.id, u.equipo_id ?? null]));
    return (vendedorId?: string | null) => periodoDeEquipo(vendedorId ? equipo.get(vendedorId) : null);
  }, [usuarios, periodoDeEquipo]);
  const desde = useMemo<FiltroVisitas>(() => {
    const h = new Date();
    if (rango === 'ciclo') return (v) => enRango(v.checkin_en, periodoDe(v.vendedor_id));
    return rango === 'mes' ? new Date(h.getFullYear(), h.getMonth(), 1) : new Date(h.getFullYear(), h.getMonth(), h.getDate() - Number(rango) + 1);
  }, [rango, periodoDe]);
  const nombre = (id: string) => usuarios.find((u) => u.id === id)?.nombre_completo ?? 'Representante';
  const filas = useMemo(() => visitasPorRepresentante(visitas, desde), [visitas, desde]);
  const muestras = useMemo(() => {
    const p = new Map(productos.map((x) => [x.id, x]));
    return muestrasPorProducto(visitas, desde).slice(0, 8).map((m) => ({ clave: m.producto_id, nombre: nombreDeProducto(p.get(m.producto_id)), valor: m.cantidad }));
  }, [visitas, desde, productos]);
  const estadoDe = useMemo(() => {
    const e = new Map(usuarios.map((u) => [u.id, u.estado_geografico]));
    return (id: string) => e.get(id);
  }, [usuarios]);
  const ajusteCobertura = useAjusteCobertura(estadoDe);
  const factorDe = (id?: string | null) => ajusteCobertura(id, periodoDe(id)).factor;
  const coberturaRep = useMemo(() => {
    const porRep = new Map<string, typeof medicos>();
    for (const m of medicos) if (m.vendedor_id) porRep.set(m.vendedor_id, [...(porRep.get(m.vendedor_id) ?? []), m]);
    return [...porRep.entries()].map(([id, ms]) => ({ id, ...resumenCobertura(coberturaMedicos(ms, visitas, periodoDe(id), () => factorDe(id))), libres: ajusteCobertura(id, periodoDe(id)).libres })).sort((a, b) => a.cubiertos / a.total - b.cubiertos / b.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicos, visitas, periodoDe, ajusteCobertura]);
  // Cobertura: cada médico con el ciclo vigente del equipo de su representante (o el mes, si no hay ciclos).
  const total = resumenCobertura(coberturaMedicos(medicos, visitas, (m) => periodoDe(m.vendedor_id), (m) => factorDe(m.vendedor_id)));
  const conCiclos = medicos.some((m) => periodoDe(m.vendedor_id).tipo === 'ciclo');

  const descargar = () => {
    const c = new Map(clientes.map((x) => [x.id, x.nombre_comercial]));
    const m = new Map(medicos.map((x) => [x.id, x.nombre]));
    const p = new Map(productos.map((x) => [x.id, x]));
    const entra = (v: (typeof visitas)[number]) => (desde instanceof Date ? new Date(v.checkin_en) >= desde : desde(v));
    const delPeriodo = visitas.filter(entra).sort((a, b) => a.checkin_en.localeCompare(b.checkin_en));
    descargarTexto(`visitas_${rango === 'ciclo' ? 'ciclo' : (desde as Date).toISOString().slice(0, 10)}.csv`, aCsv(
      ['Fecha', 'Representante', 'Tipo', 'Visitado', 'Resultado', 'En el lugar', 'Objetivo', 'Productos', 'Muestras', 'Nota', 'Próxima acción'],
      delPeriodo.map((v) => [
        new Date(v.checkin_en).toLocaleString('es'), nombre(v.vendedor_id), v.medico_id ? 'Médico' : 'Farmacia',
        v.medico_id ? m.get(v.medico_id) ?? '' : c.get(v.cliente_id ?? '') ?? '', textoResultado(v.resultado), v.dentro_de_radio ? 'Sí' : 'No',
        v.objetivo ?? '', (v.productos ?? []).map((id) => nombreDeProducto(p.get(id))).join(', '),
        (v.muestras ?? []).map((x) => `${nombreDeProducto(p.get(x.producto_id))} x${x.cantidad}`).join(', '), v.notas ?? '',
        v.proxima_accion ? `${v.proxima_accion}${v.proxima_fecha ? ` (${v.proxima_fecha})` : ''}` : '',
      ])
    ));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmentado valor={rango} onChange={setRango} opciones={[...(ciclos.length ? [{ id: 'ciclo' as const, texto: 'Ciclo' }] : []), { id: '7', texto: '7 días' }, { id: '30', texto: '30 días' }, { id: 'mes', texto: 'Este mes' }]} />
        <Boton icono={Download} onClick={descargar} disabled={filas.length === 0}>Descargar visitas</Boton>
      </div>

      <Tarjeta className="!p-0">
        <div className="px-4 pt-4 sm:px-5"><Subtitulo>Visitas por representante</Subtitulo></div>
        {filas.length === 0 ? (
          <Vacio titulo="Sin visitas en este período" />
        ) : (
          <div className="overflow-x-auto px-3 pb-3">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="rounded-l-xl bg-slate-50 px-3 py-2.5 font-semibold dark:bg-slate-800/60">Representante</th>
                  <th className="bg-slate-50 px-3 py-2.5 text-right font-semibold dark:bg-slate-800/60">Farmacias</th>
                  <th className="bg-slate-50 px-3 py-2.5 text-right font-semibold dark:bg-slate-800/60">Médicos</th>
                  <th className="bg-slate-50 px-3 py-2.5 text-right font-semibold dark:bg-slate-800/60">En el lugar</th>
                  <th className="bg-slate-50 px-3 py-2.5 text-right font-semibold dark:bg-slate-800/60">Con pedido</th>
                  <th className="rounded-r-xl bg-slate-50 px-3 py-2.5 text-right font-semibold dark:bg-slate-800/60">Muestras</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filas.map((f) => (
                  <tr key={f.vendedor_id}>
                    <td className="px-3 py-2.5 font-medium">{nombre(f.vendedor_id)}</td>
                    <td className="px-3 text-right">{f.farmacias}</td>
                    <td className="px-3 text-right">{f.medicos}</td>
                    <td className="px-3 text-right">{Math.round((f.enElLugar / Math.max(1, f.farmacias + f.medicos)) * 100)}%</td>
                    <td className="px-3 text-right">{f.pedidos}</td>
                    <td className="px-3 text-right">{f.muestras}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <div className="grid gap-4 md:grid-cols-2">
        <Tarjeta>
          <Subtitulo>Cobertura de médicos · {conCiclos ? 'ciclo vigente' : 'este mes'}</Subtitulo>
          {total.total === 0 ? (
            <Vacio titulo="Sin médicos cargados" texto="Cárgalos en el módulo Médicos." />
          ) : (
            <div className="flex flex-col gap-4">
              <Medidor valor={total.cubiertos} total={total.total} rotulo="Médicos con todas sus visitas" nota={`${total.visitas} de ${total.esperadas} visitas esperadas ${conCiclos ? 'en el ciclo de cada equipo' : 'en el mes'}${ajustada(total)}`} />
              {coberturaRep.map((r) => (
                <Medidor key={r.id} valor={r.cubiertos} total={r.total} rotulo={nombre(r.id)} nota={`${r.visitas} de ${r.esperadas} visitas${r.libres > 0 ? ` · ${r.libres.toLocaleString('es-VE')} días libres aprobados` : ''}${ajustada(r)}`} />
              ))}
            </div>
          )}
        </Tarjeta>
        <Tarjeta>
          <Subtitulo>Muestras entregadas</Subtitulo>
          <BarrasRanking filas={muestras} unidad="muestras" vacio="Sin muestras registradas en este período." />
        </Tarjeta>
      </div>
      <p className="text-xs text-slate-500">Con las visitas guardadas en este equipo (últimos 90 días).</p>
    </div>
  );
}
