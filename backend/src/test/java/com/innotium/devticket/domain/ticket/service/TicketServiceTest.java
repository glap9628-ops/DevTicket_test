package com.innotium.devticket.domain.ticket.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.innotium.devticket.common.auth.CurrentUser;
import com.innotium.devticket.common.exception.FailException;
import com.innotium.devticket.domain.mention.service.MentionService;
import com.innotium.devticket.domain.notification.service.NotificationService;
import com.innotium.devticket.domain.ticket.dto.req.TicketCreateReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketPickupReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketStatusChangeReq;
import com.innotium.devticket.domain.ticket.dto.res.TicketRes;
import com.innotium.devticket.domain.ticket.model.Ticket;
import com.innotium.devticket.domain.ticket.model.TicketStatus;
import com.innotium.devticket.domain.ticket.repository.TicketRepository;
import com.innotium.devticket.domain.user.repository.UserRepository;
import com.innotium.devticket.domain.watcher.service.WatcherService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TicketService 단위 테스트")
class TicketServiceTest {

    @Mock private TicketRepository    ticketRepository;
    @Mock private ObjectMapper        objectMapper;
    @Mock private WatcherService      watcherService;
    @Mock private MentionService      mentionService;
    @Mock private NotificationService notificationService;
    @Mock private UserRepository      userRepository;

    @InjectMocks
    private TicketService ticketService;

    private CurrentUser developer;
    private CurrentUser requester;
    private CurrentUser admin;

    @BeforeEach
    void setUp() {
        developer = CurrentUser.builder().id(2L).username("dev1").displayName("개발자1").role("DEVELOPER").groupId(2).build();
        requester = CurrentUser.builder().id(3L).username("req1").displayName("요청자1").role("REQUESTER").groupId(3).build();
        admin     = CurrentUser.builder().id(1L).username("admin").displayName("관리자").role("ADMIN").groupId(1).build();
    }

    // ─── 헬퍼 ───────────────────────────────────────────
    private Ticket makeTicket(long id, TicketStatus status) {
        Ticket t = new Ticket();
        t.setId(id);
        t.setTicketNo("QA-0001");
        t.setTicketType(1);
        t.setTitle("테스트 티켓");
        t.setStatus(status.getCode());
        t.setIsUrgent(false);
        t.setRequesterId(requester.getId());
        t.setRequesterName(requester.getDisplayName());
        return t;
    }

    private TicketRes makeTicketRes(Ticket ticket) {
        TicketRes res = new TicketRes();
        res.setId(ticket.getId());
        res.setStatus(ticket.getStatus());
        res.setRequesterId(ticket.getRequesterId());
        res.setHistoryList(Collections.emptyList());
        return res;
    }

    // ─── 공통 stub: 티켓 생성 관련 ──────────────────────
    private void stubCreateTicket(long ticketId) {
        given(ticketRepository.selectNextSeq()).willReturn(ticketId);
        willAnswer(inv -> {
            Ticket t = inv.getArgument(0);
            t.setId(ticketId);
            return null;
        }).given(ticketRepository).insertTicket(any(Ticket.class));
        lenient().when(ticketRepository.selectById(ticketId))
                 .thenReturn(makeTicket(ticketId, TicketStatus.WAITING));
        lenient().when(ticketRepository.selectHistoryByTicketId(ticketId))
                 .thenReturn(Collections.emptyList());
        lenient().when(userRepository.findDeveloperIds())
                 .thenReturn(List.of(1L, 2L));
    }

    // ─── 티켓 생성 ────────────────────────────────────────
    @Nested
    @DisplayName("티켓 생성")
    class CreateTicket {

        @Test
        @DisplayName("티켓 타입이 없으면 FailException 발생")
        void createTicket_noType_throws() {
            TicketCreateReq req = new TicketCreateReq();
            req.setTitle("제목");

            assertThatThrownBy(() -> ticketService.createTicket(req, requester))
                    .isInstanceOf(FailException.class)
                    .hasMessageContaining("티켓 유형");
        }

        @Test
        @DisplayName("제목이 없으면 FailException 발생")
        void createTicket_noTitle_throws() {
            TicketCreateReq req = new TicketCreateReq();
            req.setTicketType(1);

            assertThatThrownBy(() -> ticketService.createTicket(req, requester))
                    .isInstanceOf(FailException.class)
                    .hasMessageContaining("제목");
        }

