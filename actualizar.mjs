#!/usr/bin/env node
/**
 * Robot de parámetros de Cuadratura.
 *
 * Consulta los indicadores previsionales del mes y, si alguno cambió respecto
 * de lo que ya está cargado, agrega un tramo nuevo a parametros.json con la
 * fecha desde la que rige. Nunca borra historia: los períodos ya cerrados
 * tienen que seguir calculándose con las tasas que tenían.
 *
 * Fuentes
 *   - apigateway.cl  indicadores de Previred estructurados en JSON (necesita token)
 *   - mindicador.cl  UF y UTM (abierto, sin token)
 *
 * Uso
 *   node robot/actualizar.mjs                 actualiza parametros.json
 *   node robot/actualizar.mjs --dry-run       muestra qué haría, sin escribir
 *   node robot/actualizar.mjs --periodo 202608
 *   node robot/actualizar.mjs --mock a.json   prueba con una respuesta guardada
 *
 * Sale con código 1 si algo falla o si un valor no pasa el control de rango.
 * En GitHub Actions eso manda un correo: es a propósito, más vale que avise
 * a que escriba una tasa absurda.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARCHIVO = join(AQUI, '..', 'parametros.json');
const TOKEN = process.env.APIGATEWAY_TOKEN || '';

const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const tiene = (n) => process.argv.includes(n);
const DRY = tiene('--dry-run');

const log = (...a) => console.log(...a);
const avisos = [];
let fallas = 0;
function falla(m) { fallas++; console.error('ERROR  ' + m); }

/* ---------- códigos de AFP que usa Previred ---------- */
const AFP_COD = { '33':'Capital', '03':'Cuprum', '05':'Habitat', '29':'PlanVital',
                  '08':'ProVida', '34':'Modelo', '35':'Uno' };

/* ---------- control de rangos: si un valor cae fuera, no se escribe ---------- */
const RANGO = {
  immGeneral:  [400000, 3000000],
  immMenor:    [300000, 2500000],
  topeAfpUF:   [60, 250],
  topeAfcUF:   [90, 350],
  comisionAFP: [0, 0.04],
  sis:         [0, 0.05],
  salud:       [0.05, 0.10],
  afTramoA:    [0, 300000],
  uf:          [20000, 200000],
  utm:         [30000, 300000]
};
function enRango(nombre, v) {
  const r = RANGO[nombre];
  if (!r) return true;
  const ok = typeof v === 'number' && isFinite(v) && v >= r[0] && v <= r[1];
  if (!ok) falla(`${nombre} = ${v} está fuera del rango esperado ${r[0]}–${r[1]}`);
  return ok;
}

