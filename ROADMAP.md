# MiCartera — Roadmap de Desarrollo

> Reescrito 2026-06-13. Consolida los 3 docs de revisión ([fixes.md](fixes.md),
> [roadmapdebug08_06_26.md](roadmapdebug08_06_26.md), [spec_contrato_inversion.md](spec_contrato_inversion.md)),
> la memoria del proyecto y la nueva visión de producto (multi-usuario por email +
> app nativa Android). Ordenado por prioridad. Cada bloque es **autocontenible** para
> poder implementarse en paralelo: indica owner sugerido y dependencias explícitas.

## Leyenda

- **Estado:** ✅ hecho · 🔧 en progreso · 🔜 listo para arrancar · ⏳ bloqueado/pospuesto
- **Owner sugerido:** quién lo toma (Vos · Fable · Codex · Claude). No es rígido.
- **Paralelizable:** si puede correr en simultáneo con otros bloques y de qué depende.

---

## Visión de producto (el norte)

MiCartera deja de ser una app single-user local y pasa a ser un **producto multi-usuario**:
cada persona se loguea con su email, sus datos quedan **aislados** del resto, sus
**datos críticos viven cifrados** y **se descifran solo en su dispositivo** (la nube y
nuestro backend solo ven ciphertext y actúan de intermediario con el broker). El acceso
escala a **Android nativo (.apk)** con caché local SQLite. En el primer login el usuario
completa un **onboarding** (datos de broker necesarios para correr la app) y **firma un
contrato** que explica qué datos se usan y qué implica.

Decisión de arquitectura de datos (2026-06-13): **Opción B** — el cliente lee Firestore
directo, descifra en el dispositivo con **clave por usuario** asociada a su cuenta de
email, y cachea en **SQLite local**. El backend solo intermedia lo que requiere
credenciales de servidor (llamadas a PPI) y nunca ve plaintext.

---

# Bloques por prioridad

## P0 · Hardening de seguridad pre-exposición

- **Objetivo:** cerrar los riesgos que hoy son tolerables solo porque el backend corre en
  localhost, antes de exponerlo a internet (requisito para Android en 4G).
- **Estado:** ✅ hecho (2026-06-13). P0.1 fail-closed + P0.3 desacople aplicados juntos (acoplados);
  P0.2 ya estaba resuelto por refactors previos a la auditoría (solo se agregó un log de observabilidad).
- **Por qué esta prioridad:** el día que el backend sea alcanzable desde internet, estos
  dejan de ser teóricos. Son baratos y desbloquean todo lo demás sin deuda.
- **Owner sugerido:** Claude · **Paralelizable:** sí, sin dependencias.
- **Specs:**
  - **P0.1 — `POST /api/prices/refresh` fail-closed.** Hoy: `if settings.ADMIN_UID and request.state.uid != settings.ADMIN_UID: 403` → si `ADMIN_UID` está vacío, NO bloquea. Cambiar a: si `ADMIN_UID` no está configurado → `503` (fail-closed); si está, exigir match. Archivo: [prices.py](backend/app/routers/prices.py), [config.py](backend/app/core/config.py).
  - **P0.2 — Sanitizar errores de PPI al cliente.** No propagar detalle del broker en respuestas. Mensaje genérico al cliente + log interno detallado. Archivos: [portfolio.py](backend/app/routers/portfolio.py), [ppi_client.py](backend/app/services/ppi_client.py).
  - **P0.3 — Separar `syncPPI` del refresh global de cotizaciones en frontend.** El sync de cartera (por usuario) no debe disparar una operación global compartida. Archivo: [AppContext.jsx](frontend/src/store/AppContext.jsx).
  - **Criterio de éxito:** ningún usuario común puede gatillar el refresh global; errores de broker no llegan crudos al cliente.

---

## P1 · Identidad multi-usuario + onboarding + contrato de datos + clave por usuario

- **Objetivo:** que cada usuario se loguee por email, tenga sus datos **aislados**, complete
  un onboarding de broker en el primer login, **firme** el contrato de uso de datos, y tenga
  una **clave de cifrado propia** (no la global actual).
- **Estado:** 🔧 parcial (2026-06-13). ✅ **P1.2** (envelope encryption: passphrase aparte +
  recovery code, PBKDF2-SHA256 + AES-GCM, keywrap en `/users/{uid}/keywrap`, seam
  `getUserDEKMaterial`). ✅ **P1.4** (firma de contrato de uso de datos → `consentimiento` en
  `/users/{uid}`). ✅ **P1.3** (onboarding: 5 creds PPI cifradas con la DEK en
  `/users/{uid}/broker/data`, omitible; `onboarding_completo`). Gate completo en `AuthGate`:
  passphrase → contrato → broker → Dashboard. P1.1 parcial (email/password nativo por Codex).
  **Pendientes: P1.1 (web), P1.5 (backend usa las creds por usuario, hoy aún lee `.env`).**
