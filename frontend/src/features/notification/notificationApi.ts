import axiosInstance from '@/apis/axiosInstance';

export interface NotificationItem {
  id: number;
  recipientId: number;
  actorId?: number;
  actorName?: string;
  ticketId: number;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationListRes {
  notifications: NotificationItem[];
  totalCount: number;
  unreadCount: number;
}

export async function getNotifications(): Promise<NotificationListRes> {
  const res = await axiosInstance.get<NotificationListRes>('/notifications');
  return res.data;
}

export async function getUnreadCount(): Promise<number> {
  const res = await axiosInstance.get<{ count: number }>('/notifications/unread-count');
  return res.data.count;
}

export async function markRead(id: number): Promise<void> {
  await axiosInstance.patch(`/notifications/${id}/read`);
}

export async function markAllRead(): Promise<void> {
  await axiosInstance.patch('/notifications/read-all');
}
