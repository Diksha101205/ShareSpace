package edu.sharespace;

import edu.sharespace.Domain.Role;
import edu.sharespace.Domain.User;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:firebase-provisioning;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
})
@Import(FirebaseUserProvisioner.class)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class FirebaseUserProvisionerTest {
    @Autowired FirebaseUserProvisioner provisioner;
    @Autowired UserRepository users;

    @BeforeEach
    void clearUsers() {
        users.deleteAll();
    }

    @Test
    void firstLoginCreatesOrdinaryUserAndRepeatLoginReusesIt() {
        User first = provisioner.provision("uid-1", "new.member@example.edu", "New Member", true);
        User second = provisioner.provision("uid-1", "new.member@example.edu", "New Member", true);

        assertEquals(first.id, second.id);
        assertEquals("uid-1", users.findById(first.id).orElseThrow().firebaseUid);
        assertEquals(Role.USER, second.role);
        assertEquals(1, users.count());
    }

    @Test
    void verifiedEmailCanLinkExistingOrdinaryUserWithoutChangingItsRole() {
        User existing = users.saveAndFlush(new User("Existing Member", "member@example.edu", Role.USER));

        User linked = provisioner.provision("uid-2", "MEMBER@example.edu", "Member", true);

        assertEquals(existing.id, linked.id);
        assertEquals(Role.USER, linked.role);
        assertEquals("uid-2", linked.firebaseUid);
    }

    @Test
    void unverifiedEmailCannotClaimAnExistingProfile() {
        users.saveAndFlush(new User("Existing Member", "member@example.edu", Role.USER));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> provisioner.provision("uid-3", "member@example.edu", "Member", false));

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        assertEquals(1, users.count());
    }

    @Test
    void registrationCannotClaimAnExistingPrivilegedProfile() {
        users.saveAndFlush(new User("Resource Owner", "owner@example.edu", Role.OWNER));

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> provisioner.provision("uid-4", "owner@example.edu", "Owner", true));

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        assertNull(users.findByEmail("owner@example.edu").orElseThrow().firebaseUid);
    }
}
