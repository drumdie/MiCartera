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

## ⭐ Estado actual — checkpoint 2026-06-14

### ✅ Hecho (esta sesión + Codex)

**Seguridad / hardening**
- ✅ **P0** completo (fail-closed `prices/refresh`, desacople `syncPPI`, log en `debug-movements`).
- ✅ **Restricción API key de Android** en Google Cloud (5 APIs: Identity Toolkit, Token Service,
  Firebase Installations, Cloud Firestore, Firebase App Check). Verificada en emulador.
- ✅ **App Check web** scaffolded (reCAPTCHA v3 env-gated en `firebase.js`) — falta registro en
  Console + site key + enforcement. Falta App Check Android (Play Integrity) y restringir la
  Browser key.
- ✅ `google-services.json` gitignored.

**P1 — Identidad + clave por usuario**
- ✅ **P1.2** envelope encryption: passphrase aparte + recovery code (PBKDF2-SHA256 + AES-GCM),
  keywrap en `/users/{uid}/keywrap`, seam `getUserDEKMaterial`, gate en `AuthGate`. Validado E2E.
- ✅ **P1.4** contrato de uso de datos (`consentimiento` versionado en `/users/{uid}`).
- ✅ **P1.3** onboarding broker (5 creds PPI cifradas con la DEK en `/users/{uid}/broker/data`, omitible).
- ✅ **P1.5 (Codex)** backend usa creds PPI **por usuario**: `PPICredentials` + `SyncSourceRequest`;
  el dispositivo manda `broker_credentials` en el body de `sync-source`; `ppi_client` acepta creds
  por llamada con **fallback a las globales**. ⚠️ Falta testear con un 2º usuario.

**P3 — Android (Capacitor)**
- ✅ **apk funcionando**: arranca, Login con **Google nativo** (mismo uid que web), gate de passphrase.
  Verificado en emulador y en **teléfono real** (entró con passphrase).
- ✅ Crash de arranque resuelto: `rgcfaIncludeGoogle=true` en `variables.gradle` (empaqueta
  `play-services-auth` → `GoogleSignIn`).
- ✅ Fix script `android:apk` (`gradlew` → `.\gradlew.bat`).
- ✅ Refactor DRY del sync: helper `_build_user_portfolio` compartido por `/sync` y `/sync-source`.
- ✅ Cache offline endurecido: `allSettled` por-doc, cifrado at-rest del cache local (Fernet), purga en logout.
- 🔧 Ícono apk: Codex agregó `@capacitor/assets` (Task A) — verificar si completó la generación.

**Backend en Cloud Run** ([docs/deploy-cloud-run.md](docs/deploy-cloud-run.md))
- ✅ Deployado: servicio `micartera-backend`, región `southamerica-east1`.
  URL: `https://micartera-backend-486793579128.southamerica-east1.run.app` (health OK).
- ✅ `backend/Dockerfile` + `.dockerignore`. Redeployado (revisión `00002`) con el fix device-encrypt.
- ⏳ **Env vars SIN cargar** (`ALLOWED_ORIGINS` + 5 PPI + `DATA_ENCRYPTION_KEY`) → **acción del usuario** en la Console.

**Fixes del fetch (device-encrypt)**
- ✅ Auto-sync **espera la DEK** (no corre antes de la passphrase): `userKey.js` (`onDEKChange`/`isDEKReady`) + `AppContext.jsx`.
- ✅ Backend **tolera docs device-encrypted** (no tira 500): `_build_user_portfolio` + `read_user_portfolio`.

### ⏳ Pendiente inmediato
1. **Usuario:** cargar env vars en Cloud Run (Console) → probar fetch en el **apk**.
2. **Usuario:** reiniciar backend local → probar fetch **web** (debería andar con el fix de hoy).
3. Verificar **P1.5** end-to-end con un 2º usuario.
4. **App Check**: registro en Console (web reCAPTCHA + Android Play Integrity) + enforcement
   (monitor primero). Restringir también la **Browser key** (web).
