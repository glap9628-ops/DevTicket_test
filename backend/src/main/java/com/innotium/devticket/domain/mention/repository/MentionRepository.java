package com.innotium.devticket.domain.mention.repository;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface MentionRepository {

    void insertMention(@Param("ticketId") Long ticketId,
                       @Param("sourceType") String sourceType,
                       @Param("sourceId") Long sourceId,
                       @Param("mentionedUserId") Long mentionedUserId,
                       @Param("mentionedBy") Long mentionedBy);

    void deleteBySource(@Param("ticketId") Long ticketId,
                        @Param("sourceType") String sourceType,
                        @Param("sourceId") Long sourceId);
    void deleteByTicketId(@Param("ticketId") Long ticketId);
}
