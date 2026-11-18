# Ordena tus Fotos

App web para iPhone que ayuda a ordenar la galería. Funciona en Safari, sin instalar nada, y las fotos no salen del teléfono (todo se procesa en el navegador).

## Qué hace

Funciona en celular, tablet y laptop desde el navegador. Las fotos y videos se procesan en el dispositivo.

- **Asistente IA:** conversa contigo sobre tu galería, te propone cómo ordenarla y hace los cambios (álbumes, limpieza, carpetas). Funciona dentro de Claude.
- **Limpieza:** duplicados, fotos parecidas (deja la más nítida), borrosas, muy oscuras, videos pesados, videos de menos de 3 s, capturas y grabaciones de pantalla, imágenes recibidas o descargadas y los 50 archivos más pesados. Con un botón eliminas lo sugerido y puedes deshacer.
- **Carpetas automáticas:** por tipo (con IA: paisajes, comida, La Tata Food, diseños…), por evento, por lugar (GPS), por personas y mascotas, y «momentos» (día + lugar + protagonista).
- **Revisar una a una:** desliza para conservar o eliminar, por mes, solo videos o solo lo sugerido.
- **Vista en grande** con flechas para pasar de una a otra.
- **Guarda tu avance:** si cierras la página y vuelves a cargar los mismos archivos, recupera lo que ya habías hecho.
- **Respaldo .zip por partes:** carpetas por tipo, evento, lugar, álbum o mes, sin lo eliminado.

## Límites

Una app web no puede borrar fotos ni crear álbumes dentro de la app Fotos del iPhone, ni reconocer quién es cada persona. La pestaña «Para borrar» muestra nombre y fecha de cada foto para borrarla a mano en Fotos.

## Estructura

- `src/app.html`: la app completa (HTML, CSS y JS en un archivo).
- `build.sh`: genera `site/index.html`.
- `.github/workflows/pages.yml`: publica en GitHub Pages al hacer push a `main`.
