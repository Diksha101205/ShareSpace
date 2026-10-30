package edu.sharespace;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;

class FirebaseTokenFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(FirebaseTokenFilter.class);

    private final ObjectProvider<FirebaseAuth> firebaseAuth;
    private final FirebaseUserProvisioner provisioner;
    private final DemoModeService demoMode;
    private final ObjectMapper objectMapper;

    FirebaseTokenFilter(ObjectProvider<FirebaseAuth> firebaseAuth, FirebaseUserProvisioner provisioner,
                        DemoModeService demoMode, ObjectMapper objectMapper) {
        this.firebaseAuth = firebaseAuth;
        this.provisioner = provisioner;
        this.demoMode = demoMode;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return HttpMethod.OPTIONS.matches(request.getMethod())
                || (HttpMethod.GET.matches(request.getMethod())
                && ("/api/health".equals(request.getServletPath())
                || "/api/resources".equals(request.getServletPath())
                || request.getServletPath().startsWith("/api/resources/")));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        String demoHeader = request.getHeader(DemoModeService.HEADER);
        if (authorization == null && "true".equalsIgnoreCase(demoHeader)) {
            DemoModePolicy.State state = demoMode.state();
            if (state != DemoModePolicy.State.ACTIVE) {
                HttpStatus status = state == DemoModePolicy.State.EXPIRED ? HttpStatus.GONE : HttpStatus.SERVICE_UNAVAILABLE;
                String message = state == DemoModePolicy.State.EXPIRED
                        ? "Temporary demo access has expired"
                        : "Temporary demo access is not enabled or has not activated";
                writeError(request, response, status, message);
                return;
            }
            try {
                Domain.User user = demoMode.identity();
                log.info("Temporary demo identity accepted (method={}, path={})", request.getMethod(), request.getServletPath());
                setAuthentication(new ShareSpacePrincipal(DemoModeService.SUBJECT, user));
                chain.doFilter(request, response);
            } catch (org.springframework.web.server.ResponseStatusException ex) {
                SecurityContextHolder.clearContext();
                writeError(request, response, HttpStatus.valueOf(ex.getStatusCode().value()), ex.getReason());
            }
            return;
        }
        if (authorization == null) {
            log.warn("Protected API request has no Authorization header (method={}, path={})",
                    request.getMethod(), request.getServletPath());
            chain.doFilter(request, response);
            return;
        }
        if (authorization.length() <= 7 || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            log.warn("Protected API request has a malformed Authorization header (method={}, path={})",
                    request.getMethod(), request.getServletPath());
            chain.doFilter(request, response);
            return;
        }

        FirebaseAuth verifier = firebaseAuth.getIfAvailable();
        if (verifier == null) {
            writeError(request, response, HttpStatus.SERVICE_UNAVAILABLE, "Firebase token verification is not configured");
            return;
        }

        ShareSpacePrincipal principal;
        try {
            FirebaseToken token = verifier.verifyIdToken(authorization.substring(7).trim());
            log.info("Firebase token verification succeeded (method={}, path={})", request.getMethod(), request.getServletPath());
            Domain.User user;
            try {
                user = provisioner.provision(token.getUid(), token.getEmail(), token.getName(), token.isEmailVerified());
            } catch (DataAccessException ex) {
                log.error("Firebase token was verified but user profile provisioning failed (exceptionType={})",
                        ex.getClass().getSimpleName());
                throw ex;
            }
            log.info("Firebase user profile provisioning succeeded (method={}, path={})",
                    request.getMethod(), request.getServletPath());
            principal = new ShareSpacePrincipal(token.getUid(), user);
        } catch (FirebaseAuthException ex) {
            SecurityContextHolder.clearContext();
            AuthErrorCode code = ex.getAuthErrorCode();
            log.warn("Firebase ID token verification failed (authErrorCode={})", code == null ? "UNKNOWN" : code.name());
            if (code == AuthErrorCode.CERTIFICATE_FETCH_FAILED || code == AuthErrorCode.CONFIGURATION_NOT_FOUND) {
                writeError(request, response, HttpStatus.SERVICE_UNAVAILABLE,
                        "Firebase token verification is temporarily unavailable or misconfigured");
            } else if (code == AuthErrorCode.EXPIRED_ID_TOKEN || code == AuthErrorCode.REVOKED_ID_TOKEN) {
                writeError(request, response, HttpStatus.UNAUTHORIZED, "Firebase ID token is expired or revoked");
            } else if (code == AuthErrorCode.INVALID_ID_TOKEN) {
                writeError(request, response, HttpStatus.UNAUTHORIZED,
                        "Firebase ID token is invalid; check that the frontend and backend use the same Firebase project");
            } else {
                writeError(request, response, HttpStatus.UNAUTHORIZED, "Firebase ID token could not be verified");
            }
            return;
        } catch (IllegalArgumentException ex) {
            SecurityContextHolder.clearContext();
            log.warn("Firebase ID token parsing failed (exceptionType={})", ex.getClass().getSimpleName());
            writeError(request, response, HttpStatus.UNAUTHORIZED, "Firebase ID token could not be verified");
            return;
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            SecurityContextHolder.clearContext();
            log.info("Firebase identity provisioning was rejected (status={})", ex.getStatusCode().value());
            writeError(request, response, HttpStatus.valueOf(ex.getStatusCode().value()), ex.getReason());
            return;
        }
        setAuthentication(principal);
        chain.doFilter(request, response);
    }

    private void setAuthentication(ShareSpacePrincipal principal) {
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + principal.user().role.name())));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    private void writeError(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType("application/json");
        objectMapper.writeValue(response.getOutputStream(), Map.of(
                "timestamp", Instant.now().toString(),
                "status", status.value(),
                "error", status.getReasonPhrase(),
                "message", message,
                "path", request.getRequestURI(),
                "fields", Map.of()));
    }
}
