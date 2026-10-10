#!/usr/bin/env node
/**
 * Robot de carga de Cuadratura.
 *
 * Procesa de una pasada los archivos de todos tus clientes. Dejas cada empresa
 * en su carpeta, ejecutas el robot, y salen los respaldos listos para importar
 * y los informes publicados con su código QR.
 *
 * Estructura esperada:
 *
 *   entrada/
 *     comercial-el-roble/
 *       empresa.json          ← datos de la empresa (nombre, RUT, régimen)
 *       plan.xlsx             ← plan de cuentas del cliente (opcional)
 *       apertura.xlsx         ← saldos iniciales (opcional)
 *       diario-*.xlsx         ← libros diarios
 *       ventas-*.csv          ← registro de ventas del SII
 *       compras-*.csv         ← registro de compras del SII
 *       cartola-*.pdf         ← cartolas bancarias
 *     otra-empresa/
 *       ...
 *
 * El robot reconoce el tipo de cada archivo por su nombre y, si no lo dice el
 * nombre, mirando las columnas. Lo que no logra clasificar lo informa y lo
 * deja fuera en vez de adivinar.
 *
 * Uso
 *   node robot/cargar.mjs                  procesa todo
 *   node robot/cargar.mjs --empresa roble  solo esa carpeta
 *   node robot/cargar.mjs --dry-run        muestra qué haría, sin escribir
 *   node robot/cargar.mjs --informes       además genera los informes
 *
 * No duplica código: carga las mismas funciones de lectura que usa la app,
 * sacándolas de index.html. Si mañana arreglamos un parser, el robot lo hereda.
 * Sus pruebas están en robot/probar.mjs.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const ENTRADA = join(RAIZ, 'entrada');
const SALIDA = join(RAIZ, 'salida');
const INFORMES = join(RAIZ, 'informes');

const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i+1] : null; };
const tiene = n => process.argv.includes(n);
const DRY = tiene('--dry-run');
const CON_INFORMES = tiene('--informes');

let fallas = 0;
const avisos = [];
let silencio = false;                     // las pruebas no necesitan ver el detalle
const log = (...a) => { if(!silencio) console.log(...a); };
const falla = m => { fallas++; if(!silencio) console.error('ERROR  ' + m); };
export function silenciar(v){ silencio = v !== false; }

/* ---------- se carga el motor de la app ---------- */
export function montarEntorno(raiz = RAIZ){
  // La app está escrita para el navegador; se le dan las piezas mínimas para
  // que corra en Node. No se toca nada de su lógica.
  const noop = () => {};
  const el = { innerHTML:'', value:'', textContent:'', files:[], dataset:{}, type:'',
               classList:{add:noop, remove:noop, contains:()=>false},
               addEventListener:noop, querySelectorAll:()=>[], querySelector:()=>null,
               click:noop, focus:noop, select:noop, setSelectionRange:noop };
  globalThis.document = { getElementById:()=>el, addEventListener:noop, createElement:()=>el,
                          querySelectorAll:()=>[], querySelector:()=>null, activeElement:null, body:el };
  globalThis.window = { scrollTo:noop, print:noop, storage:null, addEventListener:noop,
                        matchMedia:()=>({matches:false}), open:()=>null };
  globalThis.location = { protocol:'file:' };
  // navigator ya existe en Node y es de solo lectura: se le agregan las piezas
  // que la app consulta, sin reemplazarlo.
  try { globalThis.navigator.serviceWorker = null; } catch(e){}
  try { Object.defineProperty(globalThis, 'navigator',
        {value: Object.assign(Object.create(globalThis.navigator || {}), {serviceWorker:null, clipboard:null}),
         configurable:true}); } catch(e){}
  globalThis.localStorage = { getItem:()=>null, setItem:noop, removeItem:noop, clear:noop };
  globalThis.confirm = () => true;
  // Node ya trae Blob, Response, DecompressionStream y TextDecoder de verdad.
  // Descomprimir Excel y PDF depende de ellos: no hay que reemplazarlos.
  if(typeof globalThis.Blob === 'undefined') throw new Error('Se necesita Node 18 o superior.');
  if(typeof globalThis.DecompressionStream === 'undefined') throw new Error('Se necesita Node 18 o superior.');
  if(typeof globalThis.FileReader === 'undefined') globalThis.FileReader = class {};

  const html = readFileSync(join(raiz, 'index.html'), 'utf8');
  const m = html.match(/<script>\n([\s\S]*)\n<\/script>/);
  if(!m) throw new Error('No encuentro el código dentro de index.html');
  // El temporizador de guardado no debe dejar el proceso vivo.
  const codigo = m[1].replace('"use strict";', '')
                     .replace('function guardar(){', 'function guardar(){ return;');
  const api = {};
  const fn = new Function('salida', codigo + `
    ;['S','estadoInicial','migrar','reconstruirPlan','leerArchivoTabla','leerXLSX','leerPDF',
      'leerTablaHTML','analizarImport','confirmarImport','analizarCartola','analizarLibro',
      'confirmarLibro','adivinarClase','mapearColumnas','mapearBanco','mapearLibro','normCab',
      'detectarDelim','parseCSV','filasATexto','generarInforme','nombreInforme','urlInforme',
      'qrSVG','cuadraDiario','esf','eri','asientosDelEjercicio','fmt','emparejar',
      'informeConciliacion','registrarDoc','addAsiento','uid','saldos','CTA','PLAN_ACT',
      'numCSV','fechaISO']
      .forEach(k=>{ try{ salida[k] = eval(k); }catch(e){} });
    salida.fijarS = v => { S = v; };
  `);
  fn(api);
  return api;
}

