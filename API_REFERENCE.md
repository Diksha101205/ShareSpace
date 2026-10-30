# ShareSpace API reference

Base URL: `http://localhost:8080/api`. JSON timestamps are ISO-8601 strings with offsets. Successful responses return a JSON object/list for reads and writes; create operations return `201 Created`. Error responses use:

```json
{"timestamp":"2026-10-28T12:00:00Z","status":409,"error":"Conflict","message":"Only approved bookings can be checked in","path":"/api/bookings/15/check-in","fields":{}}
```

Validation errors return `400` with `fields` mapping property names to validation messages. Other common statuses: `401` missing/invalid Firebase bearer token, `403` authenticated but not permitted, `404` missing record, `409` conflict or invalid state transition, and `503` when backend Firebase verification is not configured. Temporary access requests return `410` after the configured expiry. Malformed JSON returns Spring's standard `400` response.

## Authentication and access

Account registration, sign-in, sign-out, and password reset are handled by Firebase Authentication in the frontend. The frontend sends the current Firebase ID token on protected API requests as `Authorization: Bearer <Firebase-ID-token>`. The backend verifies the signature, issuer, audience/project, and expiration with the Firebase Admin SDK; it never treats a client-supplied user ID, email, or role as identity. Protected endpoints return `401 Unauthorized` when the token is missing or invalid and `403 Forbidden` for an authenticated user without permission. `GET /health`, `GET /resources`, and `GET /resources/{id}` remain public.

The backend provisions an ordinary `USER` profile after verifying a Firebase token. Verified email can link an existing ordinary profile idempotently; UID and email uniqueness plus a database transaction protect first login. Elevated `OWNER` and `ADMIN` profiles cannot be claimed by self-registration: an administrator must provision their Firebase UID into the trusted `firebase_uid` field of the existing account. Firebase roles or registration form fields are never used to grant application roles.

