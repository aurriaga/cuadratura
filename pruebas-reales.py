#!/usr/bin/env python3
"""
Pruebas contra archivos reales.

Esto es lo que faltaba: los archivos de verdad, con sus resultados exactos
escritos aquí. Cada vez que se toca la app, se corre esto antes de entregar.
Los archivos sintéticos que uno mismo genera calzan con las propias
suposiciones; los de verdad no.

    python3 pruebas-reales.py

Para agregar un archivo nuevo: déjalo en fixtures/ y escribe abajo lo que
tiene que dar. Si no sabes el resultado exacto, córrelo una vez, revisa a mano
que esté bien, y recién ahí lo escribes.
"""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(AQUI, 'fixtures')
PUERTO = 8799

# ───────────────────────── lo que cada archivo debe dar ─────────────────────
CASOS = [
 {
  'archivo': 'cartola-banco-chile.xlsx',
  'que_es': 'Cartola del Banco de Chile, 130 líneas con resumen arriba, '
            'resumen de comisiones al medio y saldos diarios al final',
  'donde': 'cartola',
  'espera': {
    'movimientos': 105,
    'primera_fecha': '2026-06-01',
    'ultima_fecha': '2026-06-30',
    'suma': -13294506,
    'control_cuadra': True,
    'saldo_inicial': 13400096,
    'saldo_final': 105590,
    # los dos pagos iguales del mismo día son movimientos distintos
    'veces_monto_-1560': 2,
    # la comisión del resumen no se cuenta dos veces
    'veces_monto_-40171': 1,
    'columna_cargo_descartada': True,   # "CARGO/ABONO" trae una letra, no un importe
  }
 },
 {
  'archivo': 'balance-sumas.xlsx',
  'que_es': 'Balance de sumas exportado de un sistema contable. Código y '
            'nombre en la misma celda. El plan usa 3 para ingresos y 4 para '
            'gastos, con el patrimonio en el 23',
  'donde': 'libro',
  'modo': 'saldos',
  'espera': {
    'cuentas': 97,
    'debe': 19208115750,
    'haber': 19208115750,
    'diferencia': 0,
    'avisos': 6,
    'modo_detectado': 'saldos',
    'esf_cuadra': True,
    'activo': 3571487569,
    # clasificaciones que costó acertar
    'cuentas_clave': {
      '212107': 'pasivo',      # "Honorarios por Pagar" no es un gasto
      '212405': 'pasivo',      # "Remuneraciones por Pagar" tampoco
      '113310': 'activo',      # "Anticipo Sueldos" es un activo
      '212106': 'pasivo',      # "Anticipo a Clientes" es un pasivo
      '232101': 'patrimonio',  # el 23 es patrimonio dentro del tramo de pasivos
      '311101': 'ingreso',     # en este plan el 3 son ingresos
      '413708': 'gasto',       # y el 4 son gastos
      '421304': 'gasto',
      '212404': 'pasivo',      # su nombre lleva dígitos: "Impuesto 2da. Categoria"
    }
  }
 },
]

# ───────────────────────────────── ejecución ────────────────────────────────
def servir(raiz):
    p = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO)],
                         cwd=raiz, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    return p

def mil(v):
    return f'{v:,.0f}'.replace(',', '.') if isinstance(v, (int, float)) else str(v)

