# MTA API (`backend/`)

Spring Boot 4.1 · Java 21 · Spring Security (JWT) · Spring Data JPA · Flyway · H2 (dev) / PostgreSQL (prod).

```bash
./mvnw spring-boot:run      # API on :8080, dev profile (in-memory H2, demo data)
./mvnw test                 # full journey tests on H2
./mvnw -DskipTests package  # target/iha-api-0.0.1-SNAPSHOT.jar
```

On a machine with only JDK 17, add `-Djava.version=17` to each command.

- Code: `src/main/java/com/iha/<feature>/` — see the [backend guide](../documentation/backend.md).
- Endpoints: [API reference](../documentation/api-reference.md).
- Schema and lifecycles: [data model](../documentation/data-model.md).
- Production settings: [deployment](../documentation/deployment.md).
