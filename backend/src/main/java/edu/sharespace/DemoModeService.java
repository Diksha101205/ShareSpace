package edu.sharespace;

import edu.sharespace.Domain.Role;
import edu.sharespace.Domain.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Resolves one backend-controlled identity for the temporary hackathon access mode. */
@Service
class DemoModeService {
    static final String HEADER = "X-ShareSpace-Demo";
    static final String SUBJECT = "sharespace-temporary-access";
    static final String EMAIL = "temporary-access@sharespace.invalid";
    static final String FULL_NAME = "ShareSpace Temporary User";

    private static final Logger log = LoggerFactory.getLogger(DemoModeService.class);

    private final DemoModePolicy policy;
    private final UserRepository users;
    private final TransactionTemplate transaction;

    DemoModeService(DemoModePolicy policy, UserRepository users, PlatformTransactionManager transactionManager) {
        this.policy = policy;
        this.users = users;
        this.transaction = new TransactionTemplate(transactionManager);
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        if (policy.state() != DemoModePolicy.State.DISABLED) {
            log.warn("Temporary demo-mode access is configured and is not suitable for production; access expires at {}.", policy.expiresAt());
        }
    }

    DemoModePolicy.State state() {
        return policy.state();
    }

    User identity() {
        try {
            return transaction.execute(status -> findOrCreateIdentity());
        } catch (DataIntegrityViolationException concurrentCreation) {
            return users.findByEmailIgnoreCase(EMAIL)
                    .map(this::validateReservedIdentity)
                    .orElseThrow(() -> concurrentCreation);
        }
    }

    private User findOrCreateIdentity() {
        User existing = users.findByEmailIgnoreCase(EMAIL).orElse(null);
        if (existing != null) return validateReservedIdentity(existing);

        User identity = new User(FULL_NAME, EMAIL, Role.USER);
        identity.verified = true;
        return users.saveAndFlush(identity);
    }

    private User validateReservedIdentity(User user) {
        if (user.role != Role.USER || user.firebaseUid != null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "The reserved temporary access profile is unavailable; administrator action is required");
        }
        return user;
    }
}
