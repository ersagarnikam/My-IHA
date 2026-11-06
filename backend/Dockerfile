# API image. Build context: backend/
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q -DskipTests package

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 iha && mkdir -p /data/storage && chown -R iha /data
WORKDIR /app
COPY --from=build /src/target/iha-api-*.jar app.jar
USER iha
ENV SPRING_PROFILES_ACTIVE=prod IHA_STORAGE_ROOT=/data/storage
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
