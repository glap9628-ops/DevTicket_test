import axiosInstance from '@/apis/axiosInstance';

export interface UserSearchResult {
  userId: number;
  username: string;
  displayName: string;
  groupName: string;
}

export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  if (q.length < 2) return [];
  const res = await axiosInstance.get('/users/search', { params: { q } });
  return res.data;
}
