# Ordena tus Fotos

App web para iPhone que ayuda a ordenar la galería. Funciona en Safari, sin instalar nada, y las fotos no salen del teléfono (todo se procesa en el navegador).

## Qué hace

- **Por fecha:** agrupa las fotos por mes usando la fecha original de la foto (EXIF).
- **Revisar una a una:** desliza a la izquierda para borrar y a la derecha para conservar; puedes asignar álbum mientras revisas.
- **Duplicados:** detecta fotos iguales o casi iguales y sugiere la mejor (mayor resolución).
- **Capturas:** encuentra capturas de pantalla para borrarlas de una vez.
- **Álbumes:** crea álbumes y mueve fotos seleccionadas.
- **Exportar:** crea un `.zip` con una carpeta por álbum o por mes, sin las fotos marcadas para borrar.

## Límites

Una app web no puede borrar fotos ni crear álbumes dentro de la app Fotos del iPhone. La pestaña «Para borrar» muestra nombre y fecha de cada foto para borrarla a mano en Fotos.

## Estructura

- `src/app.html`: la app completa (HTML, CSS y JS en un archivo).
- `build.sh`: genera `site/index.html`.
- `.github/workflows/pages.yml`: publica en GitHub Pages al hacer push a `main`.
