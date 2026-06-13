# MiCartera Android

## Estado

La app Android vive en `frontend/android` y envuelve el build Vite/PWA con Capacitor.
El flujo nuevo lee ciphertext de Firestore, descifra en el dispositivo con `getUserDEK()`
y cachea plaintext en SQLite local privado del dispositivo.

## Requisitos locales

- Node.js compatible con Vite 5.
- Android Studio con Android SDK instalado.
- JDK 17. Android Gradle Plugin no compila con Java 14 y Gradle 8.2.1 no compila con JDK 25.
- Variables recomendadas:
  - `JAVA_HOME` apuntando a JDK 17.
  - `ANDROID_HOME` o SDK configurado por Android Studio.
- Backend deployado y accesible por HTTPS. Para el build Android seteá `VITE_API_URL`.

## Build debug APK

Desde `frontend/`:

```bash
npm install
set VITE_API_URL=https://TU_BACKEND_DEPLOYADO
npm run android:sync
cd android
gradlew assembleDebug
```

APK debug esperado:

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

## Build firmado

Crear un keystore fuera del repo:

```bash
keytool -genkeypair -v -keystore micartera-release.keystore -alias micartera \
  -keyalg RSA -keysize 2048 -validity 10000
```

Configurar firma en Android Studio o con `android/gradle.properties` local no commiteado.
Luego:

```bash
cd frontend/android
gradlew assembleRelease
```

Para Play Store conviene generar `.aab`:

```bash
gradlew bundleRelease
```

## Seam de clave

El seam está en:

```text
frontend/src/services/deviceKey.js
```

Contrato actual:

```js
export async function getUserDEK(): Promise<CryptoKey>
```

Hoy devuelve una clave fija de desarrollo derivada de `micartera-dev-user-dek-v1`.
Cuando esté P1.2, reemplazar solo este módulo para:

1. Obtener la DEK envuelta desde `/users/{uid}/keywrap`.
2. Derivar KEK local con passphrase/biometría según P1.2.
3. Hacer unwrap de la DEK en el dispositivo.
4. Entregar la misma interfaz a `fernet.js`.

`frontend/src/services/fernet.js` implementa `fernet-v1` compatible con el backend:
AES-128-CBC + HMAC-SHA256, token version `0x80`, timestamp big-endian, IV 16 bytes,
PKCS7 y payload base64url.

## Sync offline-first

Implementación:

- `frontend/src/services/portfolioSync.js`
  - Lee `/users/{uid}/portfolio/*` directo con SDK Firestore.
  - Descifra cada doc con `decryptPayload`.
  - Persiste plaintext en SQLite usando `localPortfolioStore.js`.
  - Mantiene `onSnapshot` y pull en foco/visibility.
- `frontend/src/services/localPortfolioStore.js`
  - Tabla `portfolio_cache(uid, collection_name, doc_id, payload_json, updated_at, cached_at)`.
  - En web usa `localStorage` solo como fallback de desarrollo.

Resolución de conflictos:

- Last-write-wins por `updatedAt`.
- Si un documento no trae `updatedAt`, se usa `ultima_sync`/`actualizado`.
- Si no hay timestamps comparables, gana el payload entrante.

## Backend

Endpoint nuevo:

```text
POST /api/portfolio/sync-source
```

Consulta PPI, transforma al formato MiCartera y devuelve plaintext al dispositivo autenticado.
No descifra Firestore y no escribe `/users/{uid}/portfolio`.
El dispositivo cifra con `encryptPayload()` y escribe ciphertext en Firestore.

Los endpoints legacy `/api/portfolio` y `/api/portfolio/sync` quedan para transición/migración.
