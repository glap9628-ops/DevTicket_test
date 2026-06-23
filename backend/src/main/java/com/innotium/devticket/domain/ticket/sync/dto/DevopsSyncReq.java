package com.innotium.devticket.domain.ticket.sync.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * DevOps 장애이슈 관리 시스템 → DevTicket 자동 등록 요청 DTO
 *
 * <p>인증: HTTP Header {@code X-Api-Key: {DEVOPS_API_KEY}}
 *
 * <pre>
 * [필수]
 *   requesterName   - DevOps 팀 1차 배정자 이름 (티켓 요청자로 표시)
 *   title           - 장애 이슈 제목 (티켓 목록에 표시되는 이름)
 *   productName     - 장애가 발생한 제품명 (허용값 목록 참조)
 *   platform        - 장애가 발생한 플랫폼 구분 (MANAGER / AGENT)
 *   incidentVendor  - 장애 발생 업체명
 *   incidentContent - 장애 증상 및 원인, 재현 방법 등 상세 내용
 *
 * [선택]
 *   attachmentPath  - 첨부파일 (POST /v1/attachments 업로드 후 반환된 filename, 20MB 이하)
 * </pre>
 */
@Data
public class DevopsSyncReq {

    /**
     * DevOps 팀 1차 배정자 이름. 티켓 요청자 필드에 표시된다.
     */
    @NotBlank(message = "requesterName은 필수입니다")
    @Size(max = 50, message = "requesterName은 50자 이하여야 합니다")
    private String requesterName;

    /**
     * 장애 이슈 제목. 200자 이내.
     * 저장 시 "[업체명] " 이 앞에 자동으로 붙는다.
     */
    @NotBlank(message = "title은 필수입니다")
    @Size(max = 200, message = "title은 200자 이하여야 합니다")
    private String title;

    /**
     * 장애가 발생한 제품명. 아래 허용값 중 하나를 정확히 입력해야 한다.
     *
     * 허용값:
     *   innoECM / SecureZone / nPouch / innoMark / RansomCruncher / LizardBackup / innoLog / 기타
     */
    @NotBlank(message = "productName은 필수입니다")
    @Pattern(
        regexp = "innoECM|SecureZone|nPouch|innoMark|RansomCruncher|LizardBackup|innoLog|기타",
        message = "productName은 허용된 제품명만 사용 가능합니다: innoECM, SecureZone, nPouch, innoMark, RansomCruncher, LizardBackup, innoLog, 기타"
    )
    private String productName;

    /**
     * 장애 발생 플랫폼 구분.
     * MANAGER: 관리자 앱(웹/데스크톱)에서 발생한 장애
     * AGENT:   에이전트 앱(설치형 클라이언트)에서 발생한 장애
     */
    @NotBlank(message = "platform은 필수입니다")
    @Pattern(
        regexp = "(?i)MANAGER|AGENT",
        message = "platform은 MANAGER 또는 AGENT만 허용됩니다"
    )
    private String platform;

    /**
     * 장애업체.
     * 장애가 발생한 고객사 또는 관련 업체명을 입력한다.
     * 예: "인노티움 내부", "KT 클라우드", "AWS ap-northeast-2"
     */
    @NotBlank(message = "incidentVendor는 필수입니다")
    @Size(max = 100, message = "incidentVendor는 100자 이하여야 합니다")
    private String incidentVendor;

    /**
     * 장애내용.
     * 장애 증상, 발생 시각, 영향 범위, 재현 방법, 1·2차 확인 결과 등을 상세히 기술한다.
     * 마크다운 형식 사용 가능.
     */
    @NotBlank(message = "incidentContent는 필수입니다")
    @Size(max = 2000, message = "incidentContent는 2000자 이하여야 합니다")
    private String incidentContent;

    /**
     * 첨부파일 저장명. POST /v1/attachments 로 파일 업로드 후 반환된 filename 값을 사용한다.
     * 선택 필드. 파일 크기는 업로드 시 20MB 이하 제한이 적용된다.
     */
    private String attachmentPath;
}
