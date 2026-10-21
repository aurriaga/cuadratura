#!/usr/bin/env node
/**
 * Pruebas del robot de carga y de los lectores de la app.
 *
 * Arma en una carpeta temporal empresas de ejemplo con archivos inventados
 * (CSV, Excel y PDF hechos aquí mismo, sin datos de clientes reales), las pasa
 * por el robot y revisa que el resultado sea el esperado.
 *
 *   node robot/probar.mjs
 *
 * Termina con código 1 si algo falla: GitHub lo marca en rojo.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { montarEntorno, procesarEmpresa, silenciar } from './cargar.mjs';

/* ---------- archivos de prueba hechos a mano ---------- */

// ZIP sin comprimir: basta para armar un .xlsx que la app tiene que poder abrir
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = u8 => { let c = 0xFFFFFFFF; for(const b of u8) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipGuardado(archivos){
  const partes = [], central = [];
  let off = 0;
  for(const [nombre, contenido] of Object.entries(archivos)){
    const n = Buffer.from(nombre, 'utf8'), d = Buffer.from(contenido, 'utf8'), crc = crc32(d);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(d.length, 18); loc.writeUInt32LE(d.length, 22); loc.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(d.length, 20); cen.writeUInt32LE(d.length, 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(off, 42);
    partes.push(loc, n, d); central.push(cen, n);
    off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(central.length / 2, 8); fin.writeUInt16LE(central.length / 2, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, cd, fin]);
}
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// hojas = [{nombre, filas:[[...]]}]; los números van como número y el resto como texto
function xlsx(hojas){
  const col = i => String.fromCharCode(65 + i);
  const archivos = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + hojas.map((h, i) => `<sheet name="${xmlEsc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>'
  };
  hojas.forEach((h, i) => {
    archivos[`xl/worksheets/sheet${i + 1}.xml`] = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + h.filas.map((f, r) => `<row r="${r + 1}">` + f.map((v, c) => v === '' ? '' : typeof v === 'number'
          ? `<c r="${col(c)}${r + 1}"><v>${v}</v></c>`
          : `<c r="${col(c)}${r + 1}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`).join('') + '</row>').join('')
      + '</sheetData></worksheet>';
  });
  return zipGuardado(archivos);
}
// PDF de una página con texto en posiciones fijas, como el de un banco.
// lineas = [[y, [x, texto], [x, texto]…]]
// Con {sistema:true} se arma como lo exportan los sistemas contables: el
// contenido comprimido y una fuente Identity-H, donde cada letra es un número
// que solo se traduce con su mapa ToUnicode.
function pdfTexto(lineas, {sistema = false} = {}){
  const letras = [...new Set(lineas.flatMap(([, ...c]) => c.flatMap(([, t]) => [...t])))];
  const hex4 = n => n.toString(16).toUpperCase().padStart(4, '0');
  const mostrar = sistema
    ? t => '<' + [...t].map(ch => hex4(letras.indexOf(ch) + 1)).join('') + '>'
    : t => '(' + t.replace(/[\\()]/g, m => '\\' + m) + ')';
  const cs = Buffer.from('BT /F1 9 Tf\n' + lineas.map(([y, ...celdas]) => celdas.map(([x, t]) => `1 0 0 1 ${x} ${y} Tm ${mostrar(t)} Tj`).join('\n')).join('\n') + '\nET', 'latin1');
  const flujo = (dict, datos) => [Buffer.from(`<< ${dict} /Length ${datos.length} >>\nstream\n`, 'latin1'), datos, Buffer.from('\nendstream', 'latin1')];
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'
  ];
  if(!sistema){
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', flujo('', cs));
  } else {
    const cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n'
      + '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n'
      + `${letras.length} beginbfchar\n` + letras.map((ch, i) => `<${hex4(i + 1)}> <${hex4(ch.codePointAt(0))}>`).join('\n') + '\nendbfchar\n'
      + 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    objs.push('<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Arial /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>',
              flujo('/Filter /FlateDecode', deflateSync(cs)),
              '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+Arial /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 556 >>',
              flujo('/Filter /FlateDecode', deflateSync(Buffer.from(cmap, 'latin1'))));
  }
  const partes = [Buffer.from('%PDF-1.5\n', 'latin1')];
  let largo = partes[0].length;
  const pos = objs.map((o, i) => {
    const p = largo;
    const trozos = [Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), ...(typeof o === 'string' ? [Buffer.from(o, 'latin1')] : o), Buffer.from('\nendobj\n', 'latin1')];
    trozos.forEach(t => { partes.push(t); largo += t.length; });
    return p;
  });
  partes.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('')
    + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${largo}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}

/* ---------- los datos inventados ---------- */

// Balance de comprobación de dos empresas en una misma tabla (como una tabla
// dinámica: la empresa aparece solo en la primera fila de su grupo)
const BALANCE_DOS_EMPRESAS = [
  'Empresa;Cuenta;Debe;Haber',
  'Alfa SpA;1101 - Caja;500000;0',
  ';1102 - Banco;1500000;0',
  ';3101 - Capital;0;2000000',
  'Beta Ltda;1101 - Caja;300000;0',
  ';1105 - Mercaderías;700000;0',
  ';2101 - Proveedores;0;400000',
  ';3101 - Capital;0;600000',
  'Total general;;3000000;3000000'
].join('\n');

const filasBalance = (empresa, cuentas) => [
  ['Balance de comprobación'], [empresa], [''],
  ['Código', 'Cuenta', 'Debe', 'Haber'],
  ...cuentas
];
const EXCEL_POR_HOJAS = xlsx([
  {nombre: 'Saldos Beta', filas: filasBalance('Beta Ltda', [[1101, 'Caja', 300000, 0], [1105, 'Mercaderías', 700000, 0], [2101, 'Proveedores', 0, 400000], [3101, 'Capital', 0, 600000]])},
  {nombre: 'Saldos Alfa', filas: filasBalance('Alfa SpA', [[1101, 'Caja', 500000, 0], [1102, 'Banco', 1500000, 0], [3101, 'Capital', 0, 2000000]])},
  {nombre: 'ESF Beta', filas: [['Estado de situación financiera'], ['Beta Ltda'], [''], ['Código', 'Cuenta', 'Monto'],
                                [1101, 'Caja', 300000], [1105, 'Mercaderías', 700000], [2101, 'Proveedores', 400000], [3101, 'Capital', 600000]]}
]);

