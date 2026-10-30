package edu.sharespace;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DemoModePolicyTest {
    @Test
    void demoModeHasAnExplicitActivationAndExpiresAtItsConfiguredLimit() {
        DemoModePolicy policy = new DemoModePolicy(true, "2026-01-01T00:00:00Z", "PT48H");

        assertEquals(DemoModePolicy.State.NOT_STARTED, policy.stateAt(Instant.parse("2025-12-31T23:59:59Z")));
        assertEquals(DemoModePolicy.State.ACTIVE, policy.stateAt(Instant.parse("2026-01-02T23:59:59Z")));
        assertEquals(DemoModePolicy.State.EXPIRED, policy.stateAt(Instant.parse("2026-01-03T00:00:00Z")));
    }

    @Test
    void demoModeCannotBeConfiguredForLongerThanFortyEightHours() {
        assertThrows(IllegalStateException.class,
                () -> new DemoModePolicy(true, "2026-01-01T00:00:00Z", "PT49H"));
    }

    @Test
    void enabledDemoModeRequiresAnExplicitActivationTimestamp() {
        assertThrows(IllegalStateException.class, () -> new DemoModePolicy(true, "", "PT48H"));
    }
}
