# Handoff Capacitor Android / APK

Proyecto MiCartera - implementación Android Capacitor/APK.

## Commits Relevantes

- `91c568e` Fase A: add Capacitor Android shell
- `b3a87c5` Fase B: add device-side Fernet encryption
- `7b1b51f` Fase C: add offline portfolio cache sync
- `1fa8b10` Fase D: add device-encrypted portfolio source

## 1. Capacitor / Android Shell

Dónde mirar:

- `frontend/capacitor.config.ts`
- `frontend/android/`
- `frontend/package.json`

Scripts agregados:

```bash
npm run android:sync
npm run android:open
npm run android:apk
```

Dependencias agregadas:

- `@capacitor/core@6.2.1`
- `@capacitor/android@6.2.1`
- `@capacitor/cli@6.2.1`
- `@capacitor-firebase/authentication@6.3.1`
- `@capacitor-community/sqlite@6.0.2`
- `typescript`

APK generado:

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Build usado:

```text
JDK 17:
C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot

Android SDK:
C:\Users\Drumdie\AppData\Local\Android\Sdk
```

Comando:

```bash
cd frontend
npm run android:sync
cd android
gradlew assembleDebug
```

## 2. Auth Android / Firebase

Dónde mirar:

- `frontend/src/hooks/useAuth.js`
- `frontend/src/services/nativeAuth.js`
- `frontend/src/pages/Login.jsx`
- `frontend/src/store/AppContext.jsx`

Implementación:

- En plataforma nativa usa Capacitor Firebase Authentication cuando aplica.
- Email/password queda con Firebase Web SDK para mantener `auth.currentUser` y el ID token.
- UID Firebase sigue siendo identificador canónico.
- Login Android muestra formulario email/password.
- Login web conserva Google popup.

## 3. Seam De Clave Por Usuario

Dónde mirar:

- `frontend/src/services/deviceKey.js`

Función clave:

```js
getUserDEK()
```

Estado actual:

- STUB de desarrollo.
- Deriva una clave fija desde:

```text
micartera-dev-user-dek-v1
```

Este es el único punto que debe reemplazar P1.2 cuando esté la DEK real por usuario.

Integración futura esperada:

1. Leer DEK envuelta desde `/users/{uid}/keywrap`.
2. Derivar KEK local con passphrase/biometría según P1.2.
3. Hacer unwrap de la DEK en el dispositivo.
4. Mantener la misma interfaz `getUserDEK()`.
5. No tocar Fernet, SQLite ni UI.

## 4. Fernet Cliente Compatible

Dónde mirar:

- `frontend/src/services/fernet.js`

Implementa:

- `fernet-v1`
- AES-128-CBC
- HMAC-SHA256
- token version `0x80`
- timestamp big-endian
- IV 16 bytes
- PKCS7
- base64url

Funciones:

```js
encryptPayload(payload)
decryptPayload(document)
```

Importante:

- Los documentos viejos cifrados con `DATA_ENCRYPTION_KEY` global server-side NO se abren con el stub.
- Hay fallback temporal al endpoint legacy `/api/portfolio` en `usePortfolio` para transición.

## 5. SQLite Local + Offline-First

Dónde mirar:

- `frontend/src/services/localPortfolioStore.js`
- `frontend/src/services/portfolioSync.js`
- `frontend/src/hooks/usePortfolio.js`

Flujo:

1. Lee ciphertext directo desde Firestore:

```text
/users/{uid}/portfolio/*
```

2. Descifra en dispositivo con `decryptPayload()`.
3. Persiste plaintext en SQLite local privado.
4. La UI lee de cache/local state.

SQLite:

```text
DB:
micartera_user_cache

Tabla:
portfolio_cache

Campos:
uid
collection_name
doc_id
payload_json
updated_at
cached_at
```

Sync:

- `onSnapshot` Firestore.
- Pull manual en app focus / `visibilitychange`.

Conflictos:

- last-write-wins por `updatedAt`.
- fallback a `ultima_sync` / `actualizado`.
- si no hay timestamps, gana payload entrante.

## 6. Firestore Rules

Dónde mirar:

- `firestore.rules`

Cambio:

- `/users/{uid}/portfolio` ahora permite read/write al owner autenticado.
- La escritura exige ciphertext:

```text
_encrypted == true
_enc_alg == "fernet-v1"
payload string
```

## 7. Backend Como Intermediario

Dónde mirar:

- `backend/app/routers/portfolio.py`

Endpoint nuevo:

```text
POST /api/portfolio/sync-source
```

Qué hace:

- Consulta PPI.
- Transforma datos al formato MiCartera.
- Devuelve plaintext autenticado al dispositivo.
- NO descifra Firestore.
- NO escribe `/users/{uid}/portfolio`.
- El dispositivo cifra y guarda.

Endpoints legacy que siguen existiendo:

```text
POST /api/portfolio/sync
GET /api/portfolio
GET /api/portfolio/history
```

## 8. Documentación

Dónde mirar:

- `docs/android-capacitor.md`

Contiene:

- prerequisitos
- build debug APK
- build firmado
- ubicación de `getUserDEK`
- estrategia offline-first
- backend `sync-source`

## 9. Verificaciones Realizadas

OK:

```bash
npm.cmd run build
python -m py_compile backend\app\routers\portfolio.py backend\app\services\encryption.py
npx.cmd cap sync android
gradlew assembleDebug
```

## 10. Entorno Instalado / Configurado

Se instaló JDK 17 con winget:

```text
EclipseAdoptium.Temurin.17.JDK
```

Para compilar usar:

```text
JAVA_HOME:
C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot
```

Android SDK:

```text
C:\Users\Drumdie\AppData\Local\Android\Sdk
```

APK final debug:

```text
C:\Users\Drumdie\ClaudeCodeProjects\MiCartera\frontend\android\app\build\outputs\apk\debug\app-debug.apk
```

## Punto Clave Para Claude

Revisar primero:

```text
frontend/src/services/deviceKey.js
```

Ahí está el seam exacto para integrar P1.2 sin tocar Fernet, SQLite ni UI.
