package com.innotium.devticket.domain.ticket.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.innotium.devticket.common.auth.CurrentUser;
import com.innotium.devticket.common.exception.FailException;
import com.innotium.devticket.domain.ticket.dto.req.AssignTicketReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketCreateReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketPickupReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketReviewReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketSearchReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketStatusChangeReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketUpdateReq;
import com.innotium.devticket.domain.user.dto.UserSearchRes;
import com.innotium.devticket.domain.ticket.dto.res.TicketListRes;
import com.innotium.devticket.domain.ticket.dto.res.TicketRes;
import com.innotium.devticket.domain.ticket.dto.res.TicketSummaryRes;
import com.innotium.devticket.domain.ticket.model.Ticket;
import com.innotium.devticket.domain.ticket.model.TicketHistory;
import com.innotium.devticket.domain.ticket.model.TicketStatus;
import com.innotium.devticket.domain.ticket.model.TicketType;
import com.innotium.devticket.domain.ticket.repository.TicketRepository;
import com.innotium.devticket.domain.mention.repository.MentionRepository;
import com.innotium.devticket.domain.comment.repository.CommentRepository;
import com.innotium.devticket.domain.notification.repository.NotificationRepository;
import com.innotium.devticket.domain.mention.service.MentionService;
import com.innotium.devticket.domain.notification.service.NotificationService;
import com.innotium.devticket.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class TicketService {

    private final TicketRepository ticketRepository;
    private final ObjectMapper objectMapper;
    private final MentionService mentionService;
    private final NotificationService notificationService;
    private final UserRepository userRepository;
    private final CommentRepository commentRepository;
    private final MentionRepository mentionRepository;
    private final NotificationRepository notificationRepository;

    // ─────────────────────────────────────────────────────────────────
    //  티켓 등록
    // ─────────────────────────────────────────────────────────────────

    @Transactional
    public TicketRes createTicket(TicketCreateReq req, CurrentUser user) {
        if (req.getTicketType() == null) {
            throw new FailException("티켓 유형을 선택해주세요.");
        }
        if (req.getTitle() == null || req.getTitle().isBlank()) {
            throw new FailException("제목을 입력해주세요.");
        }
        if (req.getPlatform() == null || req.getPlatform().isBlank()) {
            throw new FailException("플랫폼을 선택해주세요.");
        }

        TicketType ticketType = TicketType.fromCode(req.getTicketType());

        Long seq = ticketRepository.selectNextSeq();
        String seqStr = String.format("%04d", seq);
        String ticketNo = ticketType.getPrefix() + "-" + seqStr;

        String extraFieldsJson = null;
        if (req.getExtraFields() != null && !req.getExtraFields().isEmpty()) {
            try {
                extraFieldsJson = objectMapper.writeValueAsString(req.getExtraFields());
            } catch (JsonProcessingException e) {
                throw new FailException("추가 필드 변환 중 오류가 발생했습니다.");
            }
        }

        Ticket ticket = new Ticket();
        ticket.setTicketNo(ticketNo);
        ticket.setTicketType(req.getTicketType());
        ticket.setTitle(req.getTitle());
        ticket.setStatus(TicketStatus.PENDING_REVIEW.getCode());   // 검토대기가 기본값
        ticket.setIsUrgent(req.getIsUrgent() != null ? req.getIsUrgent() : false);
        ticket.setProductName(req.getProductName());
        ticket.setPlatform(req.getPlatform().trim().toUpperCase());
        ticket.setErrorBug(req.getErrorBug() != null ? req.getErrorBug().trim() : null);
        ticket.setBuildVersion(req.getBuildVersion() != null ? req.getBuildVersion().trim() : null);
        ticket.setQaFilePath(req.getQaFilePath() != null ? req.getQaFilePath().trim() : null);
        ticket.setAttachmentPath(req.getAttachmentPath() != null ? req.getAttachmentPath().trim() : null);
        ticket.setRequesterId(user.getId());
        ticket.setRequesterName(user.getDisplayName());
        ticket.setExtraFields(extraFieldsJson);
        ticket.setRequestedDueDate(req.getRequestedDueDate());
        ticket.setRequestingDept(
            req.getRequestingDept() != null && !req.getRequestingDept().isBlank()
                ? req.getRequestingDept().trim()
                : user.getGroupName()   // 자동으로 요청자 부서명 채움
        );

        ticketRepository.insertTicket(ticket);

        TicketHistory history = new TicketHistory();
        history.setTicketId(ticket.getId());
        history.setFromStatus(null);
        history.setToStatus(TicketStatus.PENDING_REVIEW.getCode());
        history.setReason("티켓 생성");
        history.setChangedById(user.getId());
        history.setChangedByName(user.getDisplayName());
        ticketRepository.insertHistory(history);

        // extra_fields 내 멘션 파싱
        if (extraFieldsJson != null) {
            mentionService.parseMentions(ticket.getId(), "ticket_description", null,
                    extraFieldsJson, user.getId());
        }

        // 신규 티켓 알림: 관리자 + 기술연구소팀에게 발송
        String notifMsg = String.format("[신규 티켓] %s님이 '%s' 티켓을 등록했습니다.",
                user.getDisplayName(), ticket.getTitle());
        List<Long> developerIds = userRepository.findDeveloperIds();
        notificationService.notifyMultiple(developerIds, user.getId(), ticket.getId(),
                "TICKET_CREATED", notifMsg);

        return getTicket(ticket.getId());
    }

    // ─────────────────────────────────────────────────────────────────
    //  단건 조회
    // ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public TicketRes getTicket(Long id) {
        Ticket ticket = ticketRepository.selectById(id);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }

        TicketRes res = new TicketRes();
        res.setId(ticket.getId());
        res.setTicketNo(ticket.getTicketNo());
        res.setTicketType(ticket.getTicketType());
        res.setTitle(ticket.getTitle());
        res.setStatus(ticket.getStatus());
        res.setIsUrgent(ticket.getIsUrgent());
        res.setProductName(ticket.getProductName());
        res.setPlatform(ticket.getPlatform());
        res.setErrorBug(ticket.getErrorBug());
        res.setBuildVersion(ticket.getBuildVersion());
        res.setQaFilePath(ticket.getQaFilePath());
        res.setAttachmentPath(ticket.getAttachmentPath());
        res.setRequesterId(ticket.getRequesterId());
        res.setRequesterName(ticket.getRequesterName());
        res.setAssigneeId(ticket.getAssigneeId());
        res.setAssigneeName(ticket.getAssigneeName());
        res.setCreatedAt(ticket.getCreatedAt());
        res.setUpdatedAt(ticket.getUpdatedAt());
        res.setCompletedAt(ticket.getCompletedAt());
        res.setRequestedDueDate(ticket.getRequestedDueDate());
        res.setDesiredDueDate(ticket.getDesiredDueDate());
        res.setRequestingDept(ticket.getRequestingDept());
        res.setDifficulty(ticket.getDifficulty());
        res.setExpectedEffort(ticket.getExpectedEffort());
        res.setEffortUnit(ticket.getEffortUnit());
        res.setPriority(ticket.getPriority());
        res.setReviewedById(ticket.getReviewedById());
        res.setReviewedByName(ticket.getReviewedByName());
        res.setReviewedAt(ticket.getReviewedAt());

        if (ticket.getExtraFields() != null && !ticket.getExtraFields().isBlank()) {
            try {
                Map<String, Object> extraFieldsMap = objectMapper.readValue(
                        ticket.getExtraFields(), new TypeReference<Map<String, Object>>() {});
                res.setExtraFields(extraFieldsMap);
            } catch (JsonProcessingException e) {
                res.setExtraFields(ticket.getExtraFields());
            }
        }

        res.setHistoryList(ticketRepository.selectHistoryByTicketId(id));

        return res;
    }

    // ─────────────────────────────────────────────────────────────────
    //  목록 조회
    // ─────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public TicketListRes getTicketList(TicketSearchReq req) {
        List<TicketSummaryRes> content = ticketRepository.selectList(req);
        int totalCount = ticketRepository.countList(req);
        return new TicketListRes(content, totalCount, req.getPage(), req.getSize());
    }

    // ─────────────────────────────────────────────────────────────────
    //  티켓 수정 (요청자 또는 관리자)
    // ─────────────────────────────────────────────────────────────────

    @Transactional
    public TicketRes updateTicket(Long id, TicketUpdateReq req, CurrentUser user) {
        Ticket ticket = ticketRepository.selectById(id);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }

        boolean isRequester = ticket.getRequesterId().equals(user.getId());
        boolean isAdmin = "ADMIN".equals(user.getRole());
        if (!isRequester && !isAdmin) {
            throw new FailException(HttpStatus.FORBIDDEN, "작성자 또는 관리자만 티켓을 수정할 수 있습니다.");
        }

        // 픽업 전(검토대기/검토완료/진행가능) 상태에서만 요청자가 수정 가능
        int status = ticket.getStatus();
        if (!isAdmin && status > TicketStatus.READY.getCode()) {
            throw new FailException("픽업 전(검토대기·검토완료·진행가능) 상태에서만 수정할 수 있습니다.");
        }

        if (req.getTitle() == null || req.getTitle().isBlank()) {
            throw new FailException("제목을 입력해주세요.");
        }

        String extraFieldsJson = null;
        if (req.getExtraFields() != null && !req.getExtraFields().isEmpty()) {
            try {
                extraFieldsJson = objectMapper.writeValueAsString(req.getExtraFields());
            } catch (JsonProcessingException e) {
                throw new FailException("추가 필드 변환 중 오류가 발생했습니다.");
            }
        }

        String productName  = (req.getProductName() != null && !req.getProductName().isBlank())
                ? req.getProductName().trim() : null;
        String platform     = (req.getPlatform() != null && !req.getPlatform().isBlank())
                ? req.getPlatform().trim().toUpperCase() : ticket.getPlatform();
        String errorBug     = (req.getErrorBug() != null && !req.getErrorBug().isBlank())
                ? req.getErrorBug().trim() : null;
        String buildVersion = (req.getBuildVersion() != null && !req.getBuildVersion().isBlank())
                ? req.getBuildVersion().trim() : null;
        String qaFilePath   = (req.getQaFilePath() != null && !req.getQaFilePath().isBlank())
                ? req.getQaFilePath().trim() : null;

        ticketRepository.updateTicket(id, req.getTitle().trim(),
                req.getIsUrgent() != null ? req.getIsUrgent() : ticket.getIsUrgent(),
                productName, platform, errorBug, buildVersion, qaFilePath, extraFieldsJson,
                req.getRequestedDueDate(), req.getRequestingDept());

        if (extraFieldsJson != null) {
            mentionService.reParseMentions(id, "ticket_description", null,
                    extraFieldsJson, user.getId());
        }

        return getTicket(id);
    }

    // ─────────────────────────────────────────────────────────────────
    //  관리자 검토 (난이도/공수/우선순위 + 상태 변경)
    // ─────────────────────────────────────────────────────────────────

    @Transactional
    public TicketRes reviewTicket(Long id, TicketReviewReq req, CurrentUser user) {
        if (!"ADMIN".equals(user.getRole())) {
            throw new FailException(HttpStatus.FORBIDDEN, "관리자만 티켓을 검토할 수 있습니다.");
        }

        Ticket ticket = ticketRepository.selectById(id);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }

        TicketStatus fromStatus = TicketStatus.fromCode(ticket.getStatus());
        if (req.getStatus() == null) {
            throw new FailException(HttpStatus.BAD_REQUEST, "변경할 상태를 입력해주세요.");
        }
        TicketStatus toStatus   = TicketStatus.fromCode(req.getStatus());

        // 검토 가능한 전이
        //   PENDING_REVIEW(1) → REVIEW_DONE(2) : 관리자 검토 완료
        //   PENDING_REVIEW(1) → REJECTED(8)    : 검토대기에서 즉시 반려
        //   REVIEW_DONE(2)    → READY(3)        : 픽업대기 전환
        //   REVIEW_DONE(2)    → REJECTED(8)    : 검토완료 후 반려
        //   READY(3)          → REJECTED(8)    : 픽업대기 상태에서 반려
        boolean validTransition =
            (fromStatus == TicketStatus.PENDING_REVIEW && toStatus == TicketStatus.REVIEW_DONE) ||
            (fromStatus == TicketStatus.PENDING_REVIEW && toStatus == TicketStatus.REJECTED)    ||
            (fromStatus == TicketStatus.REVIEW_DONE    && toStatus == TicketStatus.READY)       ||
            (fromStatus == TicketStatus.REVIEW_DONE    && toStatus == TicketStatus.REJECTED)    ||
            (fromStatus == TicketStatus.READY          && toStatus == TicketStatus.REJECTED);

        if (!validTransition) {
            throw new FailException(String.format(
                "현재 상태(%s)에서 %s으로 변경할 수 없습니다.", fromStatus.name(), toStatus.name()));
        }

        if (toStatus == TicketStatus.REJECTED && (req.getReason() == null || req.getReason().isBlank())) {
            throw new FailException("반려 처리 시 사유를 입력해주세요.");
        }

        // 검토완료(2) 요청 시 즉시 픽업대기(3)으로 전환
        TicketStatus savedStatus = (toStatus == TicketStatus.REVIEW_DONE) ? TicketStatus.READY : toStatus;

        ticketRepository.updateReview(id, savedStatus.getCode(),
                req.getDifficulty(), req.getExpectedEffort(),
                req.getEffortUnit(), req.getPriority(),
                user.getId(), user.getDisplayName(), null);

        TicketHistory history = new TicketHistory();
        history.setTicketId(id);
        history.setFromStatus(fromStatus.getCode());
        history.setToStatus(savedStatus.getCode());
        String defaultReason;
        if (savedStatus == TicketStatus.READY)     defaultReason = "검토 완료";
        else if (savedStatus == TicketStatus.REJECTED) defaultReason = "관리자 반려";
        else                                        defaultReason = "픽업대기 전환";
        history.setReason(req.getReason() != null ? req.getReason() : defaultReason);
        history.setChangedById(user.getId());
        history.setChangedByName(user.getDisplayName());
        ticketRepository.insertHistory(history);

        // 요청자에게 검토 결과 알림
        String notifMsg = buildStatusChangeMessage(savedStatus, id, user.getDisplayName());
        notificationService.notify(ticket.getRequesterId(), user.getId(), id, "STATUS_CHANGED", notifMsg);

        return getTicket(id);
    }

    // ─────────────────────────────────────────────────────────────────
    //  관리자 평가 수정 (상태 전환 없이 평가 필드만 수정)
    // ─────────────────────────────────────────────────────────────────

    @Transactional
    public TicketRes patchReviewFields(Long id, TicketReviewReq req, CurrentUser user) {
        if (!"ADMIN".equals(user.getRole())) {
            throw new FailException(HttpStatus.FORBIDDEN, "관리자만 평가를 수정할 수 있습니다.");
        }

        Ticket ticket = ticketRepository.selectById(id);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }

        // 상태는 그대로 유지, 평가 필드만 업데이트 (desiredDueDate 포함)
        ticketRepository.updateReview(id, ticket.getStatus(),
                req.getDifficulty(), req.getExpectedEffort(),
                req.getEffortUnit(), req.getPriority(),
                user.getId(), user.getDisplayName(), req.getDesiredDueDate());

        // 히스토리 기록
        TicketHistory history = new TicketHistory();
        history.setTicketId(id);
        history.setFromStatus(ticket.getStatus());
        history.setToStatus(ticket.getStatus());
        history.setReason("관리자 평가 수정");
        history.setChangedById(user.getId());
        history.setChangedByName(user.getDisplayName());
        ticketRepository.insertHistory(history);

        return getTicket(id);
    }

    // ─────────────────────────────────────────────────────────────────
    //  상태 변경 (개발자/요청자)
    // ─────────────────────────────────────────────────────────────────

    @Transactional
    public TicketRes changeStatus(Long id, TicketStatusChangeReq req, CurrentUser user) {
        Ticket ticket = ticketRepository.selectById(id);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }

        TicketStatus fromStatus = TicketStatus.fromCode(ticket.getStatus());
        if (req.getStatus() == null) {
            throw new FailException(HttpStatus.BAD_REQUEST, "변경할 상태를 입력해주세요.");
        }
        TicketStatus toStatus   = TicketStatus.fromCode(req.getStatus());
        String role = user.getRole();

        validateStatusTransition(fromStatus, toStatus, req.getReason(), role, ticket, user);

        OffsetDateTime completedAt = null;
        if (toStatus == TicketStatus.DONE) {
            completedAt = OffsetDateTime.now();
        }

        ticketRepository.updateStatus(id, toStatus.getCode(), null, null, completedAt);

        // 재오픈(완료→진행중) 시 completedAt 초기화
        if (fromStatus == TicketStatus.DONE && toStatus == TicketStatus.IN_PROGRESS) {
            ticketRepository.updateStatus(id, toStatus.getCode(), null, null, null);
        }

        TicketHistory history = new TicketHistory();
        history.setTicketId(id);
        history.setFromStatus(fromStatus.getCode());
        history.setToStatus(toStatus.getCode());
        history.setReason(req.getReason());
        history.setChangedById(user.getId());
        history.setChangedByName(user.getDisplayName());
        ticketRepository.insertHistory(history);

        if (req.getReason() != null && !req.getReason().isBlank()) {
            mentionService.parseMentions(id, "status_reason", null,
                    req.getReason(), user.getId());
        }

        String notifType = (toStatus == TicketStatus.QA_REVIEW) ? "QA_REQUESTED" : "STATUS_CHANGED";
        String notifMsg  = buildStatusChangeMessage(toStatus, id, user.getDisplayName());

        List<Long> targets = new ArrayList<>();
        targets.add(ticket.getRequesterId());
        if (ticket.getAssigneeId() != null) targets.add(ticket.getAssigneeId());
        notificationService.notifyMultiple(targets, user.getId(), id, notifType, notifMsg);

        // 재오픈 알림
        if (fromStatus == TicketStatus.DONE && toStatus == TicketStatus.IN_PROGRESS
                && ticket.getAssigneeId() != null) {
            notificationService.notify(ticket.getAssigneeId(), user.getId(), id,
                    "REOPENED", "티켓 #" + id + "이 재오픈되었습니다.");
        }

        return getTicket(id);
    }

    private void validateStatusTransition(TicketStatus from, TicketStatus to, String reason,
                                          String role, Ticket ticket, CurrentUser user) {
        boolean isDeveloperOrAdmin = "DEVELOPER".equals(role) || "ADMIN".equals(role);
        boolean isRequester = "REQUESTER".equals(role) || ticket.getRequesterId().equals(user.getId());

        switch (from) {
            case IN_PROGRESS:
                if (!isDeveloperOrAdmin) throw new FailException("개발자 또는 관리자만 상태를 변경할 수 있습니다.");
                if (to == TicketStatus.QA_REVIEW) { /* OK */ }
                else if (to == TicketStatus.DONE) { /* OK */ }
                else if (to == TicketStatus.ON_HOLD) {
                    if (reason == null || reason.isBlank()) throw new FailException("보류 처리 시 사유를 입력해주세요.");
                } else if (to == TicketStatus.REJECTED) {
                    if (!"ADMIN".equals(role)) throw new FailException("관리자만 반려 처리할 수 있습니다.");
                    if (reason == null || reason.isBlank()) throw new FailException("반려 처리 시 사유를 입력해주세요.");
                } else {
                    throw new FailException("진행중 상태에서는 QA·완료·보류·반려로만 변경할 수 있습니다.");
                }
                break;

            case QA_REVIEW:
                if (to == TicketStatus.IN_PROGRESS) {
                    if (!isRequester && !"ADMIN".equals(role)) throw new FailException("요청자 또는 관리자만 QA 재검토를 요청할 수 있습니다.");
                    if (reason == null || reason.isBlank()) throw new FailException("반환 시 사유를 입력해주세요.");
                } else if (to == TicketStatus.DONE) {
                    if (!isRequester && !"ADMIN".equals(role)) throw new FailException("요청자 또는 관리자만 완료 처리할 수 있습니다.");
                } else {
                    throw new FailException("QA 상태에서는 진행중 또는 완료로만 변경할 수 있습니다.");
                }
                break;

            case DONE:
                if (to == TicketStatus.IN_PROGRESS) {
                    if (ticket.getCompletedAt() == null ||
                            ticket.getCompletedAt().isBefore(OffsetDateTime.now().minusDays(7))) {
                        throw new FailException("완료 후 7일 이내에만 재오픈할 수 있습니다.");
                    }
                    if (reason == null || reason.isBlank()) throw new FailException("재오픈 시 사유를 입력해주세요.");
                } else {
                    throw new FailException("완료 상태에서는 재오픈(진행중)만 가능합니다.");
                }
                break;

            case ON_HOLD:
                if (!"ADMIN".equals(role)) throw new FailException("관리자만 보류 상태를 변경할 수 있습니다.");
                if (to != TicketStatus.PENDING_REVIEW && to != TicketStatus.READY) {
                    throw new FailException("보류 상태에서는 검토대기 또는 픽업대기로만 변경할 수 있습니다.");
                }
                break;

            default:
                throw new FailException("현재 상태에서는 상태 변경이 불가합니다. (관리자 검토 필요)");
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  픽업 (진행가능 → 진행중)
    // ─────────────────────────────────────────────────────────────────

    @Transactional
    public TicketRes pickupTicket(Long id, TicketPickupReq req, CurrentUser user) {
        Ticket ticket = ticketRepository.selectById(id);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }

        String role = user.getRole();
        if (!"DEVELOPER".equals(role) && !"ADMIN".equals(role)) {
            throw new FailException("개발자 또는 관리자만 티켓을 픽업할 수 있습니다.");
        }

        // 픽업대기(READY=3) 상태에서만 픽업 허용
        if (ticket.getStatus() != TicketStatus.READY.getCode()) {
            throw new FailException("'픽업대기' 상태의 티켓만 픽업할 수 있습니다. (관리자 승인 후 픽업 가능)");
        }

        ticketRepository.updateStatus(id, TicketStatus.IN_PROGRESS.getCode(),
                user.getId(), user.getDisplayName(), null);

        TicketHistory history = new TicketHistory();
        history.setTicketId(id);
        history.setFromStatus(TicketStatus.READY.getCode());
        history.setToStatus(TicketStatus.IN_PROGRESS.getCode());
        history.setReason(req.getReason() != null ? req.getReason() : "티켓 픽업");
        history.setChangedById(user.getId());
        history.setChangedByName(user.getDisplayName());
        ticketRepository.insertHistory(history);

        notificationService.notify(ticket.getRequesterId(), user.getId(), id,
                "PICKED_UP", user.getDisplayName() + "님이 티켓 #" + id + "을 픽업했습니다.");

        return getTicket(id);
    }

    // ─────────────────────────────────────────────────────────────────
    //  픽업 취소 (진행중 → 진행가능)
    // ─────────────────────────────────────────────────────────────────

    @Transactional
    public TicketRes cancelPickup(Long id, CurrentUser user) {
        Ticket ticket = ticketRepository.selectById(id);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }

        if (ticket.getStatus() != TicketStatus.IN_PROGRESS.getCode()) {
            throw new FailException("진행중 상태의 티켓만 픽업 취소할 수 있습니다.");
        }

        boolean isAssignee = user.getId().equals(ticket.getAssigneeId());
        boolean isAdmin    = "ADMIN".equals(user.getRole());
        if (!isAssignee && !isAdmin) {
            throw new FailException("본인이 픽업한 티켓만 취소할 수 있습니다.");
        }

        // 진행가능(READY) 상태로 복귀 (재승인 불필요)
        ticketRepository.cancelPickup(id);

        TicketHistory history = new TicketHistory();
        history.setTicketId(id);
        history.setFromStatus(TicketStatus.IN_PROGRESS.getCode());
        history.setToStatus(TicketStatus.READY.getCode());
        history.setReason("픽업 취소");
        history.setChangedById(user.getId());
        history.setChangedByName(user.getDisplayName());
        ticketRepository.insertHistory(history);

        return getTicket(id);
    }

    // ─────────────────────────────────────────────────────────────────
    //  긴급 여부 변경
    // ─────────────────────────────────────────────────────────────────

    @Transactional
    public TicketRes updateUrgent(Long id, Boolean isUrgent, CurrentUser user) {
        Ticket ticket = ticketRepository.selectById(id);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }
        if (!"ADMIN".equals(user.getRole())) {
            throw new FailException(HttpStatus.FORBIDDEN, "관리자만 긴급 여부를 변경할 수 있습니다.");
        }
        ticketRepository.updateUrgent(id, isUrgent);

        if (ticket.getAssigneeId() != null) {
            String urgentMsg = isUrgent
                    ? "티켓 #" + id + "이 긴급으로 설정되었습니다."
                    : "티켓 #" + id + "의 긴급 설정이 해제되었습니다.";
            notificationService.notify(ticket.getAssigneeId(), user.getId(), id,
                    "URGENT_CHANGED", urgentMsg);
        }

        return getTicket(id);
    }

    // ─────────────────────────────────────────────────────────────────
    //  관리자 담당자 지정 / 변경
    // ─────────────────────────────────────────────────────────────────

    @Transactional
    public TicketRes assignTicket(Long id, AssignTicketReq req, CurrentUser user) {
        if (!"ADMIN".equals(user.getRole())) {
            throw new FailException(HttpStatus.FORBIDDEN, "관리자만 담당자를 지정할 수 있습니다.");
        }

        Ticket ticket = ticketRepository.selectById(id);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }

        int status = ticket.getStatus();
        if (status != TicketStatus.READY.getCode() && status != TicketStatus.IN_PROGRESS.getCode()) {
            throw new FailException("픽업대기 또는 진행중 상태의 티켓에만 담당자를 지정할 수 있습니다.");
        }

        UserSearchRes developer = userRepository.findUserById(req.getAssigneeId());
        if (developer == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다.");
        }

        // 픽업대기(3)에서 지정하면 진행중(4)으로 전환, 이미 진행중이면 상태 유지
        Integer newStatus = (status == TicketStatus.READY.getCode()) ? TicketStatus.IN_PROGRESS.getCode() : null;
        ticketRepository.updateAssignee(id, req.getAssigneeId(), developer.getDisplayName(), newStatus);

        TicketHistory history = new TicketHistory();
        history.setTicketId(id);
        history.setFromStatus(status);
        history.setToStatus(newStatus != null ? newStatus : status);
        history.setReason("담당자 지정: " + developer.getDisplayName());
        history.setChangedById(user.getId());
        history.setChangedByName(user.getDisplayName());
        ticketRepository.insertHistory(history);

        notificationService.notify(req.getAssigneeId(), user.getId(), id,
                "ASSIGNED", user.getDisplayName() + "님이 티켓을 배정했습니다.");

        return getTicket(id);
    }

    @Transactional
    public void deleteTicket(Long id, CurrentUser user) {
        if (!"ADMIN".equals(user.getRole())) {
            throw new FailException(HttpStatus.FORBIDDEN, "관리자만 티켓을 삭제할 수 있습니다.");
        }
        Ticket ticket = ticketRepository.selectById(id);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }
        // FK 참조 순서대로 연관 데이터 삭제
        notificationRepository.deleteByTicketId(id);
        mentionRepository.deleteByTicketId(id);
        commentRepository.deleteByTicketId(id);
        ticketRepository.deleteHistoryByTicketId(id);
        ticketRepository.deleteTicket(id);
    }

    // ─────────────────────────────────────────────────────────────────
    //  헬퍼
    // ─────────────────────────────────────────────────────────────────

    private String buildStatusChangeMessage(TicketStatus toStatus, Long ticketId, String actorName) {
        String label = switch (toStatus) {
            case PENDING_REVIEW -> "검토대기";
            case REVIEW_DONE    -> "검토완료";
            case READY          -> "픽업대기";
            case IN_PROGRESS    -> "진행중";
            case QA_REVIEW      -> "QA검증";
            case DONE           -> "완료";
            case ON_HOLD        -> "보류";
            case REJECTED       -> "반려";
        };
        if (toStatus == TicketStatus.QA_REVIEW) {
            return actorName + "님이 티켓 #" + ticketId + "을 QA 검증 요청했습니다.";
        }
        if (toStatus == TicketStatus.READY) {
            return actorName + "님이 티켓 #" + ticketId + "을 승인했습니다. (진행가능)";
        }
        return "티켓 #" + ticketId + "의 상태가 " + label + "(으)로 변경되었습니다.";
    }
}
