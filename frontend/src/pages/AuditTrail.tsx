import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, FileText, ChevronDown, ChevronUp, RotateCcw, AlertTriangle, Trash2 } from 'lucide-react';
import api from '../services/api';
import { Link } from 'react-router-dom';

type AuditItem = {
  item_name: string;
  qty: number;
  price: number;
  subtotal: number;
};

type DiffItem =
  | (AuditItem & { status: 'added' | 'removed' | 'unchanged' })
  | (AuditItem & { status: 'modified'; prev: AuditItem });

export default function AuditTrail() {
  const queryClient = useQueryClient();
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);

  const { data: auditData, isLoading } = useQuery({
    queryKey: ['globalAuditTrail', page],
    queryFn: async () => {
      const res = await api.get(`/notes/versions/all?page=${page}&limit=5`);
      return res.data.data;
    }
  });

  const groupedNotes = auditData?.data || [];
  const pagination = auditData?.pagination;

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/notes/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalAuditTrail'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/notes/${id}/permanent`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['globalAuditTrail'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const handleRestore = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to restore this receipt?')) {
      restoreMutation.mutate(id);
    }
  };

  const handlePermanentDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('⚠️ PERMANENT DELETE\n\nThis will permanently remove this receipt and ALL its history.\nThis action CANNOT be undone!\n\nAre you sure?')) {
      permanentDeleteMutation.mutate(id);
    }
  };

  const toggleNote = (noteId: string) => {
    setExpandedNotes(prev => ({
      ...prev,
      [noteId]: !prev[noteId]
    }));
  };

  const renderItemDiff = (prevItems: AuditItem[] = [], currItems: AuditItem[] = []) => {
    const currentList: DiffItem[] = currItems.map((c): DiffItem => {
      const prev = prevItems.find(p => p.item_name === c.item_name);
      if (!prev) return { ...c, status: 'added' };
      if (prev.qty !== c.qty || prev.price !== c.price || prev.subtotal !== c.subtotal) {
        return { ...c, status: 'modified', prev };
      }
      return { ...c, status: 'unchanged' };
    });

    const removedList: DiffItem[] = prevItems
      .filter(p => !currItems.find(c => c.item_name === p.item_name))
      .map(p => ({ ...p, status: 'removed' }));

    const allItems = [...currentList, ...removedList];

    if (allItems.length === 0) return <p className="text-xs text-gray-400 dark:text-gray-500 italic">No items found.</p>;

    return (
      <ul className="space-y-2 mt-2">
        {allItems.map((item, idx) => (
          <li key={idx} className={`p-2.5 rounded border text-xs flex justify-between items-center transition-colors
            ${item.status === 'added' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : ''}
            ${item.status === 'removed' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 opacity-80' : ''}
            ${item.status === 'modified' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : ''}
            ${item.status === 'unchanged' ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700' : ''}
          `}>
            <div>
              <span className={`font-semibold block mb-0.5 ${item.status === 'removed' ? 'line-through text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
                {item.item_name}
                {item.status === 'added' && <span className="ml-2 text-[10px] bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-1.5 py-0.5 rounded-full">New</span>}
                {item.status === 'removed' && <span className="ml-2 text-[10px] bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 px-1.5 py-0.5 rounded-full">Removed</span>}
                {item.status === 'modified' && <span className="ml-2 text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded-full">Changed</span>}
              </span>
              {item.status === 'modified' ? (
                <span className="text-gray-500 dark:text-gray-400">
                  Qty: <span className="line-through decoration-red-400">{item.prev.qty}</span> <span className="text-green-600 dark:text-green-400 font-medium">→ {item.qty}</span> | 
                  Price: <span className="line-through decoration-red-400">{item.prev.price}</span> <span className="text-green-600 dark:text-green-400 font-medium">→ {item.price}</span>
                </span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">Qty: {item.qty} | Price: Rp {Number(item.price).toLocaleString('id-ID')}</span>
              )}
            </div>
            <span className="font-medium text-right">
              {item.status === 'modified' ? (
                <div className="flex flex-col">
                  <span className="line-through text-red-400 text-[10px]">Rp {Number(item.prev.subtotal).toLocaleString('id-ID')}</span>
                  <span className="text-amber-700 dark:text-amber-400">Rp {Number(item.subtotal).toLocaleString('id-ID')}</span>
                </div>
              ) : (
                <span className={item.status === 'removed' ? 'line-through text-red-500 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}>
                  Rp {Number(item.subtotal).toLocaleString('id-ID')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-[#fff0f3] dark:bg-[#121212] rounded-3xl">
        <Loader2 className="w-10 h-10 animate-spin text-[#a60016]" />
      </div>
    );
  }

  // Hitung jumlah receipts yang berstatus 'deleted' pada halaman ini untuk card "Receipts Restore"
  const deletedCount = groupedNotes?.filter((g: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => g.deleted_at).length || 0;

  return (
    /* WARNA BLUSH PINK (#fff0f3) DITERAPKAN DI SINI SEBAGAI BACKGROUND UTAMA */
    <div className="font-body-md text-gray-800 dark:text-white antialiased bg-[#fff0f3] dark:bg-transparent min-h-screen p-4 sm:p-6 -m-4 sm:-m-6 transition-colors duration-300">
      
      <div className="max-w-5xl mx-auto pb-12">
        {/* HEADER: Judul diubah, Logo & Deskripsi dihapus */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1e293b] dark:text-white tracking-tight">
            Audit Trail
          </h1>
        </div>

        {/* SUMMARY CARDS SECTION */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Card 1: Total Receipts */}
          <div className="bg-white dark:bg-[#1a1a1c] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden relative group hover:shadow-md transition-all">
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-blue-50 to-transparent dark:from-blue-900/10 transition-colors"></div>
            <div className="flex justify-between items-start relative z-10">
              <div>
                <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Total Receipts</p>
                <h3 className="text-4xl font-bold text-[#1e293b] dark:text-white">{pagination?.total || 0}</h3>
              </div>
              <div className="p-3 bg-[#e0e7ff] dark:bg-blue-900/30 rounded-full text-[#3730a3] dark:text-blue-400 shadow-sm">
                <FileText className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Card 2: Receipts Restore */}
          <div className="bg-white dark:bg-[#1a1a1c] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden relative group hover:shadow-md transition-all">
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-amber-50 to-transparent dark:from-amber-900/10 transition-colors"></div>
            <div className="flex justify-between items-start relative z-10">
              <div>
                <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Receipts Restore</p>
                <h3 className="text-4xl font-bold text-[#1e293b] dark:text-white">{deletedCount}</h3>
              </div>
              <div className="p-3 bg-[#fef08a] dark:bg-amber-900/30 rounded-full text-[#854d0e] dark:text-amber-400 shadow-sm">
                <RotateCcw className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {groupedNotes?.length === 0 && (
          <div className="bg-white dark:bg-[#1a1a1c] rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
            <p className="text-gray-500 dark:text-gray-400 font-medium">No recent activities found.</p>
          </div>
        )}

        {/* ACCORDION TIMELINE */}
        <div className="space-y-4">
          {groupedNotes?.map((group: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
            const isExpanded = expandedNotes[group.note_id];
            const latestUpdate = new Date(group.latest_update).toLocaleString('id-ID', {
              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            return (
              <div key={group.note_id} className="bg-white dark:bg-[#1a1a1c] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden transition-all hover:shadow-md">
                {/* Accordion Header */}
                <div 
                  onClick={() => toggleNote(group.note_id)}
                  className="p-5 sm:p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-[#202022] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-50 dark:bg-gray-800 hidden sm:flex items-center justify-center text-gray-500 dark:text-gray-400 shrink-0 border border-gray-100 dark:border-gray-700">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#1e293b] dark:text-white text-sm sm:text-[15px] flex items-center gap-2 flex-wrap">
                        Receipt: {group.buyer_name}
                        {group.deleted_at && (
                          <span className="flex items-center gap-1 bg-red-50 dark:bg-red-900/30 text-[#a60016] dark:text-red-400 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ml-2">
                            <AlertTriangle className="w-3 h-3" /> Deleted
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
                        {group.versions.length} versions • Last updated: {latestUpdate}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    {group.deleted_at ? (
                      <>
                        <button
                          onClick={(e) => handleRestore(e, group.note_id)}
                          disabled={restoreMutation.isPending}
                          className="text-xs font-bold text-white bg-amber-500 px-2.5 sm:px-4 py-2 rounded-xl hover:bg-amber-600 flex items-center gap-1.5 sm:gap-2 transition-colors shadow-sm"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Restore</span>
                        </button>
                        <button
                          onClick={(e) => handlePermanentDelete(e, group.note_id)}
                          disabled={permanentDeleteMutation.isPending}
                          className="text-xs font-bold text-[#a60016] bg-red-50 dark:bg-red-900/20 px-2.5 sm:px-4 py-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 flex items-center gap-1.5 sm:gap-2 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Delete Forever</span>
                        </button>
                      </>
                    ) : (
                      <Link 
                        to={`/receipts/${group.note_id}/edit`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-bold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 block transition-colors whitespace-nowrap"
                      >
                        <span className="sm:hidden">View</span>
                        <span className="hidden sm:inline">View Receipt</span>
                      </Link>
                    )}
                    <div className="p-1 ml-2 text-gray-400">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* Accordion Body (Timeline) */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-800 bg-[#fafafa] dark:bg-[#151517] p-5 sm:p-8">
                    <div className="relative pl-6 sm:pl-8">
                      {/* Vertical line */}
                      <div className="absolute left-[11px] sm:left-[19px] top-4 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>

                      <div className="space-y-10">
                        {group.versions.map((version: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => {
                          const isCreation = version.version_number === 1;
                          const currSnap = version.snapshot;
                          const prevSnap = version.previous_snapshot;

                          return (
                            <div key={version.id} className="relative">
                              {/* Dot */}
                              <div className="absolute -left-6 sm:-left-8 mt-1.5 w-3.5 h-3.5 bg-white dark:bg-[#1a1a1c] border-2 border-indigo-500 dark:border-indigo-400 rounded-full z-10 ring-4 ring-[#fafafa] dark:ring-[#151517]"></div>
                              
                              <div className="bg-white dark:bg-[#1a1a1c] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 sm:p-6 relative">
                                <div className="flex justify-between items-start mb-5">
                                  <div>
                                    <p className="font-bold text-[#1e293b] dark:text-white flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] tracking-wider uppercase font-bold text-white ${isCreation ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                                        v{version.version_number}
                                      </span>
                                      {isCreation ? 'Created by' : 'Modified by'} <span className="text-indigo-600 dark:text-indigo-400">{version.updated_by_name}</span>
                                    </p>
                                  </div>
                                  <p className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm font-medium">
                                    {new Date(version.updated_at).toLocaleString('id-ID', {
                                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                  </p>
                                </div>

                                <div className="border-t border-gray-100 dark:border-gray-800 pt-5">
                                  {isCreation ? (
                                    <div>
                                      <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase mb-3 font-bold tracking-widest">Initial Receipt Items</p>
                                      <div className="mb-4">
                                        <span className="text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg font-bold">
                                          Total Amount: Rp {Number(currSnap.total).toLocaleString('id-ID')}
                                        </span>
                                      </div>
                                      {renderItemDiff([], currSnap.items)}
                                    </div>
                                  ) : (
                                    <div>
                                      <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase mb-4 font-bold tracking-widest">Modification Details</p>
                                      
                                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* Left: Metadata Diff */}
                                        <div className="space-y-3">
                                          <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg">Metadata Changes</h4>
                                          <div className="text-sm px-1">
                                            <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-100 dark:border-gray-800">
                                              <span className="text-gray-500 dark:text-gray-400 font-medium">Total Amount</span>
                                              <span className="text-[#a60016] dark:text-red-400 line-through">Rp {Number(prevSnap?.total || 0).toLocaleString('id-ID')}</span>
                                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">Rp {Number(currSnap.total).toLocaleString('id-ID')}</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 py-2 border-b border-gray-100 dark:border-gray-800">
                                              <span className="text-gray-500 dark:text-gray-400 font-medium">Date</span>
                                              <span className="text-[#a60016] dark:text-red-400 line-through">{new Date(prevSnap?.date || '').toLocaleDateString('id-ID')}</span>
                                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{new Date(currSnap.date).toLocaleDateString('id-ID')}</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Right: Items Diff */}
                                        <div>
                                          <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg mb-3">Items Changes</h4>
                                          {renderItemDiff(prevSnap?.items, currSnap.items)}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination Controls */}
        {pagination && pagination.totalPages > 1 && (
          <div className="mt-8 bg-white dark:bg-[#1a1a1c] px-6 py-5 border border-gray-100 dark:border-gray-800 rounded-2xl flex items-center justify-between text-sm shadow-sm">
            <div className="text-gray-500 dark:text-gray-400 font-medium">
              Page <span className="font-bold text-[#1e293b] dark:text-white">{pagination.page}</span> of <span className="font-bold text-[#1e293b] dark:text-white">{pagination.totalPages}</span> ({pagination.total} receipts)
            </div>
            <nav className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#252525] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#202022] disabled:opacity-50 transition-colors font-bold text-[13px]"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#252525] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#202022] disabled:opacity-50 transition-colors font-bold text-[13px]"
              >
                Next
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
