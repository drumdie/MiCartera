# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

**MiCartera** — App PWA de seguimiento de cartera de inversiones argentina.
Integra con la API de PPI (Portfolio Personal Inversiones) como broker.
Multi-usuario desde el diseño: cada usuario tiene su propia subcolección en Firestore.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + vite-plugin-pwa |
| Backend | FastAPI (Python) |
| Base de datos | Firebase Firestore |
| Auth | Firebase Authentication |
| Hosting | Firebase Hosting |
| Scheduler | Firebase Cloud Functions (Python, 2nd gen) |
| Broker API | PPI (Portfolio Personal Inversiones) |

## Comandos de desarrollo

### Frontend
```bash
cd frontend
npm install          # primera vez
npm run dev          # dev server en http://localhost:5173
npm run build        # build de producción → frontend/dist/
npm run preview      # previsualizar el build
npm run lint         # ESLint
```

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Swagger: http://localhost:8000/api/docs
```

### Firebase emuladores (desarrollo sin nube)
```bash
firebase emulators:start
# Firestore UI: http://localhost:4000
```

### Deploy
```bash
npm run build --prefix frontend   # build frontend primero
firebase deploy                   # deploy hosting + functions + firestore rules
firebase deploy --only hosting    # solo frontend
firebase deploy --only functions  # solo Cloud Functions
```

## Arquitectura

```
frontend/src/
  components/
    layout/          Header (MEP, RP chip), CurrencyToggle, PrivacyToggle
    portfolio/       CategorySection, AssetRow (acordeón), TacticalBadge
    charts/          DonutChart (distribución), TradingViewWidget
    fundamental/     FundCard (EBITDA, ratios, escenarios bear/base/bull)
    catalysts/       Timeline, CatalystItem
    claude-tools/    CopyContextBtn, PasteResultArea
    ui/              KPICard, StressCard, Modal, Toast
  hooks/
    usePortfolio     Suscripción onSnapshot a Firestore → agrega totales
    useCurrency      Estado de moneda activa (ARS/MEP/CCL/BNA) + conversiones
    usePrivacy       Toggle de privacidad + persistencia en localStorage
    useAuth          Firebase Auth
  services/
    firebase.js      Init Firestore + Auth
    portfolioService CRUD de posiciones en Firestore
    contextBuilder   Genera el texto táctico para "Herramientas Claude"
  store/             Context global: moneda, privacidad, usuario, cotizaciones
  pages/             Dashboard, Login

backend/app/
  main.py            FastAPI entry point + CORS
  core/config.py     Variables de entorno via pydantic-settings
  routers/           portfolio.py, prices.py, stress.py  (Fase 2)
  services/          ppi_client.py, stress_calculator.py (Fase 2)
  models/            Schemas Pydantic por categoría de activo

functions/
  main.py            Scheduler: polling PPI → escribe en /market/cotizaciones
```

## Colecciones Firestore

```
/users/{uid}/
  portfolio         Posiciones del usuario (6 categorías)
  catalysts         Eventos del calendario
  profile           Preferencias: moneda default, privacidad, alertas

/market/
  cotizaciones      MEP, CCL, BNA, Oficial, riesgo_país — escribe solo el backend
```

## Categorías de activos

`acciones_ar` · `cedears` · `bonos` · `ons` · `fci` · `liquidez`

Schema completo de referencia en `MiCartera_estructura.json`.

## Reglas clave

- Ningún nominal, precio, rendimiento ni credencial en el código — todo viene de la API o `.env`.
- El frontend nunca llama directamente a la API de PPI; el backend actúa de proxy.
- CEDEARs siempre muestran precio en ARS (BYMA) **y** valor del subyacente en USD (NYSE/NASDAQ).
- La moneda de referencia para rendimiento real es USD MEP.
- Antes de crear o modificar cualquier archivo, mencionar qué se va a hacer y esperar confirmación.
- El archivo `cartera_app_v5b.html` es la referencia visual/UX — no copiar sus datos a código.

## Variables de entorno

Copiar `.env.example` → `.env` en `backend/` y `frontend/` y completar con valores reales.
Los `.env` están en `.gitignore` y **nunca** se commitean.
