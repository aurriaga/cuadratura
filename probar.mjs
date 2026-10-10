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

/* ---------- a correr ---------- */

console.log('Pruebas del robot de Cuadratura\n');
for(const c of casos){
  try { await c.fn(); pasan++; console.log('  ok     ' + c.nombre); }
  catch(e){ fallan.push(c.nombre); console.log('  FALLA  ' + c.nombre + '\n         ' + e.message); }
}
try { rmSync(TMP, {recursive: true, force: true}); } catch(e){}
console.log(`\n${pasan} de ${casos.length} pruebas pasan.`);
process.exit(fallan.length ? 1 : 0);
