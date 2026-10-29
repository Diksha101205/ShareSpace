const authModes = new Map([
  ['/login', 'login'],
  ['/register', 'register'],
  ['/forgot-password', 'forgot'],
]);

export function authRouteState({ loading, configured, user, pathname }) {
  if (loading) return { view: 'loading' };
  if (!user) {
    const mode = authModes.get(pathname);
    return mode ? { view: 'auth', mode, configured } : { view: 'redirect-login' };
  }
  if (authModes.has(pathname)) return { view: 'redirect-workspace' };
  return { view: 'workspace' };
}

const errorMessages = {
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/user-not-found': 'The email or password is incorrect.',
  'auth/wrong-password': 'The email or password is incorrect.',
  'auth/email-already-in-use': 'An account already exists for this email. Try signing in.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a little and try again.',
  'auth/network-request-failed': 'Could not reach Firebase. Check your connection and try again.',
};

export function authErrorMessage(code) {
  return errorMessages[code] || 'Firebase could not complete this request. Check your details and try again.';
}
