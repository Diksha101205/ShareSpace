# ShareSpace

ShareSpace is a React/Vite client and Spring Boot/PostgreSQL API for sharing campus resources. Firebase Authentication handles email/password identity; the API verifies Firebase ID tokens and enforces ShareSpace profile ownership and roles.

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
