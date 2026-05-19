import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Plus, Edit2, Trash2, Loader2, Search, FileText, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function Receipts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // 1. Logika Debounce: Tunggu user selesai mengetik (500ms) baru kirim ke backend
  // Ini mencegah API di-spam setiap kali user menekan 1 huruf
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset selalu ke halaman 1 setiap kali melakukan pencarian baru
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 2. Fetch data dari backend, sekarang mengirimkan page, limit, DAN debouncedSearch
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['notes', page, debouncedSearch],
    queryFn: async () => {
      // Membangun URL query
      let url = `/notes?page=${page}&limit=5`;
      
      // Jika ada kata kunci pencarian, tambahkan ke URL
      if (debouncedSearch) {
        // Asumsi: Backend Anda menerima parameter query bernama 'search'
        url += `&search=${encodeURIComponent(debouncedSearch)}`;
      }
      
      const res = await api.get(url);
      return res.data.data;
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/notes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const notes = data?.notes || [];
  const pagination = data?.pagination;

  // Kita tidak lagi menggunakan pencarian lokal (filter array). 
  // Semuanya sekarang di-handle oleh notes dari backend langsung.

  return (
    /* WARNA BLUSH PINK (#fff0f3) DITERAPKAN DI SINI BERSAMA DENGAN PADDING/MARGIN */
    <div className="font-body-md text-gray-800 dark:text-white antialiased bg-[#fff0f3] dark:bg-transparent min-h-screen p-4 sm:p-6 -m-4 sm:-m-6 transition-colors duration-300">
      
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        {/* ================= HEADER SECTION ================= */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#a60016]/10 dark:bg-red-900/30 rounded-xl text-[#a60016] dark:text-red-400 shadow-sm">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#1e293b] dark:text-white tracking-tight">Receipts</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage all your transaction receipts</p>
            </div>
          </div>
          
          <button
            onClick={() => navigate('/receipts/new')}
            className="w-full sm:w-auto bg-[#a60016] hover:bg-[#8b0012] text-white px-5 py-3 rounded-xl flex items-center justify-center space-x-2 text-sm font-bold shadow-md shadow-red-900/10 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4 font-bold" />
            <span>Add Receipt</span>
          </button>
        </div>

        {/* ================= MAIN CARD (TABLE & SEARCH) ================= */}
        <div className="bg-white dark:bg-[#1a1a1c] rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors duration-300">
          
          {/* Search Bar Container */}
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1c]">
            <div className="relative w-full max-w-md">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400">
                <Search className="w-4 h-4" />
              </span>
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search across all pages..." 
                className="w-full pl-11 pr-10 py-3 bg-gray-50 dark:bg-[#252525] border border-transparent focus:border-[#a60016] rounded-xl text-sm text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-900/20 transition-all shadow-sm"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-[#a60016] dark:hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Table Container */}
          {(isLoading || isFetching) ? (
            <div className="flex flex-col items-center justify-center py-24">
              <Loader2 className="w-10 h-10 text-[#a60016] animate-spin mb-4" />
              <p className="text-sm font-medium text-gray-500">Searching receipts data...</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-500">
              <div className="w-20 h-20 bg-gray-50 dark:bg-[#252525] rounded-full flex items-center justify-center mb-4">
                <FileText className="w-10 h-10 text-gray-400 dark:text-gray-600" />
              </div>
              <p className="text-lg font-bold text-[#1e293b] dark:text-white">
                {debouncedSearch ? "No matching receipts found" : "No receipts found"}
              </p>
              <p className="text-sm mt-1">{debouncedSearch ? "Try different keywords" : "Start by adding a new receipt"}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-[#202022] border-b border-gray-100 dark:border-gray-800">
                      <th className="px-6 py-5 text-[13px] font-bold text-[#1e293b] dark:text-gray-300 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-5 text-[13px] font-bold text-[#1e293b] dark:text-gray-300 uppercase tracking-wider">Buyer</th>
                      <th className="px-6 py-5 text-[13px] font-bold text-[#1e293b] dark:text-gray-300 uppercase tracking-wider">Requester</th>
                      <th className="px-6 py-5 text-[13px] font-bold text-[#1e293b] dark:text-gray-300 uppercase tracking-wider">Category</th>
                      <th className="px-6 py-5 text-[13px] font-bold text-[#1e293b] dark:text-gray-300 uppercase tracking-wider">Total</th>
                      {isAdmin && <th className="px-6 py-5 text-[13px] font-bold text-[#1e293b] dark:text-gray-300 uppercase tracking-wider text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {notes.map((note: any) => (
                      <tr key={note.id} className="hover:bg-gray-50/80 dark:hover:bg-[#202022] transition-colors group bg-white dark:bg-[#1a1a1c]">
                        <td className="px-6 py-4">
                          <span className="text-[14px] font-medium text-gray-600 dark:text-gray-400">
                            {new Date(note.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-[14px] text-[#1e293b] dark:text-white">
                          {note.buyer?.name || '-'}
                        </td>
                        <td className="px-6 py-4 text-[14px] text-gray-600 dark:text-gray-300">
                          {note.requester?.name || '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-bold tracking-wide bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {note.category?.name} <span className="opacity-60 ml-1">({note.category?.code})</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-[15px] text-[#1e293b] dark:text-white">
                          Rp {Number(note.total).toLocaleString('id-ID')}
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => navigate(`/receipts/${note.id}/edit`)}
                                className="p-2 text-gray-400 hover:text-[#a60016] dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm('Are you sure you want to delete this receipt? This action cannot be undone.')) {
                                    deleteMutation.mutate(note.id);
                                  }
                                }}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination API */}
              {pagination && pagination.totalPages > 1 && (
                <div className="px-6 py-5 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-[#1a1a1c]">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Page <span className="font-bold text-gray-800 dark:text-white">{pagination.page}</span> of <span className="font-bold text-gray-800 dark:text-white">{pagination.totalPages}</span>
                    <span className="hidden sm:inline"> ({pagination.total} receipts)</span>
                  </div>
                  
                  <nav className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#252525] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      &lt; Prev
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                      disabled={page === pagination.totalPages}
                      className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#252525] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next &gt;
                    </button>
                  </nav>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}