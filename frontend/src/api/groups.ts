import api from './axios';
import type { ApiResponse, ClientGroup } from '../types';

export const getGroups = (params?: Record<string, string>) =>
  api.get<ApiResponse<ClientGroup[]>>('/groups', { params }).then(r => r.data);

export const getGroup = (id: string) =>
  api.get<ApiResponse<ClientGroup>>(`/groups/${id}`).then(r => r.data);

export const createGroup = (data: { name: string; relation?: string; notes?: string }) =>
  api.post<ApiResponse<ClientGroup>>('/groups', data).then(r => r.data);

export const updateGroup = (id: string, data: { name?: string; relation?: string; notes?: string }) =>
  api.put<ApiResponse<ClientGroup>>(`/groups/${id}`, data).then(r => r.data);

export const deleteGroup = (id: string) =>
  api.delete<ApiResponse<void>>(`/groups/${id}`).then(r => r.data);

export const addGroupMembers = (id: string, clientIds: string[]) =>
  api.post<ApiResponse<ClientGroup>>(`/groups/${id}/members`, { clientIds }).then(r => r.data);

export const removeGroupMember = (id: string, clientId: string) =>
  api.delete<ApiResponse<ClientGroup>>(`/groups/${id}/members/${clientId}`).then(r => r.data);
