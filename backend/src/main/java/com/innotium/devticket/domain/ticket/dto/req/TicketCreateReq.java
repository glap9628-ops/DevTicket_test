package com.innotium.devticket.domain.ticket.dto.req;

import lombok.Data;

import java.time.LocalDate;
import java.util.Map;

@Data
public class TicketCreateReq {
    private Integer ticketType;
    private String title;
    private Boolean isUrgent;
    private String productName;
    /** 플랫폼 구분 (MANAGER | AGENT | ...) — 필수 */
    private String platform;
    /** Error/Bug 식별자 — CI/CD 자동 연동 필드 */
    private String errorBug;
    /** 빌드/버전 번호 — CI/CD 자동 연동 필드 (QA 오류 타입) */
    private String buildVersion;
    /** ECM 업로드 경로 또는 QA 결과 파일 경로 — CI/CD 자동 연동 필드 */
    private String qaFilePath;
    /** 첨부파일 저장명 (POST /v1/attachments 업로드 후 반환된 filename) */
    private String attachmentPath;
    private Map<String, Object> extraFields;

    // ── Phase 1 신규 필드 ────────────────────────────────────────
    /** 요청자가 입력한 희망 완료일 */
    private LocalDate requestedDueDate;
    /** 요청 부서 (프론트에서 user.groupName 자동 주입) */
    private String requestingDept;
}
