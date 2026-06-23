package com.innotium.devticket.domain.notification.model;

import lombok.Data;
import java.time.OffsetDateTime;

@Data
public class Notification {
    private Long id;
    private Long recipientId;
    private Long actorId;
    private Long ticketId;
    private String type;
    private String message;
    private boolean isRead;
    private OffsetDateTime createdAt;
}
