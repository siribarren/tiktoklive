# TikTok Live Platform

Monorepo local con dos partes:

- `./` frontend dashboard (Vite + React)
- `./tiktoklive-recorder` backend/collector para TikTok Live

## Estructura de documentación

- Documentación general del proyecto: `docs/architecture.md`
- Documentación específica del recorder: `tiktoklive-recorder/README.md`

## Ejecutar frontend

```bash
npm install
npm run dev
```

## Ejecutar recorder

```bash
cd tiktoklive-recorder
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```
