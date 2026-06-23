package com.innotium.devticket.domain.notification.service;

import com.innotium.devticket.domain.notification.dto.NotificationListRes;
import com.innotium.devticket.domain.notification.dto.NotificationRes;
import com.innotium.devticket.domain.notification.model.Notification;
import com.innotium.devticket.domain.notification.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;

    /** 알림 1건 생성 (자기 자신에게는 생성하지 않음) */
    @Transactional
    public void notify(Long recipientId, Long actorId, Long ticketId, String type, String message) {
        if (recipientId == null || recipientId.equals(actorId)) return;
        Notification n = new Notification();
        n.setRecipientId(recipientId);
        n.setActorId(actorId);
        n.setTicketId(ticketId);
        n.setType(type);
        n.setMessage(message);
        notificationRepository.insert(n);
    }

    /** 여러 수신자에게 동일 알림 생성 (null 제거, 자기 자신 제외, 중복 제거) */
    @Transactional
    public void notifyMultiple(List<Long> recipientIds, Long actorId, Long ticketId, String type, String message) {
        recipientIds.stream()
                .filter(id -> id != null && !id.equals(actorId))
                .distinct()
                .forEach(id -> notify(id, actorId, ticketId, type, message));
    }

    /** 내 알림 목록 조회 (최대 100건) */
    @Transactional(readOnly = true)
    public NotificationListRes getNotifications(Long recipientId) {
        List<NotificationRes> list = notificationRepository.findByRecipient(recipientId, 100);
        int unread = notificationRepository.countUnread(recipientId);
        return new NotificationListRes(list, list.size(), unread);
    }

    /** 미읽음 수 조회 */
    @Transactional(readOnly = true)
    public int getUnreadCount(Long recipientId) {
        return notificationRepository.countUnread(recipientId);
    }

    /** 단건 읽음 처리 */
    @Transactional
    public void markRead(Long id, Long recipientId) {
        notificationRepository.markRead(id, recipientId);
    }

    /** 전체 읽음 처리 */
    @Transactional
    public void markAllRead(Long recipientId) {
        notificationRepository.markAllRead(recipientId);
    }
}
