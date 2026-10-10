# Empezar

Tres pasos. El primero toma cinco minutos y con eso ya funciona todo. Los otros
dos son para que las tasas se actualicen solas, y se hacen una sola vez.

---

## Paso 1 — Publicar la app (5 minutos)

Sin cuenta, sin tarjeta, sin instalar nada.

1. Entra a **https://app.netlify.com/drop**
2. Arrastra esta carpeta completa a la ventana.
3. Te devuelve una dirección tipo `https://algo-random-123.netlify.app`.

Esa dirección es tu app. Ábrela en el teléfono y en el PC.

**Para instalarla:**
- Android, en Chrome: menú ⋮ → *Instalar aplicación*
- iPhone, en Safari: botón compartir → *Añadir a pantalla de inicio*
- PC, en Chrome o Edge: el ícono de instalar en la barra de direcciones

Queda con su ícono, sin barra del navegador, y abre aunque no tengas señal.

**Con esto ya estás trabajando.** Las tasas vienen cargadas y verificadas, la UF
y la UTM se actualizan solas todos los días, y las leyes que tienen calendario
—el aporte del empleador, la retención de honorarios, la tasa Pro Pyme— cambian
en su fecha sin que nadie toque nada.

Lo único que falta son los pasos 2 y 3: que los indicadores de Previred se
actualicen solos cada mes.

---

## Paso 2 — Subirla a GitHub (10 minutos)

El robot necesita vivir en GitHub, que es donde corre gratis.

1. Crea una cuenta en **https://github.com/signup** si no tienes.
2. Anda a **https://github.com/new**
   - Nombre del repositorio: `cuadratura`
   - Marca **Public**
   - Crea el repositorio.
3. En la página que aparece, haz clic en **uploading an existing file**.
4. Arrastra **todos** los archivos de esta carpeta, incluida la carpeta
   `.github` (si tu computador la esconde por empezar con punto: en Windows
   activa *Ver → Elementos ocultos*; en Mac aprieta `Cmd + Shift + .`).
5. Abajo, botón verde **Commit changes**.

Después activa la publicación:

6. *Settings* → *Pages* → en **Source** elige **Deploy from a branch**, rama
   `main`, carpeta `/ (root)` → *Save*.
7. En un par de minutos te da una dirección tipo
   `https://tuusuario.github.io/cuadratura/`. Esa reemplaza a la del paso 1.

Si ya hiciste el paso 1, vuelve a instalar la app desde esta dirección nueva
para que reciba las actualizaciones.

---

## Paso 3 — Darle acceso al robot (5 minutos)

El robot lee los indicadores de Previred a través de una API que necesita un
token gratis.

1. Entra a **https://www.apigateway.cl/trial** y regístrate.
2. Anda a **https://app.apigateway.cl/connections/register** y crea una
   conexión. Te entrega un **Token de Conexión**. Cópialo.
3. En tu repositorio de GitHub: *Settings* → *Secrets and variables* →
   *Actions* → botón **New repository secret**
   - Name: `APIGATEWAY_TOKEN`
   - Secret: pega el token
   - *Add secret*

**Para probarlo de inmediato:** pestaña *Actions* → *Actualizar parámetros* →
botón **Run workflow**. Si sale verde, quedó andando.

De ahí en adelante corre solo el día 2 y el 16 de cada mes. Si algo cambia,
actualiza el archivo y todas las copias instaladas lo recogen al abrirse. Si
algo falla, GitHub te manda un correo.

---

## Si prefieres saltarte los pasos 2 y 3

La app funciona igual. Lo que pierdes es la actualización automática de cinco
cosas: los topes imponibles en UF (cambian cada enero), el ingreso mínimo, los
tramos de asignación familiar, la tasa SIS y las comisiones de las AFP.

Las puedes cargar a mano editando `parametros.json` cuando cambien. La app te
avisa en *Ajustes → Parámetros* cuándo toca revisar, con los enlaces a las
fuentes oficiales.

---

## Cargar documentos sin digitarlos

En **Documentos → Importar CSV del SII** puedes subir el registro de compras y
ventas completo de un mes, en vez de escribir factura por factura.

Para bajarlo del SII:

1. Entra a **https://www4.sii.cl/consdcvinternetui/** con tu clave.
2. Elige el año y el mes.
3. Pestaña **COMPRA** o **VENTA**, según lo que quieras cargar.
4. Botón **Descargar detalles** → te baja el archivo.
5. En la app, arrastra ese archivo al importador. Acepta CSV y Excel.

La app reconoce las columnas por su nombre, te muestra qué entendió y una vista
previa antes de cargar nada. Las notas de crédito quedan marcadas solas, y si
importas dos veces el mismo mes no se duplica nada.

Cada documento importado genera su asiento contable, igual que si lo hubieras
escrito a mano. Quedan todos a crédito y con la misma cuenta, así que después
conviene revisar los que correspondan a otra cuenta.

## Conciliación bancaria

En **Banco** subes la cartola tal como la descarga tu banco: Excel o CSV, da lo mismo. La app la cruza contra dos
cosas a la vez:

- Los movimientos de la cuenta banco en tu libro diario
- Los documentos del registro de compras y ventas que todavía están por cobrar
  o por pagar

Cuando un abono coincide en monto con una factura de venta, y además aparece el
nombre o el RUT del cliente en la glosa, te lo propone: al confirmar, graba el
asiento de cobro. Lo mismo con los pagos a proveedores.

Las comisiones, intereses e impuestos bancarios aparecen aparte con una cuenta
sugerida, para registrarlos de a uno.

