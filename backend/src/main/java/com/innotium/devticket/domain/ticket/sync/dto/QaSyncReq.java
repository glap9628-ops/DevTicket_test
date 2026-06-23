package com.innotium.devticket.domain.ticket.sync.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * CI/CD → DevTicket QA 오류 자동 등록 요청 DTO
 */
@Data
public class QaSyncReq {

    /** 티켓 제목 (필수, 200자 이하) */
    @NotBlank(message = "title은 필수입니다")
    @Size(max = 200, message = "title은 200자 이하여야 합니다")
    private String title;

    /** 제품명 (선택, 50자 이하) */
    @Size(max = 50, message = "productName은 50자 이하여야 합니다")
    private String productName;

    /** 플랫폼 — MANAGER 또는 AGENT 만 허용 (대소문자 무관) */
    @NotBlank(message = "platform은 필수입니다")
    @Pattern(
        regexp = "(?i)MANAGER|AGENT",
        message = "platform은 MANAGER 또는 AGENT만 허용됩니다"
    )
    private String platform;

    /** 오류/버그 설명 (선택) */
    private String errorBug;

    /**
     * 티켓 유형 — 반드시 1(QA 오류) 이어야 한다.
     * 값 정합성은 서비스 계층에서 이중 검증.
     */
    @NotNull(message = "ticketType은 필수입니다")
    private Integer ticketType;

    /** 빌드/버전 식별자 (필수, 100자 이하) */
    @NotBlank(message = "buildVersion은 필수입니다")
    @Size(max = 100, message = "buildVersion은 100자 이하여야 합니다")
    private String buildVersion;

    /** QA 결과 파일 경로 또는 ECM 경로 (선택) */
    private String qaFilePath;
}