5. **UX (Fable, hilo nuevo)** — ver memoria `ux-vision-perfil-inversion`: el "tab Contratos" pasa a
   ser **"Perfil de Inversión"** dentro de una pantalla **Perfil** (nombre, email, cambiar passphrase,
   toggle biometría). KPI cards con **drill-down** (ej. "Mayor posición" → top 5). Reshapea P2 y P4.

### Commits de la sesión (rama `feat/tactico-fundamental`, **sin pushear**)
`049ff21` cifrado por usuario (P1.2/1.3/1.4) + P0 + refactor sync · `34b0328` Google nativo + crash fix ·
`b3f17ad` gitignore google-services · `b015311` App Check web scaffold · `dc823ce` Dockerfile + guía Cloud Run.
**Sin commitear:** P1.5 de Codex (`portfolioSync.js`, `portfolio.py`, `ppi_client.py`), fixes del fetch de hoy
(`userKey.js`, `AppContext.jsx`, `portfolio.py`), `@capacitor/assets`. → conviene commitear antes de seguir.

---

## 🔄 Actualización de sesión — 2026-06-20

**Lo que se descubrió diagnosticando el bug de sync (y por qué cambia el rumbo):**
- El **frontend descifra las credenciales del broker y las manda en claro** al backend en el body de `sync-source`. Son **visibles en F12 → Network** (y expuestas a XSS/extensiones). El usuario lo detectó por casualidad → **inaceptable para una app cuyo objetivo es la seguridad.**
- **Decisión tomada (usuario + Claude):** migrar a **credenciales backend-managed con envelope+passphrase** (ver **SEC-1** abajo). El frontend deja de ver/descifrar credenciales.

**Diagnóstico del bug de sync (cerrado en lo funcional, pendiente la causa raíz):**
- El backend deployado **funciona** con creds válidas (probado: token real + creds del `.env` → 200 + 33 posiciones).
- Las creds que **manda el dispositivo** (las cifradas en `/users/{uid}/broker/data`) **PPI las rechaza con login HTTP 400** ("Credenciales invalidas"), mientras que las del `.env` andan. No se identificó la diferencia exacta (no se pueden descifrar las del device sin la passphrase). El usuario afirma que son iguales letra por letra.
- **Workaround temporal aplicado (commit `34352fd`):** el backend cae a las creds del `.env` si las del device fallan. ⚠️ Es un atajo **single-owner de dev** — NO sirve multi-user. **A revertir con SEC-1.**
- **Causa raíz pendiente:** comparar (A) lo que manda el device en F12 vs (B) `.env`, campo por campo. Con SEC-1 se vuelve casi moot (el backend maneja las creds), pero conviene no arrastrar creds corruptas.

**Otros hallazgos de la sesión:**
- **Cloud Run** NO tiene env vars `PPI_*` en ninguna revisión → el **APK no sincroniza** (solo el backend local, gracias al fallback). Se redefine con SEC-1.
- **MEP/RP desactualizados** (muestra 1.450, real 1.477): el sync de cartera **NO** actualiza `/market/cotizaciones` — eso lo hace el **scheduler de Cloud Functions**, que no está corriendo/deployado. Tema aparte.
- **UX pendiente — no mostrar datos no sincronizados:** hoy se muestran valores viejos (Total valorizado, MEP, RP, stress test, mayor posición, liquidez, G/P USD) y datos de **Fundamentales, Catalizadores, Gráficos, análisis táctico** aunque no haya un sync fresco. Debería **ocultarse / placeholder** hasta el primer sync, igual que los tickers (que sí se ocultan bien). A futuro: **pantalla de Loading animada** (el usuario prefiere dejarla para después, ahora ayuda verlo sin animación). Los guards `hasPositions` ya cubren parte (Fund/Catal/Gráficos cuando no hay posiciones), falta el caso "hay datos viejos pero sin sync fresco".
- **`micartera-ar.web.app` = "Site Not Found"** → la web nunca se deployó a Hosting. Solo existe localhost.
- **Auth web**: `auth/unauthorized-domain` si se entra por IP `192.x` (no autorizada). Dominios OK: `localhost`, `micartera-ar.firebaseapp.com`, `micartera-ar.web.app`.
- **.gitignore**: agregados `*.apk`, `*.aab`, `*.jks`, `*.keystore`, `google-services.json`. Verificado: nada sensible trackeado ni en historial.

