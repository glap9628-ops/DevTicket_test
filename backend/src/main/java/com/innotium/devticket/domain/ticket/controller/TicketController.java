package com.innotium.devticket.domain.ticket.controller;

import com.innotium.devticket.common.auth.CurrentUser;
import com.innotium.devticket.common.auth.UserContextHolder;
import com.innotium.devticket.common.exception.FailException;
import com.innotium.devticket.common.response.ApiResponse;
import com.innotium.devticket.domain.ticket.dto.req.AssignTicketReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketCreateReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketPickupReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketReviewReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketSearchReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketStatusChangeReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketUpdateReq;
import com.innotium.devticket.domain.ticket.dto.req.TicketUrgentReq;
import com.innotium.devticket.domain.ticket.dto.res.TicketListRes;
import com.innotium.devticket.domain.ticket.dto.res.TicketRes;
import com.innotium.devticket.domain.ticket.service.TicketService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/tickets")
@RequiredArgsConstructor
public class TicketController {

    private final TicketService ticketService;

    @PostMapping
    public ApiResponse<TicketRes> createTicket(@RequestBody TicketCreateReq req) {
        CurrentUser user = UserContextHolder.get();
        return ApiResponse.ok(ticketService.createTicket(req, user));
    }

    @GetMapping
    public ApiResponse<TicketListRes> getTicketList(@ModelAttribute TicketSearchReq req) {
        return ApiResponse.ok(ticketService.getTicketList(req));
    }

    @GetMapping("/{id}")
    public ApiResponse<TicketRes> getTicket(@PathVariable Long id) {
        return ApiResponse.ok(ticketService.getTicket(id));
    }

    @PatchMapping("/{id}")
    public ApiResponse<TicketRes> updateTicket(@PathVariable Long id,
                                               @RequestBody TicketUpdateReq req) {
        CurrentUser user = UserContextHolder.get();
        return ApiResponse.ok(ticketService.updateTicket(id, req, user));
    }

    @PutMapping("/{id}/status")
    public ApiResponse<TicketRes> changeStatus(@PathVariable Long id,
                                                @RequestBody TicketStatusChangeReq req) {
        CurrentUser user = UserContextHolder.get();
        return ApiResponse.ok(ticketService.changeStatus(id, req, user));
    }

    /**
     * 관리자 검토 — 난이도/공수/우선순위 지정 + 상태 전이
     * 허용 전이: 검토대기→검토완료, 검토완료→진행가능, 검토대기/완료→반려
     */
    @PutMapping("/{id}/review")
    public ApiResponse<TicketRes> reviewTicket(@PathVariable Long id,
                                                @RequestBody TicketReviewReq req) {
        CurrentUser user = UserContextHolder.get();
        if (!"ADMIN".equals(user.getRole())) {
            throw new FailException(HttpStatus.FORBIDDEN, "관리자만 접근할 수 있습니다.");
        }
        return ApiResponse.ok(ticketService.reviewTicket(id, req, user));
    }

    /**
     * 관리자 평가 수정 — 상태 전환 없이 난이도/공수/우선순위만 수정
     */
    @PatchMapping("/{id}/review")
    public ApiResponse<TicketRes> patchReview(@PathVariable Long id,
                                               @RequestBody TicketReviewReq req) {
        CurrentUser user = UserContextHolder.get();
        if (!"ADMIN".equals(user.getRole())) {
            throw new FailException(HttpStatus.FORBIDDEN, "관리자만 접근할 수 있습니다.");
        }
        return ApiResponse.ok(ticketService.patchReviewFields(id, req, user));
    }

    @PutMapping("/{id}/pickup")
    public ApiResponse<TicketRes> pickupTicket(@PathVariable Long id,
                                                @RequestBody(required = false) TicketPickupReq req) {
        CurrentUser user = UserContextHolder.get();
        String role = user.getRole();
        if (!"DEVELOPER".equals(role) && !"ADMIN".equals(role)) {
            throw new FailException(HttpStatus.FORBIDDEN, "개발자 또는 관리자만 티켓을 픽업할 수 있습니다.");
        }
        if (req == null) req = new TicketPickupReq();
        return ApiResponse.ok(ticketService.pickupTicket(id, req, user));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTicket(@PathVariable Long id) {
        CurrentUser user = UserContextHolder.get();
        ticketService.deleteTicket(id, user);
    }

    @DeleteMapping("/{id}/pickup")
    public ApiResponse<TicketRes> cancelPickup(@PathVariable Long id) {
        CurrentUser user = UserContextHolder.get();
        return ApiResponse.ok(ticketService.cancelPickup(id, user));
    }

    /**
     * 관리자 담당자 지정 / 변경.
     * 픽업대기(3) → 진행중(4) 전환과 함께 담당자 지정.
     * 진행중(4)이면 상태 유지, 담당자만 교체.
     */
    @PutMapping("/{id}/assignee")
    public ApiResponse<TicketRes> assignTicket(@PathVariable Long id,
                                                @RequestBody AssignTicketReq req) {
        CurrentUser user = UserContextHolder.get();
        if (!"ADMIN".equals(user.getRole())) {
            throw new FailException(HttpStatus.FORBIDDEN, "관리자만 담당자를 지정할 수 있습니다.");
        }
        return ApiResponse.ok(ticketService.assignTicket(id, req, user));
    }

    @PutMapping("/{id}/urgent")
    public ApiResponse<TicketRes> updateUrgent(@PathVariable Long id,
                                                @RequestBody TicketUrgentReq req) {
        CurrentUser user = UserContextHolder.get();
        return ApiResponse.ok(ticketService.updateUrgent(id, req.getIsUrgent(), user));
    }
}