const DIARIO = [
  'Fecha;N°;Cuenta;Glosa;Debe;Haber',
  '02/01/2026;1;1101;Aporte de capital;1.000.000;0',
  '02/01/2026;1;3101;Aporte de capital;0;1.000.000',
  '15/01/2026;2;5103;Arriendo de enero;400.000;0',
  '15/01/2026;2;1101;Arriendo de enero;0;400.000'
].join('\n');

// Cartola con fechas sin año, de la más nueva a la más antigua, signo al final
// y un salto de saldo sembrado a propósito el 15/06
const CARTOLA_CSV = [
  'BANCO EJEMPLO;;;;', 'Cartola de cuenta corriente;;;;', 'Período: 01/06/2026 al 30/06/2026;;;;',
  'Fecha;Descripción;N° Documento;Monto;Saldo',
  '30/06;COMISION MANTENCION;0;12.500-;1.487.500',
  '28/06;TRANSF A PROVEEDOR UNO;123;200.000-;1.500.000',
  '28/06;DEPOSITO CLIENTE DOS;456;300.000;',
  '15/06;PAGO PREVIRED;789;100.000-;1.400.000',
  '10/06;TRANSF DE CLIENTE TRES;111;500.000;1.400.000',
  '05/06;CHEQUE COBRADO;222;100.000-;900.000'
].join('\n');

const LINEAS_CARTOLA = [
  [800, [40, 'BANCO DE PRUEBA S.A.']],
  [785, [40, 'Cartola de cuenta corriente N° 00-123-45678-9']],
  [770, [40, 'Período: 01/07/2026 al 31/07/2026']],
  [740, [40, 'Fecha'], [110, 'Descripción'], [300, 'Cargo'], [370, 'Abono'], [440, 'Saldo']],
  [722, [40, '02/07/2026'], [110, 'Depósito cliente'], [370, '150.000'], [440, '650.000']],
  [706, [40, '05/07/2026'], [110, 'Pago proveedor'], [300, '80.000'], [440, '570.000']],
  [690, [40, '10/07/2026'], [110, 'Comisión mantención'], [300, '5.000'], [440, '565.000']],
  [674, [40, '15/07/2026'], [110, 'Transferencia recibida'], [370, '35.000'], [440, '600.000']]
];
const CARTOLA_PDF = pdfTexto(LINEAS_CARTOLA);
const CARTOLA_PDF_SISTEMA = pdfTexto(LINEAS_CARTOLA, {sistema: true});

/* ---------- el arnés ---------- */

let pasan = 0;
const fallan = [];
const casos = [];
const caso = (nombre, fn) => casos.push({nombre, fn});
function igual(real, esperado, que){
  if(JSON.stringify(real) !== JSON.stringify(esperado)) throw new Error(`${que}: esperaba ${JSON.stringify(esperado)} y salió ${JSON.stringify(real)}`);
}
function cierto(v, que){ if(!v) throw new Error(que); }

const TMP = mkdtempSync(join(tmpdir(), 'cuadratura-pruebas-'));
let nCarpeta = 0;
function empresa(cfg, archivos){
  const dir = join(TMP, 'empresa-' + (++nCarpeta));
  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'empresa.json'), JSON.stringify(Object.assign({ejercicio: 2026, mes: 11}, cfg)));
  for(const [n, c] of Object.entries(archivos)) writeFileSync(join(dir, n), c);
  return dir;
}
const sumaDebe = S => S.asientos.reduce((a, x) => a + x.lineas.reduce((b, l) => b + l.d, 0), 0);
const cuentasUsadas = S => [...new Set(S.asientos.flatMap(a => a.lineas.map(l => l.c)))].sort();
const hay = (lista, re) => lista.some(x => re.test(x));

silenciar(true);
const api = montarEntorno();

/* ---------- los casos ---------- */

caso('Lectura de montos chilenos', ()=>{
  igual(api.numCSV('1.234.567'), 1234567, '1.234.567');
  igual(api.numCSV('12.500-'), -12500, 'signo al final');
  igual(api.numCSV('(1.234)'), -1234, 'paréntesis');
  igual(api.numCSV('$ 1.234,50'), 1234.5, 'decimales con coma');
  igual(api.numCSV('1,234,567'), 1234567, 'miles con coma');
  igual(api.numCSV('−5.000'), -5000, 'signo menos tipográfico');
});

caso('Lectura de fechas', ()=>{
  igual(api.fechaISO('05/06/2026'), '2026-06-05', 'dd/mm/aaaa');
  igual(api.fechaISO('05-06-2026'), '2026-06-05', 'dd-mm-aaaa');
  igual(api.fechaISO('5 de junio de 2026'), '2026-06-05', 'mes en palabras');
  igual(api.fechaISO('05-jun-2026'), '2026-06-05', 'mes abreviado');
});

caso('Balance con dos empresas: toma la que se llama como la carpeta', async ()=>{
  const r = await procesarEmpresa(api, empresa({nombre: 'Beta Limitada'}, {'apertura-2026.csv': BALANCE_DOS_EMPRESAS}));
  igual(r.errores, [], 'errores');
  cierto(r.sano, 'la carga debería quedar sana');
  igual(r.S.asientos.length, 1, 'asientos de apertura');
  igual(cuentasUsadas(r.S), ['1101', '1105', '2101', '3101'], 'cuentas de Beta');
  igual(sumaDebe(r.S), 1000000, 'debe de Beta');
  // y el informe para el cliente sale con su gráfico de estructura
  api.fijarS(r.S); api.reconstruirPlan();
  cierto(/aria-label="Estructura del balance"/.test(api.generarInforme(r.S.compartir)), 'el informe debería traer el gráfico de estructura');
});

caso('Balance con dos empresas: si ninguna coincide, no adivina', async ()=>{
  const r = await procesarEmpresa(api, empresa({nombre: 'Gamma SpA'}, {'apertura-2026.csv': BALANCE_DOS_EMPRESAS}));
  cierto(hay(r.errores, /empresaEnArchivo/), 'debería pedir "empresaEnArchivo"');
  cierto(!r.sano, 'no debería quedar sana');
  igual(r.S.asientos.length, 0, 'no debería cargar nada');
});

