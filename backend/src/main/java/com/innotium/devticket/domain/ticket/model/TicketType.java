package com.innotium.devticket.domain.ticket.model;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum TicketType {
    QA(1, "QA"),           // QA 오류      — QA 단계 테스트/검증 이슈
    DEVOPS(2, "BUG"),      // 장애/오류    — 기능 오동작, 버그 신고
    DEV(3, "DEV"),         // 기능요청/개선 — 신규 기능 개발 또는 기존 기능 개선
    VENDOR(4, "OPS"),      // 고객요청     — 고객사 요청사항 접수 및 대응
    MAINTENANCE(5, "MNT"); // 유지보수     — 레거시 (신규 등록 불가)

    private final int code;
    private final String prefix;

    public static TicketType fromCode(int code) {
        for (TicketType t : values()) {
            if (t.code == code) return t;
        }
        throw new IllegalArgumentException("Unknown TicketType code: " + code);
    }
}
