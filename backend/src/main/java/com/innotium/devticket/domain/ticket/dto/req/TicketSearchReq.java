package com.innotium.devticket.domain.ticket.dto.req;

import lombok.Data;

@Data
public class TicketSearchReq {
    private Integer ticketType;
    private Integer status;
    private String dateFrom;
    private String dateTo;
    private Long assigneeId;
    private Long requesterId;
    private Boolean isUrgent;
    private String keyword;
    private String productName;
    /** 플랫폼 필터 (MANAGER | AGENT | ...) */
    private String platform;
    /** 빌드버전 필터 */
    private String buildVersion;
    /** 난이도 필터: 1=하, 2=중, 3=상 */
    private Integer difficulty;
    /** 우선순위 필터: 1=낮음, 2=보통, 3=높음, 4=긴급 */
    private Integer priority;
    private int page = 1;
    private int size = 20;

    public int getOffset() {
        return (page - 1) * size;
    }
}
