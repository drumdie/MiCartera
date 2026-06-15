import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.micartera.app',
  appName: 'MiCartera',
  webDir: 'dist',
  android: {
    path: 'android',
    // Fondo del WebView durante la carga → evita el flash blanco antes de que React renderice.
    backgroundColor: '#080a0d',
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com', 'password'],
    },
  },
}

export default config