        @Test
        @DisplayName("정상 생성 시 WAITING 상태로 저장")
        void createTicket_success() {
            stubCreateTicket(1L);

            TicketCreateReq req = new TicketCreateReq();
            req.setTicketType(1);
            req.setTitle("로그인 오류");
            req.setIsUrgent(false);

            TicketRes result = ticketService.createTicket(req, requester);

            then(ticketRepository).should().insertTicket(any(Ticket.class));
            then(ticketRepository).should().insertHistory(any());
            assertThat(result.getStatus()).isEqualTo(TicketStatus.WAITING.getCode());
        }

        @Test
        @DisplayName("티켓 생성 시 개발자/관리자에게 TICKET_CREATED 알림 발송")
        void createTicket_sendsNotification() {
            stubCreateTicket(1L);
            List<Long> devIds = List.of(1L, 2L);
            given(userRepository.findDeveloperIds()).willReturn(devIds);

            TicketCreateReq req = new TicketCreateReq();
            req.setTicketType(1);
            req.setTitle("결제 오류 발생");
            req.setIsUrgent(false);

            ticketService.createTicket(req, requester);

            then(notificationService).should().notifyMultiple(
                    eq(devIds),
                    eq(requester.getId()),
                    eq(1L),
                    eq("TICKET_CREATED"),
                    contains("결제 오류 발생")
            );
        }

        @Test
        @DisplayName("티켓 생성 시 요청자는 알림 수신 제외(자기 자신)")
        void createTicket_notification_excludesRequester() {
            stubCreateTicket(1L);
            // 요청자(id=3)가 개발자 목록에 없으면 notifyMultiple 내부에서 자동 제외
            given(userRepository.findDeveloperIds()).willReturn(List.of(1L, 2L));

            TicketCreateReq req = new TicketCreateReq();
            req.setTicketType(1);
            req.setTitle("테스트");
            req.setIsUrgent(false);

            ticketService.createTicket(req, requester);

            // notifyMultiple은 내부에서 actorId(=requester.id=3) 제외 처리
            then(notificationService).should().notifyMultiple(
                    argThat(ids -> !ids.contains(requester.getId())),
                    eq(requester.getId()),
                    anyLong(),
                    eq("TICKET_CREATED"),
                    anyString()
            );
        }

        @Test
        @DisplayName("개발자 목록이 비어 있으면 알림 미발송")
        void createTicket_noDevelopers_noNotification() {
            stubCreateTicket(1L);
            given(userRepository.findDeveloperIds()).willReturn(Collections.emptyList());

            TicketCreateReq req = new TicketCreateReq();
            req.setTicketType(1);
            req.setTitle("인프라 이슈");
            req.setIsUrgent(false);

            ticketService.createTicket(req, requester);

            then(notificationService).should().notifyMultiple(
                    eq(Collections.emptyList()),
                    anyLong(), anyLong(),
                    eq("TICKET_CREATED"),
                    anyString()
            );
        }
    }

    // ─── 픽업 ─────────────────────────────────────────────
    @Nested
    @DisplayName("티켓 픽업")
    class PickupTicket {

        @Test
        @DisplayName("개발자가 대기 티켓 픽업 성공")
        void pickup_developer_waiting_success() {
            Ticket ticket = makeTicket(1L, TicketStatus.WAITING);
            given(ticketRepository.selectById(1L)).willReturn(ticket);
            given(ticketRepository.selectHistoryByTicketId(1L)).willReturn(Collections.emptyList());

            TicketPickupReq req = new TicketPickupReq();
            ticketService.pickupTicket(1L, req, developer);

            then(ticketRepository).should().updateStatus(eq(1L), eq(TicketStatus.IN_PROGRESS.getCode()),
                    eq(developer.getId()), eq(developer.getDisplayName()), isNull());
            then(ticketRepository).should().insertHistory(any());
        }

        @Test
        @DisplayName("관리자도 대기 티켓 픽업 가능")
        void pickup_admin_waiting_success() {
            Ticket ticket = makeTicket(1L, TicketStatus.WAITING);
            given(ticketRepository.selectById(1L)).willReturn(ticket);
            given(ticketRepository.selectHistoryByTicketId(1L)).willReturn(Collections.emptyList());

            TicketPickupReq req = new TicketPickupReq();
            ticketService.pickupTicket(1L, req, admin);

            then(ticketRepository).should().updateStatus(eq(1L), eq(TicketStatus.IN_PROGRESS.getCode()),
                    eq(admin.getId()), eq(admin.getDisplayName()), isNull());
        }

