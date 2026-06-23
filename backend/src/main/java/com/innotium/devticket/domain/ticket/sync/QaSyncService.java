package com.innotium.devticket.domain.ticket.sync;

import com.innotium.devticket.common.auth.CurrentUser;
import com.innotium.devticket.common.auth.UserContextHolder;
import com.innotium.devticket.common.exception.FailException;
import com.innotium.devticket.domain.ticket.model.Ticket;
import com.innotium.devticket.domain.ticket.model.TicketHistory;
import com.innotium.devticket.domain.ticket.model.TicketStatus;
import com.innotium.devticket.domain.ticket.model.TicketType;
import com.innotium.devticket.domain.ticket.repository.TicketRepository;
import com.innotium.devticket.domain.ticket.sync.dto.QaSyncReq;
import com.innotium.devticket.domain.ticket.sync.dto.QaSyncRes;
import com.innotium.devticket.domain.ticket.sync.exception.DuplicateTicketException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CI/CD QA 오류 자동 등록 서비스.
 *
 * <pre>
 * 처리 순서
 *  1. ticketType == 1 검증 (QA 오류 전용 API)
 *  2. platform 정규화 (대문자)
 *  3. buildVersion + title 중복 확인 → DuplicateTicketException
 *  4. ticketNo 채번 (QA-NNNN)
 *  5. dts_tickets INSERT
 *  6. dts_ticket_history INSERT
 * </pre>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class QaSyncService {

    private static final Integer QA_TICKET_TYPE   = 1;
    private static final String  REQUESTER_NAME   = "CI/CD System";

    private final TicketRepository ticketRepository;

    /**
     * QA 오류 티켓을 생성하고 결과를 반환한다.
     *
     * @throws FailException            ticketType != 1
     * @throws DuplicateTicketException 동일 buildVersion + title 티켓 존재
     */
    @Transactional
    public QaSyncRes createQaTicket(QaSyncReq req) {

        // ── 1. ticketType 이중 검증 (Validation 레이어 우회 방어) ─────────────
        if (!QA_TICKET_TYPE.equals(req.getTicketType())) {
            throw new FailException("ticketType은 1(QA 오류)만 허용됩니다.");
        }

        // ── 2. 필드 정규화 ────────────────────────────────────────────────────
        String title        = req.getTitle().trim();
        String platform     = req.getPlatform().trim().toUpperCase();
        String buildVersion = req.getBuildVersion().trim();
        String productName  = req.getProductName()  != null ? req.getProductName().trim()  : null;
        String errorBug     = req.getErrorBug()     != null ? req.getErrorBug().trim()     : null;
        String qaFilePath   = req.getQaFilePath()   != null ? req.getQaFilePath().trim()   : null;

        // ── 3. 중복 등록 방지 ─────────────────────────────────────────────────
        Long duplicateId = ticketRepository.findDuplicateId(buildVersion, title);
        if (duplicateId != null) {
            log.warn("[QA_SYNC] Duplicate detected – buildVersion={}, title={}, existingId={}",
                    buildVersion, title, duplicateId);
            throw new DuplicateTicketException(duplicateId);
        }

        // ── 4. ticketNo 채번: QA-0001 형식 ───────────────────────────────────
        Long seq      = ticketRepository.selectNextSeq();
        String ticketNo = TicketType.QA.getPrefix() + "-" + String.format("%04d", seq);

        // ── 5. Ticket 생성 ────────────────────────────────────────────────────
        CurrentUser user = UserContextHolder.get();

        Ticket ticket = new Ticket();
        ticket.setTicketNo(ticketNo);
        ticket.setTicketType(QA_TICKET_TYPE);
        ticket.setTitle(title);
        ticket.setStatus(TicketStatus.PENDING_REVIEW.getCode());
        ticket.setIsUrgent(false);
        ticket.setProductName(productName);
        ticket.setPlatform(platform);
        ticket.setErrorBug(errorBug);
        ticket.setBuildVersion(buildVersion);
        ticket.setQaFilePath(qaFilePath);
        ticket.setRequesterId(user.getId());
        ticket.setRequesterName(REQUESTER_NAME);

        ticketRepository.insertTicket(ticket);  // useGeneratedKeys → ticket.getId() 채워짐

        // ── 6. 이력 기록 ──────────────────────────────────────────────────────
        TicketHistory history = new TicketHistory();
        history.setTicketId(ticket.getId());
        history.setFromStatus(null);
        history.setToStatus(TicketStatus.PENDING_REVIEW.getCode());
        history.setReason("CI/CD 자동 등록");
        history.setChangedById(user.getId());
        history.setChangedByName(REQUESTER_NAME);
        ticketRepository.insertHistory(history);

        log.info("[QA_SYNC] Created – id={}, ticketNo={}, buildVersion={}, platform={}",
                ticket.getId(), ticketNo, buildVersion, platform);

        return QaSyncRes.ok(ticket.getId());
    }
}