/* ---------- clasificación de archivos ---------- */
const TIPOS = [
  {k:'plan',     re:/plan|cuentas/i,                        n:'plan de cuentas'},
  {k:'apertura', re:/apertura|saldos|inicial/i,             n:'saldos de apertura'},
  {k:'diario',   re:/diario|libro|mayor|asientos/i,         n:'libro diario'},
  {k:'ventas',   re:/venta|rcv.?vta|emitid/i,               n:'registro de ventas'},
  {k:'compras',  re:/compra|rcv.?cpa|recibid/i,             n:'registro de compras'},
  {k:'cartola',  re:/cartola|banco|movimientos|extracto/i,  n:'cartola bancaria'}
];
const NOMBRE_MODO = {diario:'un libro diario', saldos:'un balance de sumas o saldos', plan:'un plan de cuentas'};
export function tipoPorNombre(archivo){
  const base = basename(archivo);
  for(const t of TIPOS) if(t.re.test(base)) return t.k;
  return null;
}
// Si el nombre no lo dice, se deduce mirando los encabezados. Devuelve también
// las columnas encontradas: sirven para decidir entre hojas de un mismo archivo.
export function perfilHoja(api, filas){
  for(const f of filas.slice(0, 20)){
    if(f.filter(x=>String(x).trim()!=='').length < 2) continue;
    const mb = api.mapearBanco(f);
    if(mb.fecha !== undefined && (mb.cargo !== undefined || mb.abono !== undefined)) return {tipo:'cartola', mapa:mb};
    const mc = api.mapearColumnas(f);
    if(mc.total !== undefined && (mc.folio !== undefined || mc.tipo !== undefined)){
      const clase = api.adivinarClase(f);
      return {tipo: clase === 'venta' ? 'ventas' : 'compras', mapa:mc};
    }
    const ml = api.mapearLibro(f);
    // Con Debe y Haber: si trae fechas es un diario; si no, un balance de sumas o saldos
    if((ml.debe !== undefined || ml.haber !== undefined) && (ml.codigo !== undefined || ml.nombre !== undefined))
      return {tipo: ml.fecha !== undefined ? 'diario' : 'apertura', mapa:ml};
    // Código y nombre sin Debe ni Haber: un plan; si trae una columna de monto,
    // suele ser un estado financiero ya elaborado a partir de otra hoja
    if(ml.codigo !== undefined && ml.nombre !== undefined && ml.debe === undefined)
      return {tipo:'plan', mapa:ml, informe: ml.monto !== undefined};
  }
  return {tipo:null, mapa:null};
}
export function tipoPorContenido(api, filas){ return perfilHoja(api, filas).tipo; }

