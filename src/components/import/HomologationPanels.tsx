import React, { useMemo, useState } from 'react';
import { Check, CheckCheck, Search, Trash2, Users, Tag } from 'lucide-react';
import type { Cliente, ClienteDrogueriaAlias, Producto, ProductoDrogueriaMapeo } from '../../types/pharmacy';
import { calcularSimilitudNombres, norm } from '../../services/importUtils';

export interface FarmaciaPendiente {
  drogueria: string;
  cod_cliente: string;
  nombre_cliente: string;
  totalUnidades: number;
  count: number;
  sugerenciaIdent01: string;
  sugerenciaNombre: string;
  similitud: number;
}

export interface ProductoPendiente {
  drogueria: string;
  codigo_producto: string;
  nombre_producto: string;
  totalUnidades: number;
  count: number;
}

const UMBRAL_LOTE = 85;
const PAGINA = 25;

const campo =
  'w-full min-h-11 px-3 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white';
const tarjeta = 'rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800';
const botonPrimario =
  'min-h-11 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-40';
const botonSecundario =
  'min-h-11 inline-flex items-center justify-center gap-2 px-4 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100';

/** Buscador con lista de resultados acotada (evita un <select> con miles de opciones). */
function Buscador<T>({
  items,
  clave,
  etiqueta,
  onElegir,
  placeholder,
}: {
  items: T[];
  clave: (item: T) => string;
  etiqueta: (item: T) => string;
  onElegir: (item: T) => void;
  placeholder: string;
}) {
  const [consulta, setConsulta] = useState('');
  const resultados = useMemo(() => {
    const tokens = norm(consulta).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    return items.filter((it) => {
      const texto = norm(etiqueta(it));
      return tokens.every((t) => texto.includes(t));
    }).slice(0, 8);
  }, [consulta, items, etiqueta]);

  return (
    <div className="relative">
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="search"
        value={consulta}
        onChange={(e) => setConsulta(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${campo} pl-9`}
      />
      {resultados.length > 0 && (
        <ul className="mt-1 rounded-xl border border-slate-200 bg-white shadow-lg divide-y divide-slate-100 overflow-hidden dark:bg-slate-900 dark:border-slate-700 dark:divide-slate-800">
          {resultados.map((it) => (
            <li key={clave(it)}>
              <button
                type="button"
                onClick={() => {
                  onElegir(it);
                  setConsulta('');
                }}
                className="w-full min-h-11 px-3 py-2 text-left text-sm hover:bg-teal-50 dark:hover:bg-teal-950/40"
              >
                {etiqueta(it)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const Vacio: React.FC<{ texto: string }> = ({ texto }) => (
  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">{texto}</div>
);

/* ------------------------------ Homologar farmacias ------------------------------ */

interface PanelHomologarProps {
  pendientes: FarmaciaPendiente[];
  hayArchivo: boolean;
  aliases: ClienteDrogueriaAlias[];
  clientes: Cliente[];
  onConfirmar: (drogueria: string, codCliente: string, nombreCliente: string, ident01: string) => void;
  onConfirmarLote: (items: FarmaciaPendiente[]) => void;
  onEliminarAlias: (id: string) => void;
}

export const PanelHomologarFarmacias: React.FC<PanelHomologarProps> = ({
  pendientes,
  hayArchivo,
  aliases,
  clientes,
  onConfirmar,
  onConfirmarLote,
  onEliminarAlias,
}) => {
  const [visibles, setVisibles] = useState(PAGINA);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [filtroAlias, setFiltroAlias] = useState('');

  const clientesPorId = useMemo(() => new Map(clientes.map((c) => [c.ident01, c])), [clientes]);
  const seguras = useMemo(() => pendientes.filter((p) => p.similitud >= UMBRAL_LOTE), [pendientes]);
  const etiquetaCliente = (c: Cliente) => `${c.nombre_fantasia || c.razon_social} · ${c.ident01} · ${c.rif}`;

  const aliasesFiltrados = useMemo(() => {
    const q = norm(filtroAlias).trim();
    const lista = q
      ? aliases.filter((a) => norm(a.nombre_cliente_drogueria).includes(q) || norm(a.drogueria).includes(q) || norm(a.cliente_ident01).includes(q))
      : aliases;
    return lista.slice(0, 50);
  }, [aliases, filtroAlias]);

  return (
    <div className="space-y-5">
      <div className={`${tarjeta} p-4 sm:p-5 space-y-4`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <Users className="w-4 h-4 text-indigo-500" />
              Farmacias con nombres distintos por droguería
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada aprobación queda guardada: la próxima carga reconoce la farmacia sin volver a preguntar.
            </p>
          </div>
          {seguras.length > 0 && (
            <button type="button" onClick={() => onConfirmarLote(seguras)} className={botonPrimario}>
              <CheckCheck className="w-4 h-4" />
              Aceptar {seguras.length} con afinidad ≥ {UMBRAL_LOTE}%
            </button>
          )}
        </div>

        {!hayArchivo ? (
          <Vacio texto="Carga un archivo de ventas en «1. Cargar Mes a Mes» para detectar las farmacias pendientes." />
        ) : pendientes.length === 0 ? (
          <Vacio texto="Todas las farmacias del archivo ya están homologadas." />
        ) : (
          <ul className="space-y-3">
            {pendientes.slice(0, visibles).map((p) => {
              const clave = `${p.drogueria}__${p.nombre_cliente}`;
              return (
                <li key={clave} className="rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                      {p.drogueria}
                    </span>
                    <span className="font-semibold text-sm text-slate-900 dark:text-white break-words">{p.nombre_cliente}</span>
                    <span className="text-xs text-slate-500 font-mono">
                      {p.cod_cliente || 'sin código'} · {p.totalUnidades.toLocaleString()} uds · {p.count} filas
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <p className="flex-1 text-sm text-slate-700 dark:text-slate-300">
                      Sugerencia:{' '}
                      <strong>{p.sugerenciaNombre}</strong>{' '}
                      <span className="font-mono text-xs text-slate-500">({p.sugerenciaIdent01})</span>{' '}
                      <span
                        className={`ml-1 px-1.5 py-0.5 rounded text-xs font-bold ${
                          p.similitud >= UMBRAL_LOTE
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {p.similitud}%
                      </span>
                    </p>
                    <div className="grid grid-cols-2 sm:flex gap-2">
                      <button
                        type="button"
                        onClick={() => onConfirmar(p.drogueria, p.cod_cliente, p.nombre_cliente, p.sugerenciaIdent01)}
                        className={botonPrimario}
                      >
                        <Check className="w-4 h-4" />
                        Aceptar
                      </button>
                      <button
                        type="button"
                        onClick={() => setCambiando(cambiando === clave ? null : clave)}
                        className={botonSecundario}
                      >
                        Otra farmacia
                      </button>
                    </div>
                  </div>

                  {cambiando === clave && (
                    <Buscador
                      items={clientes}
                      clave={(c) => c.ident01}
                      etiqueta={etiquetaCliente}
                      placeholder="Buscar farmacia por nombre, código o RIF"
                      onElegir={(c) => {
                        onConfirmar(p.drogueria, p.cod_cliente, p.nombre_cliente, c.ident01);
                        setCambiando(null);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {pendientes.length > visibles && (
          <button type="button" onClick={() => setVisibles((v) => v + PAGINA)} className={`${botonSecundario} w-full`}>
            Mostrar {Math.min(PAGINA, pendientes.length - visibles)} más ({pendientes.length - visibles} restantes)
          </button>
        )}
      </div>

      <div className={`${tarjeta} p-4 sm:p-5 space-y-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Homologaciones guardadas ({aliases.length})</h3>
          <input
            type="search"
            value={filtroAlias}
            onChange={(e) => setFiltroAlias(e.target.value)}
            placeholder="Filtrar por nombre, droguería o código"
            aria-label="Filtrar homologaciones"
            className={`${campo} sm:max-w-xs`}
          />
        </div>
        {aliasesFiltrados.length === 0 ? (
          <Vacio texto="No hay homologaciones que coincidan." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {aliasesFiltrados.map((a) => (
              <li key={a.id} className="py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{a.drogueria}</span> · {a.nombre_cliente_drogueria}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    → {clientesPorId.get(a.cliente_ident01)?.nombre_fantasia ?? 'Farmacia no encontrada'}{' '}
                    <span className="font-mono">({a.cliente_ident01})</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEliminarAlias(a.id)}
                  aria-label={`Eliminar homologación de ${a.nombre_cliente_drogueria}`}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

/* ------------------------------- Diccionario Cod SAP ------------------------------- */

interface PanelMapeoProps {
  pendientes: ProductoPendiente[];
  hayArchivo: boolean;
  mapeos: ProductoDrogueriaMapeo[];
  productos: Producto[];
  onAsignar: (drogueria: string, codigoProducto: string, nombreProducto: string, codSap: string) => void;
  onEliminar: (id: string) => void;
}

const nombreProducto = (p: Producto) => p.nombre_comercial || p.product || p.descripcion || '';
const etiquetaProducto = (p: Producto) => `${p.sku} · ${nombreProducto(p)} ${p.presentacion ?? ''}`.trim();

function mejorSugerencia(pendiente: ProductoPendiente, productos: Producto[]): { producto: Producto; similitud: number } | null {
  let mejor: Producto | null = null;
  let mejorSim = 0;
  for (const p of productos) {
    const sim = calcularSimilitudNombres(pendiente.nombre_producto, nombreProducto(p));
    if (sim > mejorSim) {
      mejorSim = sim;
      mejor = p;
    }
  }
  return mejor && mejorSim >= 50 ? { producto: mejor, similitud: mejorSim } : null;
}

const FilaPendienteSap: React.FC<{
  pendiente: ProductoPendiente;
  productos: Producto[];
  onAsignar: PanelMapeoProps['onAsignar'];
}> = ({ pendiente, productos, onAsignar }) => {
  const sugerencia = useMemo(() => mejorSugerencia(pendiente, productos), [pendiente, productos]);
  const [buscando, setBuscando] = useState(!sugerencia);

  return (
    <li className="rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
          {pendiente.drogueria}
        </span>
        <span className="font-semibold text-sm text-slate-900 dark:text-white break-words">{pendiente.nombre_producto || 'Sin nombre'}</span>
        <span className="text-xs text-slate-500 font-mono">
          {pendiente.codigo_producto} · {pendiente.totalUnidades.toLocaleString()} uds · {pendiente.count} filas
        </span>
      </div>

      {sugerencia && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="flex-1 text-sm text-slate-700 dark:text-slate-300">
            Sugerencia: <strong>{etiquetaProducto(sugerencia.producto)}</strong>{' '}
            <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {sugerencia.similitud}%
            </span>
          </p>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <button
              type="button"
              onClick={() => onAsignar(pendiente.drogueria, pendiente.codigo_producto, pendiente.nombre_producto, sugerencia.producto.sku)}
              className={botonPrimario}
            >
              <Check className="w-4 h-4" />
              Aceptar
            </button>
            <button type="button" onClick={() => setBuscando((v) => !v)} className={botonSecundario}>
              Otro producto
            </button>
          </div>
        </div>
      )}

      {buscando && (
        <Buscador
          items={productos}
          clave={(p) => p.id}
          etiqueta={etiquetaProducto}
          placeholder="Buscar medicamento por nombre o SKU"
          onElegir={(p) => onAsignar(pendiente.drogueria, pendiente.codigo_producto, pendiente.nombre_producto, p.sku)}
        />
      )}
    </li>
  );
};

export const PanelMapeoSap: React.FC<PanelMapeoProps> = ({ pendientes, hayArchivo, mapeos, productos, onAsignar, onEliminar }) => {
  const [visibles, setVisibles] = useState(PAGINA);
  const [filtro, setFiltro] = useState('');

  const mapeosFiltrados = useMemo(() => {
    const q = norm(filtro).trim();
    const lista = q
      ? mapeos.filter((m) => norm(m.codigo_producto_drogueria).includes(q) || norm(m.nombre_producto_drogueria).includes(q) || norm(m.cod_sap).includes(q) || norm(m.drogueria).includes(q))
      : mapeos;
    return lista.slice(0, 50);
  }, [mapeos, filtro]);

  return (
    <div className="space-y-5">
      <div className={`${tarjeta} p-4 sm:p-5 space-y-4`}>
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Tag className="w-4 h-4 text-purple-500" />
            Productos sin Cod SAP en el reporte
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Asócialos una vez: el diccionario recuerda «droguería + código» y completa el Cod SAP en los meses siguientes.
          </p>
        </div>

        {!hayArchivo ? (
          <Vacio texto="Carga un archivo de ventas en «1. Cargar Mes a Mes» para detectar los productos pendientes." />
        ) : pendientes.length === 0 ? (
          <Vacio texto="Todos los productos del archivo ya tienen Cod SAP." />
        ) : (
          <ul className="space-y-3">
            {pendientes.slice(0, visibles).map((p) => (
              <FilaPendienteSap key={`${p.drogueria}__${p.codigo_producto}`} pendiente={p} productos={productos} onAsignar={onAsignar} />
            ))}
          </ul>
        )}

        {pendientes.length > visibles && (
          <button type="button" onClick={() => setVisibles((v) => v + PAGINA)} className={`${botonSecundario} w-full`}>
            Mostrar {Math.min(PAGINA, pendientes.length - visibles)} más ({pendientes.length - visibles} restantes)
          </button>
        )}
      </div>

      <div className={`${tarjeta} p-4 sm:p-5 space-y-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Diccionario guardado ({mapeos.length})</h3>
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por código, nombre o SKU"
            aria-label="Filtrar diccionario"
            className={`${campo} sm:max-w-xs`}
          />
        </div>
        {mapeosFiltrados.length === 0 ? (
          <Vacio texto="No hay mapeos que coincidan." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {mapeosFiltrados.map((m) => (
              <li key={m.id} className="py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400">{m.drogueria}</span> ·{' '}
                    <span className="font-mono">{m.codigo_producto_drogueria}</span>
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {m.nombre_producto_drogueria} → <span className="font-mono">{m.cod_sap}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEliminar(m.id)}
                  aria-label={`Eliminar mapeo de ${m.codigo_producto_drogueria}`}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
