import { useAuth } from './useAuth';

export const usePermission = (...permissions: string[]): boolean => {
  const { hasPermission } = useAuth();
  return hasPermission(...permissions);
};

export const useAnyPermission = (...permissions: string[]): boolean => {
  const { hasAnyPermission } = useAuth();
  return hasAnyPermission(...permissions);
};

export const useRole = (...roles: string[]): boolean => {
  const { hasRole } = useAuth();
  return hasRole(...roles);
};
