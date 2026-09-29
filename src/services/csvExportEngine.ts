import { Drogueria, PedidoCabecera, PedidoDetalle, Cliente, Producto, ColumnaCsvConfig } from '../types/pharmacy';

export interface CsvExportResult {
  filename: string;
  content: string;
  mimeType: string;
  totalLineas: number;
}

/**
 * MOTOR DE EXPORTACIÓN DINÁMICA DE CSV POR DROGUERÍA
 * Interpreta la configuración JSONB almacenada en dim_droguerias.formato_csv_config
 * para transformar las líneas de pedido al formato exigido por cada droguería.
 */
export function generarCsvDrogueria(
  pedido: PedidoCabecera,
  detalles: PedidoDetalle[],
  cliente: Cliente,
  drogueria: Drogueria,
  productosMap: Map<string, Producto>
): CsvExportResult {
  const config = drogueria?.formato_csv_config || {
    delimitador: ';',
    incluir_encabezados: true,
    entrecomillado: 'solo_texto',
    salto_linea: '\r\n',
    formato_decimal: 'coma',
    columnas: []
  };
  const delimitador = config.delimitador || ';';
  const incluir_encabezados = config.incluir_encabezados !== false;
  const entrecomillado = config.entrecomillado || 'solo_texto';
  const formato_decimal = config.formato_decimal || 'coma';
  const salto_linea = config.salto_linea || '\r\n';
  const columnas = Array.isArray(config.columnas) ? config.columnas : [];

  // Ordenar columnas según su atributo 'orden'
  const columnasOrdenadas = [...columnas].sort((a, b) => (a.orden || 0) - (b.orden || 0));

  const lineas: string[] = [];

  // 1. Encabezados (si aplica)
  if (incluir_encabezados) {
    const encabezados = columnasOrdenadas.map((col) => {
      return formatearCampo(col.nombre_encabezado || 'CAMPO', 'texto', entrecomillado);
    });
    lineas.push(encabezados.join(delimitador));
  }

  // 2. Líneas de detalle del pedido
  for (const det of detalles) {
    // Si la cantidad confirmada es 0, no se envía a despacho
    if (det.cantidad_confirmada <= 0) continue;

    const producto = productosMap.get(det.producto_id);

    const camposFila = columnasOrdenadas.map((col) => {
      const valorCrudo = extraerValorCampo(col, pedido, det, cliente, producto);
      return formatearCampoSegunTipo(valorCrudo, col, formato_decimal, entrecomillado);
    });

    lineas.push(camposFila.join(delimitador));
  }

  const csvContent = lineas.join(salto_linea);

  // Formato de nombre de archivo limpio: TELETRANSFERENCIA_[DROGUERIA]_[NUM_PEDIDO].csv
  const nombreLimpio = (drogueria?.nombre_drogueria || 'DROGUERIA').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `TRANSFER_${nombreLimpio}_${pedido?.numero_pedido || 'ORDEN'}.csv`;

  return {
    filename,
    content: csvContent,
    mimeType: 'text/csv;charset=utf-8;',
    totalLineas: lineas.length - (incluir_encabezados ? 1 : 0),
  };
}

/**
 * Extrae el valor correspondiente según la definición de campo_origen
 */
function extraerValorCampo(
  col: ColumnaCsvConfig,
  pedido: PedidoCabecera,
  det: PedidoDetalle,
  cliente?: Cliente,
  producto?: Producto
): string | number {
  if (!col) return '';
  switch (col.campo_origen) {
    case 'rif_cliente':
      return cliente?.rif || '';
    case 'codigo_cliente':
      return cliente?.ident01 || cliente?.codigo_cliente || '';
    case 'codigo_cliente_drogueria':
      return cliente?.ident01 || cliente?.codigo_cliente || '';
    case 'numero_pedido':
      return pedido?.numero_pedido || '';
    case 'fecha_pedido':
      return pedido?.fecha_pedido ? pedido.fecha_pedido.substring(0, 10) : '';
    case 'sku':
      return producto?.sku || producto?.codigo || det?.producto_id || '';
    case 'codigo_barras':
      return producto?.codigo_barras_ean13 || producto?.pack_code || '';
    case 'nombre_producto':
      return producto?.nombre_comercial || producto?.product || '';
    case 'cantidad_solicitada':
      return det?.cantidad_solicitada ?? 0;
    case 'cantidad_confirmada':
      return det?.cantidad_confirmada ?? 0;
    case 'precio_unitario':
      return det?.precio_unitario ?? 0;
    case 'descuento_porcentaje':
      return det?.descuento_porcentaje ?? 0;
    case 'subtotal':
      return det?.subtotal_confirmado || Number(((det?.cantidad_confirmada || 0) * (det?.precio_unitario || 0) * (1 - (det?.descuento_porcentaje || 0) / 100)).toFixed(2));
    case 'constante':
      return col.valor_constante || '';
    default:
      return '';
  }
}

/**
 * Aplica formato numérico, ceros a la izquierda y entrecomillado
 */
function formatearCampoSegunTipo(
  valor: string | number,
  col: ColumnaCsvConfig,
  formatoDecimalGlobal: 'punto' | 'coma',
  entrecomillado: 'siempre' | 'solo_texto' | 'nunca'
): string {
  let stringVal = valor !== undefined && valor !== null ? String(valor) : '';

  // Relleno de ceros a la izquierda si está configurado (ej: códigos fijos)
  if (col.relleno_ceros_izq && col.relleno_ceros_izq > 0) {
    stringVal = stringVal.padStart(col.relleno_ceros_izq, '0');
  }

  // Truncado de longitud máxima si aplica
  if (col.longitud_maxima && col.longitud_maxima > 0) {
    stringVal = stringVal.substring(0, col.longitud_maxima);
  }

  // Formato decimal específico
  const formato = col.formato;
  const esNumero = typeof valor === 'number' || !isNaN(Number(valor));

  if (formato === 'decimal_coma' || (esNumero && formatoDecimalGlobal === 'coma' && formato !== 'entero' && String(valor).includes('.'))) {
    stringVal = stringVal.replace('.', ',');
  } else if (formato === 'decimal_punto' || (esNumero && formatoDecimalGlobal === 'punto' && formato !== 'entero')) {
    stringVal = stringVal.replace(',', '.');
  } else if (formato === 'entero') {
    stringVal = String(Math.round(Number(valor) || 0));
  }

  return formatearCampo(stringVal, typeof valor === 'number' ? 'numero' : 'texto', entrecomillado);
}

function formatearCampo(
  valor: string,
  tipo: 'texto' | 'numero',
  entrecomillado: 'siempre' | 'solo_texto' | 'nunca'
): string {
  const limpio = valor.replace(/"/g, '""');

  if (entrecomillado === 'siempre') {
    return `"${limpio}"`;
  }
  if (entrecomillado === 'solo_texto' && tipo === 'texto') {
    return `"${limpio}"`;
  }
  return limpio;
}

/**
 * Dispara la descarga del archivo CSV directamente en el navegador del usuario
 */
export function descargarArchivoCsv(result: CsvExportResult): void {
  const blob = new Blob([result.content], { type: `${result.mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', result.filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
