package com.innotium.devticket.domain.notification.repository;

import com.innotium.devticket.domain.notification.dto.NotificationRes;
import com.innotium.devticket.domain.notification.model.Notification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface NotificationRepository {
    void insert(Notification notification);
    List<NotificationRes> findByRecipient(@Param("recipientId") Long recipientId, @Param("limit") int limit);
    int countUnread(@Param("recipientId") Long recipientId);
    void markRead(@Param("id") Long id, @Param("recipientId") Long recipientId);
    void markAllRead(@Param("recipientId") Long recipientId);
    void deleteByTicketId(@Param("ticketId") Long ticketId);
}
