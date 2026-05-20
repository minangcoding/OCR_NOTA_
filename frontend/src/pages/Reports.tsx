import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { BarChart2, Download, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../services/api';

const CHART_COLORS = ['#3b82f6', '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

type PeriodOption = {
  label: string;
  startDate: string;
  endDate: string;
  chartTitle: string;
};

function getPeriodOptions(): PeriodOption[] {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const last7 = new Date(now); last7.setDate(now.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  return [
    { label: 'Last 7 Days',  startDate: fmt(last7),      endDate: fmt(now), chartTitle: 'Daily Trends (Last 7 Days)'  },
    { label: 'This Month',   startDate: fmt(monthStart), endDate: fmt(now), chartTitle: 'Daily Trends (This Month)'   },
    { label: 'This Year',    startDate: fmt(yearStart),  endDate: fmt(now), chartTitle: 'Monthly Trends (This Year)'  },
    { label: 'All Time',     startDate: '',              endDate: '',       chartTitle: 'All Time Trends'             },
  ];
}

export default function Reports() {
  const periods = getPeriodOptions();
  const [selectedPeriod, setSelectedPeriod] = useState(3);
  const [page, setPage] = useState(1);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const period = periods[selectedPeriod];
  const queryParams = period.startDate ? `startDate=${period.startDate}&endDate=${period.endDate}` : '';

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['reportSummary', period.startDate, period.endDate],
    queryFn: async () => {
      const res = await api.get(`/reports/summary${queryParams ? '?' + queryParams : ''}`);
      return res.data.data;
    },
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['reportTransactions', period.startDate, period.endDate, page],
    queryFn: async () => {
      const res = await api.get(`/reports/transactions?${queryParams ? queryParams + '&' : ''}page=${page}&limit=5`);
      return res.data.data;
    },
  });

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const res = await api.get(`/reports/export/excel${queryParams ? '?' + queryParams : ''}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url; link.setAttribute('download', 'report.xlsx');
      document.body.appendChild(link); link.click(); link.remove();
    } catch { alert('Failed to export Excel'); }
    finally { setExportingExcel(false); }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await api.get(`/reports/export/pdf${queryParams ? '?' + queryParams : ''}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url; link.setAttribute('download', 'report.pdf');
      document.body.appendChild(link); link.click(); link.remove();
    } catch { alert('Failed to export PDF'); }
    finally { setExportingPdf(false); }
  };

  const pieData = summary?.spendingByCategory?.map((c: { category_name: string; total: number }) => ({
    name: c.category_name, value: c.total,
  })) ?? [];

  // Backend selalu pakai alias 'month' di SELECT — baik mode daily maupun monthly
  const areaData = summary?.monthlyTrends ?? [];

  return (
    /* WARNA BLUSH PINK (#fff0f3) DITERAPKAN DI SINI SEBAGAI WRAPPER UTAMA */
    <div className="font-body-md text-gray-800 dark:text-white antialiased bg-[#fff0f3] dark:bg-transparent min-h-screen p-4 sm:p-6 -m-4 sm:-m-6 transition-colors duration-300">
      <div className="max-w-7xl mx-auto pb-12">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 shadow-sm">
              <BarChart2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#1e293b] dark:text-white tracking-tight">Reporting & Export Center</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Analyze spending trends and export data</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Period:</span>
            <select
              value={selectedPeriod}
              onChange={(e) => { setSelectedPeriod(Number(e.target.value)); setPage(1); }}
              className="bg-white dark:bg-[#252525] border border-gray-200 dark:border-gray-700 text-sm font-semibold rounded-xl px-4 py-2.5 focus:ring-[#a60016] focus:border-[#a60016] text-[#1e293b] dark:text-white transition-colors shadow-sm outline-none cursor-pointer"
            >
              {periods.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-[#1a1a1c] rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-green-50 to-transparent dark:from-green-900/10 transition-colors"></div>
            <div className="relative z-10">
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Total Spending</p>
              <p className="text-4xl font-bold text-[#1e293b] dark:text-white">Rp {(summary?.totalSpend ?? 0).toLocaleString('id-ID')}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-[#1a1a1c] rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-blue-50 to-transparent dark:from-blue-900/10 transition-colors"></div>
            <div className="relative z-10">
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Total Receipts</p>
              <p className="text-4xl font-bold text-[#1e293b] dark:text-white">{summary?.noteCount ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Pie Chart */}
          <div className="bg-white dark:bg-[#1a1a1c] rounded-[1.5rem] p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
              <h2 className="text-lg font-bold text-[#1e293b] dark:text-white">Spending by Category</h2>
              <div className="flex gap-2">
                <button onClick={handleExportExcel} disabled={exportingExcel}
                  className="flex items-center gap-2 bg-gray-50 dark:bg-[#252525] font-bold text-xs px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors shadow-sm">
                  {exportingExcel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>Excel</span><div className="w-2 h-2 bg-green-500 rounded-full ml-1" />
                </button>
                <button onClick={handleExportPdf} disabled={exportingPdf}
                  className="flex items-center gap-2 bg-gray-50 dark:bg-[#252525] font-bold text-xs px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors shadow-sm">
                  {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>PDF</span><div className="w-2 h-2 bg-[#a60016] rounded-full ml-1" />
                </button>
              </div>
            </div>
            {summaryLoading ? (
              <div className="h-52 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#a60016]" /></div>
            ) : pieData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-gray-400 font-medium text-sm bg-gray-50 dark:bg-[#252525] rounded-xl border border-dashed border-gray-200 dark:border-gray-700 m-2">No data available</div>
            ) : (
              <>
                {/* Chart tanpa label di atas slice — semua label pindah ke legend di bawah */}
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      label={false}
                      labelLine={false}
                    >
                      {pieData.map((_: unknown, idx: number) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value, name) => [
                        `Rp ${Number(value ?? 0).toLocaleString('id-ID')}`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Custom legend di bawah — tidak akan terpotong */}
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-3 mt-4 px-2">
                  {pieData.map((entry: { name: string; value: number }, idx: number) => {
                    const total = pieData.reduce((s: number, d: { value: number }) => s + d.value, 0);
                    const pct = total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0;
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                        <span className="text-[13px] font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {entry.name} <span className="font-bold text-[#1e293b] dark:text-white ml-1">{pct}%</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Area Chart */}
          <div className="bg-white dark:bg-[#1a1a1c] rounded-[1.5rem] p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex items-start justify-between mb-6">
              {/* ✅ Judul dinamis sesuai period yang dipilih */}
              <h2 className="text-lg font-bold text-[#1e293b] dark:text-white">{period.chartTitle}</h2>
              <div className="text-right">
                <p className="text-xl font-bold text-[#a60016]">Rp {(summary?.totalSpend ?? 0).toLocaleString('id-ID')}</p>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mt-1">Total Spend</p>
              </div>
            </div>
            {summaryLoading ? (
              <div className="h-[240px] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#a60016]" /></div>
            ) : areaData.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-gray-400 font-medium text-sm bg-gray-50 dark:bg-[#252525] rounded-xl border border-dashed border-gray-200 dark:border-gray-700 m-2">No data available</div>
            ) : (
              // ✅ key={selectedPeriod} → paksa chart remount setiap ganti period
              <ResponsiveContainer key={selectedPeriod} width="100%" height={240}>
                <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a60016" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a60016" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  {/* ✅ dataKey='month' — backend selalu pakai alias 'month' di SQL SELECT */}
                  <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600, fill: '#9ca3af' }} stroke="none" dy={10} />
                  <YAxis tick={{ fontSize: 11, fontWeight: 600, fill: '#9ca3af' }} stroke="none" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                    formatter={(value) => `Rp ${Number(value ?? 0).toLocaleString('id-ID')}`}
                  />
                  <Area type="monotone" dataKey="total" stroke="#a60016" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Transaction Table */}
        <section className="bg-white dark:bg-[#1a1a1c] rounded-[1.5rem] border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1c]">
            <h2 className="text-lg font-bold text-[#1e293b] dark:text-white">Transaction Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-[#202022] text-gray-500 dark:text-gray-400 text-[11px] font-bold border-b border-gray-100 dark:border-gray-800 uppercase tracking-wider">
                  <th className="px-6 py-5">Date</th>
                  <th className="px-6 py-5">Buyer</th>
                  <th className="px-6 py-5">Requester</th>
                  <th className="px-6 py-5">Category</th>
                  <th className="px-6 py-5 text-right">Amount</th>
                  <th className="px-6 py-5">Created By</th>
                </tr>
              </thead>
              <tbody className="text-gray-700 dark:text-gray-300 text-sm">
                {txLoading ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[#a60016]" /></td></tr>
                ) : !txData?.notes?.length ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center font-medium text-gray-500 dark:text-gray-400">No transactions found for this period.</td></tr>
                ) : (
                  txData.notes.map((n: { id: string; date: string; buyer: { name: string }; requester: { name: string }; category: { name: string }; total: number; user?: { name: string } }) => (
                    <tr key={n.id} className="hover:bg-gray-50/80 dark:hover:bg-[#202022] transition-colors bg-white dark:bg-[#1a1a1c] border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="px-6 py-4 font-medium text-gray-600 dark:text-gray-400">{new Date(n.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-6 py-4 font-bold text-[14px] text-[#1e293b] dark:text-white">{n.buyer.name}</td>
                      <td className="px-6 py-4 text-[13px] font-medium text-gray-600 dark:text-gray-400">{n.requester.name}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          {n.category.name}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-[#1e293b] dark:text-white text-[15px]">Rp {n.total.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-[13px] font-medium text-gray-500 dark:text-gray-400">{n.user?.name || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {txData?.pagination && txData.pagination.totalPages > 1 && (
            <div className="px-6 py-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-sm bg-white dark:bg-[#1a1a1c]">
              <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                Page <span className="font-bold text-[#1e293b] dark:text-white">{txData.pagination.page}</span> of{' '}
                <span className="font-bold text-[#1e293b] dark:text-white">{txData.pagination.totalPages}</span>{' '}
                <span className="hidden sm:inline">({txData.pagination.total} receipts)</span>
              </div>
              <nav className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#252525] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-[13px] font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1 shadow-sm">
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button onClick={() => setPage(p => Math.min(txData.pagination.totalPages, p + 1))} disabled={page === txData.pagination.totalPages}
                  className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#252525] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-[13px] font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1 shadow-sm">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </nav>
            </div>
          )}
        </section>
        
      </div>
    </div>
  );
}
