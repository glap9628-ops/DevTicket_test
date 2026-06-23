package com.innotium.devticket.domain.comment.repository;

import com.innotium.devticket.domain.comment.dto.CommentRes;
import com.innotium.devticket.domain.comment.model.Comment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CommentRepository {
    List<CommentRes> findByTicketId(@Param("ticketId") Long ticketId);
    void insert(Comment comment);
    CommentRes findById(@Param("id") Long id);
    void update(@Param("id") Long id, @Param("authorId") Integer authorId, @Param("content") String content);
    void updateById(@Param("id") Long id, @Param("content") String content);
    void delete(@Param("id") Long id, @Param("authorId") Integer authorId);
    void deleteById(@Param("id") Long id);
    void deleteByTicketId(@Param("ticketId") Long ticketId);
}
