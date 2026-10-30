import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, demoMode, firebaseConfigured } from './firebase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!demoMode && firebaseConfigured);
  const [registrationNotice, setRegistrationNotice] = useState('');

  useEffect(() => {
    if (demoMode || !auth) {
      setLoading(false);
      return undefined;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    }, () => {
      setUser(null);
      setLoading(false);
    });
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    demoMode,
    configured: firebaseConfigured,
    registrationNotice,
    dismissRegistrationNotice() { setRegistrationNotice(''); },
    async register(name, email, password) {
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (name.trim()) await updateProfile(result.user, { displayName: name.trim() });
      try {
        await sendEmailVerification(result.user);
        setRegistrationNotice('Your account is ready. Check your email to verify your address.');
        return { verificationEmailSent: true };
      } catch {
        setRegistrationNotice('Your account is ready, but Firebase could not send a verification email.');
        return { verificationEmailSent: false };
      }
    },
    async login(email, password) {
      setRegistrationNotice('');
      return signInWithEmailAndPassword(auth, email.trim(), password);
    },
    async logout() {
      setRegistrationNotice('');
      return signOut(auth);
    },
    resetPassword(email) {
      return sendPasswordResetEmail(auth, email.trim());
    },
  }), [user, loading, registrationNotice]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
