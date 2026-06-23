package com.innotium.devticket.domain.ticket.dto.res;

import lombok.Data;

import java.time.OffsetDateTime;

@Data
public class TicketHistoryRes {
    private Long id;
    private Integer fromStatus;
    private Integer toStatus;
    private String reason;
    private String changedByName;
    private OffsetDateTime changedAt;
}
