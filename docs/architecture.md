# Ember - Arquitectura de Captura TikTok Live

## Arquitectura actual (incremental, compatible)

### 1) TikTokLiveClient
- Se instancia por cuenta objetivo en `tiktok_listener.py`.
- Recibe eventos de live (`ConnectEvent`, `CommentEvent`, `DisconnectEvent`, `LiveEndEvent`).

### 2) RecorderCoordinator
- Vive en `main.py`.
- Orquesta el ciclo de vida por cuenta: iniciar, detener, reconectar y exponer estado operativo.
- Gestiona `runningTargets`, errores de conexión y `monitoringSince`.

### 3) CurrentMessagesPublisher
- Vive en `main.py`.
- Normaliza y agrega mensajes/leads/sesiones por cuenta.
- Persiste el snapshot de UI en `public/current_messages.json` (bridge legado que se mantiene activo).

### 4) EventBus
- Vive en `event_bus.py`.
- Bus en memoria, thread-safe, con `publish`, `subscribe` y `unsubscribe`.
- Publica eventos de dominio (`account.updated`, `session.started`, `message.received`, etc.) cuando cambia estado.

### 5) FastAPI
- Vive en `api_server.py`.
- Reutiliza `RecorderCoordinator` + `CurrentMessagesPublisher` + `LiveStatusChecker` vía el coordinador.
- Endpoints:
  - `GET /status`
  - `GET /live-status`
  - `POST /targets`
  - `DELETE /targets`
  - `DELETE /sessions`

### 6) WebSocket
- Endpoint: `WS /ws` en `api_server.py`.
- Se suscribe al `EventBus`.
- En cada evento envía snapshot realtime para UI (`bridgePayload` + `controlStatus`) sin romper el bridge JSON.

### 7) React bridge
- `useRecorderBridge.ts` intenta WS primero.
- Si recibe snapshots por WS, actualiza estado por eventos y detiene polling.
- Si WS falla/cierra, mantiene polling a `current_messages.json` + `/recorder-api/status`.

### 8) JSON fallback
- `current_messages.json` sigue siendo fuente de compatibilidad.
- Permite operación incluso si WS/FastAPI no está disponible.

## Arquitectura objetivo (siguiente etapa)

### Objetivo
- Separar capa realtime de capa de persistencia durable y analítica.

### Diseño objetivo
- `TikTokLiveClient` -> `RecorderCoordinator` -> `EventBus`.
- `EventBus` emite a:
  - FastAPI/WS (consumo UI en vivo).
  - Cola/broker para procesamiento asíncrono.
- Persistencia duradera:
  - Redis para fan-out/cache de eventos y presencia realtime.
  - Postgres para sesiones, mensajes, leads, auditoría y reportes.

### Resultado esperado
- UI realtime desacoplada del archivo JSON.
- Recuperación robusta ante reinicios.
- Base lista para clasificación avanzada (LLM/embeddings) sin romper el flujo operacional.
