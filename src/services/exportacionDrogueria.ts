import type {
  ColumnaExport,
  FormatoExport,
  LocalCliente,
  LocalDetalle,
  LocalDrogueria,
  LocalMapCliente,
  LocalMapProducto,
  LocalPedido,
  LocalProducto,
} from '../offline/types';

/**
 * Exportación de pedidos a archivo plano por droguería (módulo D.2).
 *
 * Toma el pedido interno y lo cruza con las homologaciones de ESA droguería:
 *   - el código de cuenta de la farmacia (map_cliente_drogueria)
 *   - el código y la descripción de cada producto (map_producto_drogueria)
 * y lo escribe respetando el layout configurado en dim_droguerias.formato_export:
 * delimitador (; , | tab), encabezados exactos, orden de columnas, entrecomillado, decimal, fecha,
 * codificación (UTF-8 / ISO-8859-1 / Windows-1252) y, para TXT posicional, ancho y relleno por columna.
 *
 * Si falta una homologación NO se genera un archivo incompleto: se devuelven errores con el SKU afectado
 * (a menos que se pida `permitirFaltantes`, que omite esas líneas y lo advierte).
 * Nota sobre Excel: un CSV en UTF-8 con `bom: true` y delimitador `;` abre directo en Excel (configuración regional es-VE/es-ES).
 */

/**
 * Entre varios códigos de un mismo producto/farmacia en una droguería, se usa el marcado como principal.
 * Sin ninguno marcado se toma el más antiguo por orden de llegada y se avisa (no debería ocurrir: el servidor siempre deja uno).
 */
export function elegirPrincipal<T extends { es_principal?: boolean }>(mapeos: T[]): { elegido: T | undefined; ambiguo: boolean } {
  const marcado = mapeos.find((m) => m.es_principal === true);
  if (marcado) return { elegido: marcado, ambiguo: false };
  const sinMarca = mapeos.filter((m) => m.es_principal === undefined);
  if (sinMarca.length > 0) return { elegido: sinMarca[0], ambiguo: sinMarca.length > 1 };
  return { elegido: mapeos[0], ambiguo: mapeos.length > 0 };
}

export type CodigoErrorExportacion =
  | 'cliente_no_validado'
  | 'cliente_sin_homologar'
  | 'producto_sin_homologar'
  | 'sin_lineas'
  | 'ancho_requerido'
  | 'formato_invalido';

export interface ErrorExportacion {
  codigo: CodigoErrorExportacion;
  mensaje: string;
  sku?: string;
}

export interface EntradaExportacion {
  pedido: Pick<LocalPedido, 'correlativo' | 'created_at' | 'observaciones' | 'estado'>;
  detalles: LocalDetalle[];
  cliente: LocalCliente;
  drogueria: LocalDrogueria;
  productos: Map<string, LocalProducto> | LocalProducto[];
  mapProductos: LocalMapProducto[];
  mapClientes: LocalMapCliente[];
}

export interface OpcionesExportacion {
  /** 'auto': confirmadas si el pedido ya fue procesado; si no, solicitadas. */
  cantidad?: 'auto' | 'solicitadas' | 'confirmadas';
  /** Omite las líneas sin homologar en vez de bloquear la exportación. */
  permitirFaltantes?: boolean;
  ahora?: Date;
}

export interface ResultadoExportacion {
  ok: boolean;
  nombre_archivo: string;
  mime: string;
  bytes: Uint8Array;
  texto: string;
  lineas: number;
  errores: ErrorExportacion[];
  advertencias: string[];
}

const ESTADOS_PROCESADOS = new Set(['procesado_parcial', 'procesado_total', 'facturado']);
const DELIMITADORES = new Set([';', ',', '|', '\t', '']);

/* ------------------------------ codificación ------------------------------ */

// Puntos de código de Windows-1252 en 0x80–0x9F (el resto coincide con Latin-1).
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

