package com.innotium.devticket.common.exception;

import com.innotium.devticket.common.exception.base.BaseException;
import org.springframework.http.HttpStatus;

public class FailException extends BaseException {

    public FailException(String messageKey) {
        super(HttpStatus.BAD_REQUEST, messageKey);
    }

    public FailException(String messageKey, String detail) {
        super(HttpStatus.BAD_REQUEST, messageKey, detail);
    }

    public FailException(HttpStatus status, String messageKey) {
        super(status, messageKey);
    }
}
