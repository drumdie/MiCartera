# Deploy del backend a Google Cloud Run

Objetivo: que el backend FastAPI tenga una URL pública HTTPS fija, así el apk Android
(y la web) pueden traer el portfolio desde cualquier red. Proyecto: **`micartera-ar`**.

> Prerequisito: plan **Blaze** habilitado (✓). Free tier de Cloud Run cubre el uso personal
> → ~$0. Conviene una **alerta/tope de presupuesto** (ya configurada en $3).

---

## 1. Instalar gcloud (una vez)

Descargá e instalá el **Google Cloud SDK** para Windows:
https://cloud.google.com/sdk/docs/install

Al terminar abre una terminal nueva y autenticá:

```powershell
gcloud init                 # elegí tu cuenta y el proyecto micartera-ar
gcloud auth login           # si no lo pidió en init
gcloud config set project micartera-ar
```

---

## 2. Deploy

Desde la **raíz del repo** (`MiCartera/`):

```powershell
gcloud run deploy micartera-backend `
  --source backend `
  --region southamerica-east1 `
  --allow-unauthenticated
```

- `--source backend` → buildea con `backend/Dockerfile` (Cloud Build lo hace en la nube; no necesitás Docker local).
- `southamerica-east1` (São Paulo) → el más cercano a Argentina (menor latencia).
- `--allow-unauthenticated` → Cloud Run deja entrar el request; **la autenticación real la hace nuestro `FirebaseAuthMiddleware`** (exige el token de Firebase). Es lo correcto.

La primera vez te va a preguntar si habilita las APIs de Cloud Run/Cloud Build → **sí**.
Al terminar imprime la **Service URL**: algo como
`https://micartera-backend-xxxxxxxx-rj.a.run.app`. **Guardala.**

---

## 3. Variables de entorno (en la Console de Cloud Run)

El deploy arranca pero todavía le faltan credenciales. Andá a:
**Cloud Run → micartera-backend → Editar e implementar nueva revisión → Variables y secretos**
y agregá (los valores los sacás de tu `backend/.env`):

| Variable | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | `micartera-ar` |
| `ALLOWED_ORIGINS` | `["https://localhost","https://micartera-ar.web.app","https://micartera-ar.firebaseapp.com","http://localhost:5173"]` |
| `PPI_AUTHORIZED_CLIENT` | (de tu `.env`) |
| `PPI_CLIENT_KEY` | (de tu `.env`) |
| `PPI_API_KEY` | (de tu `.env`) |
| `PPI_API_SECRET` | (de tu `.env`) → **mejor como Secreto** (ver abajo) |
| `PPI_ACCOUNT_NUMBER` | (de tu `.env`) |
| `DATA_ENCRYPTION_KEY` | (de tu `.env`) → **mejor como Secreto** |
| `ADMIN_UID` | (de tu `.env`) |

> **NO** setees `FIREBASE_CREDENTIALS_PATH`. Al dejarla vacía, el backend usa las
> credenciales del propio servicio de Cloud Run (ADC) para hablar con Firestore.
> `ALLOWED_ORIGINS` va tal cual (es un JSON entre comillas; pydantic lo parsea solo).

**Secretos (recomendado para `PPI_API_SECRET` y `DATA_ENCRYPTION_KEY`):** en esa misma
pantalla, "Referenciar un secreto" → crear secreto en Secret Manager → pegás el valor.
Así no quedan como texto plano en la config del servicio. (Para una v1, env vars normales
también sirven — Google las cifra at-rest — pero Secret Manager es lo prolijo.)

Guardá → implementa una revisión nueva.

---

## 4. Permisos de Firestore (verificación)

El servicio usa la **service account por defecto** de Cloud Run. En un proyecto nuevo suele
tener rol *Editor* (incluye Firestore) → funciona sin tocar nada. Si más adelante restringís
esa SA, otorgale **"Usuario de Cloud Datastore"** (Firestore) para que pueda leer/escribir.

---

## 5. Smoke test

En el navegador abrí: `<TU_SERVICE_URL>/api/health` → debe responder:

```json
{"status": "ok", "version": "0.1.0"}
```

Si eso anda, el backend está vivo. (Las rutas de portfolio requieren token de Firebase, no
se prueban directo en el navegador.)

---

## 6. Apuntar la app a Cloud Run + rebuild del apk

Pasame la **Service URL** y yo:
1. Seteo `VITE_API_URL=<URL>` en `frontend/.env`.
2. Rebuildeo el apk.
3. Reinstalás → el Dashboard ya trae el portfolio en el teléfono (en 4G, donde sea).

> Nota: la primera request tras un rato de inactividad puede tardar ~1-2 s (Cloud Run
> "arranca en frío" desde cero). Después responde normal.

---

## Costos

- Cloud Run escala a **cero** cuando nadie lo usa → no pagás por estar prendido.
- Free tier mensual cubre de sobra el uso personal → **~$0**. La alerta de $3 te avisa si algo
  se dispara. PPI y yfinance son gratis; Firestore tiene su propio free tier.