- **Por qué esta prioridad:** es el cimiento de "producto multi-usuario" y **prerrequisito
  de la Opción B** (la clave por usuario que descifra en el dispositivo nace acá). Sin esto,
  Android Opción B no tiene de dónde sacar la clave.
- **Owner sugerido:** Claude (backend/identidad) · **Paralelizable:** sí; P2 (Contrato UI) y
  el scaffolding de P3 pueden avanzar en paralelo. La integración de la clave real con P3
  depende de P1.2.
- **Specs:**
  - **P1.1 — Auth por email.** Migrar/añadir a [useAuth.js](frontend/src/hooks/useAuth.js)
    login email (email+password o magic-link Firebase). Mantener `uid` de Firebase como
    identificador canónico; el email se asocia al `uid`. Aislamiento ya cubierto por
    [firestore.rules](firestore.rules) (`isOwner(uid)`) — verificar que toda colección nueva
    lo respete.
  - **P1.2 — Clave de cifrado por usuario (envelope encryption).** Reemplazar el modelo de
    `DATA_ENCRYPTION_KEY` global ([encryption.py](backend/app/services/encryption.py)) por:
    - **DEK** (Data Encryption Key) aleatoria por usuario, generada en el dispositivo en el
      primer login.
    - **KEK** derivada de una passphrase del usuario (Argon2id/PBKDF2) definida en onboarding.
    - Se guarda en Firestore **solo la DEK envuelta por la KEK** (`/users/{uid}/keywrap`).
      Firestore nunca ve la DEK en claro. En un dispositivo nuevo: passphrase → KEK → unwrap DEK.
    - **Trade-off a documentar en el contrato:** si el usuario pierde la passphrase, los datos
      cifrados no son recuperables (no hay escrow del lado servidor). Decidir si se ofrece
      recovery code de respaldo.
  - **P1.3 — Onboarding primer login.** Cuestionario que captura los **datos de broker PPI por
    usuario** (hoy las creds PPI viven en `.env` global → pasan a ser por usuario, cifradas con
    la DEK del usuario). Campos mínimos: credenciales PPI necesarias para `ppi_client`, moneda
    default, preferencias. Flag `onboarding_completo` en `/users/{uid}/profile`.
  - **P1.4 — Contrato de uso de datos (firma).** Pantalla previa al uso que explique: qué datos
    se guardan, que se cifran y se descifran solo en su dispositivo, que el backend solo
    intermedia con el broker, qué implica. Registrar consentimiento (versión + timestamp) en
    `/users/{uid}/profile.consentimiento`.
  - **P1.5 — PPI por usuario en backend.** `ppi_client` deja de leer creds de `.env` global;
    recibe las del usuario autenticado (descifradas en el dispositivo y enviadas en la request,
    o descifradas server-side solo en memoria durante la llamada). Definir cuál en P3 (depende
    del flujo Opción B).
  - **Criterio de éxito:** dos usuarios distintos ven solo sus datos; el primer login fuerza
    onboarding + firma; la DEK envuelta vive en Firestore y la nube nunca ve plaintext.

---

## P2 · UI del Contrato de Inversión (módulo táctico)

- **Objetivo:** construir la capa visual del Contrato de Inversión sobre la lógica ya existente.
- **Estado:** 🔜 **listo para arrancar** — diseño cerrado y lógica no-visual ya commiteada.
- **Por qué esta prioridad:** es el principal valor agregado del producto y está **desbloqueado**
  (el bug rend ONs/FCI que lo bloqueaba ya se resolvió en `8705834`/`c170c02`). No depende de P0/P1.
