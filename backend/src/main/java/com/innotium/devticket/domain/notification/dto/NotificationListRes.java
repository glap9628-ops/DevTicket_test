package com.innotium.devticket.domain.notification.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class NotificationListRes {
    private List<NotificationRes> notifications;
    private int totalCount;
    private int unreadCount;
}