caso('Balance con dos empresas: "empresaEnArchivo" elige', async ()=>{
  const r = await procesarEmpresa(api, empresa({nombre: 'Gamma SpA', empresaEnArchivo: 'Alfa SpA'}, {'apertura-2026.csv': BALANCE_DOS_EMPRESAS}));
  igual(r.errores, [], 'errores');
  igual(cuentasUsadas(r.S), ['1101', '1102', '3101'], 'cuentas de Alfa');
  igual(sumaDebe(r.S), 2000000, 'debe de Alfa');
});

caso('Excel con una hoja por empresa y un estado ya elaborado', async ()=>{
  const r = await procesarEmpresa(api, empresa({nombre: 'Beta Ltda'}, {'contabilidad-beta.xlsx': EXCEL_POR_HOJAS}));
  igual(r.errores, [], 'errores');
  igual(r.S.asientos.length, 1, 'un solo asiento de apertura (sin duplicar con el estado)');
  igual(r.S.asientos[0].origen, 'apertura', 'leído como saldos, no como diario');
  igual(cuentasUsadas(r.S), ['1101', '1105', '2101', '3101'], 'cuentas de Beta');
  cierto(hay(r.avisos, /\[Saldos Alfa\]: es de otra empresa/), 'debería saltarse la hoja de Alfa');
  cierto(hay(r.avisos, /\[ESF Beta\]: es un informe ya elaborado/), 'debería saltarse el estado ya elaborado');
});

caso('Libro diario en CSV', async ()=>{
  const r = await procesarEmpresa(api, empresa({nombre: 'Delta SpA'}, {'diario-enero.csv': DIARIO}));
  igual(r.errores, [], 'errores');
  igual(r.S.asientos.length, 2, 'asientos');
  igual(api.eri(api.asientosDelEjercicio()).neto, -400000, 'resultado');
});

caso('Cartola en CSV: fechas sin año, orden inverso y salto de saldo', async ()=>{
  const r = await procesarEmpresa(api, empresa({nombre: 'Épsilon SpA'}, {'cartola-junio.csv': CARTOLA_CSV}));
  const m = r.S.banco.movs;
  igual(m.length, 6, 'movimientos');
  igual([m[0].fecha, m[m.length - 1].fecha], ['2026-06-05', '2026-06-30'], 'de la más antigua a la más nueva');
  igual(m.reduce((a, x) => a + x.monto, 0), 387500, 'suma');
  cierto(hay(r.avisos, /15-06-2026.*no calza/), 'debería avisar el salto de saldo del 15-06');
});

for(const [que, pdf] of [['simple', CARTOLA_PDF], ['comprimido y con fuente Identity-H', CARTOLA_PDF_SISTEMA]])
  caso('Cartola en PDF ' + que, async ()=>{
    const r = await procesarEmpresa(api, empresa({nombre: 'Zeta SpA'}, {'cartola-julio.pdf': pdf}));
    const m = r.S.banco.movs;
    igual(m.map(x => x.monto), [150000, -80000, -5000, 35000], 'montos con su signo');
    igual(m.map(x => x.saldo), [650000, 570000, 565000, 600000], 'saldos');
    igual(m[2].glosa, 'Comisión mantención', 'glosa con tildes');
    cierto(!hay(r.avisos, /no calza|diferencia/), 'el saldo debería calzar: ' + r.avisos.join(' | '));
  });

caso('Apertura descuadrada: error y sin informe', async ()=>{
  const r = await procesarEmpresa(api, empresa({nombre: 'Eta SpA'}, {'apertura.csv': 'Código;Cuenta;Debe;Haber\n1101;Caja;100000;0\n3101;Capital;0;90000'}));
  cierto(hay(r.errores, /descuadrado en 10\.000/), 'debería informar el descuadre');
  cierto(!r.sano, 'no debería quedar sana');
});

/* ---------- comprobantes, períodos, auxiliares y exportación ---------- */

// Empresa en memoria con tres documentos y sus movimientos, para los casos de abajo.
function empresaChica(){
  const S = api.estadoInicial();
  S.emp.ejercicio = 2026; S.ui.ano = 2026; S.ui.mes = 2;   // corte a marzo
  api.fijarS(S); api.reconstruirPlan();
  const doc = (o) => Object.assign({id: api.uid(), dte: '33', exento: 0, ila: 0, retencion: 0, ilaTasa: 0,
    condicion: 'credito', creditoIva: true, costo: 0, nc: false}, o);
  api.addAsiento('2026-01-02', 'Aporte inicial', [{c:'1102', d:5000000}, {c:'3101', h:5000000}]);
  api.registrarDoc(doc({fecha:'2026-01-10', clase:'venta', folio:'101', contraparte:'Comercial Uno', rut:'76.111.111-1', neto:1000000, iva:190000, total:1190000, cuenta:'4101'}));
  api.registrarDoc(doc({fecha:'2026-03-05', clase:'venta', folio:'102', contraparte:'Comercial Uno', rut:'76111111-1', neto:500000, iva:95000, total:595000, cuenta:'4101'}));
  api.registrarDoc(doc({fecha:'2026-02-01', clase:'compra', folio:'9', contraparte:'Proveedor Dos', rut:'77.222.222-2', neto:300000, iva:57000, total:357000, cuenta:'5104'}));
  return api.leerS();
}

caso('Comprobantes: tipo y folio correlativo por tipo', ()=>{
  const S = empresaChica();
  igual(S.asientos.map(a => api.etiquetaCbte(a)),
    ['Ingreso N° 1', 'Traspaso N° 1', 'Traspaso N° 3', 'Traspaso N° 2'], 'aporte por banco es Ingreso, ventas y compras a crédito son Traspaso (orden por fecha)');
  const pago = api.addAsiento('2026-02-20', 'Pago luz', [{c:'5104', d:40000}, {c:'1102', h:40000}]);
  igual(api.etiquetaCbte(pago), 'Egreso N° 1', 'salida de banco es Egreso');
  const caja = api.addAsiento('2026-02-21', 'Depósito', [{c:'1102', d:10000}, {c:'1101', h:10000}]);
  igual(caja.tipo, 'T', 'de caja a banco es Traspaso');
  api.borrarAsiento(pago.id);
  const otro = api.addAsiento('2026-02-22', 'Pago agua', [{c:'5104', d:20000}, {c:'1102', h:20000}]);
  igual(otro.folio, 2, 'el folio anulado no se reutiliza');
  cierto(S.bitacora.some(b => b.accion === 'anulado' && /Egreso N° 1/.test(b.detalle)), 'el anulado queda en la bitácora');
});

