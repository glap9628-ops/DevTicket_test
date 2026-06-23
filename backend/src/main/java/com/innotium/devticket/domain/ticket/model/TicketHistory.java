package com.innotium.devticket.domain.ticket.model;

import lombok.Data;

import java.time.OffsetDateTime;

@Data
public class TicketHistory {
    private Long id;
    private Long ticketId;
    private Integer fromStatus;
    private Integer toStatus;
    private String reason;
    private Long changedById;
    private String changedByName;
    private OffsetDateTime changedAt;
}