// Nombre de empresa comparable: sin tildes, espacios ni forma jurídica.
const claveEmpresa = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]/g, '').replace(/(spa|sa|ltda|limitada|sociedadanonima|eirl)$/, '');
const mencionaEmpresa = (texto, k) => { const c = claveEmpresa(texto); return k.length >= 4 && c.length >= 4 && (c.includes(k) || (c.length >= 8 && k.includes(c))); };

// Un libro con una hoja por empresa ("ESF Farmacéutica", "ESF Bajamar"…): se
// cargan solo las de esta empresa. Se reconoce porque el nombre de la empresa
// está en el título de una hoja y, en el mismo lugar de sus hermanas, hay otro.
function hojasDeOtraEmpresa(hojas, nombreEmpresa){
  const k = claveEmpresa(nombreEmpresa);
  const otras = new Set();
  if(k.length < 4) return otras;
  const titulo = f => new Set(f.map(x => String(x).trim()).filter(Boolean)).size <= 2;
  hojas.forEach(m=>{
    let pos = null;
    for(let r = 0; r < 4 && !pos; r++){
      const f = m.filas[r] || [];
      if(!titulo(f)) continue;
      const c = f.findIndex(x => mencionaEmpresa(x, k));
      if(c >= 0) pos = [r, c];
    }
    if(!pos) return;
    hojas.forEach(x=>{
      if(x === m || mencionaEmpresa(x.nombre, k)) return;
      const f = x.filas[pos[0]] || [], v = String(f[pos[1]] || '').trim();
      if(v && titulo(f) && !mencionaEmpresa(v, k) && !/^\d/.test(v)) otras.add(x.nombre);
    });
  });
  return otras;
}

async function filasDeArchivo(api, ruta){
  const buf = readFileSync(ruta);
  const u8 = new Uint8Array(buf);
  const falso = { arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) };
  const r = await api.leerArchivoTabla(falso);
  if(r.filas) return {filas: r.filas, hojas: r.hojas || null};
  const delim = api.detectarDelim(r.texto);
  return {filas: api.parseCSV(r.texto, delim), hojas: null};
}
const listaPaginas = p => p.length === 1 ? 'la página ' + p[0] + ' es' : 'las páginas ' + p.join(', ') + ' son';

