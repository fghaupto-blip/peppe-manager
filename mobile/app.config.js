module.exports = ({ config }) => ({
  ...config,
  name: 'Peppe Manager',
  slug: 'peppe-manager-mobile',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'peppe',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.peppemanager.app',
    supportsTablet: false
  },
  android: {
    package: 'com.peppemanager.app'
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    ['expo-notifications', { defaultChannel: 'peppe' }]
  ],
  experiments: {
    typedRoutes: true
  },
  extra: {
    ...(config.extra || {}),
    eas: process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID }
      : (config.extra?.eas || undefined)
  }
});
