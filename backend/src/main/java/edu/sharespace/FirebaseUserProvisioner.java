package edu.sharespace;

import edu.sharespace.Domain.Role;
import edu.sharespace.Domain.User;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;

@Service
class FirebaseUserProvisioner {
    private final UserRepository users;
    private final TransactionTemplate transaction;

    FirebaseUserProvisioner(UserRepository users, PlatformTransactionManager transactionManager) {
        this.users = users;
        this.transaction = new TransactionTemplate(transactionManager);
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    User provision(String uid, String emailClaim, String nameClaim, boolean emailVerified) {
        String email = emailClaim == null ? "" : emailClaim.trim().toLowerCase(Locale.ROOT);
        try {
            return transaction.execute(status -> provisionWithinTransaction(uid, email, nameClaim, emailVerified));
        } catch (DataIntegrityViolationException concurrentFirstLogin) {
            User provisioned = users.findByFirebaseUid(uid).orElse(null);
            if (provisioned != null) return provisioned;
            if (users.findByEmailIgnoreCase(email).isPresent()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This email address is already linked to another ShareSpace identity");
            }
            throw concurrentFirstLogin;
        }
    }

    private User provisionWithinTransaction(String uid, String email, String name, boolean emailVerified) {
        User existing = users.findByFirebaseUid(uid).orElse(null);
        if (existing != null) return existing;

        if (email.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "A verified email address is required for a ShareSpace profile");
        }

        User account = users.findByEmailIgnoreCaseForUpdate(email).orElse(null);
        if (account != null) {
            if (!emailVerified) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Verify the email address before linking this ShareSpace profile");
            }
            if (account.firebaseUid != null && !account.firebaseUid.equals(uid)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This ShareSpace profile is already linked to another identity");
            }
            if (account.role != Role.USER) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Privileged ShareSpace accounts require administrator provisioning");
            }
            account.firebaseUid = uid;
            return users.save(account);
        }

        String displayName = name == null || name.isBlank() ? email.substring(0, email.indexOf('@')) : name.trim();
        User created = new User(displayName, email, Role.USER);
        created.firebaseUid = uid;
        created.verified = false;
        return users.save(created);
    }
}
