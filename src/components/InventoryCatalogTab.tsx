import React, { useState, useMemo } from 'react';
import { Producto } from '../types/pharmacy';
import { 
  Pill, 
  Search, 
  Plus, 
  Minus,
  Barcode, 
  Pencil,
  Trash2,
  X,
  Check
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface InventoryCatalogTabProps {
  productos: Producto[];
  onActualizarStock: (productoId: string, nuevoStock: number) => void;
  onCrearProducto: (producto: Omit<Producto, 'id' | 'created_at'>) => void;
  onEditarProducto?: (producto: Producto) => void;
  onEliminarProducto?: (productoId: string) => void;
}

export const InventoryCatalogTab: React.FC<InventoryCatalogTabProps> = ({
  productos,
  onActualizarStock,
  onCrearProducto,
  onEditarProducto,
  onEliminarProducto,
}) => {
  const { esClaro } = useTheme();
  const [busqueda, setBusqueda] = useState('');
  const [filtroUnidadNegocio, setFiltroUnidadNegocio] = useState<string>('todos');
  const [soloPrioritarios, setSoloPrioritarios] = useState(false);
  const [soloBajoStock, setSoloBajoStock] = useState(false);
  
  // Modales
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false);
  const [productoAEditar, setProductoAEditar] = useState<Producto | null>(null);

  // Formulario Nuevo Producto (12 Campos sin acentos)
  const initialFormNuevo = {
    codigo: '',
    descripcion: '',
    unidad_negocio: 'La Sante',
    clase_terapeutica: '',
    sistemas: '',
    clasificacion_portafolio: 'Estrategico',
    product_code: '',
    product: '',
    pack_code: '',
    pack: '',
    molecula: '',
    estado_texto: 'Activo',
    precio_lista: 0,
    descuento_maximo_porc: 15.0,
    es_prioritario: false,
    factor_prioridad: 1.30,
    empaque_minimo: 10,
    stock_disponible: 500,
    activo: true,
  };

  const [formNuevo, setFormNuevo] = useState(initialFormNuevo);

  const unidadesNegocio = useMemo(() => {
    const set = new Set<string>();
    productos.forEach((p) => {
      const u = p.unidad_negocio || p.laboratorio;
      if (u) set.add(u);
    });
    return Array.from(set);
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      if (soloPrioritarios && !p.es_prioritario) return false;
      if (soloBajoStock && p.stock_disponible >= 500) return false;
      const u = p.unidad_negocio || p.laboratorio;
      if (filtroUnidadNegocio !== 'todos' && u !== filtroUnidadNegocio) return false;

      if (!busqueda) return true;
      const q = busqueda.toLowerCase();
      return (
        (p.product || p.nombre_comercial || '').toLowerCase().includes(q) ||
        (p.molecula || p.principio_activo || '').toLowerCase().includes(q) ||
        (p.codigo || p.sku || '').toLowerCase().includes(q) ||
        (p.pack_code || p.codigo_barras_ean13 || '').includes(q) ||
        (p.unidad_negocio || p.laboratorio || '').toLowerCase().includes(q) ||
        (p.clase_terapeutica || '').toLowerCase().includes(q) ||
        (p.sistemas || '').toLowerCase().includes(q) ||
        (p.clasificacion_portafolio || '').toLowerCase().includes(q)
      );
    });
  }, [productos, busqueda, filtroUnidadNegocio, soloPrioritarios, soloBajoStock]);

  const handleSubmitNuevo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNuevo.codigo.trim() || !formNuevo.product.trim()) {
      alert('Por favor completa al menos los campos Codigo y Product.');
      return;
    }

    const sku = formNuevo.codigo.trim();
    const nombre = formNuevo.product.trim();
    const molecula = formNuevo.molecula.trim() || 'Principio Activo';
    const presentacion = formNuevo.pack.trim() || formNuevo.descripcion.trim() || 'Caja x 30';

    onCrearProducto({
      sku,
      codigo_barras_ean13: formNuevo.pack_code.trim() || `759${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      principio_activo: molecula,
      nombre_comercial: nombre,
      presentacion,
      laboratorio: formNuevo.unidad_negocio,
      precio_lista: Number(formNuevo.precio_lista) || 0,
      descuento_maximo_porc: Number(formNuevo.descuento_maximo_porc) || 15.0,
      es_prioritario: formNuevo.es_prioritario,
      factor_prioridad: Number(formNuevo.factor_prioridad) || 1.30,
      empaque_minimo: Number(formNuevo.empaque_minimo) || 10,
      stock_disponible: Number(formNuevo.stock_disponible) || 0,
      activo: formNuevo.activo,
      equipo_asignado: formNuevo.unidad_negocio.toLowerCase().includes('comercial') ? 'Comercial' : formNuevo.unidad_negocio.toLowerCase().includes('otc') ? 'OTC' : 'La Sante',

      // 12 Campos dimensionales (sin acentos)
      codigo: formNuevo.codigo.trim(),
      descripcion: formNuevo.descripcion.trim() || nombre,
      unidad_negocio: formNuevo.unidad_negocio.trim(),
      clase_terapeutica: formNuevo.clase_terapeutica.trim(),
      sistemas: formNuevo.sistemas.trim(),
      clasificacion_portafolio: formNuevo.clasificacion_portafolio.trim(),
      product_code: formNuevo.product_code.trim() || sku,
      product: nombre,
      pack_code: formNuevo.pack_code.trim(),
      pack: formNuevo.pack.trim() || presentacion,
      molecula: molecula,
      estado_texto: formNuevo.activo ? 'Activo' : 'Inactivo',
    });

    setModalAbierto(false);
    setFormNuevo(initialFormNuevo);
  };

  const handleAbrirEditar = (prod: Producto) => {
    setProductoAEditar({ ...prod });
    setModalEditarAbierto(true);
  };

  const handleGuardarEdicion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoAEditar) return;

    if (onEditarProducto) {
      onEditarProducto({
        ...productoAEditar,
        sku: productoAEditar.codigo || productoAEditar.sku,
        nombre_comercial: productoAEditar.product || productoAEditar.nombre_comercial,
        principio_activo: productoAEditar.molecula || productoAEditar.principio_activo,
        presentacion: productoAEditar.pack || productoAEditar.presentacion,
        laboratorio: productoAEditar.unidad_negocio || productoAEditar.laboratorio,
      });
    }
    setModalEditarAbierto(false);
    setProductoAEditar(null);
  };

  const handleConfirmarEliminar = (prod: Producto) => {
    const seguro = window.confirm(`¿Estas seguro de que deseas eliminar permanentemente el producto "${prod.product || prod.nombre_comercial}" (${prod.codigo || prod.sku}) de la tabla de dimensiones dim_productos?`);
    if (seguro && onEliminarProducto) {
      onEliminarProducto(prod.id);
    }
  };

  return (
    <div className="space-y-5">

      {/* Cabecera Principal */}
      <div className={`p-5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800 shadow-lg'
      }`}>
        <div>
          <h2 className={`text-xl font-bold ${esClaro ? 'text-slate-900' : 'text-white'}`}>
            Vademecum de Productos (dim_productos)
          </h2>
          <p className={`text-xs mt-0.5 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
            Dimension de productos comerciales, principios activos, clases terapeuticas y control de inventario.
          </p>
        </div>

        <button
          onClick={() => setModalAbierto(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-sm shrink-0 min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Registrar Medicamento
        </button>
      </div>

      {/* Barra de Filtros y Busqueda */}
      <div className={`p-4 rounded-2xl border space-y-3 ${
        esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex flex-col md:flex-row items-center gap-3">
          
          <div className="relative flex-1 w-full">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${
              esClaro ? 'text-slate-400' : 'text-slate-500'
            }`} />
            <input
              type="text"
              placeholder="Buscar por Codigo, Product, Molecula, Clase Terapeutica o Sistemas..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className={`w-full text-xs rounded-xl pl-10 pr-4 py-2.5 border focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                esClaro 
                  ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400' 
                  : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
              }`}
            />
          </div>

          <div className="w-full md:w-56">
            <select
              value={filtroUnidadNegocio}
              onChange={(e) => setFiltroUnidadNegocio(e.target.value)}
              className={`w-full text-xs rounded-xl px-3 py-2.5 border focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                esClaro 
                  ? 'bg-slate-50 border-slate-200 text-slate-900' 
                  : 'bg-slate-950 border-slate-700 text-white'
              }`}
            >
              <option value="todos">Todas las Unidades de Negocio</option>
              {unidadesNegocio.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setSoloPrioritarios(!soloPrioritarios)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                soloPrioritarios
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                  : esClaro ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              Prioritarios
            </button>

            <button
              onClick={() => setSoloBajoStock(!soloBajoStock)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                soloBajoStock
                  ? 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-300'
                  : esClaro ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              Bajo Stock (&lt;500)
            </button>
          </div>

        </div>
      </div>

      {/* Lista de Medicamentos */}
      <div className={`rounded-2xl border overflow-hidden ${
        esClaro ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
      }`}>

        {/* VISTA MOVIL: Cards */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {productosFiltrados.map((prod) => (
            <div key={prod.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>{prod.product || prod.nombre_comercial}</span>
                    {prod.es_prioritario && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                        {prod.clasificacion_portafolio || 'PRIORITARIO'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {prod.molecula || prod.principio_activo} · {prod.unidad_negocio || prod.laboratorio}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    Codigo: {prod.codigo || prod.sku} · Pack: {prod.pack || prod.presentacion}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleAbrirEditar(prod)}
                    className="p-2 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleConfirmarEliminar(prod)}
                    className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Ajuste de Stock en Movil */}
              <div className="flex items-center justify-between pt-1 gap-2 border-t border-slate-50 dark:border-slate-800/60">
                <div className="text-xs">
                  <span className="text-slate-400 text-[10px] block">Dscto Max:</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {prod.descuento_maximo_porc.toFixed(1)}%
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Stock:</span>
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => onActualizarStock(prod.id, Math.max(0, prod.stock_disponible - prod.empaque_minimo))}
                      className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded text-slate-700 dark:text-slate-200 active:scale-95"
                      aria-label="Restar stock"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={prod.stock_disponible}
                      onChange={(e) => onActualizarStock(prod.id, parseInt(e.target.value) || 0)}
                      className="w-16 text-center font-bold text-xs bg-transparent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onActualizarStock(prod.id, prod.stock_disponible + prod.empaque_minimo)}
                      className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded text-slate-700 dark:text-slate-200 active:scale-95"
                      aria-label="Aumentar stock"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* VISTA ESCRITORIO: Tabla Completa */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className={`border-b text-[11px] uppercase tracking-wider font-semibold ${
              esClaro ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
            }`}>
              <tr>
                <th className="py-3 px-4">Codigo</th>
                <th className="py-3 px-4">Product / Descripcion</th>
                <th className="py-3 px-3">Molecula</th>
                <th className="py-3 px-3">Unidad de Negocio</th>
                <th className="py-3 px-3 text-center">Clase Terapeutica</th>
                <th className="py-3 px-3 text-center">Empaque</th>
                <th className="py-3 px-3 text-right">Dscto Max %</th>
                <th className="py-3 px-4 text-center">Stock Almacen</th>
                <th className="py-3 px-3 text-center">Estado</th>
                <th className="py-3 px-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-normal ${
              esClaro ? 'divide-slate-200 text-slate-700' : 'divide-slate-800 text-slate-300'
            }`}>
              {productosFiltrados.map((prod) => (
                <tr key={prod.id} className={esClaro ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'}>
                  
                  <td className="py-3 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">
                    {prod.codigo || prod.sku}
                  </td>

                  <td className="py-3 px-4">
                    <div className={`font-bold flex items-center gap-2 ${esClaro ? 'text-slate-900' : 'text-white'}`}>
                      {prod.product || prod.nombre_comercial}
                      {prod.es_prioritario && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                          {prod.clasificacion_portafolio || 'PRIORITARIO'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {prod.pack || prod.presentacion} {prod.product_code ? `· Cod: ${prod.product_code}` : ''}
                    </div>
                    {(prod.clase_terapeutica || prod.sistemas) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {prod.clase_terapeutica && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {prod.clase_terapeutica}
                          </span>
                        )}
                        {prod.sistemas && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                            {prod.sistemas}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3 font-medium">
                    {prod.molecula || prod.principio_activo}
                  </td>

                  <td className={`py-3 px-3 ${esClaro ? 'text-slate-500' : 'text-slate-400'}`}>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {prod.unidad_negocio || prod.laboratorio}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-center text-slate-500 text-[11px]">
                    {prod.clase_terapeutica || '—'}
                  </td>

                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded font-mono text-xs ${
                      esClaro ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300'
                    }`}>
                      x{prod.empaque_minimo}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-amber-700 dark:text-amber-400 font-semibold">
                    {prod.descuento_maximo_porc.toFixed(1)}%
                  </td>

                  <td className="py-3 px-4 text-center">
                    <div className="inline-flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={prod.stock_disponible}
                        onChange={(e) => onActualizarStock(prod.id, parseInt(e.target.value) || 0)}
                        className={`w-20 text-center font-bold text-xs rounded-lg py-1 px-1 border focus:outline-none focus:ring-1 ${
                          prod.stock_disponible < 500
                            ? 'border-red-400 text-red-700 dark:text-red-400 bg-red-50/20'
                            : esClaro
                            ? 'border-slate-200 text-emerald-800 bg-slate-50'
                            : 'border-slate-700 text-emerald-400 bg-slate-950'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400">uds</span>
                    </div>
                  </td>

                  <td className="py-3 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      prod.activo 
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' 
                        : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                    }`}>
                      {prod.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleAbrirEditar(prod)}
                        className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                        title="Editar Medicamento"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleConfirmarEliminar(prod)}
                        className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                        title="Eliminar Medicamento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Registro de Nuevo Medicamento (12 Campos sin acentos) */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-5 sm:p-6 rounded-2xl border max-w-2xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Pill className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                <h3 className="text-base font-bold">
                  Registrar Medicamento en Vademecum (12 Campos)
                </h3>
              </div>
              <button
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitNuevo} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Codigo (SKU Interno) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: SKU-LOS-50"
                    value={formNuevo.codigo}
                    onChange={(e) => setFormNuevo({ ...formNuevo, codigo: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Product (Nombre Comercial) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Losartan"
                    value={formNuevo.product}
                    onChange={(e) => setFormNuevo({ ...formNuevo, product: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Descripcion</label>
                  <input
                    type="text"
                    placeholder="Ej: Losartan Potasico 50mg x 30 Tabletas"
                    value={formNuevo.descripcion}
                    onChange={(e) => setFormNuevo({ ...formNuevo, descripcion: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Concatenate Molecule (Spanish) / Molecula</label>
                  <input
                    type="text"
                    placeholder="Ej: Losartan Potasico"
                    value={formNuevo.molecula}
                    onChange={(e) => setFormNuevo({ ...formNuevo, molecula: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Unidad de Negocio</label>
                  <input
                    type="text"
                    placeholder="Ej: La Sante, Comercial, OTC"
                    value={formNuevo.unidad_negocio}
                    onChange={(e) => setFormNuevo({ ...formNuevo, unidad_negocio: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Clase Terapeutica</label>
                  <input
                    type="text"
                    placeholder="Ej: Antihipertensivo, Hipolipemiante"
                    value={formNuevo.clase_terapeutica}
                    onChange={(e) => setFormNuevo({ ...formNuevo, clase_terapeutica: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Sistemas</label>
                  <input
                    type="text"
                    placeholder="Ej: Cardiovascular, Nervioso Central"
                    value={formNuevo.sistemas}
                    onChange={(e) => setFormNuevo({ ...formNuevo, sistemas: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Clasificacion Portafolio</label>
                  <input
                    type="text"
                    placeholder="Ej: Estrategico, Lanzamiento, Maduros, Clave"
                    value={formNuevo.clasificacion_portafolio}
                    onChange={(e) => setFormNuevo({ ...formNuevo, clasificacion_portafolio: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Product Code</label>
                  <input
                    type="text"
                    placeholder="Ej: PRD-LOS-50"
                    value={formNuevo.product_code}
                    onChange={(e) => setFormNuevo({ ...formNuevo, product_code: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Pack Code (EAN13)</label>
                  <input
                    type="text"
                    placeholder="Ej: PCK-LOS-30 o 7702057001014"
                    value={formNuevo.pack_code}
                    onChange={(e) => setFormNuevo({ ...formNuevo, pack_code: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Pack (Presentacion)</label>
                  <input
                    type="text"
                    placeholder="Ej: Caja x 30 Tabletas"
                    value={formNuevo.pack}
                    onChange={(e) => setFormNuevo({ ...formNuevo, pack: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Estado</label>
                  <select
                    value={formNuevo.activo ? 'Activo' : 'Inactivo'}
                    onChange={(e) => setFormNuevo({ ...formNuevo, activo: e.target.value === 'Activo' })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              {/* Parametros Comerciales & Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block font-bold mb-1">Dscto Max (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={formNuevo.descuento_maximo_porc}
                    onChange={(e) => setFormNuevo({ ...formNuevo, descuento_maximo_porc: Number(e.target.value) })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Empaque Minimo</label>
                  <input
                    type="number"
                    min={1}
                    value={formNuevo.empaque_minimo}
                    onChange={(e) => setFormNuevo({ ...formNuevo, empaque_minimo: Number(e.target.value) })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Stock Inicial</label>
                  <input
                    type="number"
                    min={0}
                    value={formNuevo.stock_disponible}
                    onChange={(e) => setFormNuevo({ ...formNuevo, stock_disponible: Number(e.target.value) })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                esClaro ? 'border-slate-200' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className={`px-4 py-2 rounded-xl ${esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm min-h-[44px]"
                >
                  Guardar Medicamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Medicamento Existente (12 Campos sin acentos) */}
      {modalEditarAbierto && productoAEditar && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className={`p-5 sm:p-6 rounded-2xl border max-w-2xl w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
            esClaro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              esClaro ? 'border-slate-200' : 'border-slate-800'
            }`}>
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold">
                  Editar Medicamento: {productoAEditar.product || productoAEditar.nombre_comercial}
                </h3>
              </div>
              <button
                onClick={() => setModalEditarAbierto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Codigo (SKU) *</label>
                  <input
                    type="text"
                    required
                    value={productoAEditar.codigo || productoAEditar.sku}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, codigo: e.target.value, sku: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Product (Nombre Comercial) *</label>
                  <input
                    type="text"
                    required
                    value={productoAEditar.product || productoAEditar.nombre_comercial}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, product: e.target.value, nombre_comercial: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Descripcion</label>
                  <input
                    type="text"
                    value={productoAEditar.descripcion || ''}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, descripcion: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Concatenate Molecule (Spanish) / Molecula</label>
                  <input
                    type="text"
                    value={productoAEditar.molecula || productoAEditar.principio_activo}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, molecula: e.target.value, principio_activo: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Unidad de Negocio</label>
                  <input
                    type="text"
                    value={productoAEditar.unidad_negocio || productoAEditar.laboratorio}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, unidad_negocio: e.target.value, laboratorio: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Clase Terapeutica</label>
                  <input
                    type="text"
                    value={productoAEditar.clase_terapeutica || ''}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, clase_terapeutica: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Sistemas</label>
                  <input
                    type="text"
                    value={productoAEditar.sistemas || ''}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, sistemas: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Clasificacion Portafolio</label>
                  <input
                    type="text"
                    value={productoAEditar.clasificacion_portafolio || ''}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, clasificacion_portafolio: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Product Code</label>
                  <input
                    type="text"
                    value={productoAEditar.product_code || ''}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, product_code: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Pack Code (EAN13)</label>
                  <input
                    type="text"
                    value={productoAEditar.pack_code || productoAEditar.codigo_barras_ean13}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, pack_code: e.target.value, codigo_barras_ean13: e.target.value })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Pack (Presentacion)</label>
                  <input
                    type="text"
                    value={productoAEditar.pack || productoAEditar.presentacion}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, pack: e.target.value, presentacion: e.target.value })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Estado</label>
                  <select
                    value={productoAEditar.activo ? 'Activo' : 'Inactivo'}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, activo: e.target.value === 'Activo' })}
                    className={`w-full rounded-lg p-2 border ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              {/* Parametros Comerciales */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block font-bold mb-1">Dscto Max (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={productoAEditar.descuento_maximo_porc}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, descuento_maximo_porc: Number(e.target.value) })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Empaque Minimo</label>
                  <input
                    type="number"
                    min={1}
                    value={productoAEditar.empaque_minimo}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, empaque_minimo: Number(e.target.value) })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Stock Almacen</label>
                  <input
                    type="number"
                    min={0}
                    value={productoAEditar.stock_disponible}
                    onChange={(e) => setProductoAEditar({ ...productoAEditar, stock_disponible: Number(e.target.value) })}
                    className={`w-full rounded-lg p-2 border font-mono ${
                      esClaro ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                esClaro ? 'border-slate-200' : 'border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setModalEditarAbierto(false)}
                  className={`px-4 py-2 rounded-xl ${esClaro ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm min-h-[44px]"
                >
                  Actualizar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
