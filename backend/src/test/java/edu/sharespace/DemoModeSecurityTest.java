package edu.sharespace;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:sharespace-temporary-mode;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "app.cors-origin=https://share-space-demo.vercel.app",
        "app.firebase.project-id=",
        "app.demo-mode=true",
        "app.demo-mode-ttl=PT48H"
})
@AutoConfigureMockMvc
class DemoModeSecurityTest {
    private static final String DEMO_HEADER = "X-ShareSpace-Demo";

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired ResourceRepository resources;

    @DynamicPropertySource
    static void activateDemoMode(DynamicPropertyRegistry properties) {
        properties.add("app.demo-mode-activated-at", () -> OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(1).toString());
    }

    @Test
    void explicitDemoIdentityCanCreateBorrowAndReturnPersistedResources() throws Exception {
        String demoRequest = "true";
        MvcResult profile = mvc.perform(get("/api/users/me").header(DEMO_HEADER, demoRequest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("USER"))
                .andExpect(jsonPath("$.email").value(DemoModeService.EMAIL))
                .andReturn();
        String resourceBody = """
                {"name":"Temporary lifecycle resource","description":"Resource created through the temporary access flow","category":"Equipment","location":"Campus Lab","requiresTraining":false,"requiresApproval":false,"maxBookingHours":4}
                """;
        MvcResult resource = mvc.perform(post("/api/resources").header(DEMO_HEADER, demoRequest)
                        .contentType(MediaType.APPLICATION_JSON).content(resourceBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.owner.fullName").value(DemoModeService.FULL_NAME))
                .andReturn();
        long resourceId = ((Number) JsonPath.read(resource.getResponse().getContentAsString(), "$.id")).longValue();
        assertEquals(users.findByEmailIgnoreCase(DemoModeService.EMAIL).orElseThrow().id,
                resources.findById(resourceId).orElseThrow().owner.id);

        OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(3).withNano(0);
        OffsetDateTime end = start.plusHours(2);
        MvcResult booking = mvc.perform(post("/api/bookings").header(DEMO_HEADER, demoRequest)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"resourceId":%d,"startTime":"%s","endTime":"%s","purpose":"Lifecycle verification"}
                                """.formatted(resourceId, start, end)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andReturn();
        long bookingId = ((Number) JsonPath.read(booking.getResponse().getContentAsString(), "$.id")).longValue();

        MvcResult overlappingBooking = mvc.perform(post("/api/bookings").header(DEMO_HEADER, demoRequest)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"resourceId":%d,"startTime":"%s","endTime":"%s","purpose":"Overlapping request"}
                                """.formatted(resourceId, start, end)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("WAITLISTED"))
                .andReturn();
        long waitlistedBookingId = ((Number) JsonPath.read(overlappingBooking.getResponse().getContentAsString(), "$.id")).longValue();

        mvc.perform(get("/api/resources").param("startTime", start.toString()).param("endTime", end.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == %d)]".formatted(resourceId)).doesNotExist());

        mvc.perform(post("/api/bookings/{id}/condition-reports", bookingId).header(DEMO_HEADER, demoRequest)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reportType\":\"BEFORE\",\"description\":\"Condition before collection\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/bookings/{id}/check-in", bookingId).header(DEMO_HEADER, demoRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CHECKED_OUT"));
        mvc.perform(post("/api/bookings/{id}/condition-reports", bookingId).header(DEMO_HEADER, demoRequest)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reportType\":\"AFTER\",\"description\":\"Condition after use\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/bookings/{id}/return", bookingId).header(DEMO_HEADER, demoRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RETURN_PENDING_CONFIRMATION"));
        mvc.perform(post("/api/bookings/{id}/confirm-return", bookingId).header(DEMO_HEADER, demoRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));

        mvc.perform(get("/api/bookings/{id}", waitlistedBookingId).header(DEMO_HEADER, demoRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        mvc.perform(get("/api/resources").param("startTime", start.toString()).param("endTime", end.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == %d)]".formatted(resourceId)).doesNotExist());

        mvc.perform(post("/api/bookings/{id}/condition-reports", waitlistedBookingId).header(DEMO_HEADER, demoRequest)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reportType\":\"BEFORE\",\"description\":\"Condition before collection\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/bookings/{id}/check-in", waitlistedBookingId).header(DEMO_HEADER, demoRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CHECKED_OUT"));
        mvc.perform(post("/api/bookings/{id}/condition-reports", waitlistedBookingId).header(DEMO_HEADER, demoRequest)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reportType\":\"AFTER\",\"description\":\"Condition after use\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/bookings/{id}/return", waitlistedBookingId).header(DEMO_HEADER, demoRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RETURN_PENDING_CONFIRMATION"));
        mvc.perform(post("/api/bookings/{id}/confirm-return", waitlistedBookingId).header(DEMO_HEADER, demoRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));

        mvc.perform(get("/api/bookings").header(DEMO_HEADER, demoRequest))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].status").value("COMPLETED"));
        mvc.perform(get("/api/resources").param("startTime", start.toString()).param("endTime", end.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == %d)]".formatted(resourceId)).exists());
    }

    @Test
    void demoRequestMarkerIsRequiredAndIdentityIsNotBrowserSelected() throws Exception {
        mvc.perform(get("/api/users/me"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users/me").header(DEMO_HEADER, "true").param("userId", "999999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(DemoModeService.EMAIL));
    }

    @Test
    void corsUsesTheConfiguredFrontendOriginAndAllowsTheDemoMarker() throws Exception {
        mvc.perform(options("/api/users/me")
                        .header("Origin", "https://share-space-demo.vercel.app")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", DEMO_HEADER))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .header().string("Access-Control-Allow-Origin", "https://share-space-demo.vercel.app"));
    }
}