caso('Respaldo antiguo sin folios se numera por fecha', ()=>{
  const viejo = {docs: [], asientos: [
    {id:'b', n:2, fecha:'2026-02-01', glosa:'x', lineas:[{c:'5104', d:10, h:0}, {c:'1101', d:0, h:10}]},
    {id:'a', n:1, fecha:'2026-01-01', glosa:'y', lineas:[{c:'1101', d:10, h:0}, {c:'3101', d:0, h:10}]}]};
  const S = api.migrar(viejo);
  igual(S.asientos.map(a => a.tipo + a.folio), ['E1', 'I1'], 'tipos y folios');
  igual(S.folios['2026'], {I:1, E:1, T:0}, 'contadores');
});

caso('Mes cerrado: no admite asientos, documentos ni borrados', ()=>{
  const S = empresaChica();
  S.cierres = {'2026-02': {cuando: '2026-03-01T00:00:00Z'}};
  api.bloqueos.length = 0;
  const n = S.asientos.length, nd = S.docs.length;
  cierto(api.addAsiento('2026-02-15', 'Tarde', [{c:'5104', d:1}, {c:'1101', h:1}]) === null, 'el asiento debería rechazarse');
  cierto(api.registrarDoc({id:'z', fecha:'2026-02-10', clase:'compra', neto:1, iva:0, total:1, exento:0, ila:0, retencion:0, cuenta:'5104', condicion:'credito'}) === false, 'el documento debería rechazarse');
  const compra = S.docs.find(d => d.folio === '9');
  cierto(api.borrarDoc(compra.id) === false, 'no se debería poder borrar un documento de febrero');
  igual([S.asientos.length, S.docs.length], [n, nd], 'nada cambió');
  igual(api.bloqueos.length, 3, 'tres bloqueos avisados');
  cierto(api.addAsiento('2026-03-15', 'Marzo sigue abierto', [{c:'5104', d:1}, {c:'1101', h:1}]), 'marzo sí acepta');
});

caso('Revisión del cierre: el descuadre impide cerrar', ()=>{
  const S = empresaChica();
  igual(api.revisionPeriodo('2026-01').puede, true, 'enero cuadra');
  S.asientos.push({id:'malo', n:99, tipo:'T', folio:99, fecha:'2026-01-20', glosa:'malo', lineas:[{c:'5104', d:100, h:0}, {c:'1101', d:0, h:90}]});
  igual(api.revisionPeriodo('2026-01').puede, false, 'con un comprobante descuadrado no se puede cerrar');
});

caso('Auxiliar por RUT: agrupa, descuenta cobros y cuadra con la contabilidad', ()=>{
  const S = empresaChica();
  const f101 = S.docs.find(d => d.folio === '101');
  api.registrarPagoDoc(f101, '2026-02-15', 500000, '1102');
  const X = api.auxiliar('cli', '2026-03-31');
  igual(X.filas.length, 1, 'los dos RUT escritos distinto son el mismo cliente');
  igual(X.T.total, 690000 + 595000, 'saldo: 1.190.000 − 500.000 + 595.000');
  igual(X.filas[0].tramos, [595000, 0, 690000, 0, 0], 'antigüedad: 26 días y 80 días');
  igual(X.dif, 0, 'cuadra con la cuenta 1103');
  igual(api.pendienteDoc(f101), 690000, 'saldo del documento');
  const P = api.auxiliar('pro', '2026-03-31');
  igual([P.T.total, P.dif], [357000, 0], 'proveedores cuadran con la 2101');
  // un cobro por asiento manual sin amarrar al documento descuadra el auxiliar, y se ve
  api.addAsiento('2026-03-20', 'Cobro suelto', [{c:'1102', d:100000}, {c:'1103', h:100000}]);
  igual(api.auxiliar('cli', '2026-03-31').dif, 100000, 'la diferencia aparece');
});

caso('Exportaciones: mismo corte, misma cifra de control, mismos totales', ()=>{
  const S = empresaChica();
  api.addAsiento('2026-06-30', 'Junio, fuera del corte', [{c:'5104', d:77777}, {c:'1102', h:77777}]);
  const C = api.corte();
  igual(C.hasta, '2026-03-31', 'corte a fin de marzo');
  const debe = C.lista.reduce((a, x) => a + x.lineas.reduce((b, l) => b + l.d, 0), 0);
  igual(C.debe, debe, 'cifra de control');
  for(const k of ['diario', 'mayor', 'balance', 'eeff', 'auxiliar']){
    const txt = api.EXPORTES[k](C);
    cierto(txt.includes('Cifra de control (suma del Debe);' + C.debe), k + ': lleva la cifra de control');
    cierto(!txt.includes('77777'), k + ': no trae movimientos fuera del corte');
  }
  const F = api.filasEEFF(C.lista), b = api.balance8(C.lista);
  igual(Math.round(F.esf.find(f => f.tot === 'Total activo').v), Math.round(F.E.activo), 'total activo del ESF');
  igual(b.T.sd, C.debe, 'sumas del balance = cifra de control');
  // cada fila de detalle suma a su total, sin cuentas escondidas
  const sec = (L, desde, hasta) => { const i = L.findIndex(f => f.sec === desde), j = L.findIndex(f => f.tot === hasta);
    return L.slice(i + 1, j).filter(f => !f.sec && !f.tot).reduce((a, f) => a + f.v, 0); };
  igual(Math.round(sec(F.esf, 'Activo corriente', 'Total activo corriente')), Math.round(F.E.ac), 'filas del activo corriente');
  igual(Math.round(sec(F.eri, 'Gastos de administración y ventas', 'Resultado operacional')), Math.round(F.r.oper), 'filas de gastos');
});

/* ---------- bloque 2: centros, comparativos, flujo de caja ---------- */

