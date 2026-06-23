import axiosInstance from '@/apis/axiosInstance';
import type { Dashboard } from '@/types/ticket';

export async function getDashboard(params?: { year?: number; month?: number }): Promise<Dashboard> {
  const res = await axiosInstance.get('/dashboard', { params });
  return res.data;
}
