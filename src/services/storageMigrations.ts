import type { FormatoCsvConfig, Usuario } from '../types/pharmacy';

/** Layout CSV base para droguerías sin configuración guardada. */
export const FORMATO_CSV_POR_DEFECTO: FormatoCsvConfig = {
  delimitador: ';',
  incluir_encabezados: true,
  entrecomillado: 'solo_texto',
  codificacion: 'UTF-8',
  salto_linea: '\r\n',
  formato_decimal: 'coma',
  columnas: [
    { campo_origen: 'codigo_cliente', nombre_encabezado: 'COD_CLIENTE', orden: 1, formato: 'texto' },
    { campo_origen: 'rif_cliente', nombre_encabezado: 'RIF_FARMACIA', orden: 2, formato: 'texto' },
    { campo_origen: 'sku', nombre_encabezado: 'SKU_PRODUCTO', orden: 3, formato: 'texto' },
    { campo_origen: 'cantidad_confirmada', nombre_encabezado: 'CANTIDAD', orden: 4, formato: 'entero' },
    { campo_origen: 'descuento_porcentaje', nombre_encabezado: 'DESCUENTO', orden: 5, formato: 'decimal_coma' },
    { campo_origen: 'numero_pedido', nombre_encabezado: 'NUMERO_ORDEN', orden: 6, formato: 'texto' },
  ],
};

/** Usuario guardado en el dispositivo (sesión anterior). */
export function leerUsuario(guardado: unknown): Usuario | undefined {
  return guardado && typeof guardado === 'object' ? (guardado as Usuario) : undefined;
}