caso('Centros de costo: se guardan en resultados y suman el resultado del ERI', ()=>{
  const S = empresaChica();
  S.centros = [['SUC1', 'Sucursal Centro'], ['SUC2', 'Sucursal Norte']];
  api.registrarDoc({id: api.uid(), fecha:'2026-03-10', clase:'venta', dte:'33', folio:'103', contraparte:'X', rut:'', neto:200000, exento:0, iva:38000, ila:0, retencion:0, total:238000, cuenta:'4101', condicion:'banco', costo:0, nc:false, cc:'SUC2'});
  const a = api.addAsiento('2026-03-12', 'Arriendo norte', [{c:'5103', d:150000, cc:'SUC2'}, {c:'1102', h:150000, cc:'SUC2'}]);
  igual(a.lineas.map(l => l.cc || ''), ['SUC2', ''], 'el centro solo queda en la cuenta de resultado');
  const C = api.corte(), RC = api.resultadoPorCentro(C.lista);
  igual(RC.cols, ['SUC1', 'SUC2', ''], 'columnas: los centros y lo que no tiene centro');
  igual([RC.T.SUC2.ing, RC.T.SUC2.gasto, RC.T.SUC2.res], [200000, 150000, 50000], 'resultado de la sucursal norte');
  const total = RC.cols.reduce((t, k) => t + RC.T[k].res, 0);
  igual(Math.round(total), Math.round(api.eri(C.lista).neto), 'la suma de los centros es el resultado del ejercicio');
  igual(api.centroDesdeTexto('sucursal norte'), 'SUC2', 'un libro importado reconoce el centro por su nombre');
  igual(api.centroDesdeTexto('Proyecto Puerto'), 'PROYECTOPU', 'y crea el que no existe');
});

caso('Comparativo: filas alineadas contra el año anterior', ()=>{
  const S = empresaChica();
  api.addAsiento('2025-02-10', 'Venta 2025', [{c:'1102', d:800000}, {c:'4101', h:800000}]);
  api.addAsiento('2025-02-20', 'Arriendo 2025', [{c:'5103', d:100000}, {c:'1102', h:100000}]);
  api.addAsiento('2025-06-10', 'Venta 2025 fuera del período', [{c:'1102', d:999000}, {c:'4101', h:999000}]);
  const X = api.comparativo(api.periodosComparados('anual'));
  const fila = (L, c) => L.find(f => f.c === c);
  igual(fila(X.eri, '4101').vs, [1500000, 800000], 'ventas ene–mar de cada año (sin junio 2025)');
  igual(fila(X.eri, '5103').vs, [0, 100000], 'una cuenta que solo tiene el año anterior también aparece');
  igual(fila(X.esf, '1102').vs, [5000000, 1699000], 'banco al corte contra el 31-12 del año anterior');
  const M = api.comparativo(api.periodosComparados('mes'));
  igual(M.tits, ['marzo 2026', 'febrero 2026'], 'mes contra mes anterior');
});

caso('Resultado mes a mes: el total cuadra con el ERI del corte', ()=>{
  const S = empresaChica();
  const X = api.eriMensual(api.corte());
  igual(X.meses.length, 3, 'enero a marzo');
  const neto = X.filas.find(f => f.tot === 'Resultado del ejercicio');
  igual(neto.vs, [1000000, -300000, 500000], 'resultado de cada mes');
  igual(Math.round(neto.total), Math.round(api.eri(api.corte().lista).neto), 'total del año');
});

caso('Flujo de caja: clasifica por actividad y calza con el mayor', ()=>{
  const S = api.estadoInicial(); S.emp.ejercicio = 2026; S.ui.ano = 2026; S.ui.mes = 1;
  api.fijarS(S); api.reconstruirPlan();
  api.addAsiento('2026-01-01', 'Saldos de apertura', [{c:'1102', d:1000000}, {c:'3101', h:1000000}], 'apertura');
  api.addAsiento('2026-01-05', 'Aporte', [{c:'1102', d:2000000}, {c:'3101', h:2000000}]);
  api.addAsiento('2026-01-10', 'Venta contado', [{c:'1102', d:119000}, {c:'4101', h:100000}, {c:'2103', h:19000}]);
  api.addAsiento('2026-02-03', 'Compra notebook', [{c:'1203', d:900000}, {c:'1102', h:900000}]);
  api.addAsiento('2026-02-28', 'Sueldos', [{c:'2104', d:400000}, {c:'1102', h:400000}]);
  api.addAsiento('2026-02-28', 'Caja a banco', [{c:'1101', d:50000}, {c:'1102', h:50000}]);
  const F = api.flujoCaja(api.corte());
  igual(F.inicial, 1000000, 'la apertura es saldo inicial, no flujo');
  igual([F.total.op, F.total.inv, F.total.fin], [119000 - 400000, -900000, 2000000], 'operación, inversión y financiamiento');
  igual(F.secc.op.lineas['Cobros a clientes'], [119000, 0], 'el cobro de la venta al contado incluye el IVA, igual que una a crédito');
  cierto(!F.secc.op.lineas['Impuestos (IVA, PPM, retenciones, renta)'], 'el IVA de la venta no se separa como impuesto');
  igual(F.fin, [3119000, 1819000], 'saldo de cada mes (el traspaso caja-banco no es flujo)');
  igual(F.dif, 0, 'calza con el mayor de caja y banco');
});

caso('Exportaciones del bloque 2 llevan la misma cifra de control', ()=>{
  const S = empresaChica(); S.centros = [['A', 'Área A']];
  const C = api.corte();
  for(const k of ['comparativo', 'mensual', 'flujo', 'centros'])
    cierto(api.EXPORTES[k](C).includes('Cifra de control (suma del Debe);' + C.debe), k + ': lleva la cifra de control');
});

/* ---------- auditoría con datos de una empresa real (aquí, inventados con su misma forma) ---------- */

