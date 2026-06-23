package com.innotium.devticket.domain.ticket.model;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * 티켓 상태 코드 정의
 *
 * 흐름:
 *   PENDING_REVIEW(1) → REVIEW_DONE(2) → READY(3) → IN_PROGRESS(4) → QA_REVIEW(5) → DONE(6)
 *                     ↘ REJECTED(8)   ↘ REJECTED(8)  ↘ ON_HOLD(7)
 */
@Getter
@RequiredArgsConstructor
public enum TicketStatus {
    PENDING_REVIEW(1),   // 검토대기  (기본값, 티켓 등록 시)
    REVIEW_DONE(2),      // 검토완료  (관리자 검토 완료)
    READY(3),            // 픽업대기  (개발자 픽업 허용)
    IN_PROGRESS(4),      // 진행중    (개발자 픽업 후)
    QA_REVIEW(5),        // QA검증    (QA 검증 중)
    DONE(6),             // 완료
    ON_HOLD(7),          // 보류
    REJECTED(8);         // 반려

    private final int code;

    public static TicketStatus fromCode(int code) {
        for (TicketStatus s : values()) {
            if (s.code == code) return s;
        }
        throw new IllegalArgumentException("Unknown TicketStatus code: " + code);
    }
}
