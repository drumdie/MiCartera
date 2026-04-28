import firebase_admin
from firebase_admin import credentials
from app.core.config import settings

_initialized = False


def init_firebase() -> None:
    global _initialized
    if _initialized:
        return

    if settings.FIREBASE_CREDENTIALS_PATH:
        cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
        firebase_admin.initialize_app(cred)
    else:
        # Cloud Run / Cloud Functions: usa Application Default Credentials
        firebase_admin.initialize_app()

    _initialized = True
