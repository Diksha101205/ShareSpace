package edu.sharespace;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CampusResourceSeederTest {
    @Test
    void acceptsOnlyTheLocalShareSpacePostgresDatabase() {
        assertDoesNotThrow(() -> CampusResourceSeeder.assertTarget(
                "PostgreSQL", "jdbc:postgresql://localhost:5432/sharespace_db", "sharespace_db", false));
        assertThrows(IllegalStateException.class, () -> CampusResourceSeeder.assertTarget(
                "PostgreSQL", "jdbc:postgresql://db.example.net:5432/sharespace_db", "sharespace_db", false));
        assertThrows(IllegalStateException.class, () -> CampusResourceSeeder.assertTarget(
                "PostgreSQL", "jdbc:postgresql://localhost:5432/other_database", "other_database", false));
        assertThrows(IllegalStateException.class, () -> CampusResourceSeeder.assertTarget(
                "H2", "jdbc:h2:mem:sharespace_db", "sharespace_db", false));
        assertThrows(IllegalStateException.class, () -> CampusResourceSeeder.assertTarget(
                "PostgreSQL", "jdbc:postgresql://localhost:5432/sharespace_db", "sharespace_db", true));
    }
}
