// Ayudas de prueba: arman un .xlsx real (ZIP con XML) en memoria. Solo lo usan las pruebas.

/** ZIP mínimo (sin compresión o con deflate) para armar un .xlsx de prueba. */
export async function armarZip(archivos: Record<string, string>, comprimir = false): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const crudo = enc.encode(contenido);
    const datos = comprimir
      ? new Uint8Array(await new Response(new Blob([crudo]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
      : crudo;
    const n = enc.encode(nombre);
    const local = new Uint8Array(30 + n.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(8, comprimir ? 8 : 0, true);
    v.setUint32(18, datos.length, true);
    v.setUint32(22, crudo.length, true);
    v.setUint16(26, n.length, true);
    local.set(n, 30);
    const c = new Uint8Array(46 + n.length);
    const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(10, comprimir ? 8 : 0, true);
    w.setUint32(20, datos.length, true);
    w.setUint32(24, crudo.length, true);
    w.setUint16(28, n.length, true);
    w.setUint32(42, offset, true);
    c.set(n, 46);
    partes.push(local, datos);
    central.push(c);
    offset += local.length + datos.length;
  }
  const tamCentral = central.reduce((a, c) => a + c.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, central.length, true);
  f.setUint16(10, central.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, offset, true);
  const todo = [...partes, ...central, fin];
  const salida = new Uint8Array(todo.reduce((a, x) => a + x.length, 0));
  let p = 0;
  for (const x of todo) { salida.set(x, p); p += x.length; }
  return salida;
}

/** Un .xlsx con una hoja: la primera fila es texto compartido, el resto mezcla números, texto en línea y fórmulas. */
export async function armarXlsx(filas: (string | number)[][], comprimir = true): Promise<Uint8Array> {
  const compartidos: string[] = [];
  const col = (i: number) => String.fromCharCode(65 + i);
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const xmlFilas = filas.map((f, r) => `<row r="${r + 1}">${f.map((v, i) => {
    const ref = `${col(i)}${r + 1}`;
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    if (r === 0) { compartidos.push(v); return `<c r="${ref}" t="s"><v>${compartidos.length - 1}</v></c>`; }
    return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return armarZip({
    '[Content_Types].xml': '<Types/>',
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="Despacho" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst>${compartidos.map((s) => `<si><r><t>${esc(s.slice(0, 2))}</t></r><r><t xml:space="preserve">${esc(s.slice(2))}</t></r></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${xmlFilas}</sheetData></worksheet>`,
  }, comprimir);
}
