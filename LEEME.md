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