def main():
    web = os.path.join(AQUI, 'web')
    if not os.path.exists(os.path.join(web, 'index.html')):
        print('Falta web/index.html'); return 1
    faltan = [c['archivo'] for c in CASOS if not os.path.exists(os.path.join(FIX, c['archivo']))]
    if faltan:
        print('Faltan archivos en fixtures/:', ', '.join(faltan)); return 1

    srv = servir(web)
    fallas, total = 0, 0
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            for caso in CASOS:
                print(f"\n── {caso['archivo']} ──")
                print(f"   {caso['que_es']}")
                ruta = os.path.join(FIX, caso['archivo'])
                ctx = b.new_context(viewport={'width': 1280, 'height': 1000})
                pg = ctx.new_page()
                errs = []
                pg.on('pageerror', lambda e: errs.append(str(e)))
                pg.goto(f'http://localhost:{PUERTO}/'); pg.wait_for_timeout(900)

                if caso['donde'] == 'cartola':
                    pg.evaluate("document.querySelector('[data-v=banco]').click()")
                    pg.wait_for_timeout(400)
                    pg.set_input_files('#b_file', ruta); pg.wait_for_timeout(3000)
                    an = pg.evaluate("car.an")
                    obt = {}
                    if an and not an.get('error'):
                        ms = an['movs']
                        ctl = an.get('control') or {}
                        obt = {
                          'movimientos': len(ms),
                          'primera_fecha': ms[0]['fecha'] if ms else None,
                          'ultima_fecha': ms[-1]['fecha'] if ms else None,
                          'suma': sum(m['monto'] for m in ms),
                          'control_cuadra': ctl.get('dif') == 0,
                          'saldo_inicial': ctl.get('inicial'),
                          'saldo_final': ctl.get('final'),
                          'veces_monto_-1560': sum(1 for m in ms if m['monto'] == -1560),
                          'veces_monto_-40171': sum(1 for m in ms if m['monto'] == -40171),
                          'columna_cargo_descartada': an['mapa'].get('cargo') is None,
                        }
                    else:
                        obt = {'error': (an or {}).get('error', 'sin respuesta')}
                else:
                    pg.evaluate("S.ui.diarioModo='importar'; S.ui.vista='diario'; render();")
                    pg.wait_for_timeout(500)
                    pg.select_option('#lb_modo', caso.get('modo', 'diario')); pg.wait_for_timeout(400)
                    pg.set_input_files('#lb_file', ruta); pg.wait_for_timeout(3000)
                    an = pg.evaluate("lib.an")
                    if an and not an.get('error'):
                        porCod = {x['cod']: x['tipo'] for x in an['nuevas']}
                        obt = {
                          'cuentas': len(an['nuevas']),
                          'debe': an['debe'], 'haber': an['haber'], 'diferencia': an['dif'],
                          'avisos': len(an.get('avisos') or []),
                          'modo_detectado': an.get('modoDetectado'),
                          'cuentas_clave': {k: porCod.get(k) for k in caso['espera']['cuentas_clave']},
                        }
                        pg.click('#lb_ok'); pg.wait_for_timeout(1500)
                        obt['esf_cuadra'] = pg.evaluate(
                          "(()=>{const E=esf(asientosDelEjercicio());return Math.abs(E.activo-E.total)<=2;})()")
                        obt['activo'] = pg.evaluate("R(esf(asientosDelEjercicio()).activo)")
                    else:
                        obt = {'error': (an or {}).get('error', 'sin respuesta')}

                for k, esp in caso['espera'].items():
                    total += 1
                    got = obt.get(k)
                    ok = (got == esp)
                    if not ok: fallas += 1
                    marca = '  OK  ' if ok else '  XX  '
                    if isinstance(esp, dict):
                        print(f"{marca}{k}")
                        for kk, vv in esp.items():
                            g2 = (got or {}).get(kk)
                            print(f"        {'ok ' if g2==vv else 'MAL'} {kk}: {g2}" + ('' if g2==vv else f'  (esperado {vv})'))
                    else:
                        print(f"{marca}{k}: {mil(got)}" + ('' if ok else f'   esperado {mil(esp)}'))
                if obt.get('error'): print('        error devuelto:', obt['error'])
                if errs: print('        errores de JS:', errs[:2]); fallas += 1
                ctx.close()
            b.close()
    finally:
        srv.terminate()

    print(f"\n{'─'*60}")
    print(f"{total - fallas} de {total} comprobaciones correctas sobre archivos reales")
    return 1 if fallas else 0

if __name__ == '__main__':
    sys.exit(main())