---

# Bloques por prioridad

## 🔐 SEC-1 · Migración a credenciales backend-managed (envelope + passphrase) — **NUEVA, prioridad alta**

- **Objetivo:** que el **frontend nunca vea ni descifre** las credenciales del broker. El **backend** las descifra, llama al broker y devuelve **solo datos procesados**. Modelo "tipo banco".
- **Motivación:** ver actualización 2026-06-20. El modelo device-encrypt actual expone las creds en claro en el cliente (F12/XSS). Reemplaza al esquema "el device manda las creds" de **P1.5**.
- **Estado (2026-06-21):** 🚀 **F1, F2 y F3-frontend HECHOS y deployados.** Backend SEC-1 en Cloud Run (rev `micartera-backend-00005`, min/max=1, sin `PPI_*`), web en `micartera-ar.web.app`. El front ya **no descifra ni manda** credenciales del broker (eliminado `loadBrokerCreds`; pantalla de creds write-only y solo en APK). **Causa raíz del sync RESUELTA**: las creds device tenían typos en `api_key`/`api_secret`, corregidas. Checkpoint previo al refactor: `34352fd`. **Pendiente:** F3c (revertir fallback `.env`) + F4.

### Arquitectura objetivo
```
Frontend (web/APK)            Backend (Cloud Run)                 Broker (PPI)
─────────────────            ───────────────────                 ────────────
- UI, login (Firebase Auth)  - /unlock  (passphrase → DEK RAM)   ← llama el backend
- pide /sync, /holdings...    - /sync /holdings /transactions
- muestra datos procesados    - /analysis
- NUNCA ve credenciales       - valida Firebase Auth + App Check
                              - rate limit, logs SIN secretos
                              - descifra creds y llama al broker
                              - NO persiste passphrase/DEK/creds en claro
Storage: creds por-usuario, cifradas con envelope (DEK envuelta bajo passphrase).
```

### Decisión de diseño clave (ajuste sobre la propuesta de ChatGPT)
- **Envelope con passphrase, NO KMS/IAM puro.** Con KMS puro el backend descifra **siempre sin passphrase** → un compromiso del backend expone TODAS las creds, y la passphrase queda cosmética. Con **envelope+passphrase**, un leak de la base en reposo **no alcanza** (falta la passphrase). Es la opción verdaderamente "bancaria".
- **Flujo de unlock:** passphrase → backend desenvuelve la DEK → la cachea en **RAM con TTL corto (~5 min)** → descifra creds on-demand → al expirar, re-bloquea. Nunca se guarda ni se loguea passphrase/DEK/creds.
- **Caveat honesto:** el backend **sí** ve creds+passphrase un instante (en RAM). Se confía en el backend (controlado: App Check, IAM, logs sin secretos). La ganancia real: **sacar al frontend** (lo expuesto) del círculo de confianza.

### Fases
- **F0** — doc de arquitectura (esto) + checkpoint. ✅
- **F1** ✅ (2026-06-21) — `device_crypto.py` (unwrap keywrap PBKDF2+AES-GCM + Fernet, probado cross-language JS↔Python con datos reales), `SessionStore` swappable (impl A en proceso), `POST /api/session/unlock` (passphrase → DEK en RAM, TTL 1h provisional) + `/status` + `/verify-broker`. El front llama `/unlock` tras el gate de passphrase (`useUserKey`).
- **F2** ✅ (2026-06-21) — `/api/portfolio/sync-source`: el backend descifra las creds server-side con la DEK de sesión (`_credentials_from_session`); el front **dejó de mandar `broker_credentials`** (`portfolioSync.js`). Las creds ya no viajan por la red.
- **F3** 🔧 frontend hecho (2026-06-21) — **eliminado `loadBrokerCreds`** (el front ya no descifra creds del broker); `BrokerCredentials` write-only y solo en APK (`Capacitor.isNativePlatform()`). **PENDIENTE F3c:** revertir el fallback `.env` del backend — hoy **inerte en Cloud Run** (sin `PPI_*`), sigue activo en **local** como red de dev → quitar al cerrar la etapa de desarrollo. ⏰ *Recordar en el próximo checkpoint (pedido del usuario).*
- **Inactividad (2026-06-21) ✅** — modelo **bank-like**: **3 min de inactividad → re-pide passphrase** (web y mobile). Front `useSessionSecurity` (3 min, resetea con actividad) → relock de la DEK + `POST /api/session/lock`; backend `SessionStore` TTL **3 min sliding**. La inactividad ya **NO** dispara re-auth de Google (se sacó el doble prompt).
- **F4** — Endurecimiento: App Check enforcement (web reCAPTCHA + Android Play Integrity), rate limit, logs sin secretos, **gate de re-verificación por mail para editar creds**, **re-auth de Gmail por cambio de contexto** (dispositivo nuevo / cambio de red/IP — necesita *session binding* server-side), rotación de creds, auditoría, IAM mínimo.

