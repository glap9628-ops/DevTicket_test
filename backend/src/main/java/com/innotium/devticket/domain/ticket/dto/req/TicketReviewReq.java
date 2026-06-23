package com.innotium.devticket.domain.ticket.dto.req;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 관리자 티켓 검토/평가 요청 DTO
 * PUT /tickets/{id}/review
 */
@Data
public class TicketReviewReq {
    /** 변경할 상태 (2=검토완료, 3=진행가능, 8=반려) */
    private Integer status;
    /** 사유 (반려 시 필수) */
    private String reason;

    /** 난이도: 1=하, 2=중, 3=상 */
    private Integer difficulty;
    /** 예상 공수 */
    private BigDecimal expectedEffort;
    /** 공수 단위: HOUR | MD */
    private String effortUnit;
    /** 우선순위: 1=낮음, 2=보통, 3=높음, 4=긴급 */
    private Integer priority;
    /** 희망 완료일 (관리자 평가 수정 시 선택적으로 변경 가능) */
    private LocalDate desiredDueDate;
}
