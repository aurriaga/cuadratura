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
