package edu.sharespace;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/** Temporary hackathon access policy. Demo mode is not suitable for production. */
@Component
final class DemoModePolicy {
    enum State { DISABLED, NOT_STARTED, ACTIVE, EXPIRED }

    static final Duration MAXIMUM_TTL = Duration.ofHours(48);

    private final boolean enabled;
    private final Instant activatedAt;
    private final Duration ttl;

    DemoModePolicy(
            @Value("${app.demo-mode:false}") boolean enabled,
            @Value("${app.demo-mode-activated-at:}") String activatedAt,
            @Value("${app.demo-mode-ttl:PT48H}") String ttl) {
        this.enabled = enabled;
        try {
            this.ttl = Duration.parse(ttl);
        } catch (RuntimeException invalidTtl) {
            throw new IllegalStateException("DEMO_MODE_TTL must be an ISO-8601 duration no longer than PT48H", invalidTtl);
        }
        if (this.ttl.isZero() || this.ttl.isNegative() || this.ttl.compareTo(MAXIMUM_TTL) > 0) {
            throw new IllegalStateException("DEMO_MODE_TTL must be positive and no longer than PT48H");
        }
        if (enabled && (activatedAt == null || activatedAt.isBlank())) {
            throw new IllegalStateException("DEMO_MODE_ACTIVATED_AT is required when DEMO_MODE is enabled");
        }
        try {
            this.activatedAt = activatedAt == null || activatedAt.isBlank() ? null : Instant.parse(activatedAt.trim());
        } catch (RuntimeException invalidActivationTime) {
            throw new IllegalStateException("DEMO_MODE_ACTIVATED_AT must be an ISO-8601 UTC timestamp", invalidActivationTime);
        }
    }

    State stateAt(Instant now) {
        if (!enabled) return State.DISABLED;
        if (now.isBefore(activatedAt)) return State.NOT_STARTED;
        return now.isBefore(activatedAt.plus(ttl)) ? State.ACTIVE : State.EXPIRED;
    }

    State state() {
        return stateAt(Instant.now());
    }

    Instant expiresAt() {
        return activatedAt == null ? null : activatedAt.plus(ttl);
    }
}
