package com.innotium.devticket.domain.ticket.sync.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * DevOps 장애이슈 자동 등록 API 응답 DTO.
 * <p>
 * 성공: {@code success=true,  ticketId=<생성된 ID>}
 * 중복: {@code success=false, ticketId=<기존 ID>,   message="Duplicate ticket already exists"}
 * 실패: {@code success=false, ticketId=null,         message=<오류 설명>}
 */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class DevopsSyncRes {

    private boolean success;
    private Long    ticketId;
    private String  message;

    public static DevopsSyncRes ok(Long ticketId) {
        return DevopsSyncRes.builder()
                .success(true)
                .ticketId(ticketId)
                .message("DevOps ticket created successfully")
                .build();
    }

    public static DevopsSyncRes duplicate(Long existingTicketId) {
        return DevopsSyncRes.builder()
                .success(false)
                .ticketId(existingTicketId)
                .message("Duplicate ticket already exists")
                .build();
    }

    public static DevopsSyncRes fail(String message) {
        return DevopsSyncRes.builder()
                .success(false)
                .message(message != null ? message : "Invalid request")
                .build();
    }
}
