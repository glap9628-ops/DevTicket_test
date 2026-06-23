package com.innotium.devticket.domain.ticket.model;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Data
public class Ticket {
    private Long id;
    private String ticketNo;
    private Integer ticketType;
    private String title;
    private Integer status;
    private Boolean isUrgent;
    private String productName;
    private Long requesterId;
    private String requesterName;
    private Long assigneeId;
    private String assigneeName;
    private String platform;
    private String errorBug;
    private String buildVersion;
    private String qaFilePath;
    private String attachmentPath;
    private String extraFields;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
    private OffsetDateTime completedAt;

    // ── Phase 1 신규 필드 ────────────────────────────────────────
    /** 요청자가 등록 시 입력한 희망 완료일 */
    private LocalDate requestedDueDate;
    /** 관리자가 검토 후 확정한 완료일 */
    private LocalDate desiredDueDate;
    /** 요청 부서 (요청자 소속 — 자동 입력) */
    private String requestingDept;

    // ── 관리자 평가 항목 (관리자 전용) ───────────────────────────
    /** 난이도: 1=하, 2=중, 3=상 */
    private Integer difficulty;
    /** 예상 공수 */
    private BigDecimal expectedEffort;
    /** 공수 단위: HOUR | MD */
    private String effortUnit;
    /** 우선순위: 1=낮음, 2=보통, 3=높음, 4=긴급 */
    private Integer priority;
    /** 검토 담당자 */
    private Long reviewedById;
    private String reviewedByName;
    private OffsetDateTime reviewedAt;
}
