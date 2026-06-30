import api from './axios';
import type { ApiResponse, AssignableUser } from '../types';

export const getAssignableUsers = () =>
  api.get<ApiResponse<AssignableUser[]>>('/users/assignable').then(r => r.data);
