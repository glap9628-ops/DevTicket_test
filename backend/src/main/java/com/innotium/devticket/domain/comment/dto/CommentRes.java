package com.innotium.devticket.domain.comment.dto;

import lombok.Data;
import java.time.OffsetDateTime;

@Data
public class CommentRes {
    private Long id;
    private Long ticketId;
    private Integer authorId;
    private String authorName;
    private String authorUsername;
    private String content;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
