# Aula Virtual

Plataforma de clases para celular, tablet y computadora. Funciona con tu cuenta de Google:

- Los **datos** (estudiantes, tareas, notas) se guardan en una hoja de Google Sheets.
- Los **archivos** se guardan en tu Google Drive, ordenados así:
  `Aula Virtual / Sede / Aula / Estudiantes / Apellidos Nombres - DNI / Tarea`

## Qué hace

**Profesor**
- Crea sedes y, dentro de cada sede, aulas. Cada aula tiene un código para que los estudiantes se unan.
- Sube material (PDF, Word, PowerPoint, imágenes, videos).
- Crea actividades:
  - **Comentario privado** sobre un tema. Cada estudiante solo ve el suyo.
  - **Subir archivos, fotos o videos**, también videos grandes, que se suben por partes.
  - **Formulario** con preguntas de opción múltiple, que se califican solas, o preguntas abiertas.
  - **Examen parcial o final**: el profesor sube la foto del examen y pone la nota.
- **Detector de copia e IA** en las respuestas escritas:
  - Si el estudiante **pegó** el texto en vez de escribirlo, y qué porcentaje.
  - Si escribió demasiado rápido para ser a mano.
  - Qué tanto **se parece a la respuesta de otro compañero**, y qué frases coinciden.
  - Si **pudo hacerse con IA**: con indicios locales o, si pones una clave de la API de Claude, con una revisión más fina.

  Son indicios para que revises tú, no pruebas.
- Califica con nota y comentario. Cada actividad tiene su nota máxima y su peso.
- Ve el **récord de notas** por estudiante, aula y sede, y los **comparativos** entre aulas. Exporta todo a **Excel**.
- **Buscador de estudiantes** por nombre, DNI, correo o celular. De cada uno ve:
  - Cuándo entró por última vez, el tiempo total conectado y si nunca entró.
  - Puede retirarlo del aula o desactivar su cuenta.
  - Puede ponerle una contraseña nueva, que la app le pedirá cambiar al entrar.
  - Puede **entrar como el estudiante** para ver lo que él ve.

**Estudiante**
- Se registra la primera vez con su DNI, nombres y apellidos completos, celular, correo, contraseña y el código del aula.
- Entra con su DNI o con su correo, y puede cambiar su contraseña.
- Ve el material, entrega sus tareas y ve sus notas con un gráfico de su avance.

## Instalación (una sola vez, unos 10 minutos)

1. Entra a <https://script.google.com> con tu cuenta de Google y toca **Nuevo proyecto**. Ponle de nombre «Aula Virtual».
2. En **Configuración del proyecto** (el engranaje ⚙ a la izquierda), marca **«Mostrar el archivo de manifiesto "appsscript.json" en el editor»**.
3. Vuelve al **Editor** (`< >`) y copia los tres archivos de la carpeta `apps-script`:
   - `Código.gs`: borra lo que tiene y pega el contenido de **`apps-script/Codigo.gs`**.
   - Toca **+ → HTML**, llámalo **`Index`** (sin `.html`) y pega el contenido de **`apps-script/Index.html`**.
   - `appsscript.json`: reemplaza su contenido por el de **`apps-script/appsscript.json`**.
4. Arriba de `Código.gs`, en `CONFIG`, pon **tu DNI, tus nombres y apellidos** y una **clave inicial**. Guarda con el ícono de disquete o con Ctrl+S.
5. En la barra de arriba elige la función **`instalar`** y toca **Ejecutar**.
   - Google te pedirá permisos. Toca **Revisar permisos**, elige tu cuenta, luego **Configuración avanzada → Ir a Aula Virtual** y **Permitir**.
   - Se crea en tu Drive la carpeta **«Aula Virtual»** con la base de datos adentro.
6. Toca **Implementar → Nueva implementación**:
   - En el engranaje, elige el tipo **Aplicación web**.
   - **Ejecutar como:** Yo.
   - **Quién tiene acceso:** Cualquier usuario.
   - Toca **Implementar** y copia la **URL de la aplicación web**.
7. Abre esa URL, entra con tu DNI y la clave inicial, y crea tu contraseña nueva.
8. Crea tus sedes y aulas, y comparte la URL y el código de cada aula con tus estudiantes.

**Para que parezca una app en el celular:** abre la URL y elige «Agregar a pantalla de inicio». En iPhone está en el botón Compartir; en Android, en el menú ⋮.

### Cuando cambies el código
Ve a **Implementar → Gestionar implementaciones → ✏️ Editar**, elige **Versión: Nueva versión** y toca **Implementar**. La URL no cambia.

### Detector de IA con Claude (opcional)
Crea una clave en <https://console.anthropic.com> y pégala en la app, en **Mi cuenta → Detector de IA**. Cada revisión cuesta unos centavos de dólar. Sin clave, el detector igual funciona con indicios locales.

## Seguridad y privacidad
- Las contraseñas se guardan cifradas: nadie puede leerlas, ni el profesor. El profesor puede poner una nueva y la app le pide al estudiante cambiarla.
- Los archivos de los estudiantes quedan en el Drive del profesor y no se comparten con nadie.
- Tras 5 intentos fallidos, el acceso se bloquea 10 minutos.
- Google muestra arriba de la página el aviso «Esta aplicación fue creada por un usuario de Google Apps Script». Es normal en este tipo de apps.

## Límites
- Un material debe pesar 25 MB o menos para que los estudiantes lo abran dentro de la app. Los videos que suben los estudiantes no tienen ese límite.
- Google Apps Script tiene cuotas diarias. Para unos 200 estudiantes alcanzan con holgura.

## Pruebas
`pruebas/prueba-completa.js` simula los servicios de Google y recorre la app en un navegador como profesor y como tres estudiantes. Necesita Node.js y Playwright:

```
cd pruebas && node prueba-completa.js
```
