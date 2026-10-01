// Respuesta de la droguería por archivo: la droguería devuelve un Excel/CSV con lo que despachó y NOVA lo cruza con
// los pedidos para llenar las "Confirmadas" (sin teclear línea por línea).
//
//  1. leerRespuesta: encuentra la fila de títulos y las columnas (por el formato guardado o adivinando por el nombre).
//  2. cruzarRespuesta: ubica cada fila en su pedido (número de pedido NOVA o, si no viene, la cuenta de la farmacia)
//     y en su producto (código de la droguería, código de barras o código interno), y calcula cómo quedaría cada pedido.
// Nada se guarda aquí: la mesa revisa la vista previa y confirma con la misma función de siempre (confirmar_pedido).
import type { CampoRespuesta, EstadoPedido, FormatoRespuesta, LocalDetalle, LocalMapCliente, LocalMapProducto, LocalPedido, LocalProducto, MotivoAjuste } from '../offline/types';
import { numero } from './cargaArchivos';
import type { Tabla } from './leerHoja';
import { estadoTrasConfirmar } from '../vistas/mesa';
import type { Confirmacion } from '../vistas/mesa';

export const CAMPOS_RESPUESTA: { id: CampoRespuesta; texto: string; ayuda: string }[] = [
  { id: 'pedido', texto: 'Número de pedido NOVA', ayuda: 'Ej.: PED-1045. Si no viene, se usa la cuenta de la farmacia.' },
  { id: 'cliente', texto: 'Código de la farmacia en la droguería', ayuda: 'Sirve cuando el archivo no trae el número de pedido.' },
  { id: 'producto', texto: 'Código del producto', ayuda: 'Código de la droguería, código de barras o código interno.' },
  { id: 'confirmadas', texto: 'Unidades despachadas', ayuda: 'Lo que la droguería sí envió.' },
  { id: 'faltantes', texto: 'Unidades que faltaron', ayuda: 'Úsalo si el archivo trae lo que NO se envió.' },
  { id: 'pedidas', texto: 'Unidades pedidas', ayuda: 'Opcional: solo para comparar.' },
  { id: 'motivo', texto: 'Motivo u observación', ayuda: 'Opcional: "sin existencia", "crédito"…' },
  { id: 'factura', texto: 'Número de factura o despacho', ayuda: 'Opcional.' },
];

/** Título normalizado: minúsculas, sin tildes ni signos. "Cant. Despachada" → "cant despachada". */
export const normalizarTitulo = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Reconocimiento por nombre, en este orden (cada título se usa una sola vez).
const RECONOCER: [CampoRespuesta, (t: string) => boolean][] = [
  ['faltantes', (t) => /falla|faltant|no despach|backorder|negad|pendient|no atendid/.test(t)],
  ['confirmadas', (t) => /despach|confirm|factur(?!a\b)|enviad|atendid|surtid|entregad/.test(t) && !/\bfecha\b/.test(t)],
  ['pedidas', (t) => /\bpedidas?\b|solicitad|\bcant(idad)? ped|\bunid(ades)? ped/.test(t)],
  ['factura', (t) => /\bfactura\b|nota de entrega|\bdocumento\b|\bnro doc|\bdespacho\b/.test(t)],
  ['motivo', (t) => /motivo|observ|causa|razon|comentario|estatus|\bestado\b|mensaje/.test(t)],
  ['pedido', (t) => (/\bpedido\b|\borden\b|correlativo|\breferencia\b|\bref\b|\boc\b/.test(t)) && !/\bcant/.test(t)],
  ['cliente', (t) => /cliente|cuenta|farmacia/.test(t) && !/nombre|razon|descrip/.test(t)],
  ['producto', (t) => /\bcod|sku|\bean\b|barra|articulo|\bproducto\b|\bitem\b|material/.test(t) && !/descrip|nombre/.test(t)],
  // Un "Cantidad" a secas en un archivo de respuesta es lo despachado.
  ['confirmadas', (t) => /^(cant|cantidad|unidades|uds|cant uds)$/.test(t)],
];

