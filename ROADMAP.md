# MiCartera — Roadmap de Desarrollo

Seguimiento de fases y hitos del proyecto PWA de cartera de inversiones argentina.

---

## Fase 0: Infraestructura Base ✅ COMPLETADO

**Objetivo:** Establecer la base técnica del proyecto.

- [x] Stack: FastAPI + React 18 + Vite + Firebase (Firestore + Auth + Hosting)
- [x] Setup inicial del monorepo (`frontend/`, `backend/`, `functions/`)
- [x] Firebase Authentication (email/password)
- [x] Firestore schema base por categoría de activos
- [x] Integración PPI broker API (credenciales en `.env`)
- [x] CORS y middleware de auth en FastAPI
- [x] Cloud Functions para scheduler de cotizaciones
- [x] Firestore Security Rules (lectura por usuario, escritura solo backend)

**Commits:** `8e7a3d7` (feat: Fase 0 — infraestructura base del proyecto)

---

## Fase 1: Portfolio Sync & Display 🔄 EN PROGRESO

**Objetivo:** Sincronizar posiciones desde PPI y mostrar cartera con precisión.

### 1.1 Sync de Posiciones ✅
- [x] `GET /api/portfolio/sync` — fetch desde PPI, escritura a Firestore
- [x] Manejo de mercado cerrado (fin de semana) — preserva datos frescos
- [x] `is_stale` flag para indicar al frontend que los datos no son frescos
- [x] Fallback a últimos valores conocidos cuando PPI no responde

### 1.2 Cálculo de Rendimiento ✅
- [x] Rendimiento ARS (`rend_ars_pct`) — para acciones y FCI
- [x] Rendimiento USD (`rend_usd_pct`) — para CEDEARs, bonos, ONs
- [x] Rendimiento del día (`rend_dia_pct`) — desde `marketChangePercent` de PPI
- [x] Toggle de moneda (ARS/MEP/CCL) en frontend — conversión en tiempo real
- [x] Fallback: si rendimiento USD es 0, usa ARS como proxy

### 1.3 Precio Promedio de Compra 🔧 CASI COMPLETO
- [x] Fetch de 5 años de movimientos (3 años inicial → 5 años ahora)
- [x] Detección de compras en USD MEP (outliers >50x)
- [x] MEP histórico exacto desde **bluelytics.com.ar** (cache en memoria)
- [x] **FIX CRÍTICO:** Usar `price × qty` (ejecución) en lugar de `abs(amount)` (incl. comisiones)
  - ALUA: 1021.67 → ~1013 (elimina +0.8% comisión)
  - LAR: 5109.94 → ~5069
  - YPFD: 35652 → más cercano a 36013
- [x] Cache incremental en `/users/{uid}/meta/avg_costs`
  - Primera vez: 5 años, ~15s
  - Syncs siguientes: solo desde `last_processed_date − 5d`, ~1-2s

### 1.4 Display de Posiciones ✅
- [x] `AssetRow.jsx` — acordeón con detalles de cada posición
- [x] Campos dinámicos: cantidad, precio compra, precio actual, ganancia, rendimiento
- [x] Labels de moneda dinámicos (ARS/MEP/CCL)
- [x] CEDEARs: muestra precio BYMA + subyacente USD + ratio
- [x] Bonos/ONs: precio paridad, TIR, vencimiento
- [x] FCI: cuotaparte
- [x] Tactical badge: `accion_tactica` (BUY, HOLD, SELL)
- [x] Tesis corta y eventos próximos

### 1.5 Cotizaciones en Tiempo Real ✅
- [x] `GET /api/prices/cotizaciones` — MEP, CCL, BNA, Oficial, riesgo país
- [x] `POST /api/prices/refresh` — fuerza polling inmediato
- [x] MEP primario: PPI (AL30÷AL30D), fallback dolarapi.com
- [x] CCL primario: PPI (GD30÷GD30D), fallback dolarapi.com
- [x] BNA/Oficial: BCRA API (v2.0/datosvariable)
- [x] Riesgo país: BCRA v2.0 var.5, fallback argentinadatos.com
- [x] Preservación de valores en fin de semana (Firestore cache)
- [x] Status "⚠ Mercado cerrado · datos del viernes" en Header

### 1.6 Seguridad & Privacidad 🔧 PARCIAL
- [x] Firebase Security Rules: `/users/{uid}/**` solo owner, `/market/**` read-only auth
- [x] PrivacyMask component — oculta números con toggle
- [x] localStorage para preferencias de privacidad
- [ ] **Encriptación at-rest** (pendiente — tarea spawned)

---

## Fase 2: Análisis Fundamental & Stress Testing 🔜 PLANEADO

**Objetivo:** Herramientas avanzadas para análisis de riesgo y escenarios.

### 2.1 Financial Fundamentals
- [ ] `GET /api/stress/fundamentals/{ticker}` — EBITDA, ratios, márgenes
- [ ] Cards con: P/E, P/B, ROE, deuda/EBITDA
- [ ] Integración con fuentes (CNBC, Yahoo Finance, o scraping de reportes)

