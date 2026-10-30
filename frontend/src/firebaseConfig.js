export function firebaseConfigFromEnv(env) {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  };
}

export function hasRequiredFirebaseConfig(config) {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

export function demoModeFromEnv(env) {
  return String(env?.VITE_DEMO_MODE || '').toLowerCase() === 'true';
}
