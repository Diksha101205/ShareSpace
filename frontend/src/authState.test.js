import test from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorMessage, authErrorMessage, authRouteState } from './authState.js';

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

test('keeps API authentication, authorization, network, and server errors distinct', () => {
  assert.match(apiErrorMessage(401, {}, { hasToken: false }), /Sign in/);
  assert.match(apiErrorMessage(401, {}, { hasToken: true, refreshed: true }), /same Firebase project/);
  assert.match(apiErrorMessage(403), /does not have permission/);
  assert.equal(apiErrorMessage(403, { message: 'Only this resource owner can decide the request' }), 'Only this resource owner can decide the request');
  assert.equal(apiErrorMessage(400, { message: 'Booking overlaps an existing reservation' }), 'Booking overlaps an existing reservation');
  assert.match(apiErrorMessage(500), /server error/);
});