### 2.2 Stress Testing & Scenarios
- [ ] `POST /api/stress/test` — simula caídas de precio (−10%, −20%, −50%)
- [ ] Bear/Base/Bull scenarios — impacto en cartera total
- [ ] Cálculo de max drawdown histórico
- [ ] Recomendaciones: qué vender primero en crisis

### 2.3 Análisis Técnico (Opcional)
- [ ] Integración TradingView widget (enlace ya en AssetRow)
- [ ] Soporte para órdenes de stop-loss (coordinar con PPI)

### 2.4 Calendarios de Eventos
- [ ] `GET /api/catalysts/{ticker}` — earnings, dividendos, vencimientos
- [ ] Timeline visual de eventos futuros
- [ ] Alertas personalizables

---

## Tareas Transversales 🔧

### Encriptación at-rest
- [ ] Encrypt antes de guardar en Firestore
- [ ] Key en `.env` / Google Cloud Secret Manager
- [ ] Frontend → backend API (no Firestore directo)
- [ ] Pérdida de real-time onSnapshot, polling c/ 30-60s
- **Tarea:** `mcp__ccd_session__spawn_task` — "Encrypt portfolio data at rest"

### Seguridad — Hallazgos Audit Codex (2026-04-30)

**🟡 MEDIUM — Precio promedio (pendiente post-verificación)**
- [ ] `rend_usd_pct = 0%` para CEDEARs con `currency: "Pesos"` (cotizan en ARS en BYMA pero son activos USD). Necesita calcular rendimiento USD usando MEP al momento de compra vs MEP actual (`portfolio.py → _transform_position`)
- [ ] Bonos: verificar si PPI devuelve `averagePrice` en posiciones. Si no → nuestro cálculo viene ÷100 del valor real (movimientos en precio por 1 VN, display por 100 VN)
- [ ] GD38 / posiciones con más de 5 años de antigüedad: sin movimientos en ventana actual → mostrar avg_cost de PPI si disponible o `null`

**🔴 HIGH**
- [ ] `POST /api/prices/refresh` acepta cualquier usuario autenticado — restringir a admin claim o mover a scheduler-only (`prices.py`)
- [ ] Detalles internos de PPI se propagan al cliente en errores — retornar mensaje genérico y loguear internamente (`portfolio.py:187`, `ppi_client.py:44,93`)

**🟡 MEDIUM**
- [ ] Cloud Function: auth PPI usa `ApiKey`/`ApiSecret` en JSON, el backend usa 4 credenciales en headers — alinear antes de que el scheduler empiece a escribir precios 0 (`functions/main.py:51`)
- [ ] `usePortfolio.js` inicializa `stressTest` con `MOCK_STRESS_TEST` — mostrar estado vacío/error para usuarios reales autenticados (`usePortfolio.js:94`)
- [ ] Refresh de cotizaciones puede escribir 0 si todas las fuentes fallan — validar que los valores sean > 0 antes de persistir (parcialmente mitigado con `_NUMERIC_FIELDS`, revisar edge cases)

**🟢 LOW**
- [ ] Agregar config de ESLint al frontend — `npm run lint` falla por falta de archivo de configuración

### Optimizaciones Futuras
- [ ] Rate limiting en endpoints públicos
- [ ] Caché distribuido (Redis) si llega a escala
- [ ] Microservicios (solo si metricas lo justifiquen — no ahora)
- [ ] Notifications: email/push en eventos (alertas de precios)

### Testing
- [ ] Tests unitarios en backend (pytest)
- [ ] Tests de componentes en frontend (Vitest/React Testing Library)
- [ ] E2E (Playwright/Cypress) — flujo completo auth → sync → display
- [ ] Smoke tests en staging antes de prod

---

## Estado Actual (2026-05-11)

| Componente | Estado | Notas |
|---|---|---|
| **Infraestructura** | ✅ | FastAPI + Firebase funcionando |
| **Auth** | ✅ | Firebase Auth integrado |
| **Sync PPI** | ✅ | 5 años de movimientos, cache incremental |
| **Avg Cost** | 🔧 | Ejecutando fix de comisiones (−0.8%) |
| **MEP Histórico** | ✅ | Bluelytics integrado |
| **Display** | ✅ | Cartera funcional con toggles |
| **Cotizaciones** | ✅ | Mercado actualizado c/ fallbacks |
| **Privacidad** | ✅ | Rules + Privacy toggle |
| **Seguridad (audit)** | 🔧 | 2 HIGH + 3 MEDIUM pendientes (ver Tareas Transversales) |
| **Encriptación** | ⏳ | Planeado post-Fase 1 |
| **Fundamentals** | ⏳ | Fase 2 |
| **Stress Testing** | ⏳ | Fase 2 |

---

## Cómo Leer Este Roadmap

- **✅** = Completado y funcional
- **🔧** = En progreso / requiere ajustes
- **🔜** = Planeado para próximas fases
- **⏳** = Waiting (bloqueado o pospuesto)

**Para cambios en el roadmap:** actualizar este archivo + CLAUDE.md (`Reglas clave` → `Fases`).
