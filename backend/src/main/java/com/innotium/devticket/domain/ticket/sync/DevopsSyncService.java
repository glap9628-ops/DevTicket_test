package com.innotium.devticket.domain.ticket.sync;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.innotium.devticket.common.auth.CurrentUser;
import com.innotium.devticket.common.auth.UserContextHolder;
import com.innotium.devticket.domain.ticket.model.Ticket;
import com.innotium.devticket.domain.ticket.model.TicketHistory;
import com.innotium.devticket.domain.ticket.model.TicketStatus;
import com.innotium.devticket.domain.ticket.model.TicketType;
import com.innotium.devticket.domain.ticket.repository.TicketRepository;
import com.innotium.devticket.domain.ticket.sync.dto.DevopsSyncReq;
import com.innotium.devticket.domain.ticket.sync.dto.DevopsSyncRes;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

/**
 * DevOps 장애이슈 자동 등록 서비스.
 *
 * <pre>
 * 처리 순서
 *  1. ticketNo 채번 (BUG-NNNN)
 *  2. dts_tickets INSERT  (extraFields 에 incidentVendor / incidentContent 보관)
 *  3. dts_ticket_history INSERT
 * </pre>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DevopsSyncService {

    private static final Integer DEVOPS_TICKET_TYPE = 2;

    private final TicketRepository ticketRepository;
    private final ObjectMapper     objectMapper;

    @Transactional
    public DevopsSyncRes createDevopsTicket(DevopsSyncReq req) {

        // ── 1. 필드 정규화 ────────────────────────────────────────────────────
        String incidentVendor = req.getIncidentVendor().trim();
        String title          = "[" + incidentVendor + "] " + req.getTitle().trim();
        String platform       = req.getPlatform().trim().toUpperCase();
        String productName    = req.getProductName()    != null ? req.getProductName().trim()    : null;
        String incidentContent= req.getIncidentContent().trim();

        // ── 2. ticketNo 채번: BUG-0001 형식 ──────────────────────────────────
        Long seq      = ticketRepository.selectNextSeq();
        String ticketNo = TicketType.DEVOPS.getPrefix() + "-" + String.format("%04d", seq);

        // ── 3. extraFields 구성 ───────────────────────────────────────────────
        Map<String, Object> extra = new HashMap<>();
        extra.put("incidentVendor",  incidentVendor);
        extra.put("incidentContent", incidentContent);

        // ── 4. Ticket 생성 ────────────────────────────────────────────────────
        CurrentUser user = UserContextHolder.get();

        Ticket ticket = new Ticket();
        ticket.setTicketNo(ticketNo);
        ticket.setTicketType(DEVOPS_TICKET_TYPE);
        ticket.setTitle(title);
        ticket.setStatus(TicketStatus.PENDING_REVIEW.getCode());
        ticket.setIsUrgent(false);
        ticket.setProductName(productName);
        ticket.setPlatform(platform);
        ticket.setRequesterId(user.getId());
        ticket.setRequesterName(req.getRequesterName());
        if (req.getAttachmentPath() != null && !req.getAttachmentPath().isBlank()) {
            ticket.setAttachmentPath(req.getAttachmentPath().trim());
        }

        try {
            ticket.setExtraFields(objectMapper.writeValueAsString(extra));
        } catch (JsonProcessingException e) {
            log.warn("[DEVOPS_SYNC] Failed to serialize extraFields: {}", e.getMessage());
        }

        ticketRepository.insertTicket(ticket);

        // ── 5. 이력 기록 ──────────────────────────────────────────────────────
        TicketHistory history = new TicketHistory();
        history.setTicketId(ticket.getId());
        history.setFromStatus(null);
        history.setToStatus(TicketStatus.PENDING_REVIEW.getCode());
        history.setReason("DevOps 장애이슈 자동 등록");
        history.setChangedById(user.getId());
        history.setChangedByName(req.getRequesterName());
        ticketRepository.insertHistory(history);

        log.info("[DEVOPS_SYNC] Created – id={}, ticketNo={}, vendor={}, platform={}",
                ticket.getId(), ticketNo, incidentVendor, platform);

        return DevopsSyncRes.ok(ticket.getId());
    }
}
