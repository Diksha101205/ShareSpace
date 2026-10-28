# Database

PostgreSQL is configured through `DB_URL`, `DB_USER`, and `DB_PASSWORD`. Hibernate creates and updates the relational tables from the JPA entities (`backend/src/main/java/edu/sharespace/Domain.java`). The repeatable fictional sample user/resource seed is opt-in with `SEED_DEMO_DATA=true`.

Before deployment, replace `ddl-auto: update` with reviewed schema migrations and deploy with `DEMO_MODE=false` plus authenticated identity integration.