export function codificar(texto: string, codificacion: FormatoExport['codificacion'], bom = false): { bytes: Uint8Array; perdidos: number } {
  if (codificacion === 'utf-8') {
    const cuerpo = new TextEncoder().encode(texto);
    if (!bom) return { bytes: cuerpo, perdidos: 0 };
    const salida = new Uint8Array(cuerpo.length + 3);
    salida.set([0xef, 0xbb, 0xbf]);
    salida.set(cuerpo, 3);
    return { bytes: salida, perdidos: 0 };
  }
  const bytes: number[] = [];
  let perdidos = 0;
  for (const simbolo of texto) {
    const cp = simbolo.codePointAt(0)!;
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) bytes.push(cp);
    else if (codificacion === 'windows-1252' && CP1252[cp] !== undefined) bytes.push(CP1252[cp]);
    else {
      bytes.push(0x3f); // '?'
      perdidos++;
    }
  }
  return { bytes: Uint8Array.from(bytes), perdidos };
}

/* -------------------------------- formatos -------------------------------- */

function formatearFecha(fechaIso: string, formato: FormatoExport['formato_fecha']): string {
  const d = new Date(fechaIso);
  const p = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = p(d.getMonth() + 1);
  const dia = p(d.getDate());
  if (formato === 'DD/MM/YYYY') return `${dia}/${m}/${y}`;
  if (formato === 'YYYY-MM-DD') return `${y}-${m}-${dia}`;
  return `${y}${m}${dia}`;
}

function formatearNumero(n: number, formato: ColumnaExport['formato'], decimal: FormatoExport['decimal']): string {
  if (formato === 'entero') return String(Math.round(n));
  const t = String(n);
  return decimal === 'coma' ? t.replace('.', ',') : t;
}

// Evita que Excel interprete texto libre como fórmula (=, +, -, @).
const neutralizarFormula = (t: string) => (/^[=+\-@]/.test(t) ? `'${t}` : t);

interface ContextoLinea {
  entrada: EntradaExportacion;
  detalle: LocalDetalle;
  producto: LocalProducto | undefined;
  mapProducto: LocalMapProducto | undefined;
  cuenta: string;
  cantidad: number;
  numeroLinea: number;
  formato: FormatoExport;
}

function valorColumna(col: ColumnaExport, c: ContextoLinea): { texto: string; numerico: boolean } {
  const f = c.formato;
  switch (col.origen) {
    case 'codigo_cliente_drogueria':
      return { texto: c.cuenta, numerico: false };
    case 'rif_cliente':
      return { texto: c.entrada.cliente.rif ?? '', numerico: false };
    case 'nombre_cliente':
      return { texto: neutralizarFormula(c.entrada.cliente.nombre_comercial), numerico: false };
    case 'codigo_producto_drogueria':
      return { texto: c.mapProducto?.codigo_drogueria ?? '', numerico: false };
    case 'descripcion_producto_drogueria':
      return { texto: neutralizarFormula(c.mapProducto?.descripcion_drogueria ?? c.producto?.nombre_comercial ?? ''), numerico: false };
    case 'ean':
      return { texto: c.producto?.ean13 ?? '', numerico: false };
    case 'sku_interno':
      return { texto: c.producto?.sku ?? '', numerico: false };
    case 'unidades_confirmadas':
    case 'unidades_solicitadas': {
      const n = col.origen === 'unidades_confirmadas' ? c.cantidad : c.detalle.unidades_solicitadas;
      return { texto: formatearNumero(n, col.formato ?? 'entero', f.decimal), numerico: true };
    }
    case 'correlativo':
      return { texto: c.entrada.pedido.correlativo, numerico: false };
    case 'fecha_pedido':
      return { texto: formatearFecha(c.entrada.pedido.created_at, f.formato_fecha), numerico: false };
    case 'observaciones':
      return { texto: neutralizarFormula((c.entrada.pedido.observaciones ?? '').replace(/[\r\n]+/g, ' ')), numerico: false };
    case 'linea':
      return { texto: String(c.numeroLinea), numerico: true };
    case 'precio_base':
      return { texto: '', numerico: true }; // fase 2: se llenará desde precios_drogueria_producto
    case 'constante':
      return { texto: col.valor ?? '', numerico: false };
  }
}

