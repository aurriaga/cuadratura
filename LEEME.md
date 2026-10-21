> Si es la primera vez, abre **EMPEZAR.md**: tiene los pasos en orden.
> Este archivo es la referencia técnica.

# Cuadratura — versión instalable

Esta carpeta es la app lista para publicar. Sirve en PC y en teléfono, y una
vez publicada se instala como aplicación y abre sin conexión.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La aplicación completa. Todo está aquí dentro. |
| `manifest.webmanifest` | Nombre, colores e íconos para que el sistema la trate como app. |
| `sw.js` | Guarda la app en el dispositivo para que abra sin señal. |
| `EMPEZAR.md` | Los pasos para dejarlo andando. Parte por ahí. |
| `parametros.json` | Tabla de tasas y topes. El robot la mantiene al día. La app la encuentra sola. |
| `robot/actualizar.mjs` | El robot que lee las fuentes y actualiza la tabla. |
| `robot/cargar.mjs` | El robot de carga: procesa las carpetas de clientes de `entrada/`. |
| `robot/probar.mjs` | Las pruebas del robot y de los lectores de la app, con archivos inventados. |
| `.github/workflows/actualizar-parametros.yml` | Lo que hace correr al robot dos veces al mes. |
| `.github/workflows/cargar-clientes.yml` | Procesa `entrada/` cada vez que subes archivos de clientes. |
| `.github/workflows/probar.yml` | Corre las pruebas cada vez que cambia `index.html` o el robot. |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | Íconos. |

## Publicarla

Sube **todos los archivos juntos, en la misma carpeta**, a cualquier hosting
estático gratis: Netlify Drop, Cloudflare Pages, GitHub Pages o Vercel. No
necesita base de datos ni servidor: es solo un sitio de archivos.

Tiene que quedar en **https**. El service worker no se registra en `http`
común ni en un archivo abierto con doble clic, y sin él no hay instalación ni
modo sin conexión.

## Instalarla

- **Android (Chrome):** menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** botón compartir → *Añadir a pantalla de inicio*.
- **PC (Chrome o Edge):** ícono de instalar en la barra de direcciones, o menú
  ⋮ → *Abrir en Cuadratura* / *Instalar*.

Queda con su propio ícono, sin barra del navegador, y abre aunque no haya
internet.

## Publicar cambios

Cuando modifiques `index.html`, sube también `sw.js` con la versión del cache
cambiada (la línea `const CACHE`, por ejemplo `cuadratura-v3` → `cuadratura-v4`).
Si no la cambias, los dispositivos que ya la tienen instalada pueden seguir
abriendo la versión vieja.

## Qué cambió en la versión 4

Una pestaña nueva, **Análisis**, con cuatro vistas. Todas usan el mismo corte
del Balance y cada una se exporta en CSV con la misma cifra de control.

**Centros de costo**

- Se crean en Ajustes (código y nombre: sucursal, proyecto, área).
- Se asignan al registrar un documento y en cada línea de resultado del
  asiento manual. Si importas un libro diario con una columna «Centro de
  costo», se asignan solos y los que no existen se crean.
- Análisis › Centros de costo muestra ingresos, costos, gastos, resultado y
  margen de cada centro. La suma de los centros es el resultado del estado de
  resultados, y se avisa qué parte de los gastos no tiene centro.

**Estados comparativos**

- Acumulado del año contra el mismo período del año anterior, o mes contra
  mes anterior, con variación en pesos y en porcentaje.
- El estado de situación se compara contra el 31 de diciembre anterior.
- El año anterior sale de sus asientos: importa su libro diario y la app lo
  separa por año. Si no está, la columna queda vacía y se avisa.
- También el estado de resultados mes a mes, de enero al corte.

**Flujo de caja**

- Método directo (NIIF PYMES sección 7): cada movimiento de caja y banco se
  ordena en operación, inversión o financiamiento según la cuenta del otro
  lado del asiento. Los saldos de apertura son el saldo inicial, y el
  traspaso entre caja y banco no cuenta como flujo.
- El saldo final se controla contra el mayor de caja y banco.
- Posición de caja: lo que hay, más lo que falta cobrar, menos lo que falta
  pagar (según los auxiliares), sueldos por pagar y el F29 que vence.

**Gráficos**

- Panel: caja mes a mes, antigüedad de lo que deben los clientes y en qué
  se va la plata (gastos principales).
- Cada vista de Análisis trae su gráfico con una lectura en palabras.
- El informe para el dueño suma el flujo de caja con su gráfico.

## Qué cambió en la versión 3

Cuatro cosas que traen los sistemas contables (Defontana, Softland, Nubox) y
que le faltaban a la app.

**Comprobantes numerados por tipo**