Al final arma la conciliación clásica por los dos caminos —desde el saldo del
banco y desde el saldo de los libros— y avisa si no llegan al mismo número.

Los cheques girados y no cobrados y los depósitos en tránsito quedan listados
con los días que llevan pendientes. Uno que lleva mucho ahí suele ser un error,
no un desfase.

## Finiquitos

En **Remuneraciones** hay dos pestañas: *Liquidación mensual* y *Finiquito*.

El finiquito calcula remuneración pendiente, feriado proporcional, indemnización
por años de servicio y aviso previo, según la causal que elijas. Aplica los topes
legales de 11 años y 90 UF, convierte los días hábiles de feriado a corridos, y
distingue lo que paga cotizaciones de lo que no.

Es una hoja de trabajo. Un finiquito tiene efectos legales y no se puede
deshacer: si el caso tiene fuero, licencia médica, contrato colectivo o un
despido discutido, que lo revise un abogado laboral antes de firmar.

## Cargar varios clientes de una vez

Si llevas más de una empresa, subir archivo por archivo no escala. Para eso
está el **robot de carga**.

Dejas una carpeta por cliente dentro de `entrada/`, con sus archivos adentro y
un `empresa.json` con el nombre, el RUT y el régimen. Después ejecutas:

```
node robot/cargar.mjs --informes
```

El robot reconoce qué es cada archivo por su nombre, y si el nombre no lo dice,
mirando las columnas. Los Excel con varias hojas los clasifica **hoja por
hoja**: un mismo archivo puede traer el plan de cuentas en una pestaña y el
libro diario en otra.

Procesa todo en el orden correcto —primero el plan, después la apertura,
después los movimientos— y al final deja dos cosas por empresa:

- `salida/<empresa>.json` — el respaldo, que importas en la app desde Ajustes
- `informes/<empresa>-<año>-<mes>.html` — el informe publicado, al que apunta
  el QR de esa empresa

Antes de dar por buena una carga verifica que el diario cuadre y que el activo
calce con el pasivo más patrimonio. Si algo no cuadra **no genera el informe** y
falla con el detalle. Un balance de apertura descuadrado lo detiene de inmediato.

Si un balance trae **varias empresas** (una columna *Empresa*, o una hoja por
empresa), carga solo la que se llama como el `nombre` de `empresa.json`. Si
ninguna coincide, no adivina: falla y te pide que agregues
`"empresaEnArchivo": "<nombre exacto>"`. Las hojas que son un estado financiero
ya armado a partir de otra hoja del mismo archivo se saltan, para no duplicar
saldos. En cartolas, avisa los saltos de saldo; en PDF, las páginas escaneadas.

Usa el mismo código de lectura que la app: si mañana corregimos un parser, el
robot lo hereda sin tocar nada.

También corre solo en GitHub: cada vez que subas archivos a `entrada/`, el
workflow *Cargar clientes* los procesa y publica los informes actualizados.

### Para ejecutarlo en tu computador

Necesitas **Node 18 o superior** (recomendado: la versión LTS de
[nodejs.org](https://nodejs.org)). En Windows también sirve, en una terminal:

```
winget install OpenJS.NodeJS.LTS
```

Antes de cargar clientes, comprueba que todo lee bien:

```
node robot/probar.mjs
```

Arma empresas de ejemplo con archivos inventados (CSV, Excel y PDF), las pasa
por el robot y revisa el resultado. Tiene que terminar en *"11 de 11 pruebas
pasan"*. GitHub corre las mismas pruebas solo (workflow *Probar*) cada vez que
cambias `index.html` o el robot, y antes de cada carga de clientes.

## Antes de empezar a cargar datos

En **Ajustes → La empresa**, pon el nombre, el RUT, el régimen tributario y el
ejercicio. El régimen determina la tasa de impuesto y la de PPM: si queda mal,
todos los cálculos de renta quedan mal.

Y en **Ajustes → Parámetros → Remuneraciones**, cambia la tasa de mutual por la
que dice tu certificado. Viene en 0,93%, que es solo una referencia: depende del
riesgo de tu actividad.

---

## Una advertencia

Esto es una hoja de trabajo, no un sustituto del SII. Lo que declares sale del
formulario del SII. Y los datos viven en cada dispositivo: exporta el respaldo
desde *Ajustes* cada cierto tiempo, porque si borras los datos del navegador se
pierden.

## Excel con varias hojas

Si el archivo trae más de una hoja —una por mes, o Diario, Mayor y Balance
separados— aparece un selector arriba del cuadro de texto.

La app abre sola la hoja con más contenido, para saltarse portadas e índices
vacíos, y muestra cuántas filas tiene cada una. Las hojas ocultas quedan
marcadas.

También puedes elegir **Todas las hojas juntas**: útil cuando el libro diario
está partido en una hoja por mes. Los encabezados que se repiten al medio se
descartan solos.

## Sobre los archivos de Excel

La app lee `.xlsx` directamente, sin convertir nada. También lee los `.xls` que
algunos bancos entregan y que en realidad son una tabla HTML disfrazada.

También lee el `.xls` binario antiguo, de antes de 2007, que es el que todavía
entregan varios bancos chilenos. No hay que convertir nada.

Si un archivo trae columnas con nombres que la app no reconoce, en la pestaña
Banco aparece **Ajustar las columnas a mano**: le indicas cuál es la fila de
títulos y qué columna es cada cosa. Queda guardado, así que la cartola del mes
siguiente se lee sola.

Las fechas que Excel guarda como número se convierten solas. Los montos con
puntos de miles también.