Firebase Admin is initialized only when `FIREBASE_PROJECT_ID` is configured. Credentials come from Google Application Default Credentials (for local development, `gcloud auth application-default login`) or `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service-account file stored outside the repository. Never commit a service-account file. If Firebase is not configured, bearer-protected calls return `503`; anonymous calls to protected routes return `401`.

### Temporary hackathon access

**Temporary only; not suitable for production or private data.** To explicitly request the one shared server-controlled `USER` identity, send `X-ShareSpace-Demo: true` with a protected request while the backend is enabled and before expiry. No client user ID or role is accepted. This mode requires Render `DEMO_MODE=true`, `DEMO_MODE_ACTIVATED_AT=<activation time in UTC ISO-8601>`, and optional `DEMO_MODE_TTL=PT48H` (positive and at most 48 hours). Requests carrying `Authorization` always follow Firebase verification; invalid Firebase tokens are never downgraded to the shared identity. Disabled or not-yet-active mode returns `503`; expired mode returns `410`. The frontend selects this request mode only when built with `VITE_DEMO_MODE=true`.

## Resources

| Method and path | Access | Behavior |
|---|---|---|
| `GET /resources` | Public | List available resources. Optional `q`, `category`, `location`, `startTime`, `endTime` filters. Availability requires both times, and only resources with no confirmed/active overlap are returned. |
| `GET /resources/{id}` | Public | Get one resource. |
| `POST /resources` | Identity required | Create (`201`); the backend assigns the owner from the resolved identity. |
| `PUT /resources/{id}` | Identity required | Edit only own resource unless Admin. |

Resource create/update body:

```json
{"name":"DSLR camera","description":"Camera kit with lens","category":"Photography","location":"Media Lab, C-10","requiresTraining":false,"requiredTrainingDescription":null,"requiresApproval":true,"maxBookingHours":24,"usageRules":"Return with all accessories","imageUrl":null}
```

Resource response fields include `id`, those body fields, `status`, nested `owner` (`id`, `fullName`, `email`, `role`, `membershipStatus`, `verified`, `createdAt`; internal training is omitted), and `createdAt`.

## Users

| Method and path | Access | Behavior |
|---|---|---|
| `GET /users/me` | Identity required | Return the resolved user record. |

## Bookings

| Method and path | Access | Behavior |
|---|---|---|
| `GET /bookings` | Identity required | Student sees own; owner sees bookings for their resources; admin sees all. |
| `GET /bookings/{id}` | Requester, owner, Admin | Get booking detail. |
| `POST /bookings` | Student | Request reservation (`201`). |
| `POST /bookings/{id}/approve` | Owning resource owner/Admin | Approve pending request. |
| `POST /bookings/{id}/reject` | Owning resource owner/Admin | Reject pending request. |
| `POST /bookings/{id}/cancel` | Requester/Admin | Cancel pending or approved booking. |
| `POST /bookings/{id}/check-in` | Requester | Approved booking with BEFORE report → checked out. |
| `POST /bookings/{id}/return` | Requester | Checked out booking with AFTER report → return awaiting confirmation. |
| `POST /bookings/{id}/confirm-return` | Owning resource owner/Admin | Confirm return → completed. |
| `GET /bookings/{id}/history` | Requester, owner, Admin | Ordered audit events for booking. |

Booking request:

```json
{"resourceId":2,"startTime":"2026-11-01T10:00:00+05:30","endTime":"2026-11-01T12:00:00+05:30","purpose":"Design class project"}
```

Approval/rejection body (required human-readable reason):

```json
{"reason":"Approved for the class project"}
```

Booking response fields include `id`, nested `resource` and `requester`, `startTime`, `endTime`, `purpose`, `status`, `eligibilityStatus`, `decisionReason`, nested `approvedBy` (if decided), `checkedInAt`, `returnedAt`, and `createdAt`.

Eligibility requires active membership and, for training-required resources, a verified user account with matching training. Maximum duration is enforced exactly (fractional overages are rejected). If a resource does not require owner approval and the requester is eligible, the request is immediately `APPROVED`; an ineligible request stays `PENDING` for an owner decision. `ACTIVE_BOOKING_LIMIT` defaults to 3 and is guarded by a user row lock. Requests overlapping active reservations enter `WAITLISTED` when `WAITLIST_ENABLED=true` (default); waitlist order is FIFO by creation timestamp and ID. When a reservation is rejected, cancelled, or completed, the first eligible future waitlisted request whose time is now available is promoted; it becomes `APPROVED` if no owner approval is required, otherwise `PENDING`. Approval rechecks overlap while holding a database write lock on the resource. Concurrent booking requests and approvals for the same resource serialize on that resource row.

### State transitions

```text
PENDING -> APPROVED | REJECTED | CANCELLED
WAITLISTED -> PENDING (FIFO promotion) | REJECTED (ineligible at promotion)
APPROVED -> CHECKED_OUT (requires BEFORE report) | CANCELLED
CHECKED_OUT -> RETURN_PENDING_CONFIRMATION (requires AFTER report)
RETURN_PENDING_CONFIRMATION -> COMPLETED (owner confirms)
```

An invalid transition returns `409 Conflict`. `OVERDUE` exists as a persisted status value but is not yet assigned by a scheduled job.

## Condition reports

| Method and path | Access | Behavior |
|---|---|---|
| `POST /bookings/{id}/condition-reports` | Requester | Create exactly one BEFORE report while approved or one AFTER report while checked out (`201`). |
| `GET /bookings/{id}/condition-reports` | Requester, owner, Admin | Return reports in creation order. |

Body:

```json
{"reportType":"BEFORE","description":"Lens and body appear undamaged","imageUrl":null}
```

`reportType` is `BEFORE` or `AFTER`. Repeating a report type for the same booking returns `409`.

## Incidents

| Method and path | Access | Behavior |
|---|---|---|
| `POST /bookings/{id}/incidents` | Requester, owner, Admin | Report `DAMAGE`, `DELAY`, or `OTHER` (`201`). |
| `GET /incidents` | Identity required | List incidents attached to visible bookings. |
| `POST /incidents/{id}/resolve` | Owning resource owner/Admin | Resolve open incident with note. |

Create body: `{"type":"DAMAGE","description":"Small crack found on the tripod clamp"}`. Resolve body: `{"resolutionNote":"Inspected and documented; repair requested"}`. Resolution is a human decision; the API does not assign penalties automatically.

## Audit and health

| Method and path | Access | Behavior |
|---|---|---|
| `GET /audit-events` | Identity required | Actor's events; Admin sees all. |
| `GET /bookings/{id}/history` | Requester, owner, Admin | Booking-specific action history. |
| `GET /health` | Public | `{"status":"UP","service":"ShareSpace API"}`. |

Audit records expose `id`, nested `actor`, `action`, `entityType`, `entityId`, `reason`, and `timestamp`.

## CORS and local startup

The default allowed browser origin is `http://localhost:5173`. Set `FRONTEND_ORIGIN` to the exact deployed frontend origin. Database configuration reads `DB_URL` (default `jdbc:postgresql://localhost:5432/sharespace_db`), `DB_USER` (default `sharespace`), and `DB_PASSWORD`. Firebase configuration reads `FIREBASE_PROJECT_ID` and Google Application Default Credentials. `SERVER_PORT` defaults to 8080.

PowerShell, from `backend/`:

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-24'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
$env:DB_URL='jdbc:postgresql://localhost:5432/sharespace_db'
$env:DB_USER='sharespace'
$env:DB_PASSWORD='your-local-password'
$env:FIREBASE_PROJECT_ID='your-firebase-project-id'
$env:FRONTEND_ORIGIN='http://localhost:5173'
& 'C:\Users\Diksh\.m2\wrapper\dists\apache-maven-3.9.16-bin\5grr65jo27hi51sujmtcldfovl\apache-maven-3.9.16\bin\mvn.cmd' spring-boot:run
```

For the frontend, copy `frontend/.env.example` to `frontend/.env.local`, fill in the Firebase web app configuration values, and run `npm run dev`. In Firebase Console, enable **Email/Password** under Authentication → Sign-in method and add `localhost` (and the deployed UI hostname) under Authentication → Settings → Authorized domains. Test by registering, confirming the verification email, signing out and signing in, requesting a password reset, and calling `GET /api/users/me` with the bearer token from an authenticated browser session. Never send a Firebase token in a URL or log it.
