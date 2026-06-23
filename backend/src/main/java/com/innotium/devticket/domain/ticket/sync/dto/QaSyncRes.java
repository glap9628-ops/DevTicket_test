package com.innotium.devticket.domain.ticket.sync.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * CI/CD QA 자동 등록 API 전용 응답 DTO.
 * <p>
 * 성공: {@code success=true,  ticketId=<생성된 ID>}
 * 중복: {@code success=false, ticketId=<기존 ID>,   message="Duplicate ticket already exists"}
 * 실패: {@code success=false, ticketId=null,         message=<오류 설명>}
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class QaSyncRes {

    private boolean success;
    private Long    ticketId;
    private String  message;

    /* ── 정적 팩토리 ─────────────────────────────────────── */

    public static QaSyncRes ok(Long ticketId) {
        return QaSyncRes.builder()
                .success(true)
                .ticketId(ticketId)
                .message("QA ticket created successfully")
                .build();
    }

    /** 중복 티켓 감지 — 기존 티켓 ID를 함께 반환한다 */
    public static QaSyncRes duplicate(Long existingTicketId) {
        return QaSyncRes.builder()
                .success(false)
                .ticketId(existingTicketId)
                .message("Duplicate ticket already exists")
                .build();
    }

    public static QaSyncRes fail(String message) {
        return QaSyncRes.builder()
                .success(false)
                .message(message != null ? message : "Invalid request")
                .build();
    }
}
