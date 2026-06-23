export type UserRole = 'REQUESTER' | 'DEVELOPER' | 'ADMIN';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  groupId?: number;
  groupName?: string;
}
