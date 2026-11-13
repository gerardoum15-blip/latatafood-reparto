# Reparto · La Tata Food

App web pequeña para el reparto a domicilio:

- **Administrador**: crea el pedido (cliente, WhatsApp, dirección, referencia, ubicación, detalle, total y forma de pago con vuelto), asigna el motorizado, cambia los estados y envía al cliente su enlace de seguimiento por WhatsApp. Ve a los motorizados en un mapa en vivo y gestiona el personal (cada uno con su PIN).
- **Motorizado**: ve solo sus pedidos con nombre, botones de WhatsApp y llamada, dirección con Google Maps / Waze y cuánto cobrar (con vuelto). Maneja los estados: *Salir en camino → Marcar entregado*. Comparte su GPS automáticamente mientras reparte.
- **Cliente**: abre su enlace (`…/#seguir/CODIGO`) sin instalar nada y ve los 5 estados y, cuando el pedido está *En ruta*, al motorizado moviéndose en el mapa y la distancia que falta. Puede cerrar la página y volver a abrir el enlace cuando quiera.

Estados (los cambia el driver): Pedido confirmado y en preparación · En camino hacia tu ubicación · Pedido entregado.

## Puesta en marcha

1. **Supabase**: abre tu proyecto (puede ser el mismo de La Tata Food; todas las tablas empiezan con `rep_`) → *SQL Editor* → *New query* → pega `supabase/setup.sql` → *Run*.
2. **Configuración**: en `src/config.ts` pega `SUPABASE_URL` y `SUPABASE_KEY` (Project Settings → API → *Publishable key*) y el WhatsApp del negocio.
3. **Publicar**: sube el repositorio a GitHub y en *Settings → Pages → Source* elige **GitHub Actions**. Cada cambio en `main` se publica solo.
4. Abre la app: la primera vez pide crear el **administrador** (nombre + PIN). Luego en *Personal* agrega a los motorizados con su PIN.

Sin el paso 2 la app funciona en **modo demo** (datos solo en ese navegador; PIN 1234 administrador, 1111 motorizado).

## Importante sobre el GPS del motorizado

Un navegador solo puede enviar la ubicación **mientras la página está abierta en pantalla**. La app mantiene la pantalla encendida (en Chrome/Android y Safari 16.4+) y reenvía la ubicación cada pocos segundos. Si el motorizado bloquea el celular o cambia a otra app, el cliente ve la última ubicación y el aviso "Última ubicación hace X min". Para GPS con la pantalla apagada se necesitaría una app nativa (Android/iOS).

## Desarrollo

```bash
npm install
npm run dev
```