- **Owner sugerido:** Fable (Claude Code CLI) · **Paralelizable:** sí, totalmente independiente.
- **Specs:** ver [spec_contrato_inversion.md](spec_contrato_inversion.md) (diseño completo).
  Lógica ya disponible (commit `bacbd19`):
  - [contratoConfig.js](frontend/src/data/contratoConfig.js) — 5 roles, bandas default por rol,
    templates de kill criteria, enums de output (`salud_tesis` ×4, `accion_tactica` ×6, `urgencia` ×4).
  - [tacticalEngine.js](frontend/src/services/tacticalEngine.js) — `computeTactico` (capa
    determinística) + `validateTacticalPayload` (valida enums del JSON pegado).
  - [contextBuilder.js](frontend/src/services/contextBuilder.js) — `buildContratoContext`.
  - [portfolioService.js](frontend/src/services/portfolioService.js) — `saveContrato`/`onSnapshotContratos`,
    `saveRankingTactico`/`onSnapshotRankingTactico`.
  - [fundamentals.py](backend/app/routers/fundamentals.py) — `_ANALYSIS_KEYS` ya acepta `tactico`.
  - **Falta SOLO UI:** tab "Contratos" (agrupado por `_GRUPO_TEMATICO`), form por ticker
    (select rol → autocompleta banda, tesis textarea, kill criteria chips con templates por rol),
    autosave con debounce + indicador completo/pendiente/stale, panel de **ranking táctico**,
    y `TacticalBadge` mapeando los 6 enums nuevos.

---

## P3 · Android nativo (Capacitor) + capa de datos Opción B

- **Objetivo:** correr MiCartera como `.apk` nativo en Android, con datos cifrados leídos directo
  de Firestore, **descifrados en el dispositivo** con la clave del usuario, y cacheados en **SQLite local**.
- **Estado:** 🔜 (scaffolding posible ya; la parte cripto real depende de P1.2)
- **Por qué esta prioridad:** es el objetivo de "usarlo en el teléfono de verdad". Se hace después
  de tener identidad/clave por usuario (P1), pero el shell y el plumbing arrancan en paralelo.
- **Owner sugerido:** Codex/antigravity (capa SQLite+sync) · **Paralelizable:** sí; el shell
  Capacitor y el plumbing SQLite arrancan contra una clave stub e integran la DEK real cuando P1.2 esté.
- **Specs (por fases):**
  - **P3.A — Atajo (apk usable rápido).** `npx cap add android` sobre la PWA actual ([vite.config.js](frontend/vite.config.js)
    ya tiene PWA configurada). Build de un `.apk` que envuelve la PWA y habla con el backend
    (deployado, ver nota). Valida toda la toolchain nativa antes de meter SQLite. Auth nativa:
    `@capacitor-firebase/authentication`.
  - **P3.B — Descifrado en dispositivo.** Portar `encrypt_payload`/`decrypt_payload`
    ([encryption.py](backend/app/services/encryption.py)) a JS/cliente (Web Crypto / lib equivalente),
    usando la **DEK del usuario** (de P1.2), no la global. El cliente lee el ciphertext de Firestore
    con el SDK (las reglas de `portfolio` hoy son `allow read,write: if false` → habrá que abrir
    lectura del ciphertext al owner, ya que deja de descifrarse server-side).
  - **P3.C — SQLite local + sync.** `@capacitor-community/sqlite`. Espejo Firestore↔SQLite:
    leer ciphertext → descifrar en dispositivo → persistir plaintext en SQLite local (privado del
    dispositivo) → la UI lee de SQLite (offline-first). Definir estrategia de sync (pull on focus,
    resolución de conflictos last-write-wins por `updatedAt`).
  - **P3.D — Backend como intermediario.** El backend deja de descifrar; solo intermedia llamadas
    a PPI con las creds del usuario (P1.5) y devuelve datos que el dispositivo cifra antes de guardar.
  - **P3.E — Firma + Play Store (opcional).** Keystore, `.aab`, publicación.
  - **Nota deploy backend:** Opción B reduce lo que hace el backend, pero las llamadas a PPI
    siguen necesitando un backend alcanzable desde 4G → **reabre el deploy** (Cloud Run/Railway/Fly)
    que antes se había descartado. Cerrar P0 antes de exponerlo.

---

## P4 · Refresh de UX/UI

- **Objetivo:** actualizar la experiencia visual y de interacción de la app.
- **Estado:** 🔜 (a definir alcance)
- **Por qué esta prioridad:** alto impacto percibido; conviene hacerlo junto con/después de la
  UI del Contrato (P2) para no rehacer estilos dos veces.
- **Owner sugerido:** Fable · **Paralelizable:** sí, pero coordinar con P2 para estilos compartidos.
- **Specs:**
  - Referencia visual/UX: [cartera_app_v5b.html](cartera_app_v5b.html) (no copiar datos, sí estética).
  - Revisar jerarquía de info en Dashboard, consistencia de KPI cards, badges tácticos, modo oscuro,
    responsive mobile (clave para Android).
  - Definir alcance concreto antes de arrancar (¿restyle total o pulido por secciones?).

---

## P5 · Calidad y deuda técnica

