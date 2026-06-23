package com.innotium.devticket.domain.notification.controller;

import com.innotium.devticket.common.auth.CurrentUser;
import com.innotium.devticket.common.auth.UserContextHolder;
import com.innotium.devticket.common.response.ApiResponse;
import com.innotium.devticket.domain.notification.dto.NotificationListRes;
import com.innotium.devticket.domain.notification.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    /** 내 알림 목록 */
    @GetMapping
    public ApiResponse<NotificationListRes> getNotifications() {
        CurrentUser user = UserContextHolder.get();
        return ApiResponse.ok(notificationService.getNotifications(user.getId()));
    }

    /** 미읽음 수 */
    @GetMapping("/unread-count")
    public ApiResponse<Map<String, Integer>> getUnreadCount() {
        CurrentUser user = UserContextHolder.get();
        int count = notificationService.getUnreadCount(user.getId());
        return ApiResponse.ok(Map.of("count", count));
    }

    /** 단건 읽음 처리 */
    @PatchMapping("/{id}/read")
    public ApiResponse<?> markRead(@PathVariable Long id) {
        CurrentUser user = UserContextHolder.get();
        notificationService.markRead(id, user.getId());
        return ApiResponse.ok();
    }

    /** 전체 읽음 처리 */
    @PatchMapping("/read-all")
    public ApiResponse<?> markAllRead() {
        CurrentUser user = UserContextHolder.get();
        notificationService.markAllRead(user.getId());
        return ApiResponse.ok();
    }
}
