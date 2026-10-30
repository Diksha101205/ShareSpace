import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, initializeAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.AIzaSyAkINh7OmO3YtaqEIONIk_-AwmDXYoVZ84,
  authDomain: import.meta.env.sharespace-30a92.firebaseapp.com,
  projectId: import.meta.env.sharespace-30a92,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.1:1070936715840:web:88f53d3402a4aacf5625a5,
  storageBucket: import.meta.env.sharespace-30a92.firebasestorage.app,
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
);

const firebaseApp = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = firebaseApp
  ? initializeAuth(firebaseApp, { persistence: browserLocalPersistence })
  : null;
