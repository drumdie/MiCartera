from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Firebase Admin SDK
    FIREBASE_CREDENTIALS_PATH: str = ""
    FIREBASE_PROJECT_ID: str = ""

    # PPI API — credenciales del panel de desarrolladores de PPI
    # PPI_API_KEY    → clave de la aplicación (portal developer)
    # PPI_API_SECRET → secreto de la aplicación (portal developer)
    # PPI_ACCOUNT_NUMBER → número de comitente del usuario (para consultas de cuenta)
    PPI_API_KEY:        str = ""
    PPI_API_SECRET:     str = ""
    PPI_ACCOUNT_NUMBER: str = ""
    PPI_BASE_URL:       str = "https://clientapi.portfoliopersonal.com"

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173"]

    # Polling de cotizaciones (segundos)
    POLLING_INTERVAL: int = 60


settings = Settings()
