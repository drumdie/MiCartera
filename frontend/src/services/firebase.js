import { initializeApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { Capacitor } from '@capacitor/core'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

// Firebase App Check (web): atesta que los requests vienen de nuestra app genuina.
// Solo se activa si VITE_RECAPTCHA_SITE_KEY está seteada → sin la key no hace nada (no rompe).
// En nativo (apk) NO se usa reCAPTCHA: ahí corresponde el provider Play Integrity vía plugin
// nativo (pendiente). El ENFORCEMENT se habilita en el Console SOLO cuando web + android mandan
// tokens válidos; antes de eso, romería el cliente.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
if (recaptchaSiteKey && !Capacitor.isNativePlatform()) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
}

export const db   = getFirestore(app)
export const auth = getAuth(app)

// En desarrollo local con emuladores (VITE_USE_EMULATORS=true en .env)
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFirestoreEmulator(db,   'localhost', 8080)
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
}
