import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, CheckCircle, XCircle } from 'lucide-react';
import api from '../../api/axios';
import type { AuditLog, ApiResponse } from '../../types';
import { Pagination } from '../../components/ui/Pagination';

const AuditLogs: React.FC = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, limit],
    queryFn: async () => {
      const res = await api.get<ApiResponse<AuditLog[]>>(`/roles/audit-logs?page=${page}&limit=${limit}`);
      return res.data;
    },
  });

  const logs = data?.data ?? [];
  const meta = data?.meta;
  const changeLimit = (l: number) => { setLimit(l); setPage(1); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="text-gray-500 text-sm mt-1">System activity and security events</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <FileText className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No audit logs yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">User</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Resource</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">IP</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {log.user ? (
                        <div>
                          <p className="font-medium text-gray-900 text-xs">
                            {log.user.firstName} {log.user.lastName}
                          </p>
                          <p className="text-gray-500 text-xs">{log.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs capitalize">{log.resource}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{log.ipAddress ?? '—'}</td>
                    <td className="px-4 py-3">
                      {log.success ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3.5 h-3.5" /> Success
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <XCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination meta={meta} onPageChange={setPage} limit={limit} onLimitChange={changeLimit} limitOptions={[25, 50, 100]} />
      </div>
    </div>
  );
};

export default AuditLogs;