- Cada asiento es ahora un comprobante de **Ingreso**, **Egreso** o
  **Traspaso**, con folio correlativo propio por año. El tipo se deduce solo:
  Ingreso si entra plata a caja o banco, Egreso si sale, Traspaso si no la
  toca. En el asiento manual se puede elegir a mano.
- Un folio borrado no se vuelve a usar: queda como *anulado* en la bitácora,
  con su monto, así que cada salto en la numeración tiene explicación.
- El Diario filtra por tipo y cada comprobante se puede imprimir con espacio
  para las firmas (preparado, revisado, aprobado).
- Los respaldos antiguos se numeran solos la primera vez que se abren, en
  orden de fecha.

**Cierre de períodos** (Cierre › Períodos)

- Un mes cerrado no acepta documentos ni comprobantes nuevos con esa fecha,
  y no deja borrar los que tiene. Así el F29 y el balance que ya entregaste
  no cambian por debajo.
- Antes de cerrar se revisa: que todos los comprobantes cuadren (si no, no
  deja cerrar), que cada documento tenga asiento, la cartola conciliada, el
  IVA y la depreciación asentados, y que el mes anterior esté cerrado.
- Reabrir pide un motivo, y queda anotado en la bitácora junto con el cierre.

**Auxiliar de clientes y proveedores por RUT** (pestaña Auxiliares)

- Saldo de cada cliente y proveedor con antigüedad en tramos de 0–30,
  31–60, 61–90, 91–180 y más de 180 días. Un RUT escrito con o sin puntos
  es la misma contraparte.
- Descuenta los cobros y pagos conciliados en Banco y los que se registran
  desde el mismo auxiliar (que arman su asiento y quedan amarrados al
  documento, también para pagos parciales).
- Se controla contra la cuenta 1103 y la 2101 al mismo corte, y explica de
  dónde suele salir la diferencia.

**Una sola fuente para ver, imprimir y exportar**

- El balance, los estados financieros, el informe para el dueño y todos los
  archivos exportados salen del **mismo corte** (el que eliges en Balance) y
  de las mismas filas. Antes el CSV del diario traía el año entero aunque el
  balance estuviera al mes.
- Se corrigió que los estados escondieran cuentas sin subgrupo (por ejemplo
  un gasto nuevo) mientras sí las sumaban en los totales: ahora toda cuenta
  que suma aparece en su grupo.
- Nuevos archivos CSV: balance de 8 columnas, estados financieros, libro
  diario, libro mayor y auxiliar. Cada uno lleva en el encabezado la **cifra
  de control** (cantidad de asientos y suma del Debe); el informe la trae en
  el pie. Si dos salidas tienen la misma cifra, sus montos cuadran.
- Si las ventas del F29 (documentos) no calzan con los ingresos contables,
  el balance y el informe lo dicen y explican por qué.

## Qué cambió en la versión 2

**Lectura de archivos**

- **Excel:** las celdas vacías con formato ya no corren los números de
  columna, y las filas de totales (*Total*, *Sumas*, *Totales*) no se suman
  como si fueran cuentas.
- **Varias empresas en una planilla:** si el balance trae una columna
  *Empresa* o *Sociedad*, la app toma sola la que coincide con el nombre en
  Ajustes y deja elegir otra desde una lista.
- **PDF:** lee los PDF que generan los sistemas contables y los bancos
  (fuentes con mapa de caracteres, objetos comprimidos, tablas de varias
  columnas y de varias páginas). Si una página es una imagen escaneada, lo
  dice con el número de página en vez de devolver una tabla vacía.
- **Cartolas:** acepta fechas sin año (`15/06`), con el mes en palabras
  (`5 de junio de 2026`), movimientos en orden descendente y montos con el
  signo al final (`12.500-`). Revisa el saldo fila a fila y avisa la fecha
  exacta donde no calza con los movimientos.

**Gráficos** (se dibujan en la misma app, sin conexión; al pasar el mouse
muestran el monto exacto):

| Dónde | Qué muestra |
|---|---|
| Panel | Ingresos y gastos de cada mes y el resultado, con una frase que lo explica. |
| Balance | Lo que tiene la empresa y cómo lo financia (activo frente a pasivo y patrimonio). |
| Banco | El saldo de la cuenta día a día, con el punto más bajo marcado. |
| F29 | IVA débito frente a crédito por mes y el remanente que se arrastra. |
| Informe para el cliente | El gráfico del panel y el de la estructura del balance. |

**Robot de carga**

- Distingue un balance de comprobación (debe y haber, sin fechas) de un libro
  diario. Antes lo leía como diario e inventaba asientos.
- Con varias empresas en un archivo carga solo la que corresponde, y si
  ninguna coincide con `empresa.json` no adivina: falla y lo explica.
