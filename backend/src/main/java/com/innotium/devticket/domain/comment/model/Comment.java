package com.innotium.devticket.domain.comment.model;

import lombok.Data;
import java.time.OffsetDateTime;

@Data
public class Comment {
    private Long id;
    private Long ticketId;
    private Integer authorId;
    private String content;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
