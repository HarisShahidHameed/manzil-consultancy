import api from './axios';
import type { ApiResponse, Client, VisaCase } from '../types';

export const getClients = (params?: Record<string, string>) =>
  api.get<ApiResponse<Client[]>>('/clients', { params }).then(r => r.data);

export const getClient = (id: string) =>
  api.get<ApiResponse<Client>>(`/clients/${id}`).then(r => r.data);

export const createClient = (data: unknown) =>
  api.post<ApiResponse<Client>>('/clients', data).then(r => r.data);

export const updateClient = (id: string, data: unknown) =>
  api.put<ApiResponse<Client>>(`/clients/${id}`, data).then(r => r.data);

export const deleteClient = (id: string) =>
  api.delete<ApiResponse<void>>(`/clients/${id}`).then(r => r.data);

export const addCase = (clientId: string, data: unknown) =>
  api.post<ApiResponse<VisaCase>>(`/clients/${clientId}/cases`, data).then(r => r.data);
