package com.innotium.devticket.domain.notification.dto;

import lombok.Data;
import java.time.OffsetDateTime;

@Data
public class NotificationRes {
    private Long id;
    private Long recipientId;
    private Long actorId;
    private String actorName;
    private Long ticketId;
    private String type;
    private String message;
    private boolean read;
    private OffsetDateTime createdAt;
}
