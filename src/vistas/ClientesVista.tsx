import { useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import type { Usuario } from '../types/pharmacy';
import type { LocalCliente } from '../offline/types';
import { Sheet } from '../components/capture/Sheet';
import { Boton, Etiqueta, Filtros, PageHeader, Tarjeta, Vacio, estiloInput, useAviso, useDebounced } from '../components/ui/kit';
import { normalizar } from '../offline/busqueda';
import { actividadDeClientes } from './logica';
import { NIVELES_RIESGO } from './riesgo';
import type { NivelRiesgo } from './riesgo';
import { useRiesgoFarmacias } from './useRiesgo';
import { prepararPedidoPara } from './navegacion';
import { AgregarFarmacias } from './AgregarFarmacias';
import { getSupabaseClient } from '../services/supabaseClient';
import { cambiarMiFichero, refrescarFarmaciasDelDispositivo } from '../services/ficheroVendedor';
import { FichaFarmacia } from '../crm/FichaFarmacia';
import { VisitaForm } from '../crm/VisitaForm';
import { useMedicos, useTareas, useVisitas } from '../crm/datos';
import { ultimaCompraPorCliente, ultimoPedidoPorCliente, useClientes, useCompras, useDroguerias, useMapClientes, usePedidos, useProductos, useUsuariosNube } from './useDatos';

const POR_PAGINA = 60;
const SIN_UNIDADES = new Map<string, number>();
type FiltroRiesgo = 'todas' | Exclude<NivelRiesgo, 'al_dia'>;

/** Fichero de farmacias. Un vendedor ve solo las suyas (lo decide la base de datos); la mesa y la gerencia ven todas. */
export function ClientesVista({ usuario, irATab }: { usuario: Usuario; irATab: (t: string) => void }) {
  const clientes = useClientes();
  const compras = useCompras();
  const pedidos = usePedidos();
  const productos = useProductos();
  const droguerias = useDroguerias();
  const mapClientes = useMapClientes();
  const [texto, setTexto] = useState('');
  const q = useDebounced(texto, 150);
  const [filtro, setFiltro] = useState<FiltroRiesgo>('todas');
  const [zona, setZona] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [abierto, setAbierto] = useState<string | null>(null);

  const esVendedor = usuario.rol === 'vendedor';
  // El vendedor arma su fichero (necesita la nube: en modo demostración no aplica).
  const puedeEditarFichero = esVendedor && !!getSupabaseClient();
  const [agregando, setAgregando] = useState(false);
  const { mostrar, nodo } = useAviso();
  // Visita con reporte (resultado, productos, nota y próxima acción) desde la ficha.
  const [visitando, setVisitando] = useState<LocalCliente | null>(null);
  const visitas = useVisitas();
  const tareas = useTareas();
  const medicos = useMedicos();
  const { usuarios } = useUsuariosNube();
  const nombreUsuario = (id: string) => usuarios.find((u) => u.id === id)?.nombre_completo ?? (id === usuario.id ? usuario.nombre_completo : 'Representante');
  const quitarDeMiFichero = async (c: LocalCliente) => {
    const sb = getSupabaseClient();
    if (!sb || !c.codigo_interno) return;
    if (!window.confirm(`¿Quitar ${c.nombre_comercial} de tu fichero? Dejarás de verla (sus pedidos se conservan).`)) return;
    try {
      await cambiarMiFichero(sb, usuario.id, [c.codigo_interno], 'quitar');
      setAbierto(null);
      await refrescarFarmaciasDelDispositivo();
      mostrar({ tipo: 'ok', texto: `${c.nombre_comercial} salió de tu fichero.` });
    } catch (e: unknown) {
      mostrar({ tipo: 'error', texto: navigator.onLine === false ? 'Necesitas conexión a internet para cambiar tu fichero.' : e instanceof Error ? e.message : String(e) });
    }
  };
  const propios = useMemo(() => (esVendedor ? pedidos.filter((p) => p.vendedor_id === usuario.id) : pedidos), [pedidos, esVendedor, usuario.id]);
  const actividad = useMemo(() => actividadDeClientes(clientes, ultimaCompraPorCliente(compras), ultimoPedidoPorCliente(pedidos)), [clientes, compras, pedidos]);
  // Farmacias en riesgo: su propio ritmo de compra contra los días que llevan sin comprar.
  const { lista: riesgo } = useRiesgoFarmacias(clientes, pedidos, SIN_UNIDADES, compras);
  const riesgoDe = useMemo(() => new Map(riesgo.map((f) => [f.cliente.id, f])), [riesgo]);
  const cuentaNivel = (n: NivelRiesgo) => riesgo.filter((f) => f.nivel === n).length;
  const zonas = useMemo(() => Array.from(new Set(clientes.map((c) => c.brick).filter((z): z is string => !!z))).sort(), [clientes]);

  const filtrados = useMemo(() => {
    const t = normalizar(q);
    return actividad
      .filter((a) => !t || a.cliente.busqueda.includes(t))
      .filter((a) => !zona || a.cliente.brick === zona)
      .filter((a) => filtro === 'todas' || riesgoDe.get(a.cliente.id)?.nivel === filtro)
      .sort((x, y) =>
        filtro === 'todas'
          ? x.cliente.nombre_comercial.localeCompare(y.cliente.nombre_comercial)
          : (riesgoDe.get(y.cliente.id)?.unidadesMes ?? 0) - (riesgoDe.get(x.cliente.id)?.unidadesMes ?? 0)
      );
  }, [actividad, q, zona, filtro, riesgoDe]);

  const seleccionado = abierto ? clientes.find((c) => c.id === abierto) : undefined;

  return (
    <div>
      <PageHeader
        titulo={esVendedor ? 'Mis clientes' : 'Clientes'}
        descripcion={`${clientes.length} farmacia${clientes.length === 1 ? '' : 's'}${esVendedor ? ' en tu fichero' : ''}`}
        acciones={puedeEditarFichero ? <Boton variante="primario" icono={Plus} onClick={() => setAgregando(true)}>Agregar farmacias</Boton> : undefined}
      />
      {nodo}
      {puedeEditarFichero && (
        <AgregarFarmacias
          abierto={agregando}
          vendedorId={usuario.id}
          onCerrar={() => setAgregando(false)}
          onAgregadas={(n) => mostrar({ tipo: 'ok', texto: n === 1 ? 'Se agregó 1 farmacia a tu fichero.' : `Se agregaron ${n} farmacias a tu fichero.` })}
        />
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={texto} onChange={(e) => { setTexto(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar por nombre, RIF, código o zona" aria-label="Buscar cliente" className={`${estiloInput} pl-9`} />
        </div>
        {zonas.length > 1 && (
          <select value={zona} onChange={(e) => { setZona(e.target.value); setLimite(POR_PAGINA); }} aria-label="Zona" className={`${estiloInput} w-auto`}>
            <option value="">Todas las zonas</option>
            {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        )}
      </div>
      <div className="mb-3">
        <Filtros
          valor={filtro}
          onChange={(f) => { setFiltro(f); setLimite(POR_PAGINA); }}
          opciones={[
            { id: 'todas', texto: 'Todas' },
            { id: 'en_riesgo', texto: `En riesgo (${cuentaNivel('en_riesgo')})` },
            { id: 'atrasada', texto: `Atrasadas (${cuentaNivel('atrasada')})` },
            { id: 'perdida', texto: `Perdidas (${cuentaNivel('perdida')})` },
          ]}
        />
      </div>

      <Tarjeta className="!p-0">
        {filtrados.length === 0 ? (
          <Vacio
            icono={Users}
            titulo={clientes.length === 0 ? (esVendedor ? 'Aún no tienes clientes asignados' : 'Todavía no hay clientes') : filtro !== 'todas' && !q && !zona ? `Ninguna farmacia ${filtro === 'en_riesgo' ? 'en riesgo' : filtro === 'atrasada' ? 'atrasada' : 'perdida'}` : 'Sin resultados'}
            texto={clientes.length === 0 ? (esVendedor ? (puedeEditarFichero ? 'Toca "Agregar farmacias" y marca las que atiendes.' : 'Pídele a un administrador que te asigne tu fichero.') : 'Cárgalos desde "Datos maestros".') : filtro !== 'todas' && !q && !zona ? 'Todas compran a su ritmo de siempre.' : 'Prueba con otra búsqueda o quita los filtros.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtrados.slice(0, limite).map(({ cliente: c, dias }) => {
              const r = riesgoDe.get(c.id);
              const alerta = r && r.nivel !== 'al_dia';
              return (
              <li key={c.id}>
                <button type="button" onClick={() => setAbierto(c.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.nombre_comercial}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[c.codigo_interno, c.municipio ?? c.brick, c.frecuencia_dias ? `cada ${c.frecuencia_dias} días` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {c.estado_validacion !== 'activo' && <Etiqueta tono="ambar">{c.estado_validacion === 'prospecto_pendiente' ? 'Por validar' : 'Inactivo'}</Etiqueta>}
                    {c.segmento === 'vip' && <Etiqueta tono="teal">VIP</Etiqueta>}
                    {alerta && <Etiqueta tono={NIVELES_RIESGO[r.nivel].tono} punto>{NIVELES_RIESGO[r.nivel].texto}</Etiqueta>}
                    <span className={`text-xs ${alerta ? 'font-semibold text-slate-600 dark:text-slate-300' : 'text-slate-400'}`}>{r ? (r.dias === 0 ? 'compró hoy' : `hace ${r.dias} d`) : dias == null ? 'sin compras' : `hace ${dias} d`}</span>
                  </div>
                </button>
              </li>
              );
            })}
          </ul>
        )}
        {filtrados.length > limite && (
          <div className="border-t border-slate-100 p-2 text-center dark:border-slate-800">
            <Boton variante="suave" onClick={() => setLimite((l) => l + POR_PAGINA)}>Ver más ({filtrados.length - limite})</Boton>
          </div>
        )}
      </Tarjeta>

      <Sheet abierto={!!seleccionado} titulo={seleccionado?.nombre_comercial ?? ''} onCerrar={() => setAbierto(null)} ancho="md:max-w-xl">
        {seleccionado && (
          <FichaFarmacia
            cliente={seleccionado}
            riesgo={riesgoDe.get(seleccionado.id)}
            compras={compras.filter((c) => c.cliente_id === seleccionado.id)}
            pedidos={propios.filter((p) => p.cliente_id === seleccionado.id)}
            visitas={visitas.filter((v) => v.cliente_id === seleccionado.id)}
            tareas={tareas.filter((t) => t.cliente_id === seleccionado.id)}
            productos={productos}
            clientes={clientes}
            medicos={medicos}
            cuentas={mapClientes.filter((m) => m.cliente_id === seleccionado.id).map((m) => ({ drogueria: droguerias.find((d) => d.id === m.drogueria_id)?.nombre ?? 'Droguería', cuenta: m.codigo_cuenta, nombre: m.nombre_en_drogueria ?? null, principal: m.es_principal !== false }))}
            vendedorId={usuario.id}
            verHistorial={usuario.rol === 'admin' || usuario.rol === 'gerente'}
            nombreUsuario={nombreUsuario}
            puedePedir={usuario.rol === 'vendedor' || usuario.rol === 'admin'}
            onPedido={() => { prepararPedidoPara(seleccionado.id); setAbierto(null); irATab('captura'); }}
            onQuitar={puedeEditarFichero && seleccionado.codigo_interno ? () => void quitarDeMiFichero(seleccionado) : undefined}
            onVisita={esVendedor ? () => setVisitando(seleccionado) : undefined}
          />
        )}
      </Sheet>
      {visitando && (
        <VisitaForm
          destino={{ tipo: 'farmacia', cliente: visitando }}
          vendedorId={usuario.id}
          productos={productos}
          onCerrar={() => setVisitando(null)}
          onGuardada={({ visita, tarea, conGps }) => {
            setVisitando(null);
            mostrar({ tipo: 'ok', texto: `Visita a ${visitando.nombre_comercial} registrada${conGps ? '' : ' (sin ubicación)'}.${tarea ? ' La próxima acción quedó en tus tareas.' : ''}` });
            if (visita.resultado === 'pedido_tomado') { prepararPedidoPara(visitando.id); setAbierto(null); irATab('captura'); }
          }}
        />
      )}
    </div>
  );
}
