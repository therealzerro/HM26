import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'HitMaster',
  slug: 'hitmaster',
  version: '2.0.0',
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    eas: {
      projectId: 'c432e8dc-0437-4a60-9635-d2116fc4039b'
    }
  },

  // Ensure build properties from app.json are preserved or moved here
  ios: {
    ...config.ios,
    bundleIdentifier: 'com.hitmaster.app',
    supportsTablet: true,
  },
  android: {
    ...config.android,
    package: 'com.hitmaster.app',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff'
    }
  }
});
