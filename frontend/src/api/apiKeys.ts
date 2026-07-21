import api from './axios';
import type { ApiResponse, ApiKey } from '../types';

export const getApiKeys = () =>
  api.get<ApiResponse<ApiKey[]>>('/api-keys').then(r => r.data);

export const createApiKey = (data: { name: string; scopes: string[]; expiresAt?: string }) =>
  api.post<ApiResponse<ApiKey>>('/api-keys', data).then(r => r.data);

export const revokeApiKey = (id: string) =>
  api.post<ApiResponse<ApiKey>>(`/api-keys/${id}/revoke`).then(r => r.data);

export const deleteApiKey = (id: string) =>
  api.delete<ApiResponse<void>>(`/api-keys/${id}`).then(r => r.data);
