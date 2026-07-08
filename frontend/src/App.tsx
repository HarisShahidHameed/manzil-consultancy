import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { RoleGuard } from './routes/RoleGuard';
import { Layout } from './components/layout/Layout';

const Login        = lazy(() => import('./pages/auth/Login'));
const Register     = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const Dashboard    = lazy(() => import('./pages/dashboard/Dashboard'));
const Users        = lazy(() => import('./pages/admin/Users'));
const Roles        = lazy(() => import('./pages/admin/Roles'));
const Permissions  = lazy(() => import('./pages/admin/Permissions'));
const AuditLogs    = lazy(() => import('./pages/admin/AuditLogs'));
const Forbidden    = lazy(() => import('./pages/Forbidden'));
// Phase 2
const ClientList   = lazy(() => import('./pages/clients/ClientList'));
const ClientForm   = lazy(() => import('./pages/clients/ClientForm'));
const ClientDetail = lazy(() => import('./pages/clients/ClientDetail'));
const Groups       = lazy(() => import('./pages/groups/Groups'));
const AppointmentList = lazy(() => import('./pages/appointments/AppointmentList'));
const CaseDetail   = lazy(() => import('./pages/appointments/CaseDetail'));
const InvoiceList  = lazy(() => import('./pages/invoices/InvoiceList'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/403" element={<Forbidden />} />

            {/* Protected */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />

                {/* Clients */}
                <Route element={<RoleGuard permissions={['clients:read']} />}>
                  <Route path="/clients" element={<ClientList />} />
                </Route>
                <Route element={<RoleGuard permissions={['clients:write']} />}>
                  <Route path="/clients/new" element={<ClientForm />} />
                  <Route path="/clients/:id/edit" element={<ClientForm />} />
                </Route>
                <Route element={<RoleGuard permissions={['clients:read']} />}>
                  <Route path="/clients/:id" element={<ClientDetail />} />
                </Route>
                <Route element={<RoleGuard permissions={['clients:read']} />}>
                  <Route path="/groups" element={<Groups />} />
                </Route>

                {/* Appointments — the queue every new case lands in (Waiting → Assigned → Registered) */}
                <Route element={<RoleGuard permissions={['appointments:read', 'clients:read']} requireAll={false} />}>
                  <Route path="/appointments" element={<AppointmentList stage="APPOINTMENT" title="Appointments" showStatusTabs />} />
                </Route>

                {/* File Processing shortcut — shows only FILE_PROCESSING stage cases */}
                <Route element={<RoleGuard permissions={['files:read', 'clients:read']} requireAll={false} />}>
                  <Route path="/file-processing" element={<AppointmentList stage="FILE_PROCESSING" title="File Processing" />} />
                </Route>

                {/* Completed — shows only COMPLETED stage cases */}
                <Route element={<RoleGuard permissions={['appointments:read', 'files:read', 'invoices:read', 'clients:read']} requireAll={false} />}>
                  <Route path="/completed" element={<AppointmentList stage="COMPLETED" title="Completed" />} />
                </Route>

                {/* Case detail (shared across appointment + file processing) */}
                <Route element={<RoleGuard permissions={['appointments:read', 'files:read', 'clients:read']} requireAll={false} />}>
                  <Route path="/cases/:id" element={<CaseDetail />} />
                </Route>

                {/* Invoices */}
                <Route element={<RoleGuard permissions={['invoices:read']} />}>
                  <Route path="/invoices" element={<InvoiceList />} />
                </Route>

                {/* Admin */}
                <Route element={<RoleGuard permissions={['users:read']} />}>
                  <Route path="/admin/users" element={<Users />} />
                </Route>
                <Route element={<RoleGuard permissions={['roles:read']} />}>
                  <Route path="/admin/roles" element={<Roles />} />
                </Route>
                <Route element={<RoleGuard permissions={['permissions:read']} />}>
                  <Route path="/admin/permissions" element={<Permissions />} />
                </Route>
                <Route element={<RoleGuard permissions={['audit:read']} />}>
                  <Route path="/admin/audit-logs" element={<AuditLogs />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);

export default App;
