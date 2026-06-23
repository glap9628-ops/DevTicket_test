import axiosInstance from '@/apis/axiosInstance';

export interface CommentItem {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string;
  authorUsername: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export async function getComments(ticketId: number): Promise<CommentItem[]> {
  const res = await axiosInstance.get<CommentItem[]>(`/tickets/${ticketId}/comments`);
  return res.data;
}

export async function addComment(ticketId: number, content: string): Promise<CommentItem> {
  const res = await axiosInstance.post<CommentItem>(`/tickets/${ticketId}/comments`, { content });
  return res.data;
}

export async function updateComment(ticketId: number, commentId: number, content: string): Promise<CommentItem> {
  const res = await axiosInstance.put<CommentItem>(`/tickets/${ticketId}/comments/${commentId}`, { content });
  return res.data;
}

export async function deleteComment(ticketId: number, commentId: number): Promise<void> {
  await axiosInstance.delete(`/tickets/${ticketId}/comments/${commentId}`);
}
