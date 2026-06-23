package com.innotium.devticket.domain.ticket.sync.exception;

import lombok.Getter;

/**
 * 동일 buildVersion + title 조합의 티켓이 이미 존재할 때 발생.
 * 컨트롤러 레벨 핸들러가 {@code 409 Conflict} 로 응답한다.
 */
@Getter
public class DuplicateTicketException extends RuntimeException {

    private final Long existingTicketId;

    public DuplicateTicketException(Long existingTicketId) {
        super("Duplicate QA ticket: existingId=" + existingTicketId);
        this.existingTicketId = existingTicketId;
    }
}
