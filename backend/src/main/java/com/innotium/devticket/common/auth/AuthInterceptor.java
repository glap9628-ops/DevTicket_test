package com.innotium.devticket.common.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Nginx auth_request 로부터 전달받은 X-ERP-* 헤더를 파싱해 CurrentUser를 설정한다.
 *
 * 역할 매핑:
 *   auth.role = admin                           → ADMIN  (어느 팀이든)
 *   group_id  가 기술연구소/DevOps 그룹         → DEVELOPER  (GroupRoleResolver 참조)
 *   group_id  기타                              → REQUESTER
 */
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    @Value("${app.auth.enabled:true}")
    private boolean authEnabled;

    private final GroupRoleResolver groupRoleResolver;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!authEnabled) {
            UserContextHolder.set(CurrentUser.builder()
                    .id(0L).username("dev").displayName("개발자").role("ADMIN").groupId(1).groupName("개발팀")
                    .build());
            return true;
        }

        String userIdHeader = request.getHeader("X-ERP-User-Id");
        if (userIdHeader == null || userIdHeader.isBlank()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"statusCode\":401,\"message\":\"인증이 필요합니다.\",\"data\":null,\"detail\":null}");
            return false;
        }

        String authRole = request.getHeader("X-ERP-User-Role");   // "admin" or "user"
        Integer groupId = parseIntOrNull(request.getHeader("X-ERP-User-Group-Id"));
        String devRole = resolveDevRole(authRole, groupId);

        UserContextHolder.set(CurrentUser.builder()
                .id(parseLongOrDefault(userIdHeader, 0L))
                .username(request.getHeader("X-ERP-User-Username"))
                .displayName(decode(request.getHeader("X-ERP-Display-Name")))
                .role(devRole)
                .groupId(groupId)
                .groupName(decode(request.getHeader("X-ERP-User-Group-Name")))
                .build());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserContextHolder.clear();
    }

    private String resolveDevRole(String authRole, Integer groupId) {
        if ("admin".equals(authRole)) return "ADMIN";
        if (groupId == null) return "REQUESTER";
        if (groupRoleResolver.isDeveloperGroup(groupId)) return "DEVELOPER";
        return "REQUESTER";
    }

    private Long parseLongOrDefault(String value, Long defaultValue) {
        if (value == null || value.isBlank()) return defaultValue;
        try { return Long.parseLong(value.trim()); } catch (NumberFormatException e) { return defaultValue; }
    }

    private Integer parseIntOrNull(String value) {
        if (value == null || value.isBlank()) return null;
        try { return Integer.parseInt(value.trim()); } catch (NumberFormatException e) { return null; }
    }

    private String decode(String value) {
        if (value == null) return null;
        try { return java.net.URLDecoder.decode(value, java.nio.charset.StandardCharsets.UTF_8); }
        catch (Exception e) { return value; }
    }
}
