package com.example.app.sso;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * 외부 Spring Boot 앱에서 이노티움 SSO로 로그인 검증/비밀번호 변경을 수행하는 서비스.
 *
 * application.yml:
 *   sso:
 *     base-url: https://sso.innotium.com
 *     client-id: sso-xxxxxxxx
 *     client-secret: xxxxxxxx-xxxx-xxxx-xxxx
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SsoVerifyService {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    @Value("${sso.base-url}")        private String baseUrl;
    @Value("${sso.client-id}")       private String clientId;
    @Value("${sso.client-secret}")   private String clientSecret;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    private volatile String accessToken;
    private volatile Instant expiresAt = Instant.EPOCH;

    // ──────── 토큰 관리 ────────
    private synchronized String token() {
        if (accessToken == null || Instant.now().isAfter(expiresAt)) {
            try {
                String basic = Base64.getEncoder().encodeToString(
                        (clientId + ":" + clientSecret).getBytes(StandardCharsets.UTF_8));
                HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/apie/sso/oauth/client-token"))
                        .header("Authorization", "Basic " + basic)
                        .POST(HttpRequest.BodyPublishers.noBody())
                        .timeout(TIMEOUT).build();
                HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() != 200) throw new RuntimeException("SSO token failed: " + res.statusCode());
                JsonNode b = MAPPER.readTree(res.body());
                this.accessToken = b.get("access_token").asText();
                this.expiresAt = Instant.now().plusSeconds(b.get("expires_in").asLong() - 60);
            } catch (Exception e) { throw new RuntimeException("SSO token error", e); }
        }
        return accessToken;
    }

    // ──────── 로그인 검증 ────────
    public LoginResult login(String loginId, String password) {
        try {
            String payload = "{\"loginId\":" + quote(loginId) + ",\"password\":" + quote(password) + "}";
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/apie/sso/auth/login"))
                    .header("Authorization", "Bearer " + token())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                    .timeout(TIMEOUT).build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode b = MAPPER.readTree(res.body().isEmpty() ? "{}" : res.body());
            if (res.statusCode() >= 400) {
                return LoginResult.fail(b.has("messageKey") ? b.get("messageKey").asText() : "UNKNOWN");
            }
            long userId = b.get("userId").asLong();
            long primaryDeptId = b.get("primaryDepartment").get("departmentId").asLong();
            return LoginResult.ok(userId,
                    b.get("name").asText(),
                    b.get("employeeNo").asText(),
                    b.get("email").asText(),
                    primaryDeptId,
                    b.get("primaryDepartment").get("departmentName").asText());
        } catch (Exception e) { throw new RuntimeException("SSO login error", e); }
    }

    // ──────── 비밀번호 변경 ────────
    public boolean changePassword(String loginId, String currentPassword, String newPassword) {
        try {
            String payload = "{\"loginId\":" + quote(loginId)
                    + ",\"currentPassword\":" + quote(currentPassword)
                    + ",\"newPassword\":" + quote(newPassword) + "}";
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/apie/sso/auth/password"))
                    .header("Authorization", "Bearer " + token())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                    .timeout(TIMEOUT).build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (res.statusCode() >= 400) {
                JsonNode b = MAPPER.readTree(res.body().isEmpty() ? "{}" : res.body());
                throw new RuntimeException("Password change failed: " + b.path("messageKey").asText());
            }
            return true;
        } catch (RuntimeException re) { throw re; }
        catch (Exception e) { throw new RuntimeException("SSO password error", e); }
    }

    // ──────── 사용자 조회 (화면 렌더링에 필요 시) ────────
    public JsonNode getUser(long userId) {
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/apie/sso/users/" + userId))
                    .header("Authorization", "Bearer " + token())
                    .GET().timeout(TIMEOUT).build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (res.statusCode() >= 400) return null;
            return MAPPER.readTree(res.body());
        } catch (Exception e) { return null; }
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    public record LoginResult(boolean success, Long userId, String name, String employeeNo,
                               String email, Long primaryDepartmentId, String primaryDepartmentName,
                               String errorKey) {
        public static LoginResult ok(long userId, String name, String empNo, String email,
                                      long deptId, String deptName) {
            return new LoginResult(true, userId, name, empNo, email, deptId, deptName, null);
        }
        public static LoginResult fail(String key) {
            return new LoginResult(false, null, null, null, null, null, null, key);
        }
    }
}
