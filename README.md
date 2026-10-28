# ShareSpace

ShareSpace backend is a single Spring Boot/PostgreSQL REST API. Frontend implementation is out of scope for this README; see [API_REFERENCE.md](API_REFERENCE.md) for the integration contract.

## Current state

The backend uses Spring Boot 3.5.16, Spring Web, Data JPA, Validation, Security, and PostgreSQL. Hibernate `ddl-auto=update` creates/updates the development schema; use reviewed migrations before production deployment.

## Requirements

- Java 21 (JDK 24 is present in the current environment but Java 21 is not)
- Maven 3.9+
- PostgreSQL 15+

Environment inspection found JDK 24 (Java 21 is the configured compiler target), Maven 3.9.16 cached locally, and PostgreSQL 18 installed. The Maven Central DNS/HTTPS failures occur inside the restricted workspace boundary; outside it DNS resolves and HTTPS returns 200. The Spring Boot 3.5.16 parent and dependencies were resolved successfully through Maven. The backend compiled and all 18 unit tests passed with JDK 24 compiling to release 21. PostgreSQL's Windows service reports `Running` and `pg_isready` sees port 5432 accepting connections. PostgreSQL credentials were not present; `psql` returned `no password supplied`, so the existence of `sharespace_db` has not been confirmed and the app has not been tested against PostgreSQL.

## Database setup

The application default database is `sharespace`. To use the requested `sharespace_db`, create it and a local user if they do not already exist (choose your own password and run with a PostgreSQL administrator account):

```sql
CREATE USER sharespace WITH PASSWORD 'your-local-password';
CREATE DATABASE sharespace_db OWNER sharespace;
```

The API reads `DB_URL` (default `jdbc:postgresql://localhost:5432/sharespace_db`), `DB_USER` (default `sharespace`), and `DB_PASSWORD` (required for your local Postgres user) from the environment. It never stores a password in the repository.

## Start the app

From `backend/`:

```powershell
$env:DB_URL='jdbc:postgresql://localhost:5432/sharespace_db'
$env:DB_USER='sharespace'
$env:DB_PASSWORD='your-local-password'
$env:DEMO_MODE='true' # local-only identity header; never use for deployment
$env:SEED_DEMO_DATA='true' # inserts fictional example users/resources
$env:FRONTEND_ORIGIN='http://localhost:5173'
$env:JAVA_HOME='C:\Program Files\Java\jdk-24'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
& 'C:\Users\Diksh\.m2\wrapper\dists\apache-maven-3.9.16-bin\5grr65jo27hi51sujmtcldfovl\apache-maven-3.9.16\bin\mvn.cmd' spring-boot:run
```
`DEMO_MODE` defaults to `false`. Without an authentication integration, protected operations return 401 in that mode. CORS defaults to `http://localhost:5173`; set `FRONTEND_ORIGIN` to the deployed UI origin.

## Development identity and seeded records

`DEMO_MODE=true` exists only for a local demo. The allowed **fictional** seeded accounts are:

- `taylor@campus.edu` — student
- `maya@campus.edu` — resource owner (has the seeded training credentials)
- `admin@campus.edu` — administrator

The `X-Demo-User` header is an intentionally insecure local demonstration identity, not authentication. The backend accepts only those seeded identities; it rejects other values. Set `DEMO_MODE=false` to reject all API calls until an authenticated identity provider and authorization integration is configured. Do not expose the demo mode publicly or treat it as production access control.

Seed setup is opt-in with `SEED_DEMO_DATA=true`; it inserts sample users/resources only when missing, so restarts do not duplicate the sample catalog. Keep it false outside local demos.

## Implemented workflow

Resource CRUD and filtering, booking eligibility and fair-use limits, owner approval/rejection, instant approval where configured, database locking against overlap races, FIFO wait-list promotion, condition reports, check-in/return confirmation, incident review, and audit history are implemented in the backend. Routes are under `/api`.

## Checks

```powershell
# Backend tests
$env:JAVA_HOME='C:\Program Files\Java\jdk-24'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
& 'C:\Users\Diksh\.m2\wrapper\dists\apache-maven-3.9.16-bin\5grr65jo27hi51sujmtcldfovl\apache-maven-3.9.16\bin\mvn.cmd' test
```
Eighteen unit tests use Mockito and target eligibility, overlap, authorization, approval/rejection, lifecycle prerequisites, incidents, waitlist handling, fair-use limits, instant approval, and audit events. Verified command: cached Maven 3.9.16 `-o test` with `JAVA_HOME=C:\Program Files\Java\jdk-24`. Result: 18 tests run, 0 failures, 0 errors. To use PostgreSQL, confirm the database and configure `DB_URL`, `DB_USER`, and `DB_PASSWORD`; no credential was supplied for this verification.

## Known gaps

- Real login, account recovery, institutional training verification, and production-grade role provisioning are not implemented. Keep demo mode disabled outside local development.
- Photo URLs are currently URL fields; there is no upload service or scheduled overdue processor.
- No migrations are included yet; the development schema is managed by Hibernate.
