package com.innotium.devticket.common.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * CI/CD Sync API 전용 API Key 인증 인터셉터.
 *
 * <p>적용 경로: {@code /v1/**}  (WebMvcConfig 에서 등록)
 *
 * <p>클라이언트는 요청 헤더에 {@code X-Api-Key: <key>} 를 포함해야 한다.
 *
 * <p>환경변수 {@code SYNC_API_KEY} 로 키 값을 주입한다.
 * 기본값은 {@code dev-sync-key-change-me} 이며 운영 배포 전 반드시 변경해야 한다.
 */
@Slf4j
// API Key 방식 미사용 — system 계정 JWT 쿠키 방식으로 전환됨
// @Component
public class ApiKeyInterceptor implements HandlerInterceptor {

    private static final String HEADER_NAME = "X-Api-Key";

    @Value("${app.sync.api-key}")
    private String expectedApiKey;

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {

        String provided = request.getHeader(HEADER_NAME);

        if (provided == null || provided.isBlank()) {
            log.warn("[API_KEY] Missing header – uri={} ip={}",
                    request.getRequestURI(), request.getRemoteAddr());
            writeUnauthorized(response, "X-Api-Key header is required");
            return false;
        }

        if (!expectedApiKey.equals(provided)) {
            log.warn("[API_KEY] Invalid key – uri={} ip={}",
                    request.getRequestURI(), request.getRemoteAddr());
            writeUnauthorized(response, "Invalid API key");
            return false;
        }

        return true;
    }

    private void writeUnauthorized(HttpServletResponse response, String message) throws Exception {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(
                "{\"success\":false,\"ticketId\":null,\"message\":\"" + message + "\"}"
        );
    }
}
