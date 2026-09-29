import React, { useState, useMemo } from 'react';
import { 
  Cliente, 
  Drogueria, 
  Producto, 
  RolUsuario, 
  EquipoVentas 
} from '../types/pharmacy';
import { 
  Barcode, 
  Mic, 
  Plus, 
  Minus,
  X, 
  Send, 
  Check, 
  Sparkles, 
  Star,
  Search,
  Save,
  ChevronDown
} from 'lucide-react';

interface OrderTakingTabProps {
  clientes: Cliente[];
  droguerias: Drogueria[];
  productos: Producto[];
  rolActual: RolUsuario;
  equipoActual: EquipoVentas;
  onAbrirEscaner: () => void;
  onAbrirDictadoVoz: () => void;
  onTransmitirPedido: (
    clienteId: string,
    drogueriaId: string,
    items: { producto: Producto; cantidad: number; descuento: number }[],
    observaciones: string
  ) => void;
  onIrASugeridos: () => void;
  itemsExternos?: { producto: Producto; cantidad: number; descuento: number }[];
  onConsumirItemsExternos?: () => void;
}

export const OrderTakingTab: React.FC<OrderTakingTabProps> = ({
  clientes,
  droguerias,
  productos,
  rolActual,
  equipoActual,
  onAbrirEscaner,
  onAbrirDictadoVoz,
  onTransmitirPedido,
  onIrASugeridos,
  itemsExternos = [],
  onConsumirItemsExternos,
}) => {
  const [clienteId, setClienteId] = useState<string>(clientes[0]?.id || '');
  const [drogueriaId, setDrogueriaId] = useState<string>(droguerias[0]?.id || '');
  const [observaciones, setObservaciones] = useState<string>('');
  const [busquedaTexto, setBusquedaTexto] = useState<string>('');
  
  // Líneas del borrador actual de pedido
  const [lineas, setLineas] = useState<{
    producto: Producto;
    cantidad: number;
    descuento: number;
  }[]>([]);

  const [toastMensaje, setToastMensaje] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMensaje(msg);
    setTimeout(() => setToastMensaje(null), 3000);
  };

  // Consumir items añadidos externamente desde Escáner de Código de Barras o Dictado por Voz
  React.useEffect(() => {
    if (itemsExternos && itemsExternos.length > 0) {
      setLineas((prev) => {
        // Sin mutar las líneas previas: en StrictMode el updater corre dos veces y duplicaba las cantidades.
        const copy = [...prev];
        itemsExternos.forEach((it) => {
          const idx = copy.findIndex((l) => l.producto.id === it.producto.id);
          if (idx >= 0) {
            copy[idx] = {
              ...copy[idx],
              cantidad: copy[idx].cantidad + it.cantidad,
              descuento: Math.min(it.producto.descuento_maximo_porc, it.descuento),
            };
          } else {
            copy.push(it);
          }
        });
        return copy;
      });
      showToast(`Añadido(s) ${itemsExternos.length} producto(s) desde Escáner/Voz.`);
      onConsumirItemsExternos?.();
    }
  }, [itemsExternos, onConsumirItemsExternos]);

  const clienteSeleccionado = useMemo(() => {
    return clientes.find((c) => c.id === clienteId) || clientes[0];
  }, [clientes, clienteId]);

  const drogueriaSeleccionada = useMemo(() => {
    return droguerias.find((d) => d.id === drogueriaId) || droguerias[0];
  }, [droguerias, drogueriaId]);

  // Clientes disponibles según equipo del vendedor
  const clientesDisponibles = useMemo(() => {
    if (rolActual === 'vendedor') {
      return clientes.filter((c) => {
        if (!c.equipo_asignado || c.equipo_asignado === 'AMBOS') return true;
        return c.equipo_asignado === equipoActual;
      });
    }
    return clientes;
  }, [clientes, rolActual, equipoActual]);

  // Productos disponibles según portafolio del equipo
  const productosDisponibles = useMemo(() => {
    if (rolActual === 'vendedor') {
      return productos.filter((p) => {
        if (!p.equipo_asignado || p.equipo_asignado === 'AMBOS') return true;
        return p.equipo_asignado === equipoActual;
      });
    }
    return productos;
  }, [productos, rolActual, equipoActual]);

  const totalUnidades = useMemo(() => {
    return lineas.reduce((acc, curr) => acc + curr.cantidad, 0);
  }, [lineas]);

  const totalMonto = useMemo(() => {
    return lineas.reduce((acc, curr) => {
      if (!curr?.producto) return acc;
      const precio = curr.producto.precio_lista || 0;
      const desc = curr.descuento || 0;
      const sub = curr.cantidad * precio * (1 - desc / 100);
      return acc + sub;
    }, 0);
  }, [lineas]);

  // Resultados de búsqueda rápida dentro de los productos disponibles
  const productosFiltrados = useMemo(() => {
    if (!busquedaTexto.trim()) return [];
    const q = busquedaTexto.toLowerCase();
    return productosDisponibles.filter((p) => {
      const nom = (p.product || p.nombre_comercial || '').toLowerCase();
      const mol = (p.molecula || p.principio_activo || '').toLowerCase();
      const sku = (p.codigo || p.sku || '').toLowerCase();
      const ean = (p.pack_code || p.codigo_barras_ean13 || '').toLowerCase();
      return nom.includes(q) || mol.includes(q) || sku.includes(q) || ean.includes(q);
    }).slice(0, 5);
  }, [productosDisponibles, busquedaTexto]);

  const handleAgregarProductoRapido = (prod: Producto) => {
    setLineas((prev) => {
      const idx = prev.findIndex((l) => l.producto.id === prod.id);
      const empaque = prod.empaque_minimo || 1;
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx].cantidad += empaque;
        return copy;
      }
      return [
        ...prev,
        {
          producto: prod,
          cantidad: empaque,
          descuento: 0,
        },
      ];
    });
    setBusquedaTexto('');
    showToast(`Añadido: ${prod.nombre_comercial}`);
  };

  const handleEliminarLinea = (productoId: string) => {
    setLineas((prev) => prev.filter((l) => l.producto.id !== productoId));
    showToast('Producto eliminado de la orden');
  };

  const handleVaciarLista = () => {
    setLineas([]);
    showToast('Pedido vaciado');
  };

  const handleCambiarCantidad = (productoId: string, cant: number) => {
    const prod = productos.find((p) => p.id === productoId);
    const maxStock = prod?.stock_disponible || 9999;
    
    if (cant > maxStock) {
      showToast(`Stock máximo alcanzado (${maxStock} uds)`);
      return;
    }

    setLineas((prev) =>
      prev.map((l) => (l.producto.id === productoId ? { ...l, cantidad: Math.max(1, cant) } : l))
    );
  };

  const handleEnviar = () => {
    if (lineas.length === 0) {
      showToast('Agregue productos para procesar el pedido');
      return;
    }

    onTransmitirPedido(clienteId, drogueriaId, lineas, observaciones);
    showToast(`Pedido transmitido con éxito a ${drogueriaSeleccionada?.nombre_drogueria || 'Droguería'}`);
    setLineas([]);
  };

  const handleGuardarBorrador = () => {
    localStorage.setItem('PHARMA_BORRADOR_LOCAL', JSON.stringify({
      clienteId,
      drogueriaId,
      lineas,
      observaciones,
      guardadoEn: new Date().toISOString()
    }));
    showToast('Borrador guardado en memoria local');
  };

  return (
    <div className="flex flex-col w-full max-w-xl mx-auto pb-6">

      {/* Toast Notificación */}
      {toastMensaje && (
        <div className="fixed top-16 left-4 right-4 bg-[#001428] text-white py-2.5 px-4 rounded-xl shadow-lg flex items-center justify-between gap-2 z-50 animate-in fade-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#85f8c4]" />
            <span className="text-sm font-medium">{toastMensaje}</span>
          </div>
        </div>
      )}

      {/* Minimal Client Context Card (Design.md Spec) */}
      <div className="bg-[#eff4ff] border border-[#dce9ff] rounded-xl p-4 mb-4 shadow-xs">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-semibold tracking-wider text-[#43474d] uppercase">
              Cliente destino
            </span>
            <div className="relative mt-0.5">
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className="w-full bg-transparent font-bold text-base text-[#001428] truncate pr-6 focus:outline-none cursor-pointer appearance-none"
              >
                {clientesDisponibles.map((c) => (
                  <option key={c.id || c.ident01} value={c.id || c.ident01} className="text-sm text-[#001428] bg-white">
                    {c.nombre_fantasia || c.nombre_comercial || c.razon_social} ({c.ident01 || c.codigo_cliente})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[#006398] absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-[#43474d] truncate">
              <span>RIF {clienteSeleccionado?.rif || 'J-31294820-1'}</span>
              <span>·</span>
              <select
                value={drogueriaId}
                onChange={(e) => setDrogueriaId(e.target.value)}
                className="bg-transparent font-medium text-[#006398] focus:outline-none cursor-pointer"
              >
                {droguerias.map((d) => (
                  <option key={d.id} value={d.id} className="text-xs text-[#001428] bg-white">
                    {d.nombre_drogueria}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0 text-right">
            <span className="text-[11px] font-semibold text-[#43474d] uppercase">Cupo Disponible</span>
            <span className="font-mono font-bold text-sm text-[#059669] mt-0.5">
              ${clienteSeleccionado ? (clienteSeleccionado.cupo_credito || 4250).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '4,250.00'}
            </span>
          </div>
        </div>
      </div>

      {/* Fast Search & Scanner Bar (Design.md Spec) */}
      <div className="relative mb-5 space-y-2">
        <div className="relative w-full">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#74777e]" />
          <input
            type="search"
            value={busquedaTexto}
            onChange={(e) => setBusquedaTexto(e.target.value)}
            placeholder="Buscar principio activo, marca o código..."
            className="w-full h-12 pl-10 pr-24 rounded-xl bg-white border border-[#e2e8f0] text-[#001428] text-sm placeholder:text-[#74777e] focus:outline-none focus:border-[#006398] focus:ring-1 focus:ring-[#006398] transition-colors shadow-xs"
          />
          
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={onAbrirDictadoVoz}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#006398] hover:bg-[#eff4ff] transition-colors active:scale-90"
              title="Dictado por voz"
              aria-label="Dictar por voz"
            >
              <Mic className="w-4 h-4 text-[#006398]" />
            </button>
            <button
              type="button"
              onClick={onAbrirEscaner}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#001428] hover:bg-[#eff4ff] transition-colors active:scale-90"
              title="Escanear código de barras"
              aria-label="Escanear código de barras"
            >
              <Barcode className="w-5 h-5 text-[#001428]" />
            </button>
          </div>
        </div>

        {/* Menú de Autocompletado de Búsqueda */}
        {productosFiltrados.length > 0 && (
          <div className="bg-white border border-[#c3c6ce] rounded-xl shadow-lg overflow-hidden divide-y divide-[#eff4ff] z-20">
            {productosFiltrados.map((prod) => (
              <button
                key={prod.id}
                onClick={() => handleAgregarProductoRapido(prod)}
                className="w-full p-3 text-left hover:bg-[#f8f9ff] flex items-center justify-between transition-colors"
              >
                <div>
                  <div className="font-semibold text-xs text-[#001428] flex items-center gap-1.5">
                    {prod.nombre_comercial}
                    {prod.es_prioritario && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  </div>
                  <div className="text-[11px] text-[#74777e]">
                    {prod.principio_activo} · {prod.laboratorio} · Stock: {prod.stock_disponible} uds
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-xs text-[#001428]">
                    ${prod.precio_lista.toFixed(2)}
                  </span>
                  <span className="block text-[10px] text-[#006398] font-semibold">+ Agregar</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Order Items Header */}
      <div className="flex items-center justify-between px-1 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-[#001428]">Líneas del Pedido</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#006398]"></span>
          <span className="text-[11px] uppercase tracking-wider text-[#74777e] font-semibold">
            {lineas.length} {lineas.length === 1 ? 'producto' : 'productos'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onIrASugeridos}
            className="text-[11px] font-semibold text-[#006398] hover:underline flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#006398]" />
            <span>Motor Sugeridos</span>
          </button>
          {lineas.length > 0 && (
            <button
              type="button"
              onClick={handleVaciarLista}
              className="text-[11px] text-[#74777e] hover:text-[#ba1a1a] transition-colors"
            >
              Vaciar lista
            </button>
          )}
        </div>
      </div>

      {/* Item List (Tarjetas Táctiles Ergonómicas según Stitch design.md) */}
      <div className="flex flex-col gap-2.5 mb-5">
        {lineas.length === 0 ? (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-8 text-center text-xs text-[#74777e]">
            No hay productos en la orden actual. Busca por nombre o usa el lector de código de barras.
          </div>
        ) : (
          lineas.map((linea) => {
            const prod = linea.producto;
            const subtotal = linea.cantidad * prod.precio_lista * (1 - linea.descuento / 100);
            const esStockBajo = prod.stock_disponible <= 50;

            return (
              <div 
                key={prod.id} 
                className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-xs transition-all hover:border-[#cbd5e1]"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex flex-col min-w-0">
                    <h2 className="text-sm font-semibold text-[#001428] truncate flex items-center gap-1">
                      {prod.nombre_comercial}
                      {prod.es_prioritario && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                    </h2>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-[#74777e]">
                      <span>{prod.laboratorio}</span>
                      <span>·</span>
                      <span>${prod.precio_lista.toFixed(2)} c/u</span>
                      <span>·</span>
                      <span className={esStockBajo ? 'text-[#ba1a1a] font-semibold' : 'text-[#74777e]'}>
                        Stock: {prod.stock_disponible} uds
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleEliminarLinea(prod.id)}
                    className="text-[#74777e] hover:text-[#ba1a1a] p-1 rounded-md transition-colors"
                    aria-label="Eliminar producto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  {/* Stepper Táctil Ergonómico (44px) */}
                  <div className="flex items-center bg-[#eff4ff] border border-[#dce9ff] rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => handleCambiarCantidad(prod.id, linea.cantidad - (prod.empaque_minimo || 1))}
                      disabled={linea.cantidad <= 1}
                      className="w-9 h-9 flex items-center justify-center rounded text-[#001428] hover:bg-white transition-colors active:scale-90 disabled:opacity-30"
                      aria-label="Disminuir"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-mono font-bold text-sm text-[#001428] px-3 text-center min-w-[40px]">
                      {linea.cantidad}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCambiarCantidad(prod.id, linea.cantidad + (prod.empaque_minimo || 1))}
                      className="w-9 h-9 flex items-center justify-center rounded text-[#001428] hover:bg-white transition-colors active:scale-90"
                      aria-label="Aumentar"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Subtotal */}
                  <div className="text-right">
                    <span className="font-display font-bold text-base text-[#001428]">
                      ${subtotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Execution Card (Design.md Spec) */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-sm mb-3">
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-[#74777e] uppercase">Total Pedido</span>
            <span className="text-xs text-[#74777e] mt-0.5">
              {lineas.length} productos · {totalUnidades} unidades
            </span>
          </div>
          <div className="text-right">
            <span className="font-display text-2xl font-bold text-[#001428] tracking-tight">
              ${totalMonto.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Input Opcional de Observación */}
        <input
          type="text"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Instrucciones especiales de entrega..."
          className="w-full text-xs p-2.5 mb-3 rounded-lg border border-[#e2e8f0] bg-[#f8f9ff] text-[#001428] focus:outline-none focus:border-[#006398]"
        />

        <button
          type="button"
          onClick={handleEnviar}
          disabled={lineas.length === 0}
          className="w-full h-12 bg-[#0f2942] hover:bg-[#001428] text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 active:bg-[#001428] transition-all shadow-sm disabled:opacity-50 disabled:pointer-events-none active:scale-[0.99]"
        >
          <Send className="w-4 h-4" />
          <span>Confirmar y Enviar Pedido</span>
        </button>
      </div>

      {/* Secondary Local Draft Action */}
      <div className="flex justify-center py-1">
        <button
          type="button"
          onClick={handleGuardarBorrador}
          className="text-xs font-semibold text-[#74777e] hover:text-[#001428] transition-colors flex items-center gap-1.5 py-1.5 px-3 rounded-lg"
        >
          <Save className="w-3.5 h-3.5 text-[#006398]" />
          <span>Guardar borrador local</span>
        </button>
      </div>

    </div>
  );
};