// Libro en Excel con plan propio (clase y rubro), diario, mayor y balance de comprobación, como lo
// entrega un contador. El diario trae RUT y razón social de la contraparte en cada línea.
const LD_CAB = ['N. Asiento','Fecha','Origen','Glosa','Cuenta','Nombre de la cuenta','Debe','Haber','Documento','RUT','Razon social'];
const ld = (n, f, o, g, c, nom, d, h, rut, rs) => [n, f, o, g, c, nom, d || '', h || '', 'doc ' + n, rut || '', rs || ''];
const LIBRO_PROPIO = xlsx([
  {nombre: 'Portada', filas: [['LIBRO DIARIO 2026'], ['GAMMA AGRICOLA SPA - RUT 76.900.900-1'], ['Periodo', 'enero 2026']]},
  {nombre: 'Plan de Cuentas', filas: [['Codigo','Nombre de la cuenta','Clase','Rubro','Debitos','Creditos','Saldo'],
    ['1-01-001','Banco Estado Cta. Cte. 12345678','ACTIVO','Activo corriente',1119000,159500,959500],
    ['1-01-002','Banco Itau Cta. Cte. 0-222-333-4','ACTIVO','Activo corriente',650000,1000,649000],
    ['1-02-001','Deudores comerciales nacionales','ACTIVO','Activo corriente',557000,169000,388000],
    ['1-03-001','IVA Credito Fiscal','ACTIVO','Activo corriente',9500,0,9500],
    ['1-06-001','Maquinaria agricola','ACTIVO','Activo no corriente',0,0,0],
    ['2-01-001','Proveedores nacionales','PASIVO','Pasivo corriente',59500,59500,0],
    ['2-01-002','Obligaciones por factoring','PASIVO','Pasivo corriente',0,0,0],
    ['2-02-001','IVA Debito Fiscal','PASIVO','Pasivo corriente',0,57000,-57000],
    ['3-01-001','Capital pagado','PATRIMONIO','Patrimonio',0,1500000,-1500000],
    ['4-01-001','Ventas del giro','RESULTADO','Ingresos',0,500000,-500000],
    ['5-01-001','Compras del giro','RESULTADO','Costos',50000,0,50000],
    ['5-04-001','Gastos financieros y comisiones bancarias','RESULTADO','Resultado no operacional',1000,0,1000],
    ['5-04-002','Impuestos y retenciones del periodo','RESULTADO','Resultado no operacional',0,0,0]]},
  {nombre: 'Libro Diario', filas: [LD_CAB,
    ld('00001','01-01-2026','APERTURA','Asiento de apertura del ejercicio','1-01-001','Banco Estado Cta. Cte. 12345678',1000000,0,'76900900-1','GAMMA AGRICOLA SPA'),
    ld('00001','01-01-2026','APERTURA','Asiento de apertura del ejercicio','1-01-002','Banco Itau Cta. Cte. 0-222-333-4',500000,0,'76900900-1','GAMMA AGRICOLA SPA'),
    ld('00001','01-01-2026','APERTURA','Asiento de apertura del ejercicio','3-01-001','Capital pagado',0,1500000,'76900900-1','GAMMA AGRICOLA SPA'),
    ld('00002','05-01-2026','VENTAS','Venta a Cliente Uno','1-02-001','Deudores comerciales nacionales',119000,0,'76111111-1','CLIENTE UNO SPA'),
    ld('00002','05-01-2026','VENTAS','Venta a Cliente Uno','4-01-001','Ventas del giro',0,100000,'76111111-1','CLIENTE UNO SPA'),
    ld('00002','05-01-2026','VENTAS','Venta a Cliente Uno','2-02-001','IVA Debito Fiscal',0,19000,'76111111-1','CLIENTE UNO SPA'),
    ld('00003','06-01-2026','VENTAS','Venta de exportacion','1-02-001','Deudores comerciales nacionales',200000,0,'55555555-5','FOREIGN BUYER LTD'),
    ld('00003','06-01-2026','VENTAS','Venta de exportacion','4-01-001','Ventas del giro',0,200000,'55555555-5','FOREIGN BUYER LTD'),
    ld('00004','07-01-2026','VENTAS','Venta a Cliente Dos','1-02-001','Deudores comerciales nacionales',238000,0,'76222222-2','CLIENTE DOS LTDA'),
    ld('00004','07-01-2026','VENTAS','Venta a Cliente Dos','4-01-001','Ventas del giro',0,200000,'76222222-2','CLIENTE DOS LTDA'),
    ld('00004','07-01-2026','VENTAS','Venta a Cliente Dos','2-02-001','IVA Debito Fiscal',0,38000,'76222222-2','CLIENTE DOS LTDA'),
    ld('00005','10-01-2026','COMPRAS','Compra de insumos','5-01-001','Compras del giro',50000,0,'77333333-3','PROVEEDOR TRES SPA'),
    ld('00005','10-01-2026','COMPRAS','Compra de insumos','1-03-001','IVA Credito Fiscal',9500,0,'77333333-3','PROVEEDOR TRES SPA'),
    ld('00005','10-01-2026','COMPRAS','Compra de insumos','2-01-001','Proveedores nacionales',0,59500,'77333333-3','PROVEEDOR TRES SPA'),
    ld('00006','15-01-2026','TESORERIA','Cobro Cliente Uno','1-01-001','Banco Estado Cta. Cte. 12345678',119000,0,'76111111-1','CLIENTE UNO SPA'),
    ld('00006','15-01-2026','TESORERIA','Cobro Cliente Uno','1-02-001','Deudores comerciales nacionales',0,119000,'76111111-1','CLIENTE UNO SPA'),
    ld('00007','16-01-2026','TESORERIA','Deposito sin identificar','1-01-002','Banco Itau Cta. Cte. 0-222-333-4',50000,0),
    ld('00007','16-01-2026','TESORERIA','Deposito sin identificar','1-02-001','Deudores comerciales nacionales',0,50000),
    ld('00008','20-01-2026','TESORERIA','Pago Proveedor Tres','2-01-001','Proveedores nacionales',59500,0,'77333333-3','PROVEEDOR TRES SPA'),
    ld('00008','20-01-2026','TESORERIA','Pago Proveedor Tres','1-01-001','Banco Estado Cta. Cte. 12345678',0,59500,'77333333-3','PROVEEDOR TRES SPA'),
    ld('00009','25-01-2026','TESORERIA','Comision bancaria','5-04-001','Gastos financieros y comisiones bancarias',1000,0),
    ld('00009','25-01-2026','TESORERIA','Comision bancaria','1-01-002','Banco Itau Cta. Cte. 0-222-333-4',0,1000),
    ld('00010','26-01-2026','TESORERIA','Traspaso entre cuentas','1-01-002','Banco Itau Cta. Cte. 0-222-333-4',100000,0),
    ld('00010','26-01-2026','TESORERIA','Traspaso entre cuentas','1-01-001','Banco Estado Cta. Cte. 12345678',0,100000)]},
  {nombre: 'Libro Mayor', filas: [['Cuenta','Nombre de la cuenta','Fecha','N. Asiento','Glosa','Documento','Debe','Haber','Saldo acumulado'],
    ['1-01-001','Banco Estado Cta. Cte. 12345678','01-01-2026','00001','Apertura','x',1000000,'',1000000],
    ['1-01-001','Banco Estado Cta. Cte. 12345678','15-01-2026','00006','Cobro','x',119000,'',1119000],
    ['3-01-001','Capital pagado','01-01-2026','00001','Apertura','x','',1500000,-1500000]]},
  {nombre: 'Balance Comprobacion', filas: [['BALANCE DE COMPROBACION AL 31 DE ENERO DE 2026'],
    ['Codigo','Nombre de la cuenta','Debitos','Creditos','Saldo deudor','Saldo acreedor'],
    ['1-01-001','Banco Estado Cta. Cte. 12345678',1119000,159500,959500,''],
    ['3-01-001','Capital pagado',0,1500000,'',1500000]]},
  {nombre: 'Observaciones', filas: [['N.','Materia','Monto','Detalle'], ['1','Cobro sin RUT','50000','Pedir respaldo']]}
]);
// Dos cartolas, una por cuenta, con el número en el encabezado. La primera trae el saldo solo arriba.
const CARTOLA_ESTADO = 'Cartola histórica;;;\nCuenta Corriente N°: 12345678;;;\nSALDO INICIAL;DEPÓSITOS;OTROS CARGOS;SALDO FINAL\n1000000;119000;-259500;859500\n' +
  'MONTO;DESCRIPCIÓN MOVIMIENTO;FECHA;CARGO/ABONO\n119000;Transferencia Cliente Uno;15/01/2026;A\n-59500;Pago Proveedor Tres;20/01/2026;C\n-100000;Traspaso a Itau;26/01/2026;C';
