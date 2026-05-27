import os
import json
from pathlib import Path

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
BASE_DIR = Path(__file__).resolve().parent
TOKEN_FILE = BASE_DIR / "token.json"
CLIENT_SECRETS_FILE = BASE_DIR / "credentials.json"


def _run_oauth_flow():
    try:
        json.loads(CLIENT_SECRETS_FILE.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"credentials.json es inválido: {exc.msg} en línea {exc.lineno}, columna {exc.colno}."
        ) from exc

    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRETS_FILE), SCOPES)
    # Force consent so Google returns a refresh token again if the old one was lost/revoked.
    return flow.run_local_server(
        port=0,
        access_type="offline",
        prompt="consent",
    )


def get_drive_service():
    creds = None

    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except json.JSONDecodeError:
            TOKEN_FILE.unlink()

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except RefreshError:
                # The refresh token may have expired or been revoked; request auth again.
                if TOKEN_FILE.exists():
                    TOKEN_FILE.unlink()
                creds = _run_oauth_flow()
        else:
            creds = _run_oauth_flow()

        with open(TOKEN_FILE, "w") as token:
            token.write(creds.to_json())

    return build("drive", "v3", credentials=creds)


def upload_file_to_drive(filepath: str, folder_id: str):
    if not folder_id:
        raise ValueError("DRIVE_FOLDER_ID no está configurado.")

    service = get_drive_service()

    file_metadata = {
        "name": os.path.basename(filepath),
        "parents": [folder_id]
    }

    media = MediaFileUpload(filepath, mimetype="text/plain")
    created = service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id,name"
    ).execute()

    return created
