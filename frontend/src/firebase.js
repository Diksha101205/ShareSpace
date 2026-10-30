import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, initializeAuth } from 'firebase/auth';
import { demoModeFromEnv, firebaseConfigFromEnv, hasRequiredFirebaseConfig } from './firebaseConfig.js';

const firebaseConfig = firebaseConfigFromEnv(import.meta.env);

export const demoMode = demoModeFromEnv(import.meta.env);
export const firebaseConfigured = !demoMode && hasRequiredFirebaseConfig(firebaseConfig);

const firebaseApp = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = firebaseApp
  ? initializeAuth(firebaseApp, { persistence: browserLocalPersistence })
  : null;