const CARTOLA_ITAU = 'Nombre Empresa;GAMMA AGRICOLA SPA\nNumero Cuenta;0-222-333-4\nSaldo Anterior;500000\nSaldo Actual;649000\n' +
  'Fecha;Descripción;Cargo;Abono;Saldo Diario\n16-01-2026;Deposito;;50000;550000\n25-01-2026;Comision;-1000;;549000\n26-01-2026;Traspaso desde Estado;;100000;649000';

async function gamma(extra){
  return procesarEmpresa(api, empresa({nombre: 'Gamma Agricola SpA', rut: '76.900.900-1', mes: 0},
    Object.assign({'GAMMA_Libro_Diario_2026.xlsx': LIBRO_PROPIO, 'cartola-estado.csv': CARTOLA_ESTADO, 'cartola-itau.csv': CARTOLA_ITAU}, extra || {})));
}

caso('Libro de un contador: plan con clase y rubro, sin duplicar mayor ni balance', async ()=>{
  const r = await gamma();
  igual(r.errores, [], 'errores');
  igual(r.S.asientos.length, 10, 'los 10 asientos del diario, ni uno más');
  cierto(hay(r.avisos, /\[Libro Mayor\]: es el libro mayor/), 'el mayor no se carga dos veces');
  cierto(hay(r.avisos, /\[Balance Comprobacion\]: es un balance armado desde el diario/), 'el balance no es una apertura');
  cierto(!hay(r.avisos, /otra empresa|172 empresas/), 'la razón social de cada línea no se confunde con varias empresas');
  const CTA = api.ev('CTA');
  igual([CTA['106001'].clase, CTA['201002'].tipo, CTA['504002'].sub], ['nc', 'pasivo', 'otrosgastos'], 'la clase y el rubro del plan mandan');
  igual(r.S.asientos.find(a => /apertura/i.test(a.glosa)).origen, 'apertura', 'el asiento de apertura se reconoce');
  igual(Math.round(api.eri(api.asientosDelEjercicio()).neto), 449000, 'resultado: 500.000 − 50.000 − 1.000');
});

caso('Funciones de cuenta con el plan del cliente', async ()=>{
  await gamma();
  const rol = c => api.ev('rolCuenta')(c);
  igual(['101001','101002','102001','103001','201001','202001'].map(rol), ['efectivo','efectivo','clientes','ivaCred','proveedores','ivaDeb'], 'roles');
  const F = api.flujoCaja(api.corte());
  igual(F.inicial, 1500000, 'saldo inicial = apertura de los dos bancos');
  igual([F.total.op, F.total.inv, F.total.fin], [119000 + 50000 - 59500 - 1000, 0, 0], 'el traspaso entre bancos no es flujo');
  igual(F.dif, 0, 'el flujo calza con el mayor');
  const Q = api.cuadratura();
  cierto(Q.chk.find(x => /Partida doble/.test(x.n)).ok, 'partida doble');
});

caso('Dos cuentas corrientes: cada cartola a su cuenta y conciliación exacta', async ()=>{
  const r = await gamma();
  igual(r.S.banco.cuentas.map(b => b.cuenta).sort(), ['101001', '101002'], 'cada cartola se reconoce por el número de cuenta');
  for(const [cta, saldo] of [['101001', 959500], ['101002', 649000]]){
    r.S.banco.cuenta = cta;
    const I = api.informeConciliacion('2026-01-31');
    igual([I.saldoCartola, I.saldoLibro, I.E.soloBanco.length, I.E.soloLibro.length, I.dif], [saldo, saldo, 0, 0, 0], 'cuenta ' + cta);
  }
});

caso('Auxiliar desde el libro: por RUT, extranjeros por nombre y cobros sin RUT aparte', async ()=>{
  await gamma();
  const X = api.auxiliar('cli', '2026-01-31');
  igual(X.modo, 'libro', 'se arma desde el libro');
  igual(X.filas.map(g => [g.nombre, g.total]), [['CLIENTE DOS LTDA', 238000], ['FOREIGN BUYER LTD', 200000]], 'Cliente Uno quedó pagado');
  igual(X.T.sinIdentificar, -50000, 'el depósito sin RUT no se aplica a ningún cliente');
  igual([X.T.total, X.dif], [388000, 0], 'cuadra con la contabilidad');
});

