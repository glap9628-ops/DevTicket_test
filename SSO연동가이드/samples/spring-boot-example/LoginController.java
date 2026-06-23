package com.example.app.controller;

import com.example.app.sso.SsoVerifyService;
import com.example.app.sso.SsoVerifyService.LoginResult;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 타 시스템의 로그인/비밀번호 변경 컨트롤러 예제.
 *
 * SSO가 비밀번호를 검증하므로, 외부 앱은:
 *  1. 로그인 폼에서 받은 ID/PW를 SSO에 그대로 전달
 *  2. 성공 응답의 userId 등을 자체 세션에 저장
 *  3. 이후 페이지는 자체 세션으로 처리 (SSO 재호출 없음)
 *  4. 비밀번호 변경은 SSO에 위임 → 다른 앱에도 자동 반영
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class LoginController {

    private final SsoVerifyService ssoService;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body, HttpSession session) {
        LoginResult r = ssoService.login(body.get("loginId"), body.get("password"));
        if (!r.success()) {
            return ResponseEntity.status(401).body(Map.of(
                    "error", r.errorKey(),
                    "message", errorMessage(r.errorKey())));
        }

        // 자체 세션에 저장 — 이후 페이지는 SSO 재호출 없이 처리
        session.setAttribute("userId", r.userId());
        session.setAttribute("name", r.name());
        session.setAttribute("employeeNo", r.employeeNo());
        session.setAttribute("primaryDepartmentId", r.primaryDepartmentId());
        session.setAttribute("primaryDepartmentName", r.primaryDepartmentName());

        return ResponseEntity.ok(Map.of(
                "userId", r.userId(),
                "name", r.name(),
                "primaryDepartmentName", r.primaryDepartmentName()
        ));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.ok(Map.of("loggedOut", true));
    }

    /** 비밀번호 변경 — SSO에 위임 (변경 즉시 전 앱에 반영) */
    @PostMapping("/password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, String> body, HttpSession session) {
        String loginId = (String) session.getAttribute("loginId");
        if (loginId == null) {
            loginId = body.get("loginId"); // 세션에 없으면 body에서
        }
        try {
            ssoService.changePassword(loginId, body.get("currentPassword"), body.get("newPassword"));
            return ResponseEntity.ok(Map.of("changed", true));
        } catch (RuntimeException e) {
            return ResponseEntity.status(400).body(Map.of("error", e.getMessage()));
        }
    }

    private String errorMessage(String key) {
        return switch (key) {
            case "ACCOUNT_NOT_FOUND", "INVALID_CREDENTIALS" -> "아이디 또는 비밀번호가 올바르지 않습니다.";
            case "ACCOUNT_DISABLED" -> "비활성 계정입니다. 관리자에게 문의하세요.";
            case "ACCOUNT_LOCKED"   -> "로그인 실패가 여러 번 반복되어 계정이 잠겼습니다.";
            default                  -> "인증 실패";
        };
    }
}