### Decisiones tomadas (2026-06-20)
- **Cache de la DEK → Opción A con interfaz swappable.** La DEK se cachea en **RAM del proceso** detrás de una interfaz `SessionStore` (swappable), con `max-instances=1` en la fase single-owner. El día que haya carga multi-user real se cambia la implementación a **B (Memorystore/Redis cifrado, en VPC, wrap con Secret Manager/KMS)** — **sin tocar el flujo de seguridad** (`/unlock`, TTL, re-unlock). *Multi-user ≠ escala horizontal:* A ya es multi-user (un proceso atiende muchos `uid` con un mapa `{uid → DEK}`); lo que A no hace es repartir carga entre instancias.
  - **Re-unlock transparente:** en cache-miss (TTL vencido / cold-start / cambio de instancia) el backend responde `401 needs_unlock`; el cliente re-postea `/unlock` con la passphrase que tiene en memoria y reintenta → invisible para el usuario. La DEK nunca se persiste ni se loguea.
- **Migración de creds existentes → NO se re-cifra nada.** Se reutiliza el ciphertext actual (`/users/{uid}/keywrap/data` + `/users/{uid}/broker/data`). El trabajo es **portar a Python** el unwrap de `deviceKey.js` (PBKDF2-SHA256 + AES-GCM, mismos params) + Fernet (nativo en `cryptography`). **Verificación:** round-trip — el backend descifra las creds reales del usuario y hace **login PPI 200** (cierra de paso la causa raíz pendiente device-vs-`.env`).
- **Ingreso/edición de creds → write-only ya.** Sacar el "load existing" + el ojo de revelado de la pantalla actual; solo permitir re-ingresar las 5. Editar requiere estar **unlockeado** (passphrase). El **gate de re-verificación por mail → F4** (endurecimiento), no es núcleo de mover el descifrado al backend.

---

## 🔐 SEC-2 · Crypto 100% server-side (la DEK nunca vive en el frontend) — **decidido 2026-06-22**

- **Motivación (pedido del usuario):** hoy el frontend genera la DEK (`setupUserKey`), la desenvuelve con la passphrase, la guarda en `_dekMaterial`, y cifra/descifra cartera y creds con Fernet JS. Objetivo: que **el frontend nunca tenga la DEK ni haga Fernet**, y que **no lea `/portfolio` `/broker` `/keywrap` directo**. SEC-1 dejó la base (`device_crypto.py` + `SessionStore`); SEC-2 lo termina.
- **Matiz honesto asumido:** mientras el usuario tipee la passphrase en el front, un front comprometido puede capturarla y replicarla al backend. SEC-2 **reduce el blast radius** (un XSS ya no roba la clave maestra ni descifra el at-rest), no es zero-trust absoluto del cliente. Vale igual.
- **Estado de partida (hallazgo 2026-06-22):** conviven **dos esquemas** en el backend — `_encrypt_doc/_decrypt_doc` usan la **clave global legacy** (`DATA_ENCRYPTION_KEY`), mientras el portfolio real está **device-encrypted con la DEK por-usuario** (el front lo escribe; `read_user_portfolio` ni lo lee → cae a vacío). **SEC-2 unifica todo en la DEK de sesión** (`device_crypto.fernet_*` + `session_store.get(uid)`), server-side.