- **Objetivo:** recuperar barreras de calidad y limpiar deuda.
- **Estado:** mezcla — ver sub-ítems.
- **Por qué esta prioridad:** importante pero no bloqueante; se intercala entre los bloques grandes.
- **Owner sugerido:** Claude/Vos · **Paralelizable:** sí, cada sub-ítem es independiente.
- **Specs:**
  - **P5.1 — ESLint (P1 en docs).** No hay config; `npm run lint` falla. Agregar config mínima
    React+hooks. [package.json](frontend/package.json). Doc Windows: `npm.cmd run lint`.
  - **P5.2 — Stress mock visible (P1/MEDIUM).** `usePortfolio.js` arranca con `MOCK_STRESS_TEST`
    → inicializar vacío + estados `loading/error/empty` para usuarios reales. [usePortfolio.js](frontend/src/hooks/usePortfolio.js).
  - **P5.3 — Cloud Function PPI auth (MEDIUM).** `functions/main.py` usa auth distinta del backend
    → puede escribir precios 0. Alinear. [functions/main.py](functions/main.py) vs [ppi_client.py](backend/app/services/ppi_client.py).
  - **P5.4 — Bundle ~651 kB (P2).** Code splitting por página/sección, lazy load de widgets pesados.
    Crítico para mobile. [vite.config.js](frontend/vite.config.js).
  - **P5.5 — Scripts de debug (P2).** Inventariar `backend/*.py` sueltos (`debug_nvda.py`,
    `force_full_sync.py`, `cargar_catalysts_v7.py`, `encrypt_existing_firestore_data.py`…),
    mover a `scripts/`, borrar los cumplidos.
  - **P5.6 — Tests (P2).** Backend: auth, prices, portfolio, stress. Frontend: `usePortfolio`,
    `AppContext`, estados vacío/error. Smoke: login→sync→render.
  - **P5.7 — GD38 avg_cost.** Bono comprado >5y atrás sin movimientos en ventana → queda en N/A
    a propósito. Decidir si extender ventana o dejar N/A con nota UI.
  - **P5.8 — Catalizadores carga inicial.** Correr una vez `cargar_catalysts_v7.py`, verificar en
    tab Catalizadores, borrar el script. (Acción tuya.)

---

## Anexo: qué ya está hecho (Fase histórica)

Resumen para que el roadmap deje de estar desalineado (ese era un hallazgo P1 en sí mismo):

- **Infraestructura:** FastAPI + React/Vite + Firebase (Firestore + Auth + Hosting) + Cloud
  Functions scheduler. PWA configurada (`vite-plugin-pwa`).
- **Sync PPI:** 5 años de movimientos, cache incremental de avg_cost, manejo mercado cerrado, `is_stale`.
- **Rendimientos:** ARS/USD/día + toggle de moneda. **Bug de rendimientos absurdos en bonos/ONs/FCI
  RESUELTO** (5 causas; commit `8705834`). **Rendimiento TOTAL** con cupones/amortizaciones/dividendos
  (commit `c170c02`).
- **Tab Fundamental:** EBITDA fix (ARS→USD por moneda real), CEDEARs, KPI cards, riesgo país,
  análisis Claude (q1/kpis/tesis/escenarios + análisis extendido + fuentes) y badges tácticos.
  `refresh_fundamentals` ya no pisa el análisis de Claude (commit `d6b13f1`).
- **Stress testing:** 5 escenarios AR, StressCard enriquecida.
- **Cotizaciones:** MEP/CCL/BNA/Oficial/riesgo país con fallbacks y preservación fin de semana.
- **Cifrado at-rest:** Fernet con clave **global** server-side (a migrar a clave por usuario en P1.2).
- **Lógica del Contrato de Inversión (no-visual):** commit `bacbd19` (ver P2).

---

## Cómo trabajar este roadmap en paralelo (división sugerida)

| Owner | Bloque | Arranca | Depende de |
|---|---|---|---|
| **Fable** | P2 — UI Contrato | ya | nada |
| **Codex** | P3 — Capacitor + Opción B | P3.A ya | clave real de P1.2 |
| **Claude** | P0 — Seguridad → P1 — Identidad/clave por usuario | ya | nada |

Seam de integración Codex↔Claude: P3.B/P3.C usan la **DEK del usuario**; hasta que P1.2 esté,
Codex trabaja contra una clave stub con la misma interfaz (`getUserDEK()`), y se swapea sin tocar
la capa SQLite.

---

## Reglas del roadmap

- Actualizar este archivo cuando cambie el estado de un bloque.
- Reflejar cambios de fase en [CLAUDE.md](CLAUDE.md) (`Reglas clave`).
- Ningún dato real (nominales, creds) en código ni en este doc.
