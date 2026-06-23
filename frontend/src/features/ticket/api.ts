import axiosInstance from '@/apis/axiosInstance';
import type { Ticket, TicketListRes, TicketStatus, TicketType } from '@/types/ticket';

export interface GetTicketsParams {
  page?: number;
  size?: number;
  ticketType?: TicketType | '';
  status?: TicketStatus | '';
  isUrgent?: boolean;
  keyword?: string;
  requesterId?: number;
  assigneeId?: number;
  productName?: string;
  /** 플랫폼 필터 */
  platform?: string;
}

export async function getTickets(params: GetTicketsParams = {}): Promise<TicketListRes> {
  const filteredParams: Record<string, unknown> = {};
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) {
      // 백엔드 page는 1-indexed
      filteredParams[k] = k === 'page' ? (v as number) + 1 : v;
    }
  });
  const res = await axiosInstance.get('/tickets', { params: filteredParams });
  return res.data;
}

export async function getTicket(id: number): Promise<Ticket> {
  const res = await axiosInstance.get(`/tickets/${id}`);
  return res.data;
}

export interface Developer {
  userId: number;
  username: string;
  displayName: string;
  groupName: string;
}

export async function getDevelopers(): Promise<Developer[]> {
  const res = await axiosInstance.get('/users/developers');
  return res.data;
}

export async function assignTicket(id: number, assigneeId: number): Promise<Ticket> {
  const res = await axiosInstance.put(`/tickets/${id}/assignee`, { assigneeId });
  return res.data;
}

export async function uploadAttachment(file: File): Promise<{ filename: string; originalName: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  const res = await axiosInstance.post('/v1/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export interface CreateTicketData {
  ticketType: TicketType;
  title: string;
  isUrgent: boolean;
  productName?: string;
  /** 플랫폼 구분 (필수) */
  platform: string;
  /** Error/Bug 식별자 */
  errorBug?: string;
  /** 빌드/버전 번호 */
  buildVersion?: string;
  /** ECM 업로드 경로 또는 QA 결과 파일 경로 */
  qaFilePath?: string;
  /** 첨부파일 저장명 (uploadAttachment 후 반환된 filename) */
  attachmentPath?: string;
  /** 요청자 희망 완료일 (YYYY-MM-DD) */
  requestedDueDate?: string;
  extraFields?: Record<string, unknown>;
}

export async function createTicket(data: CreateTicketData): Promise<Ticket> {
  const res = await axiosInstance.post('/tickets', data);
  return res.data;
}

export interface UpdateTicketData {
  title: string;
  isUrgent: boolean;
  productName?: string | null;
  platform?: string;
  errorBug?: string | null;
  buildVersion?: string | null;
  qaFilePath?: string | null;
  extraFields?: Record<string, unknown>;
  /** 요청자 희망 완료일 (등록자 수정 가능) */
  requestedDueDate?: string | null;
}

export async function updateTicket(id: number, data: UpdateTicketData): Promise<Ticket> {
  const res = await axiosInstance.patch(`/tickets/${id}`, data);
  return res.data;
}

export interface ChangeStatusData {
  toStatus: TicketStatus;
  reason?: string;
}

export async function changeStatus(id: number, data: ChangeStatusData): Promise<Ticket> {
  const res = await axiosInstance.put(`/tickets/${id}/status`, {
    status: data.toStatus,
    reason: data.reason,
  });
  return res.data;
}

export interface PickupTicketData {
  assigneeId?: number;
}

export async function pickupTicket(id: number, data: PickupTicketData = {}): Promise<Ticket> {
  const res = await axiosInstance.put(`/tickets/${id}/pickup`, data);
  return res.data;
}

export async function cancelPickup(id: number): Promise<Ticket> {
  const res = await axiosInstance.delete(`/tickets/${id}/pickup`);
  return res.data;
}

export async function deleteTicket(id: number): Promise<void> {
  await axiosInstance.delete(`/tickets/${id}`);
}

export async function updateUrgent(id: number, isUrgent: boolean): Promise<Ticket> {
  const res = await axiosInstance.put(`/tickets/${id}/urgent`, { isUrgent });
  return res.data;
}

export interface AdminReviewData {
  /** 변경할 상태: 2=검토완료, 3=진행가능, 8=반려 */
  status: number;
  reason?: string;
  difficulty?: number;
  expectedEffort?: number;
  effortUnit?: string;
  priority?: number;
}

export async function adminReview(id: number, data: AdminReviewData): Promise<Ticket> {
  const res = await axiosInstance.put(`/tickets/${id}/review`, data);
  return res.data;
}

export interface AdminReviewPatchData {
  difficulty?: number;
  expectedEffort?: number;
  effortUnit?: string;
  priority?: number;
  desiredDueDate?: string; // YYYY-MM-DD
}

export async function adminPatchReview(id: number, data: AdminReviewPatchData): Promise<Ticket> {
  const res = await axiosInstance.patch(`/tickets/${id}/review`, data);
  return res.data;
}
