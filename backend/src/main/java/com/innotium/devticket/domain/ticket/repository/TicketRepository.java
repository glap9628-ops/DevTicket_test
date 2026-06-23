package com.innotium.devticket.domain.ticket.repository;

import com.innotium.devticket.domain.ticket.dto.req.TicketSearchReq;
import com.innotium.devticket.domain.ticket.dto.res.TicketHistoryRes;
import com.innotium.devticket.domain.ticket.dto.res.TicketSummaryRes;
import com.innotium.devticket.domain.ticket.model.Ticket;
import com.innotium.devticket.domain.ticket.model.TicketHistory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

@Mapper
public interface TicketRepository {

    void insertTicket(Ticket ticket);

    Long selectNextSeq();

    Ticket selectById(Long id);

    List<TicketSummaryRes> selectList(TicketSearchReq req);

    int countList(TicketSearchReq req);

    void updateTicket(@Param("id") Long id,
                      @Param("title") String title,
                      @Param("isUrgent") Boolean isUrgent,
                      @Param("productName") String productName,
                      @Param("platform") String platform,
                      @Param("errorBug") String errorBug,
                      @Param("buildVersion") String buildVersion,
                      @Param("qaFilePath") String qaFilePath,
                      @Param("extraFields") String extraFields,
                      @Param("requestedDueDate") java.time.LocalDate requestedDueDate,
                      @Param("requestingDept") String requestingDept);

    void updateStatus(@Param("id") Long id,
                      @Param("status") Integer status,
                      @Param("assigneeId") Long assigneeId,
                      @Param("assigneeName") String assigneeName,
                      @Param("completedAt") OffsetDateTime completedAt);

    /** 관리자 평가 항목 + 상태 갱신 */
    void updateReview(@Param("id") Long id,
                      @Param("status") Integer status,
                      @Param("difficulty") Integer difficulty,
                      @Param("expectedEffort") BigDecimal expectedEffort,
                      @Param("effortUnit") String effortUnit,
                      @Param("priority") Integer priority,
                      @Param("reviewedById") Long reviewedById,
                      @Param("reviewedByName") String reviewedByName,
                      @Param("desiredDueDate") java.time.LocalDate desiredDueDate);

    /** 관리자 담당자 지정: assignee 교체, status != null이면 status도 갱신 */
    void updateAssignee(@Param("id") Long id,
                        @Param("assigneeId") Long assigneeId,
                        @Param("assigneeName") String assigneeName,
                        @Param("status") Integer status);

    /** 담당자만 초기화한다 (재오픈 시 사용) */
    void clearAssignee(@Param("id") Long id);

    /** 픽업 취소: 상태를 진행가능(READY)으로 되돌리고 담당자를 초기화한다 */
    void cancelPickup(@Param("id") Long id);

    /** 긴급 여부만 업데이트 */
    void updateUrgent(@Param("id") Long id, @Param("isUrgent") Boolean isUrgent);

    /** 티켓 삭제 시 히스토리 전체 삭제 */
    void deleteHistoryByTicketId(Long id);

    /** 티켓 삭제 (관리자 전용) */
    void deleteTicket(Long id);

    List<TicketHistoryRes> selectHistoryByTicketId(Long ticketId);

    void insertHistory(TicketHistory history);

    /**
     * CI/CD 중복 등록 방지용 조회.
     */
    Long findDuplicateId(@Param("buildVersion") String buildVersion,
                         @Param("title") String title);

    /**
     * DevOps 장애 이슈 중복 등록 방지용 조회 (incidentId 기준).
     */
    Long findDevopsDuplicateByIncidentId(@Param("incidentId") String incidentId);
}
