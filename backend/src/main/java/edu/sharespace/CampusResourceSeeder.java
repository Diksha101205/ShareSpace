package edu.sharespace;

import edu.sharespace.Domain.Booking;
import edu.sharespace.Domain.BookingStatus;
import edu.sharespace.Domain.ReportType;
import edu.sharespace.Domain.Resource;
import edu.sharespace.Domain.Role;
import edu.sharespace.Domain.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.net.URI;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
@ConditionalOnProperty(name = "app.campus-seed.enabled", havingValue = "true")
class CampusResourceSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(CampusResourceSeeder.class);
    private static final List<Listing> LISTINGS = List.of(
            new Listing("Calculus II Problem-Solving Text Set", "Books", "North Library · Reserve Desk", "A two-volume calculus set covering integration techniques, series, and worked problems.", "AVAILABLE", 8),
            new Listing("Media Lab Portable Projector Kit", "Electronics", "Media Lab · Building C", "Portable projector with HDMI cable, power adapter, and carry case for student presentations.", "AVAILABLE", 8),
            new Listing("Engineering Hall Sensor and Breadboard Pack", "Electronics", "Engineering Hall · Lab 3", "Breadboards, jumper wires, and a basic sensor assortment for supervised class prototypes.", "AVAILABLE", 4),
            new Listing("Field Research Notebook Set", "Study Materials", "North Library · Floor 2", "Water-resistant notebooks, campus map sheets, and pencils for field observations.", "AVAILABLE", 24),
            new Listing("Chemistry Molecular Model Set", "Study Materials", "Science Building · Room 118", "Reusable atom and bond pieces for visualizing common organic chemistry structures.", "AVAILABLE", 8),
            new Listing("Mathematics Center Graphing Calculator", "Electronics", "Mathematics Center · Help Desk", "Graphing calculator with protective cover for coursework and exam preparation.", "AVAILABLE", 8),
            new Listing("Recreation Center Volleyball Set", "Sports Equipment", "Recreation Center · Equipment Desk", "Indoor volleyball with a portable pump and boundary markers for club practice.", "AVAILABLE", 4),
            new Listing("Campus Courts Badminton Racket Pair", "Sports Equipment", "Campus Courts · Locker 12", "Two balanced rackets with a protective sleeve for casual and club play.", "AVAILABLE", 4),
            new Listing("Student Union Folding Display Easel", "Campus Supplies", "Student Union · Room 204", "Lightweight adjustable easel for student organization notices and project displays.", "AVAILABLE", 24),
            new Listing("Media Lab Digital Voice Recorder", "Electronics", "Media Lab · Building C", "Handheld recorder with USB cable and storage case for interviews and field notes.", "AVAILABLE", 8),
            new Listing("Studio Lighting Stand Kit", "Electronics", "Design Studio · Room 110", "Two compact light stands with clamps for supervised student photography projects.", "AVAILABLE", 8),
            new Listing("Architecture Studio Drawing Board Bundle", "Study Materials", "Architecture Studio · Room 206", "Portable drawing boards, parallel rulers, and clips for studio coursework.", "AVAILABLE", 8),
            new Listing("Introductory Java Textbook Set", "Books", "North Library · Reserve Desk", "Current course texts covering Java fundamentals, object-oriented design, and exercises.", "AVAILABLE", 24),
            new Listing("Recreation Center Indoor Soccer Ball", "Sports Equipment", "Recreation Center · Equipment Desk", "Indoor training ball with mesh carry bag for student recreation sessions.", "AVAILABLE", 4),
            new Listing("Student Union Poster Mounting Kit", "Campus Supplies", "Student Union · Service Counter", "Reusable clips, removable mounting strips, and measuring tape for campus displays.", "AVAILABLE", 8),
            new Listing("Art Studio Watercolor Palette Set", "Campus Supplies", "Art Building · Room 012", "Washable watercolor palette with brushes and a lidded mixing tray.", "UNAVAILABLE", 4),
            new Listing("Library Seminar Room Portable Whiteboard", "Campus Supplies", "North Library · Seminar Desk", "Mobile whiteboard with markers and eraser for group study sessions.", "UNAVAILABLE", 8),
            new Listing("Engineering Hall Tripod and Measurement Stand", "Electronics", "Engineering Hall · Lab 3", "Adjustable tripod and measurement stand for supervised laboratory practicals.", "UNAVAILABLE", 4)
    );

    private static final List<String> RESERVATION_PURPOSES = List.of(
            "Campus reservation 01 — student media planning session",
            "Campus reservation 02 — photography club workshop",
            "Campus reservation 03 — student society camera practice",
            "Campus reservation 04 — robotics club equipment review",
            "Campus reservation 05 — engineering project field test",
            "Campus reservation 06 — study group course preparation",
            "Campus reservation 07 — research team equipment session",
            "Campus reservation 08 — student organization display setup",
            "Campus reservation 09 — design class project work",
            "Campus reservation 10 — campus journalism interview",
            "Campus reservation 11 — student lab preparation session",
            "Campus reservation 12 — engineering club equipment practice"
    );

    private final DataSource dataSource;
    private final UserRepository users;
    private final ResourceRepository resources;
    private final BookingRepository bookings;
    private final Workflow workflow;

    CampusResourceSeeder(DataSource dataSource, UserRepository users, ResourceRepository resources,
                         BookingRepository bookings, Workflow workflow) {
        this.dataSource = dataSource;
        this.users = users;
        this.resources = resources;
        this.bookings = bookings;
        this.workflow = workflow;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        verifyDatabaseTarget();

        List<User> allUsers = users.findAll();
        List<User> requesters = allUsers.stream()
                .filter(user -> user.role == Role.USER)
                .filter(CampusResourceSeeder::isActiveLinkedAccount)
                .sorted(Comparator.comparing(user -> user.id))
                .toList();
        if (requesters.isEmpty()) {
            throw new IllegalStateException("Provision at least one active Firebase-linked USER account before running this command.");
        }

        User requester = requesters.get(0);

        List<Booking> existingBookings = bookings.findByRequesterIdOrderByCreatedAtDesc(requester.id);
        Set<String> existingPurposes = existingBookings.stream().map(booking -> booking.purpose).collect(java.util.stream.Collectors.toSet());
        long existingPlanCount = RESERVATION_PURPOSES.stream().filter(existingPurposes::contains).count();
        if (existingPlanCount == RESERVATION_PURPOSES.size()) {
            log.info("Campus inventory and reservation records are already present; no changes made");
            return;
        }
        if (existingPlanCount != 0) {
            throw new IllegalStateException("Some planned reservation records already exist; refusing to alter or duplicate existing bookings.");
        }
        if (activeBookingCount(requester.id) != 0) {
            throw new IllegalStateException("The linked USER account already has active bookings; existing reservations were preserved.");
        }

        List<User> owners = allUsers.stream()
                .filter(user -> user.role == Role.OWNER)
                .filter(CampusResourceSeeder::isActiveLinkedAccount)
                .sorted(Comparator.comparing(user -> user.id))
                .toList();
        if (owners.size() < 2) {
            throw new IllegalStateException("Provision at least two active Firebase-linked OWNER accounts through the administrator-controlled account process before running this command.");
        }

        Map<String, Resource> catalog = ensureListings(owners);
        ensureBookingResourcesAreAvailable(catalog);
        createReservations(catalog, requester);
        log.info("Created {} campus resources and {} reservations", LISTINGS.size(), RESERVATION_PURPOSES.size());
    }

    private Map<String, Resource> ensureListings(List<User> owners) {
        Map<String, Resource> catalog = new HashMap<>();
        for (Resource resource : resources.findAll()) catalog.put(resource.name, resource);

        int newListingIndex = 0;
        for (int index = 0; index < LISTINGS.size(); index++) {
            Listing listing = LISTINGS.get(index);
            Resource existing = catalog.get(listing.name());
            if (existing != null) {
                if (existing.owner.role != Role.OWNER || !isActiveLinkedAccount(existing.owner)) {
                    throw new IllegalStateException("An existing campus listing is not owned by an active linked OWNER account; no records were overwritten.");
                }
                continue;
            }

            User owner = owners.get(newListingIndex++ % owners.size());
            Resource created = workflow.create(new ResourceIn(
                    listing.name(), listing.description(), listing.category(), listing.location(),
                    false, null, true, listing.maxBookingHours(),
                    "Return the item to its campus service point and report any damage.", null), owner);
            if (!"AVAILABLE".equals(listing.status())) {
                created.status = listing.status();
                created = resources.save(created);
            }
            catalog.put(created.name, created);
        }
        return catalog;
    }

    private void ensureBookingResourcesAreAvailable(Map<String, Resource> catalog) {
        for (int index : new int[]{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}) {
            Resource resource = catalog.get(LISTINGS.get(index).name());
            if (resource == null || !"AVAILABLE".equalsIgnoreCase(resource.status)) {
                throw new IllegalStateException("A required campus listing is unavailable; no bookings were created.");
            }
        }
    }

    private void createReservations(Map<String, Resource> catalog, User requester) {
        OffsetDateTime base = OffsetDateTime.now(ZoneOffset.UTC).plusDays(14).withHour(10).withMinute(0).withSecond(0).withNano(0);

        Booking pending = request(catalog, requester, 0, 1, base, RESERVATION_PURPOSES.get(0));

        Booking approvedForOverlap = request(catalog, requester, 1, 2, base, RESERVATION_PURPOSES.get(1));
        User approvalOwner = approvedForOverlap.resource.owner;
        workflow.decide(approvedForOverlap.id, approvalOwner, true, "Approved for the scheduled campus activity");
        workflow.request(new BookingIn(approvedForOverlap.resource.id, approvedForOverlap.startTime,
                approvedForOverlap.endTime, RESERVATION_PURPOSES.get(2)), requester);

        Booking rejected = request(catalog, requester, 2, 3, base, RESERVATION_PURPOSES.get(3));
        workflow.decide(rejected.id, rejected.resource.owner, false, "The requested time is reserved for a campus class");

        Booking checkedOut = request(catalog, requester, 3, 4, base, RESERVATION_PURPOSES.get(4));
        workflow.decide(checkedOut.id, checkedOut.resource.owner, true, "Approved for the scheduled engineering activity");
        report(checkedOut, requester, ReportType.BEFORE, "Item checked before the scheduled activity");
        workflow.transition(checkedOut.id, requester, "check-in");

        complete(approvedForOverlap, requester, approvalOwner);
        Booking waitlisted = bookings.findByRequesterIdOrderByCreatedAtDesc(requester.id).stream()
                .filter(booking -> RESERVATION_PURPOSES.get(2).equals(booking.purpose))
                .findFirst().orElseThrow(() -> new IllegalStateException("The overlapping reservation was not created."));
        if (waitlisted.status == BookingStatus.PENDING) {
            workflow.transition(waitlisted.id, requester, "cancel");
        }

        workflow.request(new BookingIn(checkedOut.resource.id, checkedOut.startTime,
                checkedOut.endTime, RESERVATION_PURPOSES.get(11)), requester);

        Booking completed = request(catalog, requester, 4, 6, base, RESERVATION_PURPOSES.get(5));
        User completedOwner = completed.resource.owner;
        workflow.decide(completed.id, completedOwner, true, "Approved for the scheduled study session");
        complete(completed, requester, completedOwner);

        Booking cancelled = request(catalog, requester, 5, 7, base, RESERVATION_PURPOSES.get(6));
        workflow.transition(cancelled.id, requester, "cancel");

        Booking approved = request(catalog, requester, 6, 8, base, RESERVATION_PURPOSES.get(7));
        workflow.decide(approved.id, approved.resource.owner, true, "Approved for the scheduled campus display setup");

        workflow.transition(pending.id, requester, "cancel");

        Booking rejectedOne = request(catalog, requester, 7, 9, base, RESERVATION_PURPOSES.get(8));
        workflow.decide(rejectedOne.id, rejectedOne.resource.owner, false, "The requested time conflicts with a required campus activity");
        Booking rejectedTwo = request(catalog, requester, 8, 10, base, RESERVATION_PURPOSES.get(9));
        workflow.decide(rejectedTwo.id, rejectedTwo.resource.owner, false, "Please select another available time");

        Booking finalPending = request(catalog, requester, 9, 11, base, RESERVATION_PURPOSES.get(10));

        report(checkedOut, requester, ReportType.AFTER, "Item returned in serviceable condition");
        workflow.transition(checkedOut.id, requester, "return");

        if (finalPending.status != BookingStatus.PENDING) {
            throw new IllegalStateException("The pending reservation did not remain pending.");
        }
    }

    private Booking request(Map<String, Resource> catalog, User requester, int listingIndex, int dayOffset,
                            OffsetDateTime base, String purpose) {
        Resource resource = catalog.get(LISTINGS.get(listingIndex).name());
        OffsetDateTime start = base.plusDays(dayOffset);
        return workflow.request(new BookingIn(resource.id, start, start.plusHours(2), purpose), requester);
    }

    private void complete(Booking booking, User requester, User owner) {
        report(booking, requester, ReportType.BEFORE, "Condition recorded before campus use");
        workflow.transition(booking.id, requester, "check-in");
        report(booking, requester, ReportType.AFTER, "Condition recorded after campus use");
        workflow.transition(booking.id, requester, "return");
        workflow.transition(booking.id, owner, "confirm-return");
    }

    private void report(Booking booking, User requester, ReportType type, String description) {
        workflow.report(booking.id, new ConditionIn(type, description, null), requester);
    }

    private long activeBookingCount(Long requesterId) {
        return bookings.findByRequesterIdOrderByCreatedAtDesc(requesterId).stream()
                .filter(booking -> Set.of(BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.CHECKED_OUT,
                        BookingStatus.RETURN_PENDING_CONFIRMATION).contains(booking.status))
                .count();
    }

    private static boolean isActiveLinkedAccount(User user) {
        return "ACTIVE".equals(user.membershipStatus) && user.firebaseUid != null && !user.firebaseUid.isBlank();
    }

    private void verifyDatabaseTarget() {
        try (Connection connection = dataSource.getConnection()) {
            String product = connection.getMetaData().getDatabaseProductName();
            String url = connection.getMetaData().getURL();
            String database;
            boolean superuser;
            try (Statement statement = connection.createStatement(); var result = statement.executeQuery(
                    "select current_database(), r.rolsuper from pg_roles r where r.rolname = current_user")) {
                if (!result.next()) throw new IllegalStateException("Unable to confirm the connected database.");
                database = result.getString(1);
                superuser = result.getBoolean(2);
            }
            assertTarget(product, url, database, superuser);
        } catch (SQLException exception) {
            log.error("Could not verify the configured PostgreSQL target (exceptionType={})", exception.getClass().getSimpleName());
            throw new IllegalStateException("Could not verify the local campus database target.");
        }
    }

    static void assertTarget(String product, String jdbcUrl, String database, boolean superuser) {
        if (!"PostgreSQL".equalsIgnoreCase(product) || !"sharespace_db".equals(database)) {
            throw new IllegalStateException("Campus seeding is restricted to the local PostgreSQL sharespace_db database.");
        }
        if (superuser) {
            throw new IllegalStateException("Campus seeding requires a non-superuser PostgreSQL role.");
        }
        try {
            URI uri = URI.create(jdbcUrl.substring("jdbc:".length()));
            String host = uri.getHost();
            int port = uri.getPort() < 0 ? 5432 : uri.getPort();
            if (!Set.of("localhost", "127.0.0.1", "::1").contains(host) || port != 5432
                    || !"/sharespace_db".equals(uri.getPath())) {
                throw new IllegalStateException("Campus seeding is restricted to the local PostgreSQL sharespace_db database.");
            }
        } catch (RuntimeException exception) {
            if (exception instanceof IllegalStateException stateException) throw stateException;
            throw new IllegalStateException("Campus seeding is restricted to the local PostgreSQL sharespace_db database.");
        }
    }

    private record Listing(String name, String category, String location, String description, String status,
                           int maxBookingHours) { }
}
