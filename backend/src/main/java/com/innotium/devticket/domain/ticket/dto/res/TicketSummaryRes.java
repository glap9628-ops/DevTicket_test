package com.innotium.devticket.domain.ticket.dto.res;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Data
public class TicketSummaryRes {
    private Long id;
    private String ticketNo;
    private Integer ticketType;
    private String title;
    private Integer status;
    private Boolean isUrgent;
    private String productName;
    private String platform;
    private String errorBug;
    private String buildVersion;
    private String qaFilePath;
    private String attachmentPath;
    private String requesterName;
    private Long assigneeId;
    private String assigneeName;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;

    // Phase 1 신규 필드
    private LocalDate requestedDueDate;
    private LocalDate desiredDueDate;
    private String requestingDept;
    /** 난이도: 1=하, 2=중, 3=상 */
    private Integer difficulty;
    /** 우선순위: 1=낮음, 2=보통, 3=높음, 4=긴급 */
    private Integer priority;
    /** 예상 공수 */
    private BigDecimal expectedEffort;
    /** 공수 단위: HOUR | MD */
    private String effortUnit;
}
