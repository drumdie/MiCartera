# Backend FastAPI de MiCartera para Google Cloud Run.
# Build context = carpeta backend/  (gcloud run deploy --source backend  ó
#                                     docker build -f backend/Dockerfile backend)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Dependencias primero (mejor cache de capas)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código de la app
COPY app ./app

# Cloud Run inyecta $PORT en runtime; uvicorn debe bindear 0.0.0.0:$PORT.
# 'exec' deja a uvicorn como PID 1 → recibe SIGTERM y apaga limpio.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
