# Royal Gold Club

Primera versión navegable de la plataforma premium de juegos de cartas. Está construida como una SPA ligera con un servidor Node.js/WebSocket incluido para probar mesas compartidas durante el desarrollo.

## Ejecutar

```powershell
npm run dev
```

Abre `http://localhost:4173`. También se puede abrir en otra pestaña del mismo navegador para probar el flujo de código de invitación local.

## Qué está funcionando en esta fase

- Registro e inicio de sesión local con persistencia en `localStorage`.
- Lobby responsive, catálogo inicial y estados vacíos reales.
- Creación de mesas, códigos únicos `ROYAL-XXXXXX`, unión por código, sala de espera y copia/compartir.
- Canal realtime en `/realtime`: el servidor valida creación/unión, anfitrión, límite de asientos, turnos y jugadas de UNO. Abre dos pestañas en `http://localhost:4173` para probarlo.
- PWA móvil: `manifest.webmanifest`, `icon.svg` y `sw.js` permiten instalar el club como aplicación independiente; el caché cubre únicamente el shell visual y nunca el estado de partidas ni WebSockets.
- Motor UNO independiente en `games/uno.mjs`: baraja completa de 108 cartas, colores activos, comodines, salto, reversa, +2, +4, robo, victoria y serialización de manos privadas.
- Chat de mesa en tiempo real, aislado por sala y limitado a 240 caracteres por mensaje; la interfaz conserva los últimos 50 mensajes recibidos.
- Señalización WebRTC de voz por mesa: permisos explícitos de micrófono, ofertas/respuestas ICE retransmitidas por el servidor, audio remoto no grabado y limpieza al abandonar.
- Cierre de ronda en la interfaz: ganador, cartas restantes, salida de mesa y reinicio de partida para el anfitrión.
- Store dual en `server/store.mjs`: conserva metadatos de mesas en `data/tables.json` durante desarrollo y cambia a Supabase REST cuando existen `SUPABASE_URL` y `SUPABASE_SECRET_KEY`; acepta `SUPABASE_SERVICE_ROLE_KEY` como compatibilidad legacy; `/health` expone el modo activo.
- UNO jugable con estado autorizado por servidor cuando el WebSocket está disponible; modo local contra rivales de prueba como respaldo: validación de carta, robo, turnos, descarte, victoria y recompensa virtual.
- Perfil, historial, estadísticas, amigos y preferencias.
- Solicitud explícita de permiso de micrófono mediante `getUserMedia`, indicador de micrófono y salida de la mesa.
- Accesibilidad básica: labels, foco visible, botones táctiles y `prefers-reduced-motion`.

La interfaz muestra si el servidor realtime está conectado. La autenticación del formulario todavía es local; la identidad persistente de Supabase deberá enviar el UUID del usuario en el saludo realtime antes de activar mesas multi-instancia.

Las pruebas del motor se ejecutan con `npm test` y cubren baraja, reparto, jugadas válidas, salto, robo y victoria.

## Siguiente capa de producción

1. **Identidad y datos:** completar Supabase Auth + PostgreSQL. El adaptador de mesas y la migración RLS ya están preparados; falta conectar el formulario de acceso y escribir sesiones, eventos, wallets y resultados en sus tablas.
2. **Servidor autoritativo:** `server.mjs` ya incluye un gateway WebSocket por mesa, heartbeat, límite básico de mensajes, expiración de códigos y validación de turnos/cartas privadas para UNO, Blackjack/21, Dominó, Texas Hold’em, Rummy y Crazy Eights. Para producción, migrarlo a Node.js/TypeScript, añadir acciones idempotentes, versión del estado, autenticación de tokens y almacenamiento persistente.
3. **Motores independientes:** `games/uno.mjs`, `games/blackjack.mjs`, `games/domino.mjs`, `games/poker.mjs`, `games/rummy.mjs` y `games/crazy-eights.mjs` tienen pruebas de reglas. 21 incluye ases y dealer; Dominó incluye set doble-seis, extremos, pozo y pases; Texas Hold’em incluye ciegas, bote, check/call/raise/fold, calles comunitarias, evaluación de manos y showdown; Rummy incluye robo desde pozo/descarte, manos privadas, turnos, grupos y escaleras; Crazy Eights incluye ocho comodín de palo, descarte y robo. CSPRNG para barajar.
4. **Voz:** esta fase incluye WebRTC mesh para mesas pequeñas con STUN y señalización propia. Para producción, sustituir o complementar por LiveKit con tokens efímeros generados en servidor, una sala por `table_id`, permisos de micrófono explícitos y sin grabación por defecto.
5. **Economía:** transacciones atómicas para `virtual_wallets` y `wallet_transactions`; todas las fichas son recreativas y sin valor monetario.
6. **Despliegue:** variables de entorno sugeridas: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (solo servidor), `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `REALTIME_ORIGIN`. `SUPABASE_SERVICE_ROLE_KEY` se acepta solo como compatibilidad legacy.

## Arquitectura sugerida

```text
src/
  auth/        perfiles, sesiones y privacidad
  lobby/       catálogo, mesas e invitaciones
  games/       uno, poker, blackjack, domino, rummy, crazy-eights, mica
  realtime/    gateway WS, eventos idempotentes, reconexión
  economy/     wallets y ledger de fichas
  voice/       tokens LiveKit y controles de audio
  moderation/  bloqueos, reportes y administración
```

La versión local está intencionalmente concentrada en `app.js` para que el primer flujo sea fácil de inspeccionar; el siguiente paso técnico es separar estos módulos y añadir tests automatizados antes de publicar partidas entre dispositivos.

## Datos y despliegue

`supabase/migrations/001_initial_schema.sql` contiene el contrato PostgreSQL para perfiles, catálogo, mesas, miembros, invitaciones, sesiones, eventos auditables, wallets, movimientos idempotentes, resultados, amistades, bloqueos, notificaciones y reportes. Incluye índices, triggers y políticas RLS. Copia `.env.example` como `.env` para preparar la integración; la `SUPABASE_SECRET_KEY` solo debe vivir en el backend.

La demo local no ejecuta esta migración automáticamente ni inventa una conexión de producción. Con las variables de Supabase, el store usa PostgreSQL para metadatos de mesas; sin ellas, conserva el fallback de archivo para desarrollo. Las transacciones del ledger y la autenticación todavía requieren su integración específica.

### Despliegue recomendado

El backend realtime se prepara para Render porque necesita un proceso Node.js persistente y WebSocket. `render.yaml` deja definidos `npm ci`, `npm start` y `/health`; configura en Render `SUPABASE_URL` y `SUPABASE_SECRET_KEY` como secretos. Cloudflare puede quedar delante como DNS, HTTPS y protección del dominio, pero no sustituye al proceso Node/WebSocket.

Antes del primer despliegue ejecuta la migración de `supabase/migrations/001_initial_schema.sql`, crea los perfiles de Auth y verifica `/health` con `storage: "supabase"`. En producción el servidor se detiene si faltan las variables de Supabase, evitando un fallback accidental a archivos locales. No subas `.env` ni claves al repositorio.

La identidad de desarrollo local principal configurada para el proyecto es `byvera198@gmail.com`. Esta referencia no contiene contraseña, token ni acceso a servicios externos; la conexión real a Supabase requerirá las credenciales del proyecto.
