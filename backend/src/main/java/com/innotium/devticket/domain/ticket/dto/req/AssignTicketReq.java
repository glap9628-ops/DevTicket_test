package com.innotium.devticket.domain.ticket.dto.req;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AssignTicketReq {
    @NotNull
    private Long assigneeId;
}
