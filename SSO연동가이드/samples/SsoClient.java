package com.example.sso;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * 이노티움 SSO 중앙 집중형 인증 클라이언트 (Java 11+).
 *
 * 의존성: com.fasterxml.jackson.core:jackson-databind
 *
 * 사용:
 *   SsoClient sso = new SsoClient("https://sso.innotium.com", "sso-xxx", "secret-xxx");
 *   JsonNode user = sso.login("kim", "password");
 *   long userId = user.get("userId").asLong();   // FK로 저장
 *   sso.changePassword("kim", "old", "New1!");
 *   JsonNode u = sso.getUser(userId);
 */
public class SsoClient {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final String baseUrl;
    private final String clientId;
    private final String clientSecret;
    private final HttpClient http;

    private volatile String accessToken;
    private volatile Instant expiresAt = Instant.EPOCH;

    public SsoClient(String baseUrl, String clientId, String clientSecret) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.clientId = clientId; this.clientSecret = clientSecret;
        this.http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    }

    private synchronized String token() throws Exception {
        if (accessToken == null || Instant.now().isAfter(expiresAt)) {
            String basic = Base64.getEncoder().encodeToString(
                    (clientId + ":" + clientSecret).getBytes(StandardCharsets.UTF_8));
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/apie/sso/oauth/client-token"))
                    .header("Authorization", "Basic " + basic)
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .timeout(TIMEOUT).build();
            JsonNode body = send(req);
            accessToken = body.get("access_token").asText();
            expiresAt = Instant.now().plusSeconds(body.get("expires_in").asLong() - 60);
        }
        return accessToken;
    }

    // ───── 로그인 검증 ─────
    public JsonNode login(String loginId, String password) throws Exception {
        String payload = "{\"loginId\":" + quote(loginId) + ",\"password\":" + quote(password) + "}";
        return post("/apie/sso/auth/login", payload);
    }

    // ───── 비밀번호 변경 ─────
    public JsonNode changePassword(String loginId, String currentPassword, String newPassword) throws Exception {
        String payload = "{\"loginId\":" + quote(loginId)
                + ",\"currentPassword\":" + quote(currentPassword)
                + ",\"newPassword\":" + quote(newPassword) + "}";
        return post("/apie/sso/auth/password", payload);
    }

    // ───── 조회 ─────
    public JsonNode getUser(long userId) throws Exception {
        return get("/apie/sso/users/" + userId);
    }

    public JsonNode listUsers(String keyword, Long departmentId, String status,
                               int startIndex, int pageSize) throws Exception {
        StringBuilder url = new StringBuilder("/apie/sso/users?startIndex=")
                .append(startIndex).append("&pageSize=").append(pageSize);
        if (keyword != null) url.append("&keyword=").append(urlEncode(keyword));
        if (departmentId != null) url.append("&departmentId=").append(departmentId);
        if (status != null) url.append("&status=").append(status);
        return get(url.toString());
    }

    public JsonNode getDepartment(long departmentId) throws Exception {
        return get("/apie/sso/departments/" + departmentId);
    }

    public JsonNode listDepartments(String keyword, String status,
                                     int startIndex, int pageSize) throws Exception {
        StringBuilder url = new StringBuilder("/apie/sso/departments?startIndex=")
                .append(startIndex).append("&pageSize=").append(pageSize);
        if (keyword != null) url.append("&keyword=").append(urlEncode(keyword));
        if (status != null) url.append("&status=").append(status);
        return get(url.toString());
    }

    // ───── 내부 ─────
    private JsonNode post(String path, String jsonBody) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .header("Authorization", "Bearer " + token())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .timeout(TIMEOUT).build();
        return send(req);
    }

    private JsonNode get(String path) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .header("Authorization", "Bearer " + token())
                .GET().timeout(TIMEOUT).build();
        return send(req);
    }

    private JsonNode send(HttpRequest req) throws Exception {
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        JsonNode body = MAPPER.readTree(res.body().isEmpty() ? "{}" : res.body());
        if (res.statusCode() >= 400) {
            String key = body.has("messageKey") ? body.get("messageKey").asText() : "UNKNOWN";
            throw new SsoApiException(res.statusCode(), key, body);
        }
        return body;
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String urlEncode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    public static class SsoApiException extends RuntimeException {
        public final int statusCode;
        public final String messageKey;
        public final JsonNode body;
        public SsoApiException(int statusCode, String messageKey, JsonNode body) {
            super("SSO API " + statusCode + " " + messageKey);
            this.statusCode = statusCode; this.messageKey = messageKey; this.body = body;
        }
    }

    public static void main(String[] args) throws Exception {
        SsoClient sso = new SsoClient(
                System.getenv().getOrDefault("SSO_BASE_URL", "https://sso.innotium.com"),
                System.getenv("SSO_CLIENT_ID"), System.getenv("SSO_CLIENT_SECRET"));
        if (args.length < 2) { System.out.println("Usage: java SsoClient <loginId> <password>"); return; }
        JsonNode u = sso.login(args[0], args[1]);
        System.out.printf("✅ %s (userId=%d, dept=%s)%n",
                u.get("name").asText(), u.get("userId").asLong(),
                u.get("primaryDepartment").get("departmentName").asText());
    }
}
