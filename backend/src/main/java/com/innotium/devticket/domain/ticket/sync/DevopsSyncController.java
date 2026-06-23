package com.innotium.devticket.domain.ticket.sync;

import com.innotium.devticket.domain.ticket.sync.dto.DevopsSyncReq;
import com.innotium.devticket.domain.ticket.sync.dto.DevopsSyncRes;
import com.innotium.devticket.domain.ticket.sync.exception.DuplicateTicketException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

/**
 * DevOps 장애이슈 자동 등록 컨트롤러.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  POST /devticket/api/v1/tickets/devops                           │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  인증  Cookie: access_token={JWT}                                │
 * │        - POST /api/auth/login 으로 로그인 후 발급된 JWT 쿠키 사용 │
 * │        - 만료(401) 시 재로그인 후 재시도                         │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  요청  Content-Type: application/json                            │
 * │        DevopsSyncReq (body) 참조                                 │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  응답  201 Created   → { success:true,  ticketId:<생성 ID> }     │
 * │        400 Bad Request → { success:false, message:<오류 사유> }  │
 * │        500 Internal  → { success:false, message:"Internal..." } │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * 호출 시점: QA팀 2차 확인 완료 → 개발팀 이관 결정 시
 * 생성 결과: ticketType=2(장애/오류), 상태=접수대기, ticketNo=BUG-NNNN
 */
@Slf4j
@RestController
@RequestMapping("/v1/tickets")
@RequiredArgsConstructor
public class DevopsSyncController {

    private final DevopsSyncService devopsSyncService;

    /**
     * DevOps 장애 티켓 자동 등록.
     *
     * @return 201 Created + DevopsSyncRes
     */
    @PostMapping("/devops")
    public ResponseEntity<DevopsSyncRes> createDevopsTicket(@Valid @RequestBody DevopsSyncReq req) {
        DevopsSyncRes res = devopsSyncService.createDevopsTicket(req);
        return ResponseEntity.status(HttpStatus.CREATED).body(res);
    }

    /** Bean Validation 실패 → 400 (필수 필드 누락, 허용값 위반 등) */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<DevopsSyncRes> handleValidation(MethodArgumentNotValidException ex) {
        FieldError fe = ex.getBindingResult().getFieldError();
        String msg = (fe != null) ? fe.getDefaultMessage() : "Invalid request";
        return ResponseEntity.badRequest().body(DevopsSyncRes.fail(msg));
    }

    /** 그 외 예상치 못한 예외 → 500 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<DevopsSyncRes> handleUnexpected(Exception ex) {
        log.error("[DEVOPS_SYNC] Unexpected error: {}", ex.getMessage(), ex);
        return ResponseEntity.internalServerError()
                .body(DevopsSyncRes.fail("Internal server error"));
    }
}
