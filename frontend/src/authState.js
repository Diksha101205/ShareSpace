const authModes = new Map([
  ['/login', 'login'],
  ['/register', 'register'],
  ['/forgot-password', 'forgot'],
]);

export function authRouteState({ loading, configured, user, pathname, demoMode = false }) {
  if (demoMode) return authModes.has(pathname) ? { view: 'redirect-workspace' } : { view: 'workspace' };
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

export function apiErrorMessage(status, body = {}, { hasToken = false, refreshed = false } = {}) {
  if (status === 401) {
    if (!hasToken) return 'Sign in to continue. Your account session is not available to ShareSpace.';
    if (refreshed) return 'ShareSpace rejected the refreshed Firebase session. Check that the frontend and backend use the same Firebase project, then sign in again.';
    return 'ShareSpace could not authenticate this request. Your session may need to be renewed.';
  }
  if (status === 403) return body.message || 'You are signed in, but your account does not have permission to perform this action.';
  if (status === 503) return body.message || 'The ShareSpace identity service is not configured. Contact the application administrator.';
  if (status >= 500) return 'ShareSpace encountered a server error. Try again in a little while.';
  return body.message || body.detail || body.error || `Request failed (${status})`;
}
