# TikTok Live Platform

Monorepo local con dos partes:

- `./` frontend dashboard (Vite + React)
- `./tiktoklive-recorder` backend/collector para TikTok Live

## Estructura de documentación

- Documentación general del proyecto: `docs/architecture.md`
- Documentación específica del recorder: `tiktoklive-recorder/README.md`

## Arranque unificado

```bash
npm install
docker compose up -d
npm run dev:all
```

Eso levanta el frontend de Vite y el recorder de Python al mismo tiempo.
El recorder requiere Python 3.10+ y, en este proyecto, `python3.11` es la opción recomendada.

## Ejecutar frontend

```bash
npm install
npm run dev
```

## Ejecutar recorder

```bash
cd tiktoklive-recorder
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3.11 main.py
```

## Base de datos local

```bash
docker compose up -d
```

La primera vez que levanta, Postgres carga automaticamente:

- `database/schema.sql`
- `database/seed.sql`

Para revisar datos de ejemplo:

```bash
psql "postgresql://ember:ember@localhost:5432/ember" -f database/example-queries.sql
```

Para reiniciar la base desde cero:

```bash
docker compose down -v
docker compose up -d
```
