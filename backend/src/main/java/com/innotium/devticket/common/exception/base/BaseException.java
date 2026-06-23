package com.innotium.devticket.common.exception.base;

import org.springframework.http.HttpStatus;

public abstract class BaseException extends RuntimeException {
    private final HttpStatus httpStatus;
    private final String messageKey;
    private final String detail;

    protected BaseException(HttpStatus status, String messageKey) {
        super(messageKey);
        this.httpStatus = status;
        this.messageKey = messageKey;
        this.detail = null;
    }

    protected BaseException(HttpStatus status, String messageKey, String detail) {
        super(messageKey);
        this.httpStatus = status;
        this.messageKey = messageKey;
        this.detail = detail;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }

    public String getMessageKey() {
        return messageKey;
    }

    public String getDetail() {
        return detail;
    }
}
