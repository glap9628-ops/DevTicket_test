package com.innotium.devticket.domain.ticket.dto.req;

import lombok.Data;

@Data
public class TicketStatusChangeReq {
    private Integer status;
    private String reason;
}
