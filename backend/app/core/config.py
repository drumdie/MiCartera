from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env — ruta absoluta para que funcione independientemente del cwd
_ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_ENV_FILE), extra="ignore")

    # Firebase Admin SDK
    FIREBASE_CREDENTIALS_PATH: str = ""
    FIREBASE_PROJECT_ID: str = ""

    # PPI API — 4 credenciales del panel Gestiones → Gestión de servicio API
    PPI_AUTHORIZED_CLIENT: str = ""
    PPI_CLIENT_KEY:        str = ""
    PPI_API_KEY:           str = ""
    PPI_API_SECRET:        str = ""
    PPI_ACCOUNT_NUMBER:    str = ""
    PPI_BASE_URL:          str = "https://clientapi.portfoliopersonal.com"

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173"]

    # Polling de cotizaciones (segundos)
    POLLING_INTERVAL: int = 60

    # UID del administrador (owner). Solo este UID puede hacer POST /api/prices/refresh.
    # Copiar desde Firebase Console → Authentication → Users.
    ADMIN_UID: str = ""


settings = Settings()
