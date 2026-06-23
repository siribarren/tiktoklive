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
npm run dev:all
```

Ese comando levanta o reutiliza:

- el servicio PostgreSQL local de desarrollo
- el backend/recorder de Python
- el frontend de Vite

Las cuentas activas ahora se leen desde PostgreSQL; `tiktoklive-recorder/targets.json`
queda solo como espejo de compatibilidad.

Por defecto intenta usar el servicio Homebrew `postgresql@17` y, si hace falta,
puedes cambiarlo con `DEV_STACK_POSTGRES_SERVICE` o `DEV_STACK_DATABASE_URL`.
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

El comando `npm run dev:all` usa la base local en `127.0.0.1:5432`.
Para revisar datos de ejemplo:

```bash
psql "postgresql://ember:ember@127.0.0.1:5432/ember" -f database/example-queries.sql
```

Para reiniciar la base desde cero:

```bash
rm -rf /private/tmp/ember-dev-stack
npm run dev:all
```