/** Adivina qué columna es cada dato. Devuelve el índice de la columna por dato. */
export function reconocerColumnas(encabezados: string[]): Partial<Record<CampoRespuesta, number>> {
  const norm = encabezados.map(normalizarTitulo);
  const usados = new Set<number>();
  const salida: Partial<Record<CampoRespuesta, number>> = {};
  for (const [campo, prueba] of RECONOCER) {
    if (salida[campo] !== undefined) continue;
    // Para el producto se prefiere un título con "cod" (no la descripción).
    const candidatos = norm.map((t, i) => ({ t, i })).filter(({ t, i }) => t && !usados.has(i) && prueba(t));
    if (!candidatos.length) continue;
    const elegido = campo === 'producto' ? candidatos.find((c) => /\bcod/.test(c.t)) ?? candidatos[0] : candidatos[0];
    salida[campo] = elegido.i;
    usados.add(elegido.i);
  }
  return salida;
}

/**
 * La fila de títulos es la que más datos reconoce entre las 15 primeras (debe tener producto y cantidad).
 * Si el formato tiene títulos guardados, primero se busca la fila que los contiene.
 */
export function buscarFilaEncabezado(filas: string[][], guardados: string[] = []): number {
  const buscados = guardados.map(normalizarTitulo).filter(Boolean);
  if (buscados.length) {
    const i = filas.slice(0, 15).findIndex((f) => {
      const n = new Set(f.map(normalizarTitulo));
      return buscados.filter((t) => n.has(t)).length >= Math.min(2, buscados.length);
    });
    if (i >= 0) return i;
  }
  let mejor = -1;
  let puntos = 0;
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const c = reconocerColumnas(filas[i]);
    if (c.producto === undefined || (c.confirmadas === undefined && c.faltantes === undefined)) continue;
    const n = Object.keys(c).length;
    if (n > puntos) { puntos = n; mejor = i; }
  }
  return mejor;
}

export interface FilaRespuesta {
  /** Fila del archivo (1 = la primera). */
  linea: number;
  pedido: string;
  cliente: string;
  producto: string;
  confirmadas: number | null;
  faltantes: number | null;
  pedidas: number | null;
  motivo: string;
  factura: string;
}

export interface RespuestaLeida {
  encabezados: string[];
  /** Fila de títulos (1 = la primera). */
  filaEncabezado: number;
  columnas: Partial<Record<CampoRespuesta, number>>;
  filas: FilaRespuesta[];
  problemas: string[];
}

/** Lee la tabla con el formato de la droguería (si lo hay). */
export function leerRespuesta(tabla: Tabla, formato?: FormatoRespuesta): RespuestaLeida {
  const indice = formato?.fila_encabezado ? formato.fila_encabezado - 1 : buscarFilaEncabezado(tabla.filas, Object.values(formato?.columnas ?? {}).filter((t): t is string => !!t));
  if (indice < 0 || indice >= tabla.filas.length) {
    return { encabezados: tabla.filas[0] ?? [], filaEncabezado: 1, columnas: {}, filas: [], problemas: ['No encontré la fila de títulos. Indica en el formato de respuesta en qué fila están y qué columna es cada dato.'] };
  }
  const encabezados = tabla.filas[indice].map((x) => (x ?? '').trim());
  const columnas = reconocerColumnas(encabezados);
  // Lo guardado en el formato manda sobre lo adivinado.
  const norm = encabezados.map(normalizarTitulo);
  for (const [campo, titulo] of Object.entries(formato?.columnas ?? {}) as [CampoRespuesta, string][]) {
    if (!titulo?.trim()) continue;
    const i = norm.indexOf(normalizarTitulo(titulo));
    if (i >= 0) {
      for (const k of Object.keys(columnas) as CampoRespuesta[]) if (columnas[k] === i) delete columnas[k];
      columnas[campo] = i;
    }
  }
  const problemas: string[] = [];
  const faltaGuardada = (Object.entries(formato?.columnas ?? {}) as [CampoRespuesta, string][]).filter(([, t]) => t?.trim() && !norm.includes(normalizarTitulo(t)));
  for (const [campo, t] of faltaGuardada) problemas.push(`El archivo no tiene la columna "${t}" (${CAMPOS_RESPUESTA.find((c) => c.id === campo)?.texto.toLowerCase()}).`);
  if (columnas.producto === undefined) problemas.push('No encuentro la columna con el código del producto.');
  if (columnas.confirmadas === undefined && columnas.faltantes === undefined) problemas.push('No encuentro la columna con las unidades despachadas (o las que faltaron).');

  const celda = (f: string[], campo: CampoRespuesta) => (columnas[campo] === undefined ? '' : (f[columnas[campo] as number] ?? '').trim());
  const cantidad = (f: string[], campo: CampoRespuesta) => {
    const t = celda(f, campo);
    return t === '' ? null : numero(t);
  };
  const filas: FilaRespuesta[] = [];
  if (!problemas.some((p) => p.startsWith('No encuentro'))) {
    tabla.filas.slice(indice + 1).forEach((f, k) => {
      const producto = celda(f, 'producto');
      if (!producto) return; // filas en blanco, subtotales o pies de página
      filas.push({
        linea: indice + 2 + k,
        pedido: celda(f, 'pedido'),
        cliente: celda(f, 'cliente'),
        producto,
        confirmadas: cantidad(f, 'confirmadas'),
        faltantes: cantidad(f, 'faltantes'),
        pedidas: cantidad(f, 'pedidas'),
        motivo: celda(f, 'motivo'),
        factura: celda(f, 'factura'),
      });
    });
    if (filas.length === 0) problemas.push('El archivo no trae filas con productos debajo de los títulos.');
  }
  return { encabezados, filaEncabezado: indice + 1, columnas, filas, problemas };
}

