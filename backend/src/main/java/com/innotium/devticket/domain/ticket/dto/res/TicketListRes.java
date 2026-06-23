package com.innotium.devticket.domain.ticket.dto.res;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class TicketListRes {
    private List<TicketSummaryRes> content;
    private int totalCount;
    private int page;
    private int size;
}
