import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface Props {
  permissions?: string[];
  roles?: string[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
}

export const RoleGuard: React.FC<Props> = ({
  permissions = [],
  roles = [],
  requireAll = true,
  fallback,
}) => {
  const { hasPermission, hasAnyPermission, hasRole } = useAuth();

  const permOk =
    permissions.length === 0
      ? true
      : requireAll
      ? hasPermission(...permissions)
      : hasAnyPermission(...permissions);

  const roleOk = roles.length === 0 ? true : hasRole(...roles);

  if (!permOk || !roleOk) {
    if (fallback) return <>{fallback}</>;
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
};

// Inline component variant (not a route wrapper)
export const Can: React.FC<Props & { children: React.ReactNode }> = ({
  permissions = [],
  roles = [],
  requireAll = true,
  children,
  fallback,
}) => {
  const { hasPermission, hasAnyPermission, hasRole } = useAuth();

  const permOk =
    permissions.length === 0
      ? true
      : requireAll
      ? hasPermission(...permissions)
      : hasAnyPermission(...permissions);

  const roleOk = roles.length === 0 ? true : hasRole(...roles);

  if (!permOk || !roleOk) return fallback ? <>{fallback}</> : null;
  return <>{children}</>;
};
