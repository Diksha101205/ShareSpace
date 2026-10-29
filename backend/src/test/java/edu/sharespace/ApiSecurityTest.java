package edu.sharespace;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:firebase-api-security;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "app.firebase.project-id="
})
@AutoConfigureMockMvc
class ApiSecurityTest {
    @Autowired MockMvc mvc;

    @Test
    void protectedApiRejectsMissingBearerToken() throws Exception {
        mvc.perform(get("/api/bookings"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Authentication required"));
    }

    @Test
    void resourceCreationStillRequiresAuthentication() throws Exception {
        mvc.perform(post("/api/resources").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Camera\",\"description\":\"Campus camera\",\"category\":\"Equipment\",\"location\":\"Library\",\"requiresTraining\":false,\"requiresApproval\":true,\"maxBookingHours\":4}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void healthAndResourceDiscoveryRemainPublic() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk());
        mvc.perform(get("/api/resources")).andExpect(status().isOk());
    }

    @Test
    void bearerTokenIsUnavailableWhenFirebaseBackendIsNotConfigured() throws Exception {
        mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer invalid"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("Firebase token verification is not configured"));
    }
}
