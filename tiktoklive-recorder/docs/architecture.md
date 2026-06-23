# Ember - Arquitectura de Captura TikTok Live

## Arquitectura actual (incremental, compatible)

### TikTokLiveClient
- Instanciado por cuenta objetivo en `tiktoklive-recorder/tiktok_listener.py`.
- Emite eventos de conexión, comentarios y término de live.

### RecorderCoordinator
- Vive en `tiktoklive-recorder/main.py`.
- Orquesta workers por cuenta (`start/stop/reconnect`) y expone estado operativo.
- La lista de cuentas activas sale de PostgreSQL; `targets.json` queda solo como espejo de compatibilidad.

### CurrentMessagesPublisher
- Vive en `tiktoklive-recorder/main.py`.
- Agrega mensajes/leads/sesiones por cuenta.
- Persiste `public/current_messages.json` solo como compatibilidad legacy.

### EventBus
- Vive en `tiktoklive-recorder/event_bus.py`.
- Implementación thread-safe en memoria (`publish`, `subscribe`, `unsubscribe`).
- Publica eventos de dominio cuando cambia estado:
  - `account.updated`
  - `session.started`
  - `session.ended`
  - `message.received`
  - `lead.updated`
  - `target.started`
  - `target.stopped`
  - `session.deleted`

### FastAPI
- Vive en `tiktoklive-recorder/api_server.py`.
- Reutiliza objetos existentes (coordinator + publisher + checker vía coordinator).
- Endpoints:
  - `GET /status`
  - `GET /live-status`
  - `GET /db-snapshot`
  - `POST /targets`
  - `DELETE /targets`
  - `DELETE /sessions`

### WebSocket
- Endpoint: `WS /ws`.
- Suscripción al `EventBus`.
- Cada evento dispara snapshot realtime (`bridgePayload` + `controlStatus`) para UI.

### React bridge
- `src/app/data/useRecorderBridge.ts`.
- Intenta WebSocket primero.
- Si WS entrega snapshots, actualiza por eventos y corta polling.
- Consulta `/recorder-api/db-snapshot` como fuente principal de datos.

### JSON fallback
- `current_messages.json` se conserva solo por compatibilidad.
- No es la fuente de verdad del frontend.

## Arquitectura objetivo

### Meta
- Desacoplar realtime de persistencia durable para escalar y auditar.

### Camino objetivo
- `TikTokLiveClient` -> `RecorderCoordinator` -> `EventBus`.
- `EventBus` fan-out a:
  - FastAPI/WS para UI en vivo.
  - Cola/event streaming para procesos asíncronos.
- Persistencia futura:
  - Redis para estado y distribución realtime.
  - Postgres para sesiones, mensajes, leads, historial y reportes.

### Resultado esperado
- Menos dependencia del archivo JSON.
- Recuperación más robusta tras reinicios.
- Base preparada para clasificación avanzada (LLM/embeddings) sin romper operaciones actuales.