/* ---------- período ---------- */
function periodoPorDefecto() {
  // Los indicadores del mes se publican durante ese mismo mes. Si el del mes
  // corriente todavía no está, se prueba con el anterior.
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesAnterior(p) {
  let y = +p.slice(0, 4), m = +p.slice(4);
  m--; if (m === 0) { m = 12; y--; }
  return `${y}${String(m).padStart(2, '0')}`;
}
const desdeDe = (p) => `${p.slice(0, 4)}-${p.slice(4)}-01`;

/* ---------- lectura de las fuentes ---------- */
async function traerPrevired(periodo) {
  const mock = arg('--mock');
  if (mock) { log(`  usando respuesta de prueba ${mock}`); return JSON.parse(readFileSync(mock, 'utf8')); }
  if (!TOKEN) { avisos.push('no hay APIGATEWAY_TOKEN: se omiten los indicadores previsionales'); return null; }
  const url = `https://apigateway.cl/api/v2/previred/indicadores/data/${periodo}`;
  const r = await fetch(url, { headers: { Authorization: `Token ${TOKEN}` } });
  if (!r.ok) throw new Error(`la API respondió ${r.status} para el período ${periodo}`);
  return r.json();
}
async function traerIndicadores() {
  try {
    const r = await fetch('https://mindicador.cl/api');
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    return { uf: j.uf?.valor, utm: j.utm?.valor, fecha: (j.fecha || '').slice(0, 10) };
  } catch (e) { avisos.push('no se pudo leer mindicador.cl: ' + e.message); return null; }
}

/* ---------- traducción al formato de la app ---------- */
function interpretar(resp, periodo) {
  const I = resp?.data?.indicadores;
  if (!I) throw new Error('la respuesta no trae el bloque de indicadores');
  const uf = I.moneda?.CLF;
  if (!enRango('uf', uf)) throw new Error('UF inválida en la respuesta');

  const min = I.renta_imponible_minima || {};
  const tope = I.renta_imponible_tope || {};
  const af = I.asignacion_familiar || {};
  const afc = I.afc || {};
  const com = I.afp?.comision || {};

  // Previred publica los topes en pesos; la app los guarda en UF, que es como
  // los fija la ley y así el monto en pesos se recalcula solo cada día.
  const enUF = (pesos) => pesos ? Math.round((pesos / uf) * 10) / 10 : null;

  const out = { periodo, uf, utm: I.moneda?.UTM };

  if (min.general) {
    out.imm = { desde: desdeDe(periodo), gen: min.general,
                menor: min.menores_18_mayores_65, noRem: min.fines_no_remuneracionales,
                ley: 'según indicadores Previred ' + periodo };
    enRango('immGeneral', min.general); enRango('immMenor', min.menores_18_mayores_65);
  }
  if (tope.afp) {
    out.topes = { desde: desdeDe(periodo), afp: enUF(tope.afp), afc: enUF(tope.afc),
                  ips: enUF(tope.inp) || 60, apvMes: 50, apvAno: 600 };
    enRango('topeAfpUF', out.topes.afp); enRango('topeAfcUF', out.topes.afc);
  }
  const afps = Object.entries(com)
    .filter(([c]) => AFP_COD[c])
    .map(([c, v]) => ({ n: AFP_COD[c], t: Math.round((0.10 + v) * 10000) / 10000 }))
    .sort((a, b) => a.t - b.t);
  if (afps.length >= 5) {
    afps.forEach(a => enRango('comisionAFP', a.t - 0.10));
    afps.push({ n: 'IPS (ex INP)', t: 0.1855 });
    out.afp = afps;
  } else if (Object.keys(com).length) {
    avisos.push(`solo vinieron ${afps.length} AFP: no se tocan las comisiones`);
  }
  if (typeof I.afp?.sis === 'number') {
    enRango('sis', I.afp.sis);
    out.sis = { desde: desdeDe(periodo), t: I.afp.sis };
  }
  if (af.tramo_a_monto != null) {
    enRango('afTramoA', af.tramo_a_monto);
    out.asigFam = { desde: desdeDe(periodo), tramos: [
      { h: af.tramo_a_hasta, m: af.tramo_a_monto },
      { h: af.tramo_b_hasta, m: af.tramo_b_monto },
      { h: af.tramo_c_hasta, m: af.tramo_c_monto },
      { h: 1e12, m: 0 } ] };
  }
  if (afc.plazo_indefinido_trabajador != null) {
    out.afc = { indefTrab: afc.plazo_indefinido_trabajador,
                indefEmp:  afc.plazo_indefinido_empleador,
                plazoEmp:  afc.plazo_fijo_empleador };
  }
  if (typeof I.salud?.tasa === 'number' && enRango('salud', I.salud.tasa)) out.salud = I.salud.tasa;
  return out;
}

/* ---------- comparación contra lo ya cargado ---------- */
const vigenteA = (arr, f) => { let r = arr?.[0]; for (const x of arr || []) { if (x.desde <= f) r = x; else break; } return r; };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sinFecha = (o) => { const c = { ...o }; delete c.desde; delete c.ley; return c; };

function fusionar(P, nuevo) {
  const cambios = [];
  const hoy = desdeDe(nuevo.periodo);

  // listas con vigencia: se agrega un tramo solo si el contenido cambió
  for (const k of ['imm', 'topes', 'sis', 'asigFam']) {
    if (!nuevo[k]) continue;
    P[k] = P[k] || [];
    const act = vigenteA(P[k], hoy);
    if (act && igual(sinFecha(act), sinFecha(nuevo[k]))) continue;
    const yaEstaEsaFecha = P[k].findIndex(x => x.desde === nuevo[k].desde);
    if (yaEstaEsaFecha > -1) P[k][yaEstaEsaFecha] = nuevo[k];
    else P[k].push(nuevo[k]);
    P[k].sort((a, b) => a.desde < b.desde ? -1 : 1);
    cambios.push(`${k}: tramo nuevo desde ${nuevo[k].desde}`);
  }
  // valores sin vigencia: se reemplazan
  // Las AFP se comparan por contenido, no por orden: reordenarlas no es un cambio.
  const normAfp = (a) => JSON.stringify((a || []).map(x => [x.n, x.t]).sort((p, q) => p[0] < q[0] ? -1 : 1));
  for (const k of ['afp', 'afc', 'salud']) {
    if (nuevo[k] === undefined) continue;
    if (k === 'afp' ? normAfp(P[k]) === normAfp(nuevo[k]) : igual(P[k], nuevo[k])) continue;
    P[k] = nuevo[k];
    cambios.push(`${k}: actualizado`);
  }
  return cambios;
}

/* ---------- principal ---------- */
async function main() {
  log('Robot de parámetros de Cuadratura');

  if (!existsSync(ARCHIVO)) { falla(`no encuentro ${ARCHIVO}`); process.exit(1); }
  const P = JSON.parse(readFileSync(ARCHIVO, 'utf8'));

  const ind = await traerIndicadores();
  if (ind) log(`  UF ${ind.uf} · UTM ${ind.utm} (${ind.fecha})`);

  let periodo = arg('--periodo') || periodoPorDefecto();
  let resp = null;
  for (let intento = 0; intento < 2 && !resp; intento++) {
    try { resp = await traerPrevired(periodo); }
    catch (e) {
      log(`  ${periodo}: ${e.message}`);
      if (intento === 0 && !arg('--periodo') && !arg('--mock')) periodo = mesAnterior(periodo);
      else { avisos.push('no se pudieron leer los indicadores previsionales: ' + e.message); }
    }
  }

  let cambios = [];
  if (resp) {
    const nuevo = interpretar(resp, periodo);
    log(`  indicadores del período ${periodo} leídos`);
    if (fallas) { console.error('Hay valores fuera de rango: no se escribe nada.'); process.exit(1); }
    cambios = fusionar(P, nuevo);
  }

  if (cambios.length) {
    P.verificado = new Date().toISOString().slice(0, 10);
    P.generado = { por: 'robot', periodo, fecha: new Date().toISOString().slice(0, 16).replace('T', ' ') };
    log('\nCambios:');
    cambios.forEach(c => log('  · ' + c));
    if (DRY) log('\n(--dry-run: no se escribió nada)');
    else { writeFileSync(ARCHIVO, JSON.stringify(P, null, 2) + '\n', 'utf8'); log(`\nEscrito ${ARCHIVO}`); }
  } else {
    log('\nSin cambios: los parámetros ya estaban al día.');
  }

  if (avisos.length) { log('\nAvisos:'); avisos.forEach(a => log('  · ' + a)); }
  process.exit(fallas ? 1 : 0);
}

main().catch(e => { console.error('ERROR  ' + e.message); process.exit(1); });
