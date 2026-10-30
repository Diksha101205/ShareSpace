import test from 'node:test';
import assert from 'node:assert/strict';
import { demoModeFromEnv, firebaseConfigFromEnv, hasRequiredFirebaseConfig } from './firebaseConfig.js';

test('demo mode is enabled only by an explicit true environment value', () => {
  assert.equal(demoModeFromEnv({ VITE_DEMO_MODE: 'true' }), true);
  assert.equal(demoModeFromEnv({ VITE_DEMO_MODE: 'false' }), false);
  assert.equal(demoModeFromEnv({}), false);
});

test('maps Vite Firebase environment fields to the Firebase SDK configuration', () => {
  const config = firebaseConfigFromEnv({
    VITE_FIREBASE_API_KEY: 'test-web-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'sharespace-3092.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'sharespace-3092',
    VITE_FIREBASE_APP_ID: 'test-app-id',
    VITE_FIREBASE_MESSAGING_SENDER_ID: 'test-sender-id',
    VITE_FIREBASE_STORAGE_BUCKET: 'sharespace-3092.firebasestorage.app',
  });

  assert.deepEqual(config, {
    apiKey: 'test-web-key',
    authDomain: 'sharespace-3092.firebaseapp.com',
    projectId: 'sharespace-3092',
    appId: 'test-app-id',
    messagingSenderId: 'test-sender-id',
    storageBucket: 'sharespace-3092.firebasestorage.app',
  });
  assert.equal(hasRequiredFirebaseConfig(config), true);
});

test('does not initialize Firebase when required Vite configuration is missing', () => {
  const config = firebaseConfigFromEnv({ VITE_FIREBASE_PROJECT_ID: 'sharespace-3092' });
  assert.equal(hasRequiredFirebaseConfig(config), false);
});
