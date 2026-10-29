package edu.sharespace;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseToken;
import edu.sharespace.Domain.Role;
import edu.sharespace.Domain.User;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class FirebaseTokenFilterTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final ObjectProvider<FirebaseAuth> authProvider = mock(ObjectProvider.class);
    private final FirebaseUserProvisioner provisioner = mock(FirebaseUserProvisioner.class);
    private final FirebaseAuth firebaseAuth = mock(FirebaseAuth.class);
    private final FirebaseTokenFilter filter = new FirebaseTokenFilter(authProvider, provisioner, mapper);

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void missingBearerTokenContinuesWithoutCreatingAnIdentity() throws Exception {
        MockHttpServletRequest request = request(null);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        verifyNoInteractions(provisioner);
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    void missingFirebaseConfigurationReturnsUnavailable() throws Exception {
        when(authProvider.getIfAvailable()).thenReturn(null);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request("Bearer example-token"), response, mock(FilterChain.class));

        assertEquals(503, response.getStatus());
        assertFalse(response.getContentAsString().contains("example-token"));
    }

    @Test
    void verifiedTokenEstablishesServerLoadedUserPrincipal() throws Exception {
        User user = new User("Taylor Morgan", "taylor@example.edu", Role.USER);
        user.id = 17L;
        FirebaseToken token = mock(FirebaseToken.class);
        when(authProvider.getIfAvailable()).thenReturn(firebaseAuth);
        when(firebaseAuth.verifyIdToken("valid-token")).thenReturn(token);
        when(token.getUid()).thenReturn("firebase-uid-17");
        when(token.getEmail()).thenReturn("taylor@example.edu");
        when(token.getName()).thenReturn("Taylor Morgan");
        when(token.isEmailVerified()).thenReturn(true);
        when(provisioner.provision("firebase-uid-17", "taylor@example.edu", "Taylor Morgan", true)).thenReturn(user);

        filter.doFilter(request("Bearer valid-token"), new MockHttpServletResponse(), mock(FilterChain.class));

        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        assertEquals(new FirebasePrincipal("firebase-uid-17", user), principal);
        verify(provisioner).provision("firebase-uid-17", "taylor@example.edu", "Taylor Morgan", true);
    }

    @Test
    void invalidTokenIsRejectedWithoutExposingItsValue() throws Exception {
        when(authProvider.getIfAvailable()).thenReturn(firebaseAuth);
        when(firebaseAuth.verifyIdToken(anyString())).thenThrow(new IllegalArgumentException("bad token"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request("Bearer do-not-print-this"), response, mock(FilterChain.class));

        assertEquals(401, response.getStatus());
        assertFalse(response.getContentAsString().contains("do-not-print-this"));
        verifyNoInteractions(provisioner);
    }

    @Test
    void expiredTokenIsRejectedAsUnauthenticated() throws Exception {
        when(authProvider.getIfAvailable()).thenReturn(firebaseAuth);
        FirebaseAuthException failure = mock(FirebaseAuthException.class);
        when(failure.getAuthErrorCode()).thenReturn(AuthErrorCode.EXPIRED_ID_TOKEN);
        when(firebaseAuth.verifyIdToken("expired-token")).thenThrow(failure);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request("Bearer expired-token"), response, mock(FilterChain.class));

        assertEquals(401, response.getStatus());
        verifyNoInteractions(provisioner);
    }

    @Test
    void certificateFetchFailureIsReportedAsVerifierUnavailableNotBadCredentials() throws Exception {
        when(authProvider.getIfAvailable()).thenReturn(firebaseAuth);
        FirebaseAuthException failure = mock(FirebaseAuthException.class);
        when(failure.getAuthErrorCode()).thenReturn(AuthErrorCode.CERTIFICATE_FETCH_FAILED);
        when(firebaseAuth.verifyIdToken("valid-shaped-token")).thenThrow(failure);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request("Bearer valid-shaped-token"), response, mock(FilterChain.class));

        assertEquals(503, response.getStatus());
        assertFalse(response.getContentAsString().contains("valid-shaped-token"));
        verifyNoInteractions(provisioner);
    }

    @Test
    void invalidIdTokenCodeRemainsUnauthorizedWithoutExposingToken() throws Exception {
        when(authProvider.getIfAvailable()).thenReturn(firebaseAuth);
        FirebaseAuthException failure = mock(FirebaseAuthException.class);
        when(failure.getAuthErrorCode()).thenReturn(AuthErrorCode.INVALID_ID_TOKEN);
        when(firebaseAuth.verifyIdToken("wrong-project-token")).thenThrow(failure);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request("Bearer wrong-project-token"), response, mock(FilterChain.class));

        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("same Firebase project"));
        assertFalse(response.getContentAsString().contains("wrong-project-token"));
        verifyNoInteractions(provisioner);
    }

    private MockHttpServletRequest request(String authorization) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/bookings");
        if (authorization != null) request.addHeader("Authorization", authorization);
        return request;
    }
}