**Fases:**
- **F1 — Escritura server-side.** El backend cifra portfolio (y meta: avg_costs, history) con la **DEK de sesión** y escribe en Firestore. Reemplaza el cifrado que hoy hace el front y la clave global legacy.
- **F2 — Lectura server-side.** `GET /api/portfolio` descifra con la DEK de sesión y devuelve **plano**. El front consume ese endpoint en vez de leer ciphertext + descifrar local.
- **F3 — Purga del front.** Eliminar `_dekMaterial`, `getUserDEKMaterial()`, Fernet JS y los reads directos a `/portfolio` `/broker` `/keywrap`. (Depende de **B-limitada** para el offline.)
- **F4 — Firestore Rules.** Bloquear `/portfolio` `/broker` `/keywrap` (y meta) **completamente al cliente** (solo backend con Admin SDK).
- **F5 — Sesión/DEK.** Confirmar TTL 3 min + borrado en lock/logout + binding a sesión (parte ya en SEC-1; reforzar).

**Decisiones de diseño (2026-06-22):**
- **Offline → Opción B-limitada** (no online-only). Caché de dispositivo con clave **no exportable en Android Keystore**, crypto **nativa (no WebView)**, **SQLCipher** bien configurado. Cachea **solo cartera procesada para la UI** (resumen, posiciones, últimas cotizaciones). **Nunca** cachea: creds del broker, DEK del servidor, passphrase/recovery, tokens. `allowBackup=false`. Label "datos offline del…" + **expiración 24–48h**. Wipe en logout/cambio de user y si se invalida biometría/Keystore → rebuild online. Movimientos detallados / creds / operaciones sensibles: **solo online**. → Es su propio **hito, después de SEC-2** (trabajo nativo Android; web queda online-only).
- **No hay procesamiento server-side de datos de usuario sin el user presente** (confirmado por el usuario: para eso está el botón sync). Habilita el doble control de SEC-3 sin sacrificar nada.

**SEC-3 · Doble control (passphrase + KMS) — fase posterior.** `K_combinada = HKDF(clave_de_passphrase, KMS.decrypt(secreto_kms_del_usuario))` → desenvolver la DEK requiere **passphrase Y KMS**. Preserva que el operador **no** pueda descifrar unilateralmente, suma anti-dump + audit + rotación (rotar la KMS sin re-cifrar datos). La "recuperación" sigue siendo por **recovery code** (lado usuario), no por KMS. No bloquea SEC-2.

**BROKER-ABS · Multi-broker (se contempla en SEC-2).** La app es **multi-user y multi-broker** desde el día 1 — NO es una app PPI. Un user nuevo entra, carga **sus** Broker Credentials y anda.
- Capa de **adaptador de broker** (`BrokerClient` con implementaciones; hoy solo `PPIBrokerClient` envolviendo `ppi_client`), elegida por-usuario vía un campo `broker_type`. Las creds pasan a ser **genéricas** ("broker creds"), no "creds PPI".
- Los endpoints nuevos de SEC-2 (cifrar/leer, creds write-only) nacen **broker-agnósticos**.
- Antes de producción: leer specs/forms de otras Broker APIs e implementar 1-2 adaptadores más.

**COTI · Cotizaciones globales (rediseño de cadencia + fuente).** Hoy el scheduler corre **cada 2 min 24/7** (incluso con mercado cerrado) y saca MEP/CCL de **AL30/GD30 vía la cuenta PPI del owner**. Cambios:
- **Cadencia market-aware:** refrescar el doc global solo en **horario de mercado BYMA** (días hábiles) cada ~10 min; pausa / 1-2x por día con mercado cerrado. Mantener el modelo **global-doc read-only para clientes** (no re-acoplar la apertura de cada user con una escritura global compartida — ver P0.3). *(Recomendación de Claude; el usuario evaluaba on-open vs N-veces/día.)*
- **Fuente keyless para datos globales:** sacar MEP/CCL/oficial/RP de una **fuente pública sin credenciales** (p.ej. dolarapi/criptoya/argentinadatos) → **no depende de la cuenta de ningún user/broker**. Los **precios por-ticker** siguen viniendo del **sync por-usuario** (cada user trae los suyos), no del scheduler.

