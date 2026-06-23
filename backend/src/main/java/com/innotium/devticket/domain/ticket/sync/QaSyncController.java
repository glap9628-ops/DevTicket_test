package com.innotium.devticket.domain.ticket.sync;

import com.innotium.devticket.common.exception.FailException;
import com.innotium.devticket.domain.ticket.sync.dto.QaSyncReq;
import com.innotium.devticket.domain.ticket.sync.dto.QaSyncRes;
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
 * CI/CD QA 오류 자동 등록 컨트롤러.
 *
 * <p>전체 URL: {@code POST /devticket/api/v1/tickets/qa}
 *
 * <p>인증: system 계정으로 로그인({@code POST /api/auth/login}) 후 발급된
 * JWT 쿠키({@code access_token})를 유지하여 호출한다.
 * JWT 만료(401) 시 CI/CD 측에서 재로그인 후 재시도.
 *
 * <p>응답은 항상 {@link QaSyncRes} 형태로 통일.
 */
@Slf4j
@RestController
@RequestMapping("/v1/tickets")
@RequiredArgsConstructor
public class QaSyncController {

    private final QaSyncService qaSyncService;

    /**
     * QA 오류 티켓 자동 등록.
     *
     * <pre>
     * POST /devticket/api/v1/tickets/qa
     * Header: X-Api-Key: {API_KEY}
     * Body:   QaSyncReq (JSON)
     * </pre>
     *
     * @return 201 Created + QaSyncRes
     */
    @PostMapping("/qa")
    public ResponseEntity<QaSyncRes> createQaTicket(@Valid @RequestBody QaSyncReq req) {
        QaSyncRes res = qaSyncService.createQaTicket(req);
        return ResponseEntity.status(HttpStatus.CREATED).body(res);
    }

    /* ── 컨트롤러 전용 예외 핸들러 ──────────────────────────────────────────
       GlobalExceptionHandler 보다 우선 적용되어 QaSyncRes 형식으로 응답한다. */

    /** Bean Validation 실패 → 400 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<QaSyncRes> handleValidation(MethodArgumentNotValidException ex) {
        FieldError fe = ex.getBindingResult().getFieldError();
        String msg = (fe != null) ? fe.getDefaultMessage() : "Invalid request";
        return ResponseEntity.badRequest().body(QaSyncRes.fail(msg));
    }

    /** 비즈니스 검증 실패 (ticketType != 1 등) → 400 */
    @ExceptionHandler(FailException.class)
    public ResponseEntity<QaSyncRes> handleFail(FailException ex) {
        return ResponseEntity.status(ex.getHttpStatus())
                .body(QaSyncRes.fail(ex.getMessageKey()));
    }

    /** 중복 티켓 → 409 Conflict + 기존 ticketId 반환 */
    @ExceptionHandler(DuplicateTicketException.class)
    public ResponseEntity<QaSyncRes> handleDuplicate(DuplicateTicketException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(QaSyncRes.duplicate(ex.getExistingTicketId()));
    }

    /** 그 외 예상치 못한 예외 → 500 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<QaSyncRes> handleUnexpected(Exception ex) {
        log.error("[QA_SYNC] Unexpected error: {}", ex.getMessage(), ex);
        return ResponseEntity.internalServerError()
                .body(QaSyncRes.fail("Internal server error"));
    }
}
