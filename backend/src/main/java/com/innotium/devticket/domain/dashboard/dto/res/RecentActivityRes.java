package com.innotium.devticket.domain.dashboard.dto.res;

import lombok.Data;
import java.time.OffsetDateTime;

@Data
public class RecentActivityRes {
    private Long ticketId;
    private String ticketNo;
    private String title;
    private Integer fromStatus;
    private Integer toStatus;
    private String changedByName;
    private OffsetDateTime changedAt;
}
