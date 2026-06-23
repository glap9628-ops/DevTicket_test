FROM eclipse-temurin:17-jdk AS builder
WORKDIR /app
COPY . .
RUN sed -i 's/\r//' gradlew && chmod +x gradlew && ./gradlew clean bootJar -x test

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "app.jar"]