/** Motivo de la droguería en palabras → motivo de NOVA. */
export function motivoDeTexto(t: string): MotivoAjuste {
  const n = normalizarTitulo(t);
  if (!n) return 'quiebre_stock_drogueria';
  if (/credit|cupo|deuda|morosi|bloquead/.test(n)) return 'limite_credito';
  if (/descontinu|discontinu|no se fabrica|retirad/.test(n)) return 'producto_descontinuado';
  if (/stock|existenc|agotad|falla|inventario|sin disp|no disp|quiebre|faltant/.test(n)) return 'quiebre_stock_drogueria';
  if (/comercial|precio|condicion/.test(n)) return 'ajuste_comercial';
  return 'otro';
}

const codigoLimpio = (t: string) => t.trim().toUpperCase().replace(/\s+/g, '');
const sinCeros = (t: string) => t.replace(/^0+(?=\d)/, '');
const soloDigitos = (t: string) => t.replace(/\D/g, '');

export interface LineaCruzada {
  detalle: LocalDetalle;
  confirmadas: number;
  enArchivo: boolean;
  /** La droguería informó más de lo pedido (se toma lo pedido). */
  excedente: boolean;
  motivo: MotivoAjuste;
  motivoTexto: string;
}

export interface PedidoCruzado {
  pedido: LocalPedido;
  lineas: LineaCruzada[];
  confirmaciones: Confirmacion[];
  estado: EstadoPedido;
  factura: string;
  /** Filas del archivo usadas en este pedido. */
  filas: number;
  avisos: string[];
}

export interface FilaSinUbicar { linea: number; texto: string; motivo: string }

export interface ResultadoCruce {
  pedidos: PedidoCruzado[];
  sinUbicar: FilaSinUbicar[];
  /** Pedidos del archivo que ya estaban procesados (no se tocan). */
  yaProcesados: string[];
}

export interface EntradaCruce {
  filas: FilaRespuesta[];
  drogueriaId: string;
  /** Pedidos abiertos de esta droguería (enviados, en proceso o en revisión). */
  abiertos: LocalPedido[];
  /** Todos los pedidos conocidos (para avisar si uno del archivo ya estaba procesado). */
  todos: LocalPedido[];
  detallesPorPedido: Map<string, LocalDetalle[]>;
  productos: LocalProducto[];
  mapProductos: LocalMapProducto[];
  mapClientes: LocalMapCliente[];
  /** Si se carga desde un pedido abierto, todas las filas son de ese pedido. */
  pedidoFijo?: LocalPedido;
  codigoProducto?: FormatoRespuesta['codigo_producto'];
  ausentes?: FormatoRespuesta['ausentes'];
}