        @Test
        @DisplayName("요청자는 픽업 불가 - FailException 발생")
        void pickup_requester_forbidden() {
            Ticket ticket = makeTicket(1L, TicketStatus.WAITING);
            given(ticketRepository.selectById(1L)).willReturn(ticket);

            TicketPickupReq req = new TicketPickupReq();

            assertThatThrownBy(() -> ticketService.pickupTicket(1L, req, requester))
                    .isInstanceOf(FailException.class)
                    .hasMessageContaining("개발자 또는 관리자");
        }

        @Test
        @DisplayName("대기 상태가 아닌 티켓은 픽업 불가")
        void pickup_notWaiting_throws() {
            Ticket ticket = makeTicket(1L, TicketStatus.IN_PROGRESS);
            given(ticketRepository.selectById(1L)).willReturn(ticket);

            TicketPickupReq req = new TicketPickupReq();

            assertThatThrownBy(() -> ticketService.pickupTicket(1L, req, developer))
                    .isInstanceOf(FailException.class)
                    .hasMessageContaining("대기 상태");
        }

        @Test
        @DisplayName("존재하지 않는 티켓 픽업 시 FailException 발생")
        void pickup_notFound_throws() {
            given(ticketRepository.selectById(99L)).willReturn(null);

            assertThatThrownBy(() -> ticketService.pickupTicket(99L, new TicketPickupReq(), developer))
                    .isInstanceOf(FailException.class);
        }

        @Test
        @DisplayName("픽업 성공 시 요청자에게 PICKED_UP 알림 발송")
        void pickup_sendsNotification() {
            Ticket ticket = makeTicket(1L, TicketStatus.WAITING);
            given(ticketRepository.selectById(1L)).willReturn(ticket);
            given(ticketRepository.selectHistoryByTicketId(1L)).willReturn(Collections.emptyList());

            ticketService.pickupTicket(1L, new TicketPickupReq(), developer);

            then(notificationService).should().notify(
                    eq(requester.getId()),
                    eq(developer.getId()),
                    eq(1L),
                    eq("PICKED_UP"),
                    anyString()
            );
        }
    }

    // ─── 상태 전환 ─────────────────────────────────────────
    @Nested
    @DisplayName("상태 변경 - 전환 규칙")
    class ChangeStatus {

        private Ticket setupTicket(TicketStatus status) {
            Ticket ticket = makeTicket(1L, status);
            lenient().when(ticketRepository.selectById(1L)).thenReturn(ticket);
            lenient().when(ticketRepository.selectHistoryByTicketId(1L)).thenReturn(Collections.emptyList());
            return ticket;
        }

        @Test
        @DisplayName("대기 → 진행중: 개발자 가능")
        void waiting_to_inProgress_developer_ok() {
            setupTicket(TicketStatus.WAITING);
            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.IN_PROGRESS.getCode());

            assertThatCode(() -> ticketService.changeStatus(1L, req, developer))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("대기 → 진행중: 요청자 불가")
        void waiting_to_inProgress_requester_forbidden() {
            setupTicket(TicketStatus.WAITING);
            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.IN_PROGRESS.getCode());

            assertThatThrownBy(() -> ticketService.changeStatus(1L, req, requester))
                    .isInstanceOf(FailException.class)
                    .hasMessageContaining("개발자 또는 관리자");
        }

        @Test
        @DisplayName("대기에서 완료로 직접 전환 불가")
        void waiting_to_done_invalid() {
            setupTicket(TicketStatus.WAITING);
            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.DONE.getCode());

