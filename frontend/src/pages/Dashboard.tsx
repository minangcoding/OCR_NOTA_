import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Receipt, Wallet, Users, TrendingUp } from 'lucide-react';
import api from '../services/api';

export default function Dashboard() {
  const [page, setPage] = useState(1);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboardStats', page],
    queryFn: async () => {
      const res = await api.get(`/reports/dashboard?page=${page}&limit=5`);
      return res.data.data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-[#fff0f3] dark:bg-[#121212] rounded-3xl">
        <Loader2 className="w-10 h-10 animate-spin text-[#a60016]" />
      </div>
    );
  }

  return (
    /* 
      Warna "Blush Pink" (#fff0f3) diaplikasikan di sini!
      Gunakan -m-6 p-6 agar warnanya menyebar ke seluruh sudut (tergantung padding layout Anda)
    */
    <div className="font-body-md text-gray-800 dark:text-white antialiased space-y-8 bg-[#fff0f3] dark:bg-transparent min-h-screen p-2 sm:p-6 -m-2 sm:-m-6 transition-colors duration-300">
      
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-[#1e293b] dark:text-white tracking-tight">System Activity Log</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your application activities and recent receipts.</p>
      </div>

      {/* === SUMMARY CARDS (DESAIN MIRIP MOCKUP) === */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Card 1: Total Receipts */}
        <div className="bg-white dark:bg-[#1a1a1c] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden group hover:shadow-md transition-all">
          {/* Lengkungan Pastel di Kanan (Sesuai Mockup) */}
          <div className="absolute right-0 top-0 bottom-0 w-2/5 bg-[#ffe4e6] dark:bg-red-900/10 rounded-l-[100px] transition-transform duration-500 group-hover:scale-105 origin-right"></div>
          
          <div className="relative z-10 flex justify-between items-start">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Total Receipts</p>
                <h3 className="text-4xl font-bold text-[#1e293b] dark:text-white">{stats?.totalReceipts || 0}</h3>
              </div>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> +All Time
              </p>
            </div>
            
            <div className="w-10 h-10 rounded-full bg-[#fda4af] dark:bg-red-500/20 text-[#9f1239] dark:text-red-400 flex items-center justify-center shadow-sm">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Card 2: Total Amount */}
        <div className="bg-white dark:bg-[#1a1a1c] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden group hover:shadow-md transition-all">
          {/* Lengkungan Pastel di Kanan */}
          <div className="absolute right-0 top-0 bottom-0 w-2/5 bg-[#dbeafe] dark:bg-blue-900/10 rounded-l-[100px] transition-transform duration-500 group-hover:scale-105 origin-right"></div>
          
          <div className="relative z-10 flex justify-between items-start">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Total Amount</p>
                <h3 className="text-3xl font-bold text-[#1e293b] dark:text-white mt-2 mb-1">Rp {(stats?.totalAmount || 0).toLocaleString('id-ID')}</h3>
              </div>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> +All Time
              </p>
            </div>
            
            <div className="w-10 h-10 rounded-full bg-[#93c5fd] dark:bg-blue-500/20 text-[#1e3a8a] dark:text-blue-400 flex items-center justify-center shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Card 3: Active Users */}
        <div className="bg-white dark:bg-[#1a1a1c] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden group hover:shadow-md transition-all">
          {/* Lengkungan Pastel di Kanan */}
          <div className="absolute right-0 top-0 bottom-0 w-2/5 bg-[#e0e7ff] dark:bg-indigo-900/10 rounded-l-[100px] transition-transform duration-500 group-hover:scale-105 origin-right"></div>
          
          <div className="relative z-10 flex justify-between items-start">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Active Users</p>
                <h3 className="text-4xl font-bold text-[#1e293b] dark:text-white">{stats?.activeUsers || 0}</h3>
              </div>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 flex items-center gap-1">
                Currently Active
              </p>
            </div>
            
            <div className="w-10 h-10 rounded-full bg-[#a5b4fc] dark:bg-indigo-500/20 text-[#3730a3] dark:text-indigo-400 flex items-center justify-center shadow-sm">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
      </section>

      {/* === BOTTOM SECTION: RECENT RECEIPTS TABLE === */}
      <section className="bg-white dark:bg-[#1a1a1c] rounded-[1.5rem] border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden mt-6">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1c]">
          <h2 className="text-lg font-bold text-[#1e293b] dark:text-white">Recent Receipts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-gray-50/50 dark:bg-[#202022] text-gray-500 dark:text-gray-400 text-[11px] font-bold border-b border-gray-100 dark:border-gray-800 uppercase tracking-wider">
                <th className="px-6 py-5">Receipt ID</th>
                <th className="px-6 py-5">Date</th>
                <th className="px-6 py-5">Submitter</th>
                <th className="px-6 py-5">Requester</th>
                <th className="px-6 py-5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300 text-sm">
              {!stats?.recentReceipts?.length ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-medium">
                    No recent receipts found.
                  </td>
                </tr>
              ) : (
                stats.recentReceipts.map((n: { id: string; date: string; user?: { name: string }; requester?: { name: string }; total: number | string }) => (
                  <tr key={n.id} className="hover:bg-gray-50/80 dark:hover:bg-[#202022] transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0 bg-white dark:bg-[#1a1a1c]">
                    <td className="px-6 py-4 font-medium">
                      <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-mono text-xs rounded-md font-bold">
                        #{n.id.substring(0, 6).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">
                      {new Date(n.date).toLocaleDateString('id-ID', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold">
                          {(n.user?.name || 'U').substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-bold text-[#1e293b] dark:text-white text-[13px]">{n.user?.name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[13px] font-medium text-gray-600 dark:text-gray-400">
                      {n.requester?.name || '-'}
                    </td>
                    <td className="px-6 py-4 font-bold text-[#1e293b] dark:text-white text-right">
                      Rp {Number(n.total).toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {stats?.recentPagination && stats.recentPagination.totalPages > 1 && (
          <div className="px-6 py-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-[#1a1a1c]">
            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              Showing page <span className="text-[#1e293b] dark:text-white font-bold">{stats.recentPagination.page}</span> of <span className="text-[#1e293b] dark:text-white font-bold">{stats.recentPagination.totalPages}</span>
            </div>
            <nav className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 font-bold rounded-xl text-[13px] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed bg-white dark:bg-[#252525] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(stats.recentPagination.totalPages, p + 1))}
                disabled={page === stats.recentPagination.totalPages}
                className="px-4 py-2 font-bold rounded-xl text-[13px] shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-[#a60016] text-white hover:bg-[#8b0012]"
              >
                Next
              </button>
            </nav>
          </div>
        )}
      </section>
    </div>
  );
}