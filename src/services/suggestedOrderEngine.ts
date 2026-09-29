import { Cliente, Producto, HistoricoPedidoPrevio, PedidoCabecera, PedidoDetalle, SugeridoItem, ParametrosSugerido } from '../types/pharmacy';

/**
 * MOTOR DE PEDIDO SUGERIDO GLOBAL (FASE 1)
 * 
 * Regla de negocio fundamental:
 * - Evalúa el historial consolidado de compra del cliente sin segregar por Equipo A o Equipo B.
 * - Soporta ventanas temporales de 30, 60 y 90 días.
 * - Pondera productos prioritarios estratégicos multiplicando por su factor de prioridad.
 * - Redondea las unidades recomendadas al múltiplo de empaque mínimo (blíster, caja o fardo).
 * - Sugiere un descuento comercial competitivo respetando el descuento_maximo_porc del vademécum.
 * - Si un producto es prioritario pero no registra compras recientes, sugiere una colocación inicial mínima.
 */
export function calcularPedidoSugeridoLocal(
  cliente: Cliente,
  productos: Producto[],
  historicoPrevio: HistoricoPedidoPrevio[],
  pedidosCabecera: PedidoCabecera[],
  pedidosDetalle: PedidoDetalle[],
  parametros: ParametrosSugerido
): SugeridoItem[] {
  const { dias_analisis, factor_crecimiento, solo_con_historia, incluir_prioritarios_sin_historia } = parametros;
  
  // Fecha límite de corte hacia atrás
  const fechaCorte = new Date();
  fechaCorte.setDate(fechaCorte.getDate() - dias_analisis);
  const corteIso = fechaCorte.toISOString().slice(0, 10);

  // Las fechas ISO (YYYY-MM-DD) se comparan como texto; solo los formatos raros pasan por Date.
  const esAnteriorAlCorte = (fechaTexto: string): boolean => {
    if (/^\d{4}-\d{2}-\d{2}/.test(fechaTexto)) return fechaTexto.slice(0, 10) < corteIso;
    const fecha = new Date(fechaTexto);
    return !isNaN(fecha.getTime()) && fecha < fechaCorte;
  };

  // Mapa de agregación por producto_id
  const metricasPorProducto = new Map<string, {
    totalUnidades: number;
    unidadesEquipoA: number;
    unidadesEquipoB: number;
    frecuenciaPedidos: number;
    descuentosPonderadosSuma: number;
  }>();

  // Textos del cliente normalizados una sola vez (antes se recalculaban en cada fila del histórico).
  const idsCliente = new Set(
    [cliente.id, cliente.ident01, cliente.codigo_cliente, cliente.rif].filter((v): v is string => !!v)
  );
  const idsPedido = new Set([cliente.id, cliente.ident01, cliente.codigo_cliente].filter((v): v is string => !!v));
  const nombreFantasia = (cliente.nombre_fantasia || '').toLowerCase();
  const razonSocial = (cliente.razon_social || '').toLowerCase();

  // 1. Procesar el histórico de compras cargado (ventas de las droguerías)
  historicoPrevio.forEach((h) => {
    const nombreFila = h.nombre_cliente ? h.nombre_cliente.toLowerCase() : '';
    const esEsteCliente =
      idsCliente.has(h.cliente_id) ||
      (nombreFila !== '' && nombreFantasia !== '' && nombreFila.includes(nombreFantasia)) ||
      (nombreFila !== '' && razonSocial !== '' && nombreFila.includes(razonSocial));

    if (!esEsteCliente) return;
    if (esAnteriorAlCorte(h.fecha_pedido)) return;

    const actual = 
      metricasPorProducto.get(h.producto_id) || 
      (h.cod_sap ? metricasPorProducto.get(h.cod_sap) : undefined) || {
        totalUnidades: 0,
        unidadesEquipoA: 0,
        unidadesEquipoB: 0,
        frecuenciaPedidos: 0,
        descuentosPonderadosSuma: 0,
      };

    actual.totalUnidades += (h.cantidad_facturada || h.cantidad_solicitada || 0);
    const eq = (h.equipo_origen || '').toUpperCase();
    if (eq.includes('A') || eq.includes('SANTE')) {
      actual.unidadesEquipoA += (h.cantidad_facturada || 0);
    } else {
      actual.unidadesEquipoB += (h.cantidad_facturada || 0);
    }
    actual.frecuenciaPedidos += 1;
    actual.descuentosPonderadosSuma += (h.descuento_porcentaje || 0) * (h.cantidad_facturada || 1);

    metricasPorProducto.set(h.producto_id, actual);
    if (h.cod_sap) metricasPorProducto.set(h.cod_sap, actual);
    if (h.codigo_producto_drogueria) metricasPorProducto.set(h.codigo_producto_drogueria, actual);
  });

  // 2. Procesar los pedidos de la plataforma ya procesados
  const pedidosClienteRecientes = pedidosCabecera.filter((pc) => {
    if (!idsPedido.has(pc.cliente_id)) return false;
    if (esAnteriorAlCorte(pc.fecha_pedido)) return false;
    return pc.estado === 'procesado_total' || pc.estado === 'procesado_parcial' || pc.estado === 'facturado';
  });

  if (pedidosClienteRecientes.length > 0) {
    // Detalles indexados por pedido: evita recorrer todos los detalles por cada pedido.
    const detallesPorPedido = new Map<string, PedidoDetalle[]>();
    pedidosDetalle.forEach((pd) => {
      const lista = detallesPorPedido.get(pd.pedido_id);
      if (lista) lista.push(pd);
      else detallesPorPedido.set(pd.pedido_id, [pd]);
    });

    pedidosClienteRecientes.forEach((pc) => {
      (detallesPorPedido.get(pc.id) ?? []).forEach((det) => {
        const actual = metricasPorProducto.get(det.producto_id) || {
          totalUnidades: 0,
          unidadesEquipoA: 0,
          unidadesEquipoB: 0,
          frecuenciaPedidos: 0,
          descuentosPonderadosSuma: 0,
        };

        actual.totalUnidades += det.cantidad_confirmada;
        if (pc.equipo_origen === 'A') {
          actual.unidadesEquipoA += det.cantidad_confirmada;
        } else {
          actual.unidadesEquipoB += det.cantidad_confirmada;
        }
        actual.frecuenciaPedidos += 1;
        actual.descuentosPonderadosSuma += det.descuento_porcentaje * det.cantidad_confirmada;

        metricasPorProducto.set(det.producto_id, actual);
      });
    });
  }

  // 3. Generar la lista de sugeridos para el vademécum activo
  const resultado: SugeridoItem[] = [];

  for (const prod of productos) {
    if (!prod.activo) continue;

    const metricas = 
      metricasPorProducto.get(prod.id) || 
      (prod.sku ? metricasPorProducto.get(prod.sku) : undefined) || 
      (prod.codigo ? metricasPorProducto.get(prod.codigo) : undefined);
    const totalUnidades = metricas?.totalUnidades || 0;
    const frecuencia = metricas?.frecuenciaPedidos || 0;
    const unidadesA = metricas?.unidadesEquipoA || 0;
    const unidadesB = metricas?.unidadesEquipoB || 0;

    // Filtros de inclusión
    if (totalUnidades === 0 && !prod.es_prioritario && solo_con_historia) {
      continue;
    }
    if (totalUnidades === 0 && !incluir_prioritarios_sin_historia) {
      continue;
    }
    if (totalUnidades === 0 && !prod.es_prioritario) {
      continue;
    }

    // Promedio mensual normalizado a 30 días
    const promedioMensual = Number(((totalUnidades / dias_analisis) * 30).toFixed(2));

    let sugeridoCalculado = 0;
    let explicacion = '';

    if (totalUnidades > 0) {
      // Demanda base proyectada con factor de crecimiento y ponderador estratégico
      const factorPrioridad = prod.es_prioritario ? (prod.factor_prioridad || 1.25) : 1.0;
      const baseProyectada = promedioMensual * factor_crecimiento * factorPrioridad;
      
      // Redondeo hacia arriba al múltiplo del empaque mínimo
      const empaque = Math.max(1, prod.empaque_minimo || 1);
      sugeridoCalculado = Math.ceil(baseProyectada / empaque) * empaque;
      
      // Mínimo al menos un empaque si hubo ventas
      if (sugeridoCalculado < empaque && totalUnidades > 0) {
        sugeridoCalculado = empaque;
      }

      explicacion = `Compró ${totalUnidades} uds en ${dias_analisis}d (${unidadesA} Eq.A + ${unidadesB} Eq.B). ` +
        `Velocidad: ${promedioMensual} uds/mes. ` +
        (prod.es_prioritario ? `SKU Prioritario (x${factorPrioridad.toFixed(2)}). ` : '') +
        (factor_crecimiento !== 1.0 ? `Crecimiento ${(factor_crecimiento * 100).toFixed(0)}%. ` : '') +
        `Ajustado a embalaje x${empaque}.`;
    } else if (prod.es_prioritario) {
      // SKU prioritario sin historial en este cliente
      sugeridoCalculado = Math.max(1, prod.empaque_minimo || 1);
      explicacion = `SKU Estratégico prioritario sin compra en los últimos ${dias_analisis} días. ` +
        `Se sugiere lote mínimo de penetración (${sugeridoCalculado} uds).`;
    }

    // Descuento sugerido: ponderado histórico o 75% del máximo permitido
    const descMax = typeof prod.descuento_maximo_porc === 'number' ? prod.descuento_maximo_porc : 15;
    let descuentoSugerido = 0;
    if (totalUnidades > 0 && metricas && metricas.descuentosPonderadosSuma > 0) {
      descuentoSugerido = Number((metricas.descuentosPonderadosSuma / totalUnidades).toFixed(2));
    } else {
      descuentoSugerido = Number((descMax * 0.75).toFixed(2));
    }
    // Asegurar que no exceda el límite del producto
    descuentoSugerido = Math.min(descMax, Math.max(0, descuentoSugerido));

    resultado.push({
      producto_id: prod.id,
      sku: prod.sku || prod.codigo || prod.id,
      codigo_barras: prod.codigo_barras_ean13 || prod.pack_code || '',
      nombre_comercial: prod.nombre_comercial || prod.product || 'Medicamento',
      principio_activo: prod.principio_activo || prod.molecula || '',
      laboratorio: prod.laboratorio || prod.unidad_negocio || 'Laboratorio',
      precio_lista: typeof prod.precio_lista === 'number' ? prod.precio_lista : 0,
      descuento_maximo_porc: descMax,
      es_prioritario: !!prod.es_prioritario,
      factor_prioridad: prod.factor_prioridad || 1.25,
      empaque_minimo: prod.empaque_minimo || 1,
      stock_disponible: typeof prod.stock_disponible === 'number' ? prod.stock_disponible : 500,
      total_unidades_historicas: totalUnidades,
      frecuencia_pedidos: frecuencia,
      compras_equipo_a: unidadesA,
      compras_equipo_b: unidadesB,
      promedio_mensual: promedioMensual,
      sugerido_calculado: sugeridoCalculado,
      descuento_sugerido: descuentoSugerido,
      explicacion_algoritmo: explicacion,
    });
  }

  // Ordenar: Prioritarios primero, luego mayor volumen sugerido
  return resultado.sort((a, b) => {
    if (a.es_prioritario && !b.es_prioritario) return -1;
    if (!a.es_prioritario && b.es_prioritario) return 1;
    return b.sugerido_calculado - a.sugerido_calculado;
  });
}
