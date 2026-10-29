import test from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage, authRouteState } from './authState.js';

test('holds protected routes while the Firebase session is loading', () => {
  assert.deepEqual(authRouteState({ loading: true, configured: true, user: null, pathname: '/bookings' }), { view: 'loading' });
});

test('redirects unauthenticated protected routes to login', () => {
  assert.deepEqual(authRouteState({ loading: false, configured: true, user: null, pathname: '/bookings/12' }), { view: 'redirect-login' });
});

test('allows an unauthenticated visitor to use auth screens and sends signed-in users to the app', () => {
  assert.deepEqual(authRouteState({ loading: false, configured: false, user: null, pathname: '/register' }), { view: 'auth', mode: 'register', configured: false });
  assert.deepEqual(authRouteState({ loading: false, configured: true, user: { uid: 'uid-1' }, pathname: '/login' }), { view: 'redirect-workspace' });
  assert.deepEqual(authRouteState({ loading: false, configured: true, user: { uid: 'uid-1' }, pathname: '/bookings' }), { view: 'workspace' });
});

test('translates common Firebase errors without exposing SDK error internals', () => {
  assert.equal(authErrorMessage('auth/invalid-credential'), 'The email or password is incorrect.');
  assert.match(authErrorMessage('unknown'), /Firebase could not complete/);
});