/** Ubica cada fila en su pedido y producto y calcula cómo quedaría cada pedido. */
export function cruzarRespuesta(e: EntradaCruce): ResultadoCruce {
  const sinUbicar: FilaSinUbicar[] = [];
  const yaProcesados = new Set<string>();
  const abiertos = e.pedidoFijo ? [e.pedidoFijo] : e.abiertos.filter((p) => p.drogueria_id === e.drogueriaId);

  // Número de pedido: exacto ("PED-1045") o solo los dígitos ("1045") si no se confunde con otro.
  const porCorrelativo = new Map<string, LocalPedido>();
  const porDigitos = new Map<string, LocalPedido[]>();
  for (const p of e.todos.filter((x) => x.drogueria_id === e.drogueriaId)) {
    porCorrelativo.set(codigoLimpio(p.correlativo), p);
    const d = sinCeros(soloDigitos(p.correlativo.replace(/-R\d+$/i, '')));
    if (d && !/-R\d+$/i.test(p.correlativo)) porDigitos.set(d, [...(porDigitos.get(d) ?? []), p]);
  }
  const abiertoIds = new Set(abiertos.map((p) => p.id));
  const buscarPedido = (t: string): LocalPedido | undefined => {
    const exacto = porCorrelativo.get(codigoLimpio(t));
    if (exacto) return exacto;
    const d = porDigitos.get(sinCeros(soloDigitos(t)));
    return d?.length === 1 ? d[0] : undefined;
  };
  // Cuenta de la farmacia en la droguería → farmacia.
  const clientePorCuenta = new Map<string, string>();
  for (const m of e.mapClientes) {
    if (m.drogueria_id !== e.drogueriaId) continue;
    for (const k of [m.codigo_cuenta, m.nombre_en_drogueria]) if (k) clientePorCuenta.set(sinCeros(codigoLimpio(k)), m.cliente_id);
  }
  // Código del producto → producto.
  const tipo = e.codigoProducto ?? 'auto';
  const productoPorCodigo = new Map<string, string>();
  const agregar = (codigo: string | null | undefined, id: string) => {
    if (!codigo) return;
    const c = codigoLimpio(codigo);
    if (!productoPorCodigo.has(c)) productoPorCodigo.set(c, id);
    if (!productoPorCodigo.has(sinCeros(c))) productoPorCodigo.set(sinCeros(c), id);
  };
  if (tipo === 'auto' || tipo === 'drogueria') for (const m of e.mapProductos) if (m.drogueria_id === e.drogueriaId) agregar(m.codigo_drogueria, m.producto_id);
  if (tipo === 'auto' || tipo === 'ean') for (const p of e.productos) agregar(p.ean13, p.id);
  if (tipo === 'auto' || tipo === 'sku') for (const p of e.productos) agregar(p.sku, p.id);
  const buscarProducto = (t: string) => productoPorCodigo.get(codigoLimpio(t)) ?? productoPorCodigo.get(sinCeros(codigoLimpio(t)));

  // 1. Filas por pedido.
  const filasDe = new Map<string, FilaRespuesta[]>();
  for (const f of e.filas) {
    let pedido: LocalPedido | undefined;
    if (e.pedidoFijo) {
      if (f.pedido) {
        const otro = buscarPedido(f.pedido);
        if (otro && otro.id !== e.pedidoFijo.id) { sinUbicar.push({ linea: f.linea, texto: f.producto, motivo: `Es del pedido ${otro.correlativo}.` }); continue; }
      }
      pedido = e.pedidoFijo;
    } else if (f.pedido) {
      pedido = buscarPedido(f.pedido);
      if (!pedido) { sinUbicar.push({ linea: f.linea, texto: f.producto, motivo: `No hay un pedido "${f.pedido}" de esta droguería.` }); continue; }
    } else if (f.cliente) {
      const cliente = clientePorCuenta.get(sinCeros(codigoLimpio(f.cliente)));
      if (!cliente) { sinUbicar.push({ linea: f.linea, texto: f.producto, motivo: `La cuenta "${f.cliente}" no está homologada con ninguna farmacia.` }); continue; }
      const candidatos = abiertos.filter((p) => p.cliente_id === cliente);
      if (candidatos.length !== 1) {
        sinUbicar.push({ linea: f.linea, texto: f.producto, motivo: candidatos.length === 0 ? `La farmacia de la cuenta "${f.cliente}" no tiene pedidos abiertos con esta droguería.` : `La farmacia de la cuenta "${f.cliente}" tiene ${candidatos.length} pedidos abiertos: el archivo debe traer el número de pedido.` });
        continue;
      }
      pedido = candidatos[0];
    } else {
      sinUbicar.push({ linea: f.linea, texto: f.producto, motivo: 'La fila no trae número de pedido ni cuenta de la farmacia.' });
      continue;
    }
    if (!abiertoIds.has(pedido.id)) { yaProcesados.add(pedido.correlativo); continue; }
    filasDe.set(pedido.id, [...(filasDe.get(pedido.id) ?? []), f]);
  }

  // 2. Cada pedido: filas → líneas del pedido.
  const pedidos: PedidoCruzado[] = [];
  for (const p of abiertos) {
    const filas = filasDe.get(p.id);
    if (!filas?.length) continue;
    const detalles = [...(e.detallesPorPedido.get(p.id) ?? [])].sort((a, b) => a.linea - b.linea);
    const avisos: string[] = [];
    const recibido = new Map<string, { unidades: number; motivo: string }>();
    let factura = '';
    for (const f of filas) {
      if (f.factura && !factura) factura = f.factura;
      const productoId = buscarProducto(f.producto);
      if (!productoId) { sinUbicar.push({ linea: f.linea, texto: f.producto, motivo: `El código "${f.producto}" no corresponde a ningún producto homologado (${p.correlativo}).` }); continue; }
      const lineas = detalles.filter((d) => d.producto_id === productoId);
      if (!lineas.length) { sinUbicar.push({ linea: f.linea, texto: f.producto, motivo: `El producto no está en el pedido ${p.correlativo}.` }); continue; }
      // Faltantes → despachadas = pedidas − faltantes. Celda vacía = no se despachó.
      const pedidasLineas = lineas.reduce((a, d) => a + d.unidades_solicitadas, 0);
      let unidades = f.confirmadas !== null ? f.confirmadas : f.faltantes !== null ? pedidasLineas - f.faltantes : 0;
      if (!Number.isFinite(unidades) || unidades < 0) unidades = 0;
      // Si el producto está en varias líneas, se reparte en orden.
      for (const d of lineas) {
        const previo = recibido.get(d.id);
        const lugar = Math.max(0, d.unidades_solicitadas - (previo?.unidades ?? 0));
        const toma = d === lineas[lineas.length - 1] ? unidades : Math.min(unidades, lugar);
        recibido.set(d.id, { unidades: (previo?.unidades ?? 0) + toma, motivo: f.motivo || previo?.motivo || '' });
        unidades -= toma;
      }
    }
    const lineas: LineaCruzada[] = detalles.map((d) => {
      const r = recibido.get(d.id);
      const bruto = r ? Math.round(r.unidades) : e.ausentes === 'completas' ? d.unidades_solicitadas : 0;
      const confirmadas = Math.min(bruto, d.unidades_solicitadas);
      return { detalle: d, confirmadas, enArchivo: !!r, excedente: bruto > d.unidades_solicitadas, motivo: r ? motivoDeTexto(r.motivo) : 'quiebre_stock_drogueria', motivoTexto: r?.motivo ?? '' };
    });
    if (lineas.every((l) => !l.enArchivo)) continue; // ninguna fila cayó en una línea: ya quedó en "sin ubicar"
    const excedentes = lineas.filter((l) => l.excedente).length;
    if (excedentes) avisos.push(`${excedentes} producto${excedentes === 1 ? '' : 's'} con más unidades que lo pedido: se toma lo pedido.`);
    const ausentes = lineas.filter((l) => !l.enArchivo).length;
    if (ausentes) avisos.push(`${ausentes} producto${ausentes === 1 ? '' : 's'} del pedido no ${ausentes === 1 ? 'viene' : 'vienen'} en el archivo: ${e.ausentes === 'completas' ? 'quedan completos' : 'quedan en cero (sin despachar)'}.`);
    const confirmaciones = lineas.map((l) => ({ detalle_id: l.detalle.id, unidades_confirmadas: l.confirmadas, motivo: l.motivo }));
    pedidos.push({ pedido: p, lineas, confirmaciones, estado: estadoTrasConfirmar(detalles, confirmaciones), factura, filas: filas.length, avisos });
  }
  pedidos.sort((a, b) => a.pedido.correlativo.localeCompare(b.pedido.correlativo, 'es', { numeric: true }));
  return { pedidos, sinUbicar: sinUbicar.sort((a, b) => a.linea - b.linea), yaProcesados: [...yaProcesados] };
}
