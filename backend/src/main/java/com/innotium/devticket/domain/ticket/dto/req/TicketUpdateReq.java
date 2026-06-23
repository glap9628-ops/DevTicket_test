package com.innotium.devticket.domain.ticket.dto.req;

import lombok.Data;

import java.time.LocalDate;
import java.util.Map;

@Data
public class TicketUpdateReq {
    private String title;
    private Boolean isUrgent;
    private String productName;
    /** 플랫폼 구분 (MANAGER | AGENT | ...) */
    private String platform;
    /** Error/Bug 식별자 */
    private String errorBug;
    /** 빌드/버전 번호 */
    private String buildVersion;
    /** ECM 업로드 경로 또는 QA 결과 파일 경로 */
    private String qaFilePath;
    private Map<String, Object> extraFields;
    private LocalDate requestedDueDate;
    private String requestingDept;
}