- Salta las hojas que son un estado financiero armado desde otra hoja.
- Informa las páginas escaneadas de un PDF, los saltos de saldo de las cartolas,
  y qué empresa quedó con errores (esa queda sin informe).
- Tiene pruebas: `node robot/probar.mjs`. GitHub las corre solo en cada cambio,
  y los workflows usan Node 24 (Node 20 dejó de recibir soporte en abril de 2026).

## Los datos

Todo queda guardado en el dispositivo donde uses la app: publicarla no
comparte información con nadie. Eso también significa que el PC y el teléfono
llevan datos separados. Para pasarlos de uno a otro usa **Ajustes → Exportar
respaldo** y después **Importar respaldo** en el otro. Conviene exportar cada
cierto tiempo: si borras los datos del navegador, se pierden.

## Sin publicar

Si no quieres subirla a ningún lado, `cuadratura.html` (el archivo suelto que
viene aparte) funciona igual con doble clic en el PC o abriéndolo desde
Archivos en el teléfono. Lo único que pierdes es el ícono en la pantalla de
inicio.

## Cómo se mantiene al día

Hay tres capas, y ninguna necesita que hagas nada una vez configuradas.

**1. La app, sola, cada día.** UF, UTM, IPC y dólar se traen de `mindicador.cl`
al abrirla. Todo lo que está expresado en UF o en UTM se recalcula con eso: los
topes imponibles en pesos, los tramos del impuesto único y del global
complementario, el tope del APV. Sin señal sigue funcionando con el último valor
guardado.

**2. Las leyes que ya tienen calendario.** El aporte del empleador de la Ley
21.735 sube por tramos hasta 2033, la retención de honorarios llega a 17% en
2028, la tasa Pro Pyme vuelve a 25% en 2029. Todo eso ya está cargado con su
fecha: cambia solo el día que corresponde, sin que nadie toque nada.

**3. El robot, dos veces al mes.** Lee los indicadores previsionales de Previred
y actualiza `parametros.json` cuando algo cambió. Las copias instaladas lo
recogen al abrirse. Esta es la capa que hay que configurar una vez.

### Configurar el robot

1. Sube esta carpeta a un repositorio de **GitHub** y activa GitHub Pages.
2. Crea una cuenta gratuita en [apigateway.cl](https://www.apigateway.cl/trial)
   y genera un Token de Conexión. Esa API entrega los indicadores de Previred
   como JSON en vez del PDF.
3. En el repositorio, ve a *Settings → Secrets and variables → Actions* y crea
   un secreto llamado `APIGATEWAY_TOKEN` con ese token.
No hay cuarto paso: la app busca sola el `parametros.json` que está junto a
ella. Si publicaste la carpeta completa, ya lo está leyendo.

Listo. El día 2 y el 16 de cada mes el robot despierta, compara y, si algo
cambió, hace el commit. No consume créditos por usuario: una consulta al mes
sirve a todas las copias instaladas.

Puedes ejecutarlo a mano desde la pestaña *Actions* del repositorio, y probarlo
en tu computador antes de subirlo:

```
node robot/actualizar.mjs --dry-run
```

### Qué hace el robot exactamente

- Agrega un tramo nuevo **solo si el valor cambió**. Si nada cambió, no toca el
  archivo y no genera ruido.
- **Nunca borra historia.** Los períodos ya cerrados se siguen calculando con
  las tasas que tenían. Si en octubre corriges una liquidación de marzo, usa las
  de marzo.
- Convierte los topes de pesos a UF, que es como los fija la ley, para que el
  monto en pesos se recalcule solo todos los días.
- Revisa que cada valor caiga en un rango razonable antes de escribirlo. Si un
  sueldo mínimo viene en cinco millones, **no escribe nada y falla a
  propósito**: GitHub te manda un correo. Vale más que avise a que grabe una
  cifra absurda.
- Si la API no responde o no configuraste el token, la app sigue funcionando con
  lo que ya tiene. Nunca se queda sin datos.

### Lo que el robot no puede hacer

Una ley tributaria nueva no la trae nadie. Si cambia el IVA, la tasa del IDPC o
un impuesto adicional del DL 825, hay que editar `parametros.json` a mano. Para
eso la app muestra avisos en *Ajustes → Parámetros* cuando una norma transitoria
está por vencer, con los enlaces a las fuentes oficiales.

## Fechas que conviene tener anotadas

| Cuándo | Qué pasa | Quién lo hace |
|---|---|---|
| Todos los días | UF, UTM, IPC y dólar | La app |
| Día 2 y 16 de cada mes | Topes, SIS, comisiones de AFP, ingreso mínimo, asignación familiar | El robot |
| En su fecha | Aporte del empleador, retención de honorarios, tasa Pro Pyme | Ya está programado |
| Cuando salga una ley tributaria | IVA, IDPC, PPM, impuestos adicionales | Tú, avisado por la app |
