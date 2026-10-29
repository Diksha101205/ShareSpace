# Campus inventory and reservations

The optional campus catalog runner is disabled during ordinary application startup. It creates 18 resources and 12 reservations through the existing owner and booking workflow. It does not create or promote user accounts. Two active, Firebase-linked OWNER accounts and one active, linked USER account are required. An administrator must provision owner accounts through the existing account-provisioning process.

The runner refuses to write unless its connection is local PostgreSQL on port 5432 and the current database is `sharespace_db`. It also refuses PostgreSQL superuser connections. Configure `DB_USER` as a dedicated non-superuser role with database CONNECT, schema USAGE, table SELECT/INSERT/UPDATE/DELETE, and sequence USAGE/SELECT/UPDATE privileges. The command below validates the existing JPA schema rather than updating it. `DB_PASSWORD` and `GOOGLE_APPLICATION_CREDENTIALS` must already be available in the PowerShell environment; do not place their values in this file or in source control.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-24'
$env:SPRING_JPA_HIBERNATE_DDL_AUTO = 'validate'
$env:SERVER_PORT = '19091'
& 'C:\Users\Diksh\.m2\wrapper\dists\apache-maven-3.9.16-bin\5grr65jo27hi51sujmtcldfovl\apache-maven-3.9.16\bin\mvn.cmd' `
  -f backend\pom.xml spring-boot:run `
  '-Dspring-boot.run.arguments=--app.campus-seed.enabled=true'
```

After the startup log reports the created counts, stop the process with `Ctrl+C`. A later run sees the reservation purpose keys and makes no changes. If only part of the planned reservations exists, the runner refuses to continue rather than duplicate or alter records.
