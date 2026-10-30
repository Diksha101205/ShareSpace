# ShareSpace

ShareSpace is a React/Vite client and Spring Boot/PostgreSQL API for sharing campus resources. Normal access uses Firebase Authentication and server-verified ID tokens. A separately enabled, time-limited temporary access mode is available for hackathon review.

## Requirements

- Java 21 or newer (the backend compiles with `--release 21`; Java 24 is also supported by the current setup)
- Maven 3.9+
- PostgreSQL
- Node.js and npm
- A Firebase project with Email/Password sign-in enabled

## Configure Firebase

1. In Firebase Console, create/register a Web App and enable **Email/Password** under Authentication → Sign-in method.
2. Add `localhost` under Authentication → Settings → Authorized domains. Add the production frontend hostname when deploying.
3. Copy `frontend/.env.example` to `frontend/.env.local` and fill in the Firebase Web App configuration. These are public client configuration values; never put service-account keys in the frontend.
4. For backend token verification, set `FIREBASE_PROJECT_ID` to the same Firebase project ID and configure Google Application Default Credentials. Locally, `gcloud auth application-default login` is preferred. Alternatively, set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON file outside this repository. Never commit that file.

Registration creates a Firebase account; the backend creates the ShareSpace profile on the first verified API request. New profiles receive the `USER` role only. Existing ordinary profiles can be linked by verified email. Existing `OWNER` and `ADMIN` accounts require an administrator to provision the Firebase UID in the trusted `app_users.firebase_uid` column. A client cannot select or claim a privileged role.

## Configure PostgreSQL and run

Create/use the existing `sharespace_db` database and an application role with the required schema permissions. Supply credentials through the local process environment; do not add them to source files:

```powershell
$env:DB_URL='jdbc:postgresql://localhost:5432/sharespace_db'
$env:DB_USER='sharespace'
$env:DB_PASSWORD='your-local-database-password'
$env:FIREBASE_PROJECT_ID='your-firebase-project-id'
$env:FRONTEND_ORIGIN='http://localhost:5173'
$env:JAVA_HOME='C:\Program Files\Java\jdk-24'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
Set-Location backend
& 'C:\Users\Diksh\.m2\wrapper\dists\apache-maven-3.9.16-bin\5grr65jo27hi51sujmtcldfovl\apache-maven-3.9.16\bin\mvn.cmd' spring-boot:run
```

Start the frontend in a second terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

The default API is `http://localhost:8080/api`; the default allowed browser origin is `http://localhost:5173`. Set `FRONTEND_ORIGIN` to the exact UI origin for another environment. `SEED_DEMO_DATA` defaults to `false`; do not enable the optional fictional demo fixture loader for real accounts. The old `X-Demo-User` header is not accepted.

## Temporary hackathon access

**Warning:** this temporary shared identity is only for a short-lived hackathon submission. It is not authentication and is not suitable for production or private data. Every visitor using this mode shares the same backend `USER` profile and can perform actions available to that profile. The backend enforces an expiry; the configured lifetime defaults to 48 hours and cannot exceed 48 hours.

Enable the mode only when needed. Set Render `DEMO_MODE=true`, `DEMO_MODE_ACTIVATED_AT` to the current UTC time in ISO-8601 format (for example `2026-10-30T12:00:00Z`), and `DEMO_MODE_TTL=PT48H`. The activation timestamp is required and does not reset on restart. Render must also have its existing `DB_URL`, `DB_USER`, and `DB_PASSWORD`, plus `FRONTEND_ORIGIN` set to the exact Vercel origin without a trailing slash. Keep `SEED_DEMO_DATA=false`. Firebase Admin initialization is skipped while this mode is enabled.

Set Vercel `VITE_DEMO_MODE=true` and `VITE_API_URL` to the backend base URL ending in `/api`, then rebuild/redeploy the frontend. Firebase web settings are not required in this mode. The browser sends only the explicit `X-ShareSpace-Demo: true` mode marker; the backend resolves a single reserved identity and ignores browser-supplied user IDs. Requests with a Firebase `Authorization` header always use Firebase verification and never fall back to the shared identity.

After the submission, disable the mode on both services (`DEMO_MODE=false` on Render and `VITE_DEMO_MODE=false` on Vercel), remove the activation timestamp, and redeploy. Restore valid Firebase web configuration and the matching Firebase Admin configuration before using normal Firebase access.

## Authentication smoke check

Register in the UI, use the Firebase email verification link, sign out, then sign in again. Use the browser session to call `GET /api/users/me`; the client attaches its Firebase ID token as a bearer token. Request a password reset from **Forgot password?**. Check `API_REFERENCE.md` for protected/public endpoints and status codes. Never log or share ID tokens.

## Verify

```powershell
# Frontend checks (from frontend/)
npm test
npm run build

# Backend tests (from backend/)
$env:JAVA_HOME='C:\Program Files\Java\jdk-24'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
& 'C:\Users\Diksh\.m2\wrapper\dists\apache-maven-3.9.16-bin\5grr65jo27hi51sujmtcldfovl\apache-maven-3.9.16\bin\mvn.cmd' test
```

See [API_REFERENCE.md](API_REFERENCE.md) for the endpoint contract. PostgreSQL schema updates are currently managed by Hibernate; production deployments should use reviewed migrations.

## Remaining operational setup

Real Firebase project credentials, authorized domains, PostgreSQL credentials, and privileged-user UID provisioning are environment/operator responsibilities. Overdue status scheduling, training verification, and profile editing are not implemented.