function ajustar(texto: string, col: ColumnaExport, numerico: boolean): string {
  let t = texto;
  const limite = col.ancho ?? col.max_largo;
  if (limite && t.length > limite) t = t.slice(0, limite);
  if (col.ancho) {
    const relleno = (col.relleno ?? (numerico ? '0' : ' ')).charAt(0) || ' ';
    const derecha = (col.alineacion ?? (numerico ? 'der' : 'izq')) === 'der';
    t = derecha ? t.padStart(col.ancho, relleno) : t.padEnd(col.ancho, relleno);
  }
  return t;
}

function escribirCampo(texto: string, numerico: boolean, f: FormatoExport, advertencias: Set<string>): string {
  if (f.delimitador === '') return texto; // posicional: nunca se entrecomilla
  const contieneEspecial = texto.includes(f.delimitador) || texto.includes('"') || /[\r\n]/.test(texto);
  const debeCitar = f.entrecomillado === 'siempre' || (f.entrecomillado === 'solo_texto' && !numerico && texto !== '');
  if (f.entrecomillado === 'nunca') {
    if (contieneEspecial) {
      advertencias.add('Algún texto contenía el delimitador o comillas y se reemplazó por un espacio (el layout no admite entrecomillado).');
      return texto.split(f.delimitador).join(' ').replace(/["\r\n]/g, ' ');
    }
    return texto;
  }
  if (debeCitar || contieneEspecial) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

const sanitizarNombre = (t: string) => t.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');

function nombreArchivo(entrada: EntradaExportacion, f: FormatoExport, ahora: Date): string {
  const plantilla = f.nombre_archivo ?? '{correlativo}_{fecha}.{extension}';
  const valores: Record<string, string> = {
    correlativo: entrada.pedido.correlativo,
    fecha: formatearFecha(ahora.toISOString(), 'YYYYMMDD'),
    drogueria: entrada.drogueria.codigo,
    cliente: entrada.cliente.codigo_interno ?? entrada.cliente.rif ?? 'cliente',
    extension: f.extension.replace(/^\./, ''),
  };
  return sanitizarNombre(plantilla.replace(/\{(\w+)\}/g, (_, k: string) => valores[k] ?? ''));
}

/* --------------------------------- principal -------------------------------- */

export function generarArchivoDrogueria(entrada: EntradaExportacion, opciones: OpcionesExportacion = {}): ResultadoExportacion {
  const f = entrada.drogueria.formato_export;
  const errores: ErrorExportacion[] = [];
  const advertencias = new Set<string>();
  const ahora = opciones.ahora ?? new Date();

  const vacio = (): ResultadoExportacion => ({
    ok: false,
    nombre_archivo: nombreArchivo(entrada, f, ahora),
    mime: 'text/plain',
    bytes: new Uint8Array(),
    texto: '',
    lineas: 0,
    errores,
    advertencias: Array.from(advertencias),
  });

  if (!f || !Array.isArray(f.columnas) || f.columnas.length === 0 || !DELIMITADORES.has(f.delimitador)) {
    errores.push({ codigo: 'formato_invalido', mensaje: `La droguería ${entrada.drogueria.nombre} no tiene un layout de exportación válido.` });
    return vacio();
  }
  if (f.delimitador === '' && f.columnas.some((c) => !c.ancho)) {
    errores.push({ codigo: 'ancho_requerido', mensaje: 'Un layout posicional (sin delimitador) exige el ancho de cada columna.' });
    return vacio();
  }

  // Regla 4: nada sale hacia la droguería si la farmacia no está validada y homologada con ella.
  if (entrada.cliente.estado_validacion !== 'activo') {
    errores.push({ codigo: 'cliente_no_validado', mensaje: 'La farmacia aún no está validada (RIF/documentación).' });
  }
  // Solo las cuentas con código sirven para escribir el pedido (un alias solo con nombre no identifica a la farmacia ante la droguería).
  const cuentas = entrada.mapClientes.filter((m) => m.cliente_id === entrada.cliente.id && m.drogueria_id === entrada.drogueria.id && !!m.codigo_cuenta);
  const { elegido: cuenta, ambiguo: cuentaAmbigua } = elegirPrincipal(cuentas);
  if (cuentaAmbigua) advertencias.add(`La farmacia tiene varias cuentas en ${entrada.drogueria.nombre} y ninguna marcada como principal: se usó ${cuenta?.codigo_cuenta}.`);
  if (!cuenta) {
    errores.push({ codigo: 'cliente_sin_homologar', mensaje: `La farmacia no tiene código de cuenta en ${entrada.drogueria.nombre}.` });
  }

  const productos = Array.isArray(entrada.productos) ? new Map(entrada.productos.map((p) => [p.id, p])) : entrada.productos;
  const codigosPorProducto = new Map<string, LocalMapProducto[]>();
  for (const m of entrada.mapProductos) {
    if (m.drogueria_id !== entrada.drogueria.id) continue;
    codigosPorProducto.set(m.producto_id, [...(codigosPorProducto.get(m.producto_id) ?? []), m]);
  }
  const mapPorProducto = new Map<string, LocalMapProducto>();
  for (const [productoId, codigos] of codigosPorProducto) {
    const { elegido, ambiguo } = elegirPrincipal(codigos);
    if (elegido) mapPorProducto.set(productoId, elegido);
    if (ambiguo) advertencias.add(`Un producto tiene varios códigos en ${entrada.drogueria.nombre} y ninguno principal: se usó ${elegido?.codigo_drogueria}.`);
  }
  const modo = opciones.cantidad ?? 'auto';
  const usarConfirmadas = modo === 'confirmadas' || (modo === 'auto' && ESTADOS_PROCESADOS.has(entrada.pedido.estado));

  const lineas: ContextoLinea[] = [];
  [...entrada.detalles]
    .sort((a, b) => a.linea - b.linea)
    .forEach((detalle) => {
      const cantidad = usarConfirmadas ? detalle.unidades_confirmadas ?? 0 : detalle.unidades_solicitadas;
      if (cantidad <= 0) return; // lo que la droguería no despachó no viaja
      const producto = productos.get(detalle.producto_id);
      const mapProducto = mapPorProducto.get(detalle.producto_id);
      if (!mapProducto) {
        const sku = producto?.sku ?? detalle.producto_id;
        if (opciones.permitirFaltantes) advertencias.add(`Se omitió ${sku}: sin código en ${entrada.drogueria.nombre}.`);
        else errores.push({ codigo: 'producto_sin_homologar', sku, mensaje: `${sku} no tiene código en ${entrada.drogueria.nombre}.` });
        return;
      }
      lineas.push({ entrada, detalle, producto, mapProducto, cuenta: cuenta?.codigo_cuenta ?? '', cantidad, numeroLinea: lineas.length + 1, formato: f });
    });

  if (lineas.length === 0 && errores.length === 0) {
    errores.push({ codigo: 'sin_lineas', mensaje: 'No hay unidades para enviar a la droguería.' });
  }
  if (errores.length > 0) return vacio();

  const filas: string[] = [];
  if (f.encabezado) {
    filas.push(f.columnas.map((c) => ajustar(escribirCampo(c.encabezado, false, f, advertencias), c, false)).join(f.delimitador));
  }
  for (const linea of lineas) {
    filas.push(
      f.columnas
        .map((col) => {
          const { texto, numerico } = valorColumna(col, linea);
          return f.delimitador === '' ? ajustar(texto, col, numerico) : escribirCampo(ajustar(texto, col, numerico), numerico, f, advertencias);
        })
        .join(f.delimitador)
    );
  }
  const texto = filas.join(f.salto_linea) + f.salto_linea;

  const { bytes, perdidos } = codificar(texto, f.codificacion, f.bom);
  if (perdidos > 0) advertencias.add(`${perdidos} carácter(es) no existen en ${f.codificacion} y se escribieron como "?".`);

  return {
    ok: true,
    nombre_archivo: nombreArchivo(entrada, f, ahora),
    mime: `${f.formato === 'csv' ? 'text/csv' : 'text/plain'};charset=${f.codificacion}`,
    bytes,
    texto,
    lineas: lineas.length,
    errores: [],
    advertencias: Array.from(advertencias),
  };
}

/** Descarga el archivo en el navegador (sin pasar por ningún servidor). */
export function descargarArchivoExportado(res: ResultadoExportacion): void {
  const url = URL.createObjectURL(new Blob([res.bytes as BlobPart], { type: res.mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = res.nombre_archivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