/* ---------- procesar una empresa ---------- */
export async function procesarEmpresa(api, carpeta){
  const nombreCarpeta = basename(carpeta);
  log(`\n── ${nombreCarpeta} ──────────────────────────────`);
  // avisos y errores de esta empresa: el resumen final dice cuál quedó mal
  const misAvisos = [], misErrores = [];
  const av = m => { misAvisos.push(m); avisos.push(m); };
  const fa = m => { misErrores.push(m); falla(m); };

  const cfgRuta = join(carpeta, 'empresa.json');
  if(!existsSync(cfgRuta)){
    fa(`${nombreCarpeta}: falta empresa.json`);
    return null;
  }
  const cfg = JSON.parse(readFileSync(cfgRuta, 'utf8'));

  const S = api.estadoInicial();
  S.emp = Object.assign(S.emp, {
    nombre: cfg.nombre || nombreCarpeta,
    rut: cfg.rut || '',
    regimen: cfg.regimen || '14D3',
    ejercicio: cfg.ejercicio || new Date().getFullYear(),
    sobre50kUF: !!cfg.sobre50kUF,
    inventarioPermanente: cfg.inventarioPermanente !== false
  });
  S.ui = Object.assign(S.ui, {ejercicio: S.emp.ejercicio, ano: S.emp.ejercicio,
                              mes: cfg.mes !== undefined ? cfg.mes : 11});
  if(cfg.compartir) S.compartir = Object.assign(S.compartir, cfg.compartir);
  api.fijarS(S);
  api.reconstruirPlan();

  const archivos = readdirSync(carpeta)
    .filter(f => !f.startsWith('.') && f !== 'empresa.json')
    .filter(f => statSync(join(carpeta, f)).isFile())
    .filter(f => ['.xlsx','.xls','.csv','.txt','.pdf'].includes(extname(f).toLowerCase()));

  // El orden importa: primero el plan, después la apertura, después el resto.
  const prioridad = {plan:0, apertura:1, diario:2, compras:3, ventas:4, cartola:5};
  const clasificados = [];
  for(const f of archivos){
    const ruta = join(carpeta, f);
    let filas, hojas;
    try { ({filas, hojas} = await filasDeArchivo(api, ruta)); }
    catch(e){ av(`${nombreCarpeta}/${f}: ${e.message}`); continue; }
    if(!filas || !filas.length){ av(`${nombreCarpeta}/${f}: sin filas legibles`); continue; }
    // Un PDF con páginas escaneadas: lo que está en ellas no se puede leer
    if(filas.paginasImagen && filas.paginasImagen.length)
      av(`${f}: ${listaPaginas(filas.paginasImagen)} una imagen escaneada; lo que contiene no se pudo leer`);
    // Con varias hojas se clasifica cada una por su contenido: un mismo archivo
    // suele traer el plan de cuentas y el libro diario en pestañas distintas.
    if(hojas && hojas.length > 1){
      const vivas = hojas.filter(h => !h.oculta && h.celdas >= 6);      // fuera portadas e índices
      const ajenas = hojasDeOtraEmpresa(vivas, S.emp.nombre);
      const perfiles = vivas.map(h => ({h, p: perfilHoja(api, h.filas)}));
      const conImportes = perfiles.filter(x => x.p.mapa && (x.p.mapa.debe !== undefined || x.p.mapa.haber !== undefined));
      perfiles.forEach(({h, p})=>{
        if(ajenas.has(h.nombre)){ av(`${f} [${h.nombre}]: es de otra empresa; no se carga`); return; }
        // un estado financiero armado desde otra hoja del mismo archivo repetiría los datos
        if(p.informe && conImportes.length){
          av(`${f} [${h.nombre}]: es un informe ya elaborado; los datos se toman de la hoja «${conImportes[0].h.nombre}»`);
          return;
        }
        const t = p.tipo || tipoPorNombre(h.nombre) || tipoPorNombre(f);
        if(!t){ av(`${nombreCarpeta}/${f} [${h.nombre}]: no pude reconocer qué es`); return; }
        clasificados.push({f, ruta, tipo:t, porNombre: !p.tipo, filas:h.filas, hojas:null, hoja:h.nombre});
      });
      continue;
    }
    const tipoN = tipoPorNombre(f);
    const tipo = tipoN || tipoPorContenido(api, filas);
    if(!tipo){ av(`${nombreCarpeta}/${f}: no pude reconocer qué es`); continue; }
    clasificados.push({f, ruta, tipo, porNombre: !!tipoN, filas, hojas});
  }
  clasificados.sort((a,b)=> (prioridad[a.tipo] ?? 9) - (prioridad[b.tipo] ?? 9) || a.f.localeCompare(b.f));

  const resumen = {docs:0, asientos:0, cuentas:0, movs:0, omitidos:0};

  for(const c of clasificados){
    // Con varias hojas se procesan todas: un libro partido por mes es lo normal.
    const grupos = [{etq: c.hoja || '', filas: c.filas}];

    for(const g of grupos){
      const etq = c.f + (g.etq ? ` [${g.etq}]` : '');
      try {
        if(c.tipo === 'plan' || c.tipo === 'apertura' || c.tipo === 'diario'){
          let modo = c.tipo === 'plan' ? 'plan' : c.tipo === 'apertura' ? 'saldos' : 'diario';
          const opciones = {empresa: cfg.empresaEnArchivo};
          let an = api.analizarLibro('', modo, S.emp.ejercicio, g.filas, opciones);
          if(an.error){ av(`${etq}: ${an.error}`); resumen.omitidos++; continue; }
          // Las filas pueden contradecir la clasificación: un balance sin fechas
          // leído como diario inventaría asientos.
          const det = an.modoDetectado;
          if(modo !== 'plan' && det && det !== 'plan' && det !== modo){
            if(c.porNombre) av(`${etq}: el nombre dice ${NOMBRE_MODO[modo]}, pero sus filas parecen ${NOMBRE_MODO[det]}. Se leyó según el nombre; cámbialo si no corresponde`);
            else {
              av(`${etq}: se leyó como ${NOMBRE_MODO[det]} por cómo vienen sus filas`);
              modo = det;
              an = api.analizarLibro('', modo, S.emp.ejercicio, g.filas, opciones);
              if(an.error){ av(`${etq}: ${an.error}`); resumen.omitidos++; continue; }
            }
          }
          // Varias empresas en la misma tabla: se carga solo la que corresponde,
          // y si ninguna se llama como esta, no se adivina.
          if(an.empresas){
            if(!an.empresaCoincide){
              fa(`${etq}: trae ${an.empresas.length} empresas (${an.empresas.map(e=>e.nombre).join(', ')}) y ninguna coincide con «${S.emp.nombre}». ` +
                 `Escribe en empresa.json "empresaEnArchivo": "<nombre exacto>" para elegir una`);
              resumen.omitidos++; continue;
            }
            log(`   ${etq}: de ${an.empresas.length} empresas en el archivo se tomó «${an.empresa}»`);
          }
          if(modo === 'saldos' && an.dif){
            const pag = g.filas.paginasImagen;
            fa(`${etq}: el balance de apertura está descuadrado en ${api.fmt(Math.abs(an.dif))}` +
               (pag && pag.length ? ` (${listaPaginas(pag)} una imagen escaneada: probablemente faltan las cuentas que están ahí)` : ''));
            resumen.omitidos++; continue;
          }
          if(an.malos && an.malos.length)
            av(`${etq}: ${an.malos.length} asiento(s) no cuadran y se omiten`);
          if(an.avisos && an.avisos.length)
            an.avisos.filter(a=>a.nivel==='alto').forEach(a=> av(`${etq}: ${a.t} — ${a.q}`));
          const n = api.confirmarLibro(an, cfg.fechaApertura || (S.emp.ejercicio + '-01-01'));
          if(modo === 'plan'){ resumen.cuentas += n; log(`   ${etq}: ${n} cuenta(s) al plan`); }
          else { resumen.asientos += n; log(`   ${etq}: ${n} asiento(s)${modo === 'saldos' ? ` de apertura con ${an.lineas.length} cuenta(s)` : ''}`); }
        }
        else if(c.tipo === 'ventas' || c.tipo === 'compras'){
          const clase = c.tipo === 'ventas' ? 'venta' : 'compra';
          const an = api.analizarImport('', clase, S.emp.ejercicio, g.filas);
          if(an.error){ av(`${etq}: ${an.error}`); resumen.omitidos++; continue; }
          const cta = (cfg.cuentas && cfg.cuentas[c.tipo]) || (clase === 'venta' ? '4101' : '1105');
          const n = api.confirmarImport(an, cta, cfg.creditoIva !== false);
          resumen.docs += n;
          log(`   ${etq}: ${n} documento(s)${an.repetidos ? `, ${an.repetidos} repetidos omitidos` : ''}`);
        }
        else if(c.tipo === 'cartola'){
          const an = api.analizarCartola('', S.emp.ejercicio, g.filas);
          if(an.error){ av(`${etq}: ${an.error}`); resumen.omitidos++; continue; }
          S.banco.movs = S.banco.movs.concat(an.movs).sort((a,b)=> a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
          resumen.movs += an.movs.length;
          log(`   ${etq}: ${an.movs.length} movimiento(s) de banco`);
          // lo mismo que la app muestra al cargarla: saltos de saldo y control con lo que declara el banco
          (an.problemas || []).filter(p => !/sin monto$/.test(p)).forEach(p => av(`${etq}: ${p}`));
          if(an.control && Math.abs(an.control.dif) > 1)
            av(`${etq}: los movimientos suman ${api.fmt(an.control.suma)}, pero el saldo pasa de ${api.fmt(an.control.inicial)} a ${api.fmt(an.control.final)}: diferencia de ${api.fmt(an.control.dif)}`);
        }
      } catch(e){ fa(`${etq}: ${e.message}`); resumen.omitidos++; }
    }
  }

  // Controles antes de dar por buena la carga
  const d = api.cuadraDiario();
  if(d.dif !== 0) fa(`${nombreCarpeta}: el libro diario quedó descuadrado en ${api.fmt(Math.abs(d.dif))}`);
  const E = api.esf(api.asientosDelEjercicio());
  if(Math.abs(E.activo - E.total) > 2)
    fa(`${nombreCarpeta}: activo y pasivo más patrimonio difieren en ${api.fmt(Math.abs(E.activo - E.total))}`);

  const conc = S.banco.movs.length ? api.informeConciliacion() : null;
  log(`   ─ ${resumen.docs} documentos · ${resumen.asientos} asientos · ${resumen.cuentas} cuentas · ${resumen.movs} movimientos de banco`);
  log(`   ─ diario ${d.dif === 0 ? 'cuadrado' : 'DESCUADRADO'} · resultado ${api.fmt(api.eri(api.asientosDelEjercicio()).neto)}`);
  if(conc) log(`   ─ conciliación: ${conc.E.pares.length} calzados, ${conc.E.soloBanco.length} por resolver`);
  if(misErrores.length) log(`   ─ ${misErrores.length} error(es): esta empresa queda sin informe`);

  return {S, cfg, resumen, nombreCarpeta, avisos: misAvisos, errores: misErrores,
          sano: !misErrores.length && d.dif === 0 && Math.abs(E.activo - E.total) <= 2};
}

/* ---------- principal ---------- */
async function main(){
  log('Robot de carga de Cuadratura');

  if(!existsSync(ENTRADA)){
    log(`\nNo existe la carpeta "entrada". Créala con una subcarpeta por empresa:`);
    log(`  entrada/mi-empresa/empresa.json`);
    log(`  entrada/mi-empresa/ventas-septiembre.csv`);
    log(`\nHay una plantilla de empresa.json en robot/empresa-ejemplo.json`);
    process.exit(0);
  }

  const api = montarEntorno();

  const filtro = arg('--empresa');
  const carpetas = readdirSync(ENTRADA)
    .filter(f => !f.startsWith('.'))
    .filter(f => statSync(join(ENTRADA, f)).isDirectory())
    .filter(f => !filtro || f.toLowerCase().includes(filtro.toLowerCase()));

  if(!carpetas.length){ log('\nNo hay carpetas de empresa que procesar.'); process.exit(0); }

  const hechas = [];
  for(const c of carpetas){
    try { const r = await procesarEmpresa(api, join(ENTRADA, c)); if(r) hechas.push(r); }
    catch(e){ falla(`${c}: ${e.message}`); }
  }

  if(!DRY){
    if(!existsSync(SALIDA)) mkdirSync(SALIDA, {recursive:true});
    if(CON_INFORMES && !existsSync(INFORMES)) mkdirSync(INFORMES, {recursive:true});
    for(const h of hechas){
      api.fijarS(h.S); api.reconstruirPlan();
      const ruta = join(SALIDA, h.nombreCarpeta + '.json');
      writeFileSync(ruta, JSON.stringify(h.S), 'utf8');
      log(`\nEscrito ${ruta}`);
      if(CON_INFORMES){
        if(!h.sano){ avisos.push(`${h.nombreCarpeta}: no se generó el informe porque la carga tuvo errores o quedó descuadrada`); continue; }
        const html = api.generarInforme(h.S.compartir);
        const arch = api.nombreInforme();
        writeFileSync(join(INFORMES, arch), html, 'utf8');
        const url = api.urlInforme();
        log(`Informe ${join('informes', arch)}${url ? ` → ${url}` : ''}`);
      }
    }
  } else log('\n(--dry-run: no se escribió nada)');

  if(avisos.length){
    log('\nAvisos:');
    avisos.slice(0, 40).forEach(a => log('  · ' + a));
    if(avisos.length > 40) log(`  · y ${avisos.length - 40} más`);
  }
  const malas = hechas.filter(h => !h.sano);
  log(`\n${hechas.length} empresa(s) procesada(s): ${hechas.length - malas.length} sin problemas` +
      (malas.length ? `, ${malas.length} con errores (${malas.map(h => h.nombreCarpeta).join(', ')})` : '') + '.');
  process.exit(fallas ? 1 : 0);
}

// Se ejecuta solo si se llama directo (node robot/cargar.mjs); las pruebas lo importan
const esPrincipal = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if(esPrincipal) main().catch(e => { console.error('ERROR  ' + e.message); console.error(e.stack); process.exit(1); });
