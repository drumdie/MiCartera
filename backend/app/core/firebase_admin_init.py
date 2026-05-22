from pathlib import Path
import firebase_admin
from firebase_admin import credentials
from app.core.config import settings, _ENV_FILE

_initialized = False

# Directorio base del backend (donde vive el .env y el serviceAccountKey)
_BACKEND_DIR = _ENV_FILE.parent


def init_firebase() -> None:
    global _initialized
    if _initialized:
        return

    if settings.FIREBASE_CREDENTIALS_PATH:
        cred_path = Path(settings.FIREBASE_CREDENTIALS_PATH)
        # Si es ruta relativa, resolverla desde el directorio del backend
        if not cred_path.is_absolute():
            cred_path = _BACKEND_DIR / cred_path
        cred = credentials.Certificate(str(cred_path))
        firebase_admin.initialize_app(cred)
    else:
        # Cloud Run / Cloud Functions: usa Application Default Credentials
        firebase_admin.initialize_app()

    _initialized = True
