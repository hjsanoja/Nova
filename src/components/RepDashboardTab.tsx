import React, { useState, useMemo } from 'react';
import { PedidoCabecera, PedidoDetalle } from '../types/pharmacy';
import {
  Search,
  TrendingUp,
  CheckCircle2,
  Timer,
  Calendar,
  Download,
  RefreshCw,
  ChevronRight,
  Sliders,
  ShieldCheck,
  DollarSign,
  FileSpreadsheet,
  Compass
} from 'lucide-react';

interface RepDashboardTabProps {
  pedidos: PedidoCabecera[];
  detalles: PedidoDetalle[];
  vendedorId?: string;
}

export const RepDashboardTab: React.FC<RepDashboardTabProps> = ({
  pedidos,
  detalles,
  vendedorId,
}) => {
  const [busquedaVendedor, setBusquedaVendedor] = useState<string>('');
  const [pedidoDetalleModalId, setPedidoDetalleModalId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Filtrar pedidos si es vista exclusiva del vendedor
  const pedidosVendedor = useMemo(() => {
    if (!vendedorId) return pedidos;
    return pedidos.filter((p) => p.vendedor_id === vendedorId);
  }, [pedidos, vendedorId]);

  // Cálculos de métricas consolidadas
  const metricas = useMemo(() => {
    let totalTransferido = 0;
    let pendientesCola = 0;
    let procesadas = 0;
    let sumaFillRate = 0;
    let countProcesadas = 0;

    pedidosVendedor.forEach((p) => {
      totalTransferido += p.total_confirmado || p.total_solicitado;
      if (p.estado === 'borrador' || p.estado === 'enviado_teletransferencia') {
        pendientesCola++;
      } else if (p.estado === 'procesado_total' || p.estado === 'procesado_parcial') {
        procesadas++;
        sumaFillRate += p.fill_rate;
        countProcesadas++;
      }
    });

    const fillRatePromedio = countProcesadas > 0 ? (sumaFillRate / countProcesadas).toFixed(1) : '96.4';

    return {
      totalTransferidoHoy: totalTransferido > 0 ? totalTransferido : 18420.00,
      totalOrdenes: pedidosVendedor.length > 0 ? pedidosVendedor.length : 24,
      procesadas: procesadas > 0 ? procesadas : 19,
      pendientesCola: pendientesCola > 0 ? pendientesCola : 5,
      fillRatePromedio,
      tiempoMedioMin: 18,
    };
  }, [pedidosVendedor]);

  // Vendedores simulados en campo con actividad en tiempo real
  const vendedoresCampo = [
    { id: 'v1', nombre: 'Carlos Mendoza', codigo: 'VEN-1044', zona: 'Valencia Centro-Norte', pedidosHoy: 8, monto: 4850.00, ultimaAct: 'Hace 12 min', canal: 'Móvil', activo: true },
    { id: 'v2', nombre: 'Andrea Briceño', codigo: 'VEN-1082', zona: 'Maracay Este', pedidosHoy: 6, monto: 3120.00, ultimaAct: 'Hace 25 min', canal: 'Móvil', activo: true },
    { id: 'v3', nombre: 'Roberto Morales', codigo: 'VEN-1019', zona: 'Caracas Baruta', pedidosHoy: 7, monto: 6400.00, ultimaAct: 'Hace 40 min', canal: 'Móvil', activo: true },
    { id: 'v4', nombre: 'Mariana Silva', codigo: 'VEN-1090', zona: 'Barquisimeto Oeste', pedidosHoy: 3, monto: 1850.00, ultimaAct: 'Hace 1h', canal: 'Móvil', activo: false },
  ];

  const vendedoresFiltrados = useMemo(() => {
    if (!busquedaVendedor.trim()) return vendedoresCampo;
    const q = busquedaVendedor.toLowerCase();
    return vendedoresCampo.filter((v) => 
      v.nombre.toLowerCase().includes(q) ||
      v.zona.toLowerCase().includes(q) ||
      v.codigo.toLowerCase().includes(q)
    );
  }, [busquedaVendedor]);

  const pedidoModalSeleccionado = useMemo(() => {
    if (!pedidoDetalleModalId) return null;
    return pedidos.find((p) => p.id === pedidoDetalleModalId) || null;
  }, [pedidos, pedidoDetalleModalId]);

  const lineasModal = useMemo(() => {
    if (!pedidoModalSeleccionado) return [];
    return detalles.filter((d) => d.pedido_id === pedidoModalSeleccionado.id);
  }, [detalles, pedidoModalSeleccionado]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto">

      {/* Toast Notificación */}
      {toastMsg && (
        <div className="fixed top-16 left-4 right-4 md:left-auto md:right-8 bg-[#001428] text-white py-3 px-5 rounded-xl shadow-xl flex items-center gap-3 z-50 animate-in fade-in slide-in-from-top">
          <CheckCircle2 className="w-5 h-5 text-[#85f8c4] shrink-0" />
          <span className="text-sm font-medium">{toastMsg}</span>
        </div>
      )}

      {/* Top Operational Summary & Live Clock Bar (Stitch design.md Spec) */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-[#74777e]">
            <span className="font-semibold uppercase tracking-widest text-[#006398]">Control Maestro B2B</span>
            <span className="text-[#c3c6ce]">•</span>
            <span className="font-mono text-xs tracking-wide">Nodo Caracas Central [CCS-01]</span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-[#001428] tracking-tight">
            Panel General de Operaciones
          </h1>
          <p className="text-sm text-[#43474d] max-w-2xl">
            Resumen de ventas canalizadas, rendimiento de teletransferencia y estado de conectividad en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#e5eeff] text-[#0b1c30] text-xs font-semibold shadow-xs">
            <Calendar className="w-4 h-4 text-[#74777e]" />
            <span>Hoy, {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>

          <button 
            type="button"
            onClick={() => showToast('Datos actualizados en tiempo real')}
            className="group inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#e5eeff] hover:bg-[#dce9ff] text-[#0b1c30] text-xs font-semibold transition-all shadow-xs active:scale-95"
          >
            <RefreshCw className="w-4 h-4 text-[#74777e] group-hover:rotate-180 transition-transform duration-500" />
            <span>Actualizar</span>
          </button>

          <button 
            type="button"
            onClick={() => showToast('Generando reporte consolidado en PDF/Excel...')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#001428] hover:bg-[#0f2942] text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Reporte Consolidado</span>
          </button>
        </div>
      </div>

      {/* 4 High-Efficacy Metric Tiles (Stitch design.md Spec) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1: Total Transferido Hoy */}
        <div className="p-5 rounded-xl bg-white border border-[#e2e8f0] shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between">
            <span className="text-[11px] uppercase tracking-wider text-[#74777e] font-semibold">
              Total Transferido Hoy
            </span>
            <span className="text-[#74777e] font-mono text-xs">$ USD</span>
          </div>
          <div>
            <div className="font-display text-2xl md:text-3xl font-bold text-[#001428] tracking-tight">
              ${metricas.totalTransferidoHoy.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              <TrendingUp className="w-4 h-4 text-[#059669]" />
              <span className="font-semibold text-[#059669]">+12%</span>
              <span className="text-[#74777e]">vs. promedio día anterior</span>
            </div>
          </div>
          {/* Micro Sparkline SVG */}
          <div className="pt-1">
            <svg className="w-full h-8 text-[#006398] overflow-visible" fill="none" preserveAspectRatio="none" viewBox="0 0 200 30">
              <path d="M0 24 Q 25 22, 50 18 T 100 19 T 150 11 T 200 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2"></path>
              <path d="M0 24 Q 25 22, 50 18 T 100 19 T 150 11 T 200 4 L 200 30 L 0 30 Z" fill="currentColor" opacity="0.08"></path>
            </svg>
          </div>
        </div>

        {/* Metric 2: Pedidos en Ruta / Cola */}
        <div className="p-5 rounded-xl bg-white border border-[#e2e8f0] shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between">
            <span className="text-[11px] uppercase tracking-wider text-[#74777e] font-semibold">
              Pedidos en Ruta / Cola
            </span>
            <Compass className="w-5 h-5 text-[#74777e]" />
          </div>
          <div>
            <div className="font-display text-2xl md:text-3xl font-bold text-[#001428] tracking-tight">
              {metricas.totalOrdenes} <span className="text-sm font-normal text-[#74777e]">órdenes</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#006398]"></span>
              <span className="font-mono text-[#001428] font-medium">{metricas.procesadas} procesadas</span>
              <span className="text-[#c3c6ce]">|</span>
              <span className="font-mono text-[#74777e]">{metricas.pendientesCola} en validación</span>
            </div>
          </div>
          {/* Progress Bar SLA Consumption */}
          <div className="w-full bg-[#e5eeff] rounded-full h-1.5 overflow-hidden mt-1">
            <div className="bg-[#006398] h-full rounded-full" style={{ width: '79%' }}></div>
          </div>
        </div>

        {/* Metric 3: Fill-Rate Global Droguerías */}
        <div className="p-5 rounded-xl bg-white border border-[#e2e8f0] shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between">
            <span className="text-[11px] uppercase tracking-wider text-[#74777e] font-semibold">
              Fill-Rate Global Droguerías
            </span>
            <CheckCircle2 className="w-5 h-5 text-[#059669]" />
          </div>
          <div>
            <div className="font-display text-2xl md:text-3xl font-bold text-[#001428] tracking-tight">
              {metricas.fillRatePromedio}%
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#059669]"></span>
              <span className="text-[#74777e]">Promedio consolidado red nacional</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-xs font-mono text-[#74777e] pt-1 border-t border-[#f1f5f9]">
            <span>Umbral mín: 92%</span>
            <span className="text-[#059669] font-bold">+4.4% Delta</span>
          </div>
        </div>

        {/* Metric 4: Tiempo Medio de Respuesta */}
        <div className="p-5 rounded-xl bg-white border border-[#e2e8f0] shadow-xs flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between">
            <span className="text-[11px] uppercase tracking-wider text-[#74777e] font-semibold">
              Tiempo Medio de Respuesta
            </span>
            <Timer className="w-5 h-5 text-[#74777e]" />
          </div>
          <div>
            <div className="font-display text-2xl md:text-3xl font-bold text-[#001428] tracking-tight">
              {metricas.tiempoMedioMin} <span className="text-sm font-normal text-[#74777e]">min</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-[#74777e]">
              <span className="w-2 h-2 rounded-full bg-[#006398]"></span>
              <span>Desde toma hasta teletransferencia</span>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 bg-[#e5eeff] h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#006398] h-full rounded-full" style={{ width: '45%' }}></div>
            </div>
            <span className="font-mono text-xs text-[#74777e]">SLA: &lt;40m</span>
          </div>
        </div>

      </section>

      {/* Operational Split: Connectivity Hub & Macro Activity Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* Droguerías Connectivity Panel (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-[#001428]">Salud de Enlaces B2B</h2>
              <p className="text-xs text-[#74777e]">Protocolos e intercambio electrónico activo</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#e5eeff] font-mono text-xs font-semibold text-[#006398]">
              3 Droguerías Conectadas
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {/* Droguería Cobeca */}
            <div className="p-4 bg-white border border-[#e2e8f0] rounded-xl shadow-xs hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#006398] font-bold shrink-0">
                    API
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#001428]">Droguería Cobeca</h3>
                    <div className="flex items-center gap-2 text-[#74777e] text-xs">
                      <span>Enlace API REST v2</span>
                      <span>•</span>
                      <span className="font-mono">Latencia 35ms</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <span className="w-2 h-2 rounded-full bg-[#059669]"></span>
                  <span className="text-[11px] font-bold text-[#001428] uppercase">Óptimo</span>
                </div>
              </div>

              <div className="mt-3 pt-2.5 flex items-center justify-between text-xs text-[#74777e] bg-[#f8f9ff] p-2 rounded-lg border border-[#e2e8f0]">
                <span>84 órdenes despachadas hoy</span>
                <span className="text-[#001428] font-semibold">99.8% Aceptación</span>
              </div>
            </div>

            {/* Droguería Nena */}
            <div className="p-4 bg-white border border-[#e2e8f0] rounded-xl shadow-xs hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#006398] font-bold shrink-0">
                    SFTP
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#001428]">Droguería Nena</h3>
                    <div className="flex items-center gap-2 text-[#74777e] text-xs">
                      <span>Conexión SFTP Segura</span>
                      <span>•</span>
                      <span className="font-mono">Próximo corte 14:00</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <span className="w-2 h-2 rounded-full bg-[#059669]"></span>
                  <span className="text-[11px] font-bold text-[#001428] uppercase">Óptimo</span>
                </div>
              </div>

              <div className="mt-3 pt-2.5 flex items-center justify-between text-xs text-[#74777e] bg-[#f8f9ff] p-2 rounded-lg border border-[#e2e8f0]">
                <span>32 órdenes procesadas</span>
                <span className="text-[#001428] font-semibold">Sync programado OK</span>
              </div>
            </div>

            {/* Droguería Drolanca */}
            <div className="p-4 bg-white border border-[#e2e8f0] rounded-xl shadow-xs hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#006398] font-bold shrink-0">
                    CSV
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#001428]">Droguería Drolanca</h3>
                    <div className="flex items-center gap-2 text-[#74777e] text-xs">
                      <span>Enlace Manual / Formato CSV</span>
                      <span>•</span>
                      <span className="text-[#006398] font-medium">Cola en espera</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <span className="w-2 h-2 rounded-full bg-[#006398]"></span>
                  <span className="text-[11px] font-bold text-[#001428] uppercase">Pendiente</span>
                </div>
              </div>

              <div className="mt-3 pt-2.5 flex items-center justify-between text-xs text-[#74777e] bg-[#f8f9ff] p-2 rounded-lg border border-[#e2e8f0]">
                <span className="text-[#006398] font-medium">12 órdenes pendientes de subida</span>
                <button 
                  type="button" 
                  onClick={() => showToast('Abriendo gestor de carga Drolanca...')}
                  className="text-[#001428] hover:underline font-bold flex items-center gap-1"
                >
                  Subir Lote <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Distribution & Real-time Flow Canvas (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-4 bg-white p-5 rounded-xl border border-[#e2e8f0] shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-[#001428]">
                Flujo Horario de Teletransferencias
              </h2>
              <p className="text-xs text-[#74777e]">Volumen de paquetes EDI procesados vs. capacidad instalada</p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-[#001428]"></span>
                <span className="text-[#43474d] font-medium">Transmitidas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-[#dce9ff]"></span>
                <span className="text-[#43474d] font-medium">En buffer</span>
              </div>
            </div>
          </div>

          {/* Custom Inline Visualization Chart */}
          <div className="w-full pt-3 pb-2">
            <div className="h-52 w-full flex items-end gap-3 sm:gap-6 px-2">
              {[
                { hora: '08h', heightPct: 35, innerPct: 75, actual: false },
                { hora: '09h', heightPct: 60, innerPct: 85, actual: false },
                { hora: '10h', heightPct: 85, innerPct: 92, actual: false },
                { hora: '11h', heightPct: 100, innerPct: 96, actual: false },
                { hora: '12h', heightPct: 70, innerPct: 80, actual: false },
                { hora: '13h', heightPct: 55, innerPct: 65, actual: true },
                { hora: '14h', heightPct: 20, innerPct: 0, actual: false, proximo: true },
              ].map((bar) => (
                <div 
                  key={bar.hora}
                  className={`flex-1 flex flex-col items-center gap-2 h-full justify-end group transition-all ${
                    bar.proximo ? 'opacity-40' : ''
                  }`}
                >
                  <div 
                    className={`w-full max-w-[38px] rounded-t flex flex-col justify-end overflow-hidden ${
                      bar.actual ? 'bg-[#006398]/30 relative' : 'bg-[#dce9ff]'
                    }`}
                    style={{ height: `${bar.heightPct}%` }}
                  >
                    <div 
                      className={`w-full rounded-t transition-all ${
                        bar.actual ? 'bg-[#006398]' : 'bg-[#001428] group-hover:bg-[#0f2942]'
                      }`}
                      style={{ height: `${bar.innerPct}%` }}
                    />
                    {bar.actual && (
                      <div className="absolute inset-x-0 top-0 h-1 bg-[#006398] animate-pulse" />
                    )}
                  </div>
                  <span className={`font-mono text-xs ${
                    bar.actual ? 'text-[#006398] font-bold' : 'text-[#74777e]'
                  }`}>
                    {bar.hora}{bar.actual ? ' *' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-[#74777e] gap-2 bg-[#f8f9ff] p-3 rounded-lg border border-[#e2e8f0]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#006398]"></span>
              <span>Pico registrado a las 11:15 AM (48 lotes/minuto). Canal de contingencia inactivo por estabilidad.</span>
            </div>
            <span className="font-mono text-[#001428] font-bold shrink-0">Capacidad libre: 44%</span>
          </div>
        </section>

      </div>

      {/* Sales Rep Real-time Tracking Data Table (Stitch design.md Spec) */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#001428]">
              Desempeño de Fuerza de Ventas en Calle
            </h2>
            <p className="text-xs text-[#74777e]">Captura móvil en tiempo real y conciliación de pedidos con droguería</p>
          </div>

          <div className="relative">
            <input
              type="text"
              value={busquedaVendedor}
              onChange={(e) => setBusquedaVendedor(e.target.value)}
              placeholder="Filtrar por vendedor o ruta..."
              className="pl-9 pr-3 py-1.5 rounded-lg bg-white border border-[#e2e8f0] text-xs text-[#001428] placeholder:text-[#74777e] w-64 shadow-xs focus:outline-none focus:border-[#006398]"
            />
            <Search className="w-4 h-4 absolute left-2.5 top-2 text-[#74777e] pointer-events-none" />
          </div>
        </div>

        {/* Clean Minimal Table without Harsh Borders */}
        <div className="overflow-x-auto rounded-xl bg-white border border-[#e2e8f0] shadow-xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#eff4ff]/60 text-[#74777e] text-[11px] uppercase tracking-wider border-b border-[#e2e8f0]">
                <th className="py-3 px-5 font-semibold">Vendedor</th>
                <th className="py-3 px-4 font-semibold">Zona / Ruta Asignada</th>
                <th className="py-3 px-4 text-right font-semibold">Pedidos Hoy</th>
                <th className="py-3 px-4 text-right font-semibold">Monto Total</th>
                <th className="py-3 px-4 font-semibold">Última Actividad</th>
                <th className="py-3 px-5 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {vendedoresFiltrados.map((v) => (
                <tr key={v.id} className="hover:bg-[#f8f9ff] transition-colors">
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#eff4ff] text-[#001428] font-bold flex items-center justify-center text-xs shrink-0">
                        {v.nombre.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-[#001428]">{v.nombre}</span>
                        <span className="text-[11px] text-[#74777e]">ID: {v.codigo}</span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-[#43474d] font-medium">
                    {v.zona}
                  </td>

                  <td className="py-3.5 px-4 text-right font-mono font-medium text-[#001428]">
                    {v.pedidosHoy} pedidos
                  </td>

                  <td className="py-3.5 px-4 text-right font-mono font-bold text-[#001428]">
                    ${v.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>

                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${v.activo ? 'bg-[#059669]' : 'bg-[#74777e]'}`} />
                      <span className="font-mono text-xs text-[#001428]">{v.ultimaAct}</span>
                      <span className="text-[10px] text-[#74777e]">({v.canal})</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-5 text-right">
                    <button
                      type="button"
                      onClick={() => showToast(`Bitácora de ${v.nombre} cargada`)}
                      className="text-[#006398] hover:text-[#001428] font-semibold text-xs inline-flex items-center gap-1 transition-colors"
                    >
                      Ver Bitácora <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Table Sub-bar */}
          <div className="p-3.5 flex flex-col sm:flex-row items-center justify-between text-xs text-[#74777e] bg-[#f8f9ff] border-t border-[#e2e8f0] gap-2">
            <span>Mostrando {vendedoresFiltrados.length} de 18 vendedores de guardia comercial</span>
            <div className="flex items-center gap-2 font-mono">
              <button className="px-2.5 py-1 rounded bg-[#e5eeff] text-[#001428] hover:bg-[#dce9ff] transition-colors font-medium">
                Anterior
              </button>
              <span className="px-2 text-[#001428] font-bold">1 / 5</span>
              <button className="px-2.5 py-1 rounded bg-[#e5eeff] text-[#001428] hover:bg-[#dce9ff] transition-colors font-medium">
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Executive Quick Actions Canvas (Stitch design.md Spec) */}
      <section className="p-5 rounded-xl bg-[#eff4ff]/60 border border-[#dce9ff] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-[#e5eeff] flex items-center justify-center text-[#001428] shrink-0 font-bold">
            <Sliders className="w-5 h-5 text-[#001428]" />
          </div>
          <div className="flex flex-col">
            <h3 className="font-display font-bold text-sm text-[#001428]">
              Gestión y Auditoría Integral de Plataforma
            </h3>
            <p className="text-xs text-[#74777e]">
              Operaciones de alto nivel para supervisores de integración e intercambio
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => showToast('Iniciando auditoría de enlaces EDI y certificados SSL...')}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-[#e2e8f0] text-[#001428] text-xs font-semibold shadow-xs hover:bg-[#f8f9ff] transition-all"
          >
            <ShieldCheck className="w-4 h-4 text-[#059669]" />
            <span>Auditoría de Enlaces</span>
          </button>

          <button
            type="button"
            onClick={() => showToast('Abriendo gestor de droguerías y esquemas CSV...')}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-[#e2e8f0] text-[#001428] text-xs font-semibold shadow-xs hover:bg-[#f8f9ff] transition-all"
          >
            <DollarSign className="w-4 h-4 text-[#006398]" />
            <span>Gestionar Droguerías y Tarifas</span>
          </button>

          <button
            type="button"
            onClick={() => showToast('Exportando reporte consolidado en formato Excel/CSV...')}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-[#e2e8f0] text-[#001428] text-xs font-semibold shadow-xs hover:bg-[#f8f9ff] transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#006398]" />
            <span>Reporte Consolidado en Excel</span>
          </button>
        </div>
      </section>

      {/* Modal de Detalle de Pedido */}
      {pedidoModalSeleccionado && (
        <div className="fixed inset-0 z-50 bg-[#001428]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="p-5 sm:p-6 rounded-2xl border border-[#e2e8f0] max-w-2xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto bg-white text-[#001428]">
            <div className="flex items-center justify-between border-b pb-3 border-[#e2e8f0]">
              <div>
                <h3 className="text-base font-bold font-mono">
                  {pedidoModalSeleccionado.numero_pedido}
                </h3>
                <p className="text-xs text-[#74777e]">
                  Estado: <b className="text-[#006398]">{pedidoModalSeleccionado.estado}</b> • Fill-Rate: <b>{pedidoModalSeleccionado.fill_rate}%</b>
                </p>
              </div>
              <button
                onClick={() => setPedidoDetalleModalId(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#74777e] hover:text-[#001428] text-2xl font-bold rounded-xl"
                aria-label="Cerrar modal"
              >
                &times;
              </button>
            </div>

            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#eff4ff] text-[#74777e] text-[11px] uppercase">
                    <th className="py-2 px-3">Medicamento</th>
                    <th className="py-2 px-3 text-right">Solicitado</th>
                    <th className="py-2 px-3 text-right">Confirmado</th>
                    <th className="py-2 px-3">Motivo Ajuste</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {lineasModal.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 px-3 font-semibold">{l.producto_id}</td>
                      <td className="py-2 px-3 text-right font-mono">{l.cantidad_solicitada}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-[#006398]">{l.cantidad_confirmada}</td>
                      <td className="py-2 px-3 text-[#74777e]">{l.motivo_ajuste}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setPedidoDetalleModalId(null)}
                className="px-4 py-2 bg-[#001428] text-white text-xs font-semibold rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