// RCV del SII: NC de exportación, liquidación-factura recibida, combustible y documento de otro mes
const RCV_V = 'Nro;Tipo Doc;Tipo Venta;Rut cliente;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA;Monto total\n' +
  '1;33;Del Giro;76111111-1;CLIENTE UNO SPA;10;05/02/2026;0;100000;19000;119000\n' +
  '2;110;Del Giro;55555555-5;FOREIGN BUYER LTD;11;06/02/2026;300000;0;0;300000\n' +
  '3;112;Del Giro;55555555-5;FOREIGN BUYER LTD;12;07/02/2026;50000;0;0;50000\n' +
  '4;43;Del Giro;76444444-4;FERIA REGIONAL SA;13;08/02/2026;0;200000;38000;238000\n';
const RCV_C = 'Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Monto Total;Codigo Otro Impuesto;Valor Otro Impuesto\n' +
  '1;33;Del Giro;77333333-3;PROVEEDOR TRES SPA;50;03/02/2026;0;100000;19000;;119000;;\n' +
  '2;33;Del Giro;76555555-5;ESTACION DE SERVICIO;51;10/02/2026;0;40000;7600;;67600;35;20000\n' +
  '3;43;Del Giro;76444444-4;FERIA REGIONAL SA;52;12/02/2026;0;150000;28500;;178500;;\n' +
  '4;33;Del Giro;77333333-3;PROVEEDOR TRES SPA;53;28/01/2026;0;10000;1900;;11900;;\n' +
  '5;34;Del Giro;97036000-K;BANCO;54;15/02/2026;0;0;0;;0;;\n';

caso('RCV: NC de exportación, liquidación-factura, combustible y período del registro', async ()=>{
  const S = api.estadoInicial(); S.emp.ejercicio = 2026; S.ui.ano = 2026; S.ui.mes = 1; api.fijarS(S); api.reconstruirPlan();
  const filasV = api.parseCSV(RCV_V, ';'); filasV.periodo = '2026-02';
  const filasC = api.parseCSV(RCV_C, ';'); filasC.periodo = '2026-02';
  const v = api.analizarImport('', 'venta', 2026, filasV), c = api.analizarImport('', 'compra', 2026, filasC);
  igual(c.docs.length, 4, 'el documento en $0 se omite');
  cierto(v.docs.find(d => d.dte === '112').nc, 'la 112 es nota de crédito');
  const liq = c.docs.find(d => d.dte === '43');
  igual([liq.clase, liq.liqFactura], ['venta', true], 'la liquidación-factura recibida es una venta del mandante');
  igual(c.docs.find(d => d.folio === '51').impEsp, 20000, 'el impuesto específico a la gasolina va al costo');
  api.confirmarImport(v, '4101', true); api.confirmarImport(c, '1105', true);
  const f = api.f29Ano()[1];
  igual(f.debito, 19000 + 38000 + 28500, 'débito: factura + liquidación emitida + liquidación recibida');
  igual(f.cred, 19000 + 7600 + 1900, 'crédito: sin el IVA de la liquidación y con la factura de enero registrada en febrero');
  igual(f.netoExento, 300000 - 50000, 'exportaciones netas de la NC');
  igual(f.ilaC, 0, 'el combustible no es crédito de impuesto adicional');
  igual(api.f29Ano()[0].docs, 0, 'la factura del 28-01 va al período del registro (febrero)');
  cierto(api.cuadraDiario().dif === 0, 'los asientos de los documentos cuadran con IVA no recuperable e impuesto específico');
});

caso('F29: remanente reajustado por la UTM', ()=>{
  const S = api.estadoInicial(); S.emp.ejercicio = 2026; api.fijarS(S); api.reconstruirPlan();
  S.par.remanenteInicial = 28967997;
  S.par.utmMes = {'2026-01': 69751, '2026-02': 69611, '2026-03': 69889};
  const A = api.f29Ano();
  igual(A[0].remReaj, Math.round(28967997 * 0.998), 'enero: UTM de febrero sobre la de enero, −0,2 %');
  igual(A[1].factorRem, 1.004, 'febrero: +0,4 %');
  igual(A[2].sinUTM, true, 'sin la UTM de abril no se reajusta, y se avisa');
});

caso('Libro y RCV juntos: los documentos van solo al F29', async ()=>{
  const r = await gamma({'RCV_VENTA_76900900-1_202601.csv': RCV_V.replace(/\/02\/2026/g, '/01/2026')});
  igual(r.S.asientos.length, 10, 'los documentos no agregan asientos');
  cierto(r.S.docs.length === 4 && r.S.docs.every(d => d.sinAsiento), 'quedan como documentos solo tributarios');
  cierto(api.f29Ano()[0].debito > 0, 'y sí cuentan para el F29');
});

caso('F29 declarado: se lee la planilla con los códigos del formulario', ()=>{
  const filas = [['Detalle F29'], ['Período','IVA débito (cód. 538)','IVA crédito del mes','Remanente CF (cód. 77)','PPM (cód. 62)','Total a pagar (cód. 547)'],
                 ['01-2026','5053971','2092502','25948675','482745','567512'], ['02-2026','3342379','1691158','24401302','301191','442311']];
  const d = api.analizarF29Declarado(filas);
  igual(d.meses['2026-01'], {'538': 5053971, '520': 2092502, '077': 25948675, '062': 482745, '547': 567512}, 'enero');
  igual(Object.keys(d.meses), ['2026-01', '2026-02'], 'meses');
});

/* ---------- a correr ---------- */

console.log('Pruebas del robot de Cuadratura\n');
for(const c of casos){
  try { await c.fn(); pasan++; console.log('  ok     ' + c.nombre); }
  catch(e){ fallan.push(c.nombre); console.log('  FALLA  ' + c.nombre + '\n         ' + e.message); }
}
try { rmSync(TMP, {recursive: true, force: true}); } catch(e){}
console.log(`\n${pasan} de ${casos.length} pruebas pasan.`);
process.exit(fallan.length ? 1 : 0);
