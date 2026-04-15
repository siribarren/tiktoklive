# TikTok Live Recorder

Herramienta en Python para escuchar comentarios de lives de TikTok, guardarlos en archivos `.txt`, detectar leads básicos y subir los logs a Google Drive.

## Qué hace

- Escucha una o varias cuentas de TikTok Live.
- Muestra los comentarios en una ventana `tkinter` o en consola.
- Guarda cada sesión en `logs/`.
- Clasifica mensajes con reglas simples para detectar potenciales leads y los guarda en `leads/`.
- Puede exportar un resumen consolidado de mensajes por usuario.
- Sube los logs generados a Google Drive.

## Requisitos

- Python 3.9+
- Una app OAuth de Google para Drive
- Una cuenta o lista de cuentas de TikTok para monitorear

## Instalación

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Configuración

1. Copia `.env.example` a `.env` y completa sus valores.
2. Copia `credentials.example.json` a `credentials.json` y pega tus credenciales OAuth de Google.
3. La primera vez que ejecutes el proyecto se generará `token.json` después del flujo de autorización.
4. Si quieres monitorear varias cuentas, crea un `targets.json` basado en `targets.example.json`.

Variables soportadas:

- `TIKTOK_UNIQUE_ID`: cuenta única a escuchar si no usas `targets.json`.
- `TARGETS_FILE`: ruta a un archivo JSON con múltiples cuentas.
- `DRIVE_FOLDER_ID`: carpeta destino en Google Drive.

## Uso

Escuchar lives:

```bash
python main.py
```

Exportar resumen JSON a partir de los logs:

```bash
python export_stream_json.py
```

## Archivos locales no versionados

Estos archivos se mantienen fuera de git:

- `.env`
- `credentials.json`
- `token.json`
- `targets.json`
- `logs/`
- `leads/`
- `venv/`

## Subir a GitHub

El repositorio queda preparado para publicarse en:

`https://github.com/siribarren/tiktoklive`