            assertThatThrownBy(() -> ticketService.changeStatus(1L, req, developer))
                    .isInstanceOf(FailException.class);
        }

        @Test
        @DisplayName("진행중 → 보류: 사유 필수")
        void inProgress_to_onHold_reasonRequired() {
            setupTicket(TicketStatus.IN_PROGRESS);
            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.ON_HOLD.getCode());

            assertThatThrownBy(() -> ticketService.changeStatus(1L, req, developer))
                    .isInstanceOf(FailException.class)
                    .hasMessageContaining("사유");
        }

        @Test
        @DisplayName("진행중 → 보류: 사유 있으면 성공")
        void inProgress_to_onHold_withReason_ok() {
            setupTicket(TicketStatus.IN_PROGRESS);
            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.ON_HOLD.getCode());
            req.setReason("외부 이슈로 인한 보류");

            assertThatCode(() -> ticketService.changeStatus(1L, req, developer))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("진행중 → 반려: 개발자, 사유 있으면 성공")
        void inProgress_to_rejected_developer_ok() {
            setupTicket(TicketStatus.IN_PROGRESS);
            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.REJECTED.getCode());
            req.setReason("요건 불명확으로 반려");

            assertThatCode(() -> ticketService.changeStatus(1L, req, developer))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("진행중 → QA검토: 개발자 가능")
        void inProgress_to_qaReview_ok() {
            setupTicket(TicketStatus.IN_PROGRESS);
            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.QA_REVIEW.getCode());

            assertThatCode(() -> ticketService.changeStatus(1L, req, developer))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("QA검토 → 완료: 요청자만 가능")
        void qaReview_to_done_requester_ok() {
            setupTicket(TicketStatus.QA_REVIEW);
            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.DONE.getCode());

            assertThatCode(() -> ticketService.changeStatus(1L, req, requester))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("QA검토 → 완료: 개발자는 불가")
        void qaReview_to_done_developer_forbidden() {
            setupTicket(TicketStatus.QA_REVIEW);
            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.DONE.getCode());

            assertThatThrownBy(() -> ticketService.changeStatus(1L, req, developer))
                    .isInstanceOf(FailException.class)
                    .hasMessageContaining("요청자");
        }

        @Test
        @DisplayName("QA검토 → 진행중(재검토): 요청자, 사유 필수")
        void qaReview_to_inProgress_requester_reasonRequired() {
            setupTicket(TicketStatus.QA_REVIEW);
            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.IN_PROGRESS.getCode());

            assertThatThrownBy(() -> ticketService.changeStatus(1L, req, requester))
                    .isInstanceOf(FailException.class)
                    .hasMessageContaining("사유");
        }

        @Test
        @DisplayName("완료 → 대기(재오픈): 7일 이내 가능")
        void done_to_waiting_within7days_ok() {
            Ticket ticket = makeTicket(1L, TicketStatus.DONE);
            ticket.setCompletedAt(OffsetDateTime.now().minusDays(3));
            given(ticketRepository.selectById(1L)).willReturn(ticket);
            given(ticketRepository.selectHistoryByTicketId(1L)).willReturn(Collections.emptyList());

            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.WAITING.getCode());
            req.setReason("추가 수정 필요");

            assertThatCode(() -> ticketService.changeStatus(1L, req, requester))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("완료 → 대기(재오픈): 7일 초과 불가")
        void done_to_waiting_after7days_forbidden() {
            Ticket ticket = makeTicket(1L, TicketStatus.DONE);
            ticket.setCompletedAt(OffsetDateTime.now().minusDays(8));
            given(ticketRepository.selectById(1L)).willReturn(ticket);

            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.WAITING.getCode());
            req.setReason("재오픈");

            assertThatThrownBy(() -> ticketService.changeStatus(1L, req, requester))
                    .isInstanceOf(FailException.class)
                    .hasMessageContaining("7일");
        }

        @Test
        @DisplayName("완료 → 재오픈: 사유 필수")
        void done_to_waiting_reasonRequired() {
            Ticket ticket = makeTicket(1L, TicketStatus.DONE);
            ticket.setCompletedAt(OffsetDateTime.now().minusDays(1));
            given(ticketRepository.selectById(1L)).willReturn(ticket);

            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.WAITING.getCode());

            assertThatThrownBy(() -> ticketService.changeStatus(1L, req, requester))
                    .isInstanceOf(FailException.class)
                    .hasMessageContaining("사유");
        }

        @Test
        @DisplayName("상태 변경 시 관련자에게 STATUS_CHANGED 알림 발송")
        void changeStatus_sendsNotification() {
            Ticket ticket = makeTicket(1L, TicketStatus.IN_PROGRESS);
            ticket.setAssigneeId(developer.getId());
            ticket.setAssigneeName(developer.getDisplayName());
            given(ticketRepository.selectById(1L)).willReturn(ticket);
            given(ticketRepository.selectHistoryByTicketId(1L)).willReturn(Collections.emptyList());

            TicketStatusChangeReq req = new TicketStatusChangeReq();
            req.setStatus(TicketStatus.ON_HOLD.getCode());
            req.setReason("일정 지연으로 보류");

            ticketService.changeStatus(1L, req, developer);

            then(notificationService).should(atLeastOnce()).notifyMultiple(
                    anyList(), anyLong(), eq(1L), anyString(), anyString()
            );
        }
    }
}