---

# Bloques por prioridad (previos)

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
  passphrase → contrato → broker → Dashboard. ✅ **P1.5 (Codex, 2026-06-14)**: backend usa creds PPI
  por usuario (`PPICredentials`, `broker_credentials` en el body, fallback a globales) — falta testear
  con 2º usuario. **Pendiente: P1.1 web** (sigue Google popup; nativo ya tiene email/password + Google).
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
- **Estado:** 🔜 listo para arrancar (con Fable, hilo nuevo). **Reshape (2026-06-14):** ya NO es un
  "tab Contratos" → pasa a ser el botón **"Perfil de Inversión"** dentro de la pantalla **Perfil**
  (ver memoria `ux-vision-perfil-inversion` y P4). La lógica no-visual sigue lista y commiteada.
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
- **Estado:** 🔧 mayormente hecho (2026-06-14). ✅ apk nativo funcionando (Google login + gate +
  fetch device-encrypt), ✅ crash de arranque resuelto, ✅ backend deployado en Cloud Run, ✅ cifrado
  en dispositivo + cache offline. **Pendiente:** cargar env vars de Cloud Run (usuario), capa SQLite
  offline-first robusta (P3.C, hoy hay cache básico), ícono (Codex), firma/Play Store (P3.E).
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

- **Objetivo:** actualizar la experiencia visual y de interacción de la app + nueva arquitectura de
  información (ver memoria `ux-vision-perfil-inversion`).
- **Estado:** 🔜 listo para arrancar en **hilo nuevo con Fable** (prompt ya armado en la sesión;
  el usuario va a adjuntar imágenes de referencia). Incorpora **P2** (Contrato → "Perfil de Inversión").
- **Por qué esta prioridad:** alto impacto percibido; engloba la UI del Contrato (P2) y nuevas pantallas.
- **Owner sugerido:** Fable (hilo nuevo, en la PC del usuario) · **Paralelizable:** sí.
- **Specs:**
  - Referencia visual/UX: imágenes de apps que el usuario adjunte + [cartera_app_v5b.html](cartera_app_v5b.html).
    Identidad: dark + 'Syne'/'DM Mono' + acento verde. Mobile-first (corre como apk).
  - **Nueva IA:** pantalla **Perfil** (botón con nombre del user) con nombre/email, **cambiar passphrase**
    (re-wrap de la DEK en `userKey.js`, feature nueva), **toggle biometría** (UI + seam; nativo aparte =
    Android Keystore, pendiente de P1.2), y **"Perfil de Inversión"** (contrato por tickers, P2).
  - **KPI cards con drill-down:** ej. "Mayor posición" → top 5 posiciones + % cartera + datos.
  - Estados vacío/loading/error explícitos (hoy "failed to fetch" y stress mock se ven como rotos).
  - **Gating de datos por estado real del usuario (requisito de etapa final, 2026-06-20).** Hoy es una
    confusión menor de dev (a veces se ve stress test sin login); el comportamiento *final* es:
    - **Sin login** → NO mostrar cartera; mostrar "no se puede sincronizar / iniciá sesión".
    - **Logueado OK (Gmail + passphrase)** → mostrar la cartera del **último día de mercado** (last-known-good),
      con "sincronizado: [fecha]" arriba, + toda la info propia del usuario (stress, fundamentals,
      catalizadores, gráficos). Si hoy no hay datos frescos (finde/feriado), se muestra lo último guardado.
    - **Usuario nuevo desde cero (sin credenciales aún)** → TODO vacío. **Nunca** datos de otro usuario
      (ni stress, ni fundamentals, ni catalizadores del owner): cada sección vacía con placeholder tipo
      "completar / asignar datos" hasta que **ese** usuario los genere.
    - Nunca mostrar mocks (`MOCK_COTIZACIONES`/`MOCK_STRESS_TEST`) como si fueran reales (ver P5.2).
    - Nota: el gate `hasFreshData` (sesión) agregado en 2026-06-20 es una versión *rough* de etapa actual
      (oculta lo último-conocido al recargar) — se reshapea acá al modelo last-known-good + vacío-por-usuario.

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
