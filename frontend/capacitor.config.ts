import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.micartera.app',
  appName: 'MiCartera',
  webDir: 'dist',
  android: {
    path: 'android',
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com', 'password'],
    },
  },
}

export default config
