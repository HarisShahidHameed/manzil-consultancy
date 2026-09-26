import api from './axios';
import type { ApiResponse, CaseStage, Client, VisaCase } from '../types';

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

// Appends a phase-tagged note to the client's running HR Comments log — never
// overwrites earlier entries. See backend appendClientHrComment.
export const appendHrComment = (id: string, phase: string, text: string) =>
  api.post<ApiResponse<Client>>(`/clients/${id}/hr-comments`, { phase, text }).then(r => r.data);

// Duplicate-passport lookup behind the client form's real-time warning. `stage` is the
// stage of the match's most recent visa case, or null when they have no case at all.
// An empty passport resolves to { exists: false, client: null } rather than erroring,
// so callers never have to special-case a half-typed field.
export interface PassportCheck {
  exists: boolean;
  client: null | {
    id: string;
    clientRef: string;
    firstName: string;
    lastName: string;
    stage: CaseStage | null;
  };
}

export const checkPassport = (passportNumber: string, excludeClientId?: string) =>
  api
    .get<ApiResponse<PassportCheck>>('/clients/check-passport', {
      // Omitted entirely rather than sent empty when creating — the backend treats a
      // present-but-blank excludeClientId as a uuid it has to parse.
      params: { passportNumber, ...(excludeClientId ? { excludeClientId } : {}) },
    })
    .then(r => r.data);

// Opens an additional visa case against an existing client — the multi-case path that lets
// a returning client apply for another country without a second, fragmented profile.
export const addClientCase = (clientId: string, data: unknown) =>
  api.post<ApiResponse<VisaCase>>(`/clients/${clientId}/cases`, data).then(r => r.data);

export interface ImportResult {
  imported: number;
  failed: number;
  duplicates: number;
  errors: { row: number; message: string }[];
}

export const importClients = (rows: unknown[]) =>
  api.post<ApiResponse<ImportResult>>('/clients/import', { rows }).then(r => r.data);
