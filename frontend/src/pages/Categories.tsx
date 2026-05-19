import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import api from '../services/api';
import { Search, Plus, Pencil, Trash2, X, Loader2, Folder, Tag, FolderOpen, Filter } from 'lucide-react';

const categorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  code: z.string().min(1, 'Code is required').toUpperCase(),
  type: z.enum(['COA Project', 'COA Vendor']).default('COA Project'),
  is_active: z.boolean().default(true),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface Category {
  id: string;
  name: string;
  code: string;
  type: string;
  is_active: boolean;
  created_at: string;
}

export default function Categories() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  // Search, Filter & Pagination States
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const filterRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
  });

  const { data: categoriesData, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/categories');
      return res.data.data as Category[];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CategoryFormValues) => api.post('/categories', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      closeModal();
    },
    onError: (error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      alert(err.response?.data?.message || 'Failed to create category');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; payload: CategoryFormValues }) =>
      api.put(`/categories/${data.id}`, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      closeModal();
    },
    onError: (error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      alert(err.response?.data?.message || 'Failed to update category');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      alert(err.response?.data?.message || 'Failed to delete category');
    }
  });

  const openAddModal = () => {
    setEditingCategory(null);
    reset({ name: '', code: '', type: 'COA Project', is_active: true });
    setIsModalOpen(true);
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    reset({ name: category.name, code: category.code, type: (category.type as "COA Project" | "COA Vendor") || 'COA Project', is_active: category.is_active });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    reset();
  };

  const onSubmit = (data: CategoryFormValues) => {
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, payload: data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this category? This action cannot be undone if not linked to any receipts.')) {
      deleteMutation.mutate(id);
    }
  };

  // Reset pagination when search/filter changes
  useEffect(() => {
    // eslint-disable-next-line
    setCurrentPage(1);
  }, [searchTerm, typeFilter, statusFilter]);

  // LOGIKA PENCARIAN & FILTER
  const filteredCategories = categoriesData?.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' ? true : c.type === typeFilter;
    const matchesStatus = statusFilter === 'all' ? true : 
                          statusFilter === 'active' ? c.is_active : !c.is_active;

    return matchesSearch && matchesType && matchesStatus;
  }) || [];

  // LOGIKA PAGINASI (MAX 5)
  const totalFiltered = filteredCategories.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalFiltered);
  const currentCategories = filteredCategories.slice(startIndex, endIndex);

  // STATISTIK CARD
  const totalProjectCount = categoriesData?.filter(c => c.type === 'COA Project').length || 0;
  const totalVendorCount = categoriesData?.filter(c => c.type === 'COA Vendor').length || 0;

  return (
    /* WARNA BLUSH PINK (#fff0f3) DITERAPKAN DI SINI BERSAMA DENGAN PADDING/MARGIN */
    <div className="font-body-md text-on-surface dark:text-white antialiased space-y-6 bg-[#fff0f3] dark:bg-transparent min-h-screen p-4 sm:p-6 -m-4 sm:-m-6 transition-colors duration-300">
      
      {/* HEADER SECTION DENGAN SEARCH BAR & FILTER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-h2 text-3xl font-bold text-on-background dark:text-white tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-secondary dark:text-gray-400 mt-1">Manage receipt COA and Codes</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative w-full sm:w-64 lg:w-80">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-secondary dark:text-gray-400">
              <Search className="w-4 h-4" />
            </span>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search COA or codes..." 
              className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest dark:bg-[#1a1a1c] border border-outline-variant/50 dark:border-gray-800 rounded-lg text-sm text-on-surface dark:text-white placeholder-secondary dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-sm"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-secondary hover:text-primary dark:text-gray-400 dark:hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button 
            onClick={openAddModal}
            className="w-full sm:w-auto bg-gradient-to-r from-[#a60016] to-[#d90429] hover:from-[#8a0012] hover:to-[#a60016] text-white px-5 py-2.5 rounded-xl flex items-center justify-center space-x-2 text-sm font-bold shadow-md hover:shadow-lg transition-all shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New COA</span>
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#1a1a1c] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-blue-50 to-transparent dark:from-blue-900/10 transition-colors"></div>
          <div className="relative z-10 flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wider uppercase">Total COA Project</p>
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400 shadow-sm">
              <Folder className="w-5 h-5" />
            </div>
          </div>
          <h3 className="relative z-10 text-4xl font-bold text-[#1e293b] dark:text-white">{totalProjectCount}</h3>
        </div>

        <div className="bg-white dark:bg-[#1a1a1c] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden group hover:shadow-md transition-all duration-300">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-emerald-50 to-transparent dark:from-emerald-900/10 transition-colors"></div>
          <div className="relative z-10 flex justify-between items-start mb-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wider uppercase">Total COA Vendor</p>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400 shadow-sm">
              <Tag className="w-5 h-5" />
            </div>
          </div>
          <h3 className="relative z-10 text-4xl font-bold text-[#1e293b] dark:text-white">{totalVendorCount}</h3>
        </div>
      </div>

      {/* TABLE SECTION */}
      <section className="bg-surface-container-lowest dark:bg-[#1a1a1c] rounded-2xl shadow-sm border border-outline-variant/20 dark:border-gray-800 overflow-hidden transition-colors duration-300">
        
        <div className="p-6 border-b border-surface-container dark:border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-lg font-bold text-on-background dark:text-white">Chart of Accounts</h2>
          
          <div className="relative w-full sm:w-auto" ref={filterRef}>
            <button 
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center justify-center w-full sm:w-auto px-5 py-2 border border-outline-variant/50 dark:border-gray-700 rounded-lg text-sm font-medium text-secondary dark:text-gray-300 hover:bg-surface-container-low dark:hover:bg-gray-800 transition-colors"
            >
              <Filter className="w-4 h-4 mr-2" /> 
              Filter
              {(typeFilter !== 'all' || statusFilter !== 'all') && (
                <span className="ml-2 w-2 h-2 rounded-full bg-primary"></span>
              )}
            </button>

            {showFilterDropdown && (
              <div className="absolute top-full right-0 mt-2 w-[240px] bg-surface-container-lowest dark:bg-[#1a1a1c] border border-outline-variant/20 dark:border-gray-800 rounded-xl shadow-xl z-20 p-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-secondary dark:text-gray-400 mb-1.5 uppercase tracking-wider">By Type</label>
                    <select 
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-bright dark:bg-[#252525] border border-outline-variant/50 dark:border-gray-700 rounded-lg text-sm text-on-surface dark:text-white focus:outline-none focus:border-primary cursor-pointer"
                    >
                      <option value="all">All Types</option>
                      <option value="COA Project">COA Project</option>
                      <option value="COA Vendor">COA Vendor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-secondary dark:text-gray-400 mb-1.5 uppercase tracking-wider">By Status</label>
                    <select 
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-bright dark:bg-[#252525] border border-outline-variant/50 dark:border-gray-700 rounded-lg text-sm text-on-surface dark:text-white focus:outline-none focus:border-primary cursor-pointer"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  {(typeFilter !== 'all' || statusFilter !== 'all') && (
                    <button 
                      onClick={() => { setTypeFilter('all'); setStatusFilter('all'); }}
                      className="w-full text-center text-xs font-bold text-primary hover:underline mt-2"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[550px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#202022] text-gray-500 dark:text-gray-400 text-[11px] uppercase tracking-wider font-bold border-b border-gray-100 dark:border-gray-800 transition-colors">
                <th className="px-6 py-4">COA Name</th>
                <th className="px-6 py-4">Code</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-on-surface dark:text-gray-300 text-sm divide-y divide-surface-container dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-secondary dark:text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                    <p>Loading COA data...</p>
                  </td>
                </tr>
              ) : currentCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-secondary dark:text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <FolderOpen className="w-12 h-12 text-secondary/50 dark:text-gray-600 mb-3" />
                      <p className="text-base font-medium text-on-background dark:text-white">
                        {searchTerm ? `No COA found matching "${searchTerm}"` : "No COA found"}
                      </p>
                      {!searchTerm && <p className="text-sm mt-1">Get started by creating a new COA.</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                currentCategories.map((c) => (
                  <tr key={c.id} className="hover:bg-secondary-container/20 dark:hover:bg-gray-800/50 transition-colors">
                    {/* Category Name dengan Icon */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-surface-container-high dark:bg-gray-700 text-secondary dark:text-gray-300 flex items-center justify-center shrink-0">
                          <Folder className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-on-background dark:text-white">{c.name}</span>
                      </div>
                    </td>
                    
                    {/* Code */}
                    <td className="px-6 py-4 font-mono text-secondary dark:text-gray-400">
                      {c.code}
                    </td>

                    {/* Type */}
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase shadow-sm border ${
                        c.type === 'COA Project' 
                          ? 'bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/20 dark:border-blue-900/30 dark:text-blue-400' 
                          : 'bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:border-indigo-900/30 dark:text-indigo-400'
                      }`}>
                        {c.type}
                      </span>
                    </td>
                    
                    {/* Status */}
                    <td className="px-6 py-4">
                      {c.is_active ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                          Inactive
                        </span>
                      )}
                    </td>
                    
                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end space-x-2">
                        <button 
                          onClick={() => openEditModal(c)} 
                          className="p-2 text-secondary dark:text-gray-400 hover:text-primary dark:hover:text-primary hover:bg-primary-container/10 dark:hover:bg-gray-800 rounded-lg transition-colors"
                          title="Edit Category"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(c.id)} 
                          className="p-2 text-secondary dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                          title="Delete Category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        <div className="px-6 py-4 border-t border-surface-container dark:border-gray-800 bg-surface-container-low/30 dark:bg-[#202022] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-secondary dark:text-gray-400">
            Showing <span className="font-bold text-on-background dark:text-white">{totalFiltered === 0 ? 0 : startIndex + 1}</span> to <span className="font-bold text-on-background dark:text-white">{endIndex}</span> of <span className="font-bold text-on-background dark:text-white">{totalFiltered}</span> entries
          </p>
          
          <div className="flex items-center gap-1">
             <button 
               onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
               disabled={currentPage === 1}
               className="px-3 py-1 border border-outline-variant/50 dark:border-gray-700 rounded bg-white dark:bg-[#1a1a1c] text-secondary dark:text-gray-400 hover:bg-surface-container-low dark:hover:bg-gray-800 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
             >
               Prev
             </button>
             
             {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
               <button 
                 key={page}
                 onClick={() => setCurrentPage(page)}
                 className={`px-3 py-1 border rounded text-sm transition-colors ${
                   currentPage === page 
                     ? 'border-primary bg-primary/10 dark:bg-primary/20 text-primary font-bold' 
                     : 'border-outline-variant/50 dark:border-gray-700 bg-white dark:bg-[#1a1a1c] text-secondary dark:text-gray-400 hover:bg-surface-container-low dark:hover:bg-gray-800'
                 }`}
               >
                 {page}
               </button>
             ))}

             <button 
               onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
               disabled={currentPage === totalPages || totalPages === 0}
               className="px-3 py-1 border border-outline-variant/50 dark:border-gray-700 rounded bg-white dark:bg-[#1a1a1c] text-secondary dark:text-gray-400 hover:bg-surface-container-low dark:hover:bg-gray-800 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
             >
               Next
             </button>
          </div>
        </div>
      </section>

      {/* MODAL SECTION */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
          <div 
            className="bg-surface-container-lowest dark:bg-[#1a1a1c] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all border border-transparent dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-6 py-4 border-b border-outline-variant/20 dark:border-gray-800 bg-surface-container-low/50 dark:bg-[#202022]">
              <div>
                <h2 className="text-lg font-bold text-on-background dark:text-white">
                  {editingCategory ? 'Edit COA' : 'Create New COA'}
                </h2>
                <p className="text-xs text-secondary dark:text-gray-400 mt-0.5">
                  {editingCategory ? 'Update existing Chart of Account mapping.' : 'Add a new Chart of Account.'}
                </p>
              </div>
              <button 
                onClick={closeModal} 
                className="p-2 text-secondary dark:text-gray-400 hover:text-on-surface dark:hover:text-white hover:bg-surface-container-low dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit(onSubmit)} className="p-6">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-on-surface dark:text-gray-300 mb-1.5">Code <span className="text-primary">*</span></label>
                  <input 
                    {...register('code')}
                    className={`w-full px-4 py-2.5 bg-surface-bright dark:bg-[#252525] border ${errors.code ? 'border-primary focus:ring-primary' : 'border-outline-variant/50 dark:border-gray-700 focus:ring-primary'} rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm dark:text-white uppercase transition-colors`}
                    placeholder="e.g. 6010-00"
                  />
                  {errors.code && <p className="text-primary text-xs mt-1.5 font-medium">{errors.code.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-on-surface dark:text-gray-300 mb-1.5">COA Name <span className="text-primary">*</span></label>
                  <input 
                    {...register('name')}
                    className={`w-full px-4 py-2.5 bg-surface-bright dark:bg-[#252525] border ${errors.name ? 'border-primary focus:ring-primary' : 'border-outline-variant/50 dark:border-gray-700 focus:ring-primary'} rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm dark:text-white transition-colors`}
                    placeholder="e.g. Travel - Airfare"
                  />
                  {errors.name && <p className="text-primary text-xs mt-1.5 font-medium">{errors.name.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-on-surface dark:text-gray-300 mb-1.5">Type <span className="text-primary">*</span></label>
                  <select 
                    {...register('type')}
                    className={`w-full px-4 py-2.5 bg-surface-bright dark:bg-[#252525] border ${errors.type ? 'border-primary focus:ring-primary' : 'border-outline-variant/50 dark:border-gray-700 focus:ring-primary'} rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm dark:text-white transition-colors cursor-pointer`}
                  >
                    <option value="COA Project">COA Project</option>
                    <option value="COA Vendor">COA Vendor</option>
                  </select>
                  {errors.type && <p className="text-primary text-xs mt-1.5 font-medium">{errors.type.message}</p>}
                </div>

                <div className="pt-2">
                  <label className="flex items-center p-3 border border-outline-variant/50 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-surface-container-low dark:hover:bg-[#252525] transition-colors">
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox" 
                        {...register('is_active')}
                        className="w-5 h-5 border-outline-variant rounded text-primary focus:ring-primary focus:ring-2 bg-surface-bright dark:bg-[#1a1a1c] dark:border-gray-600" 
                      />
                    </div>
                    <div className="ml-3">
                      <span className="block text-sm font-semibold text-on-background dark:text-white">Set as Active</span>
                      <span className="block text-xs text-secondary dark:text-gray-400 mt-0.5">Enable this category for new receipts.</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="mt-8 pt-5 border-t border-outline-variant/20 dark:border-gray-800 flex items-center justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="px-5 py-2.5 bg-surface-container-lowest dark:bg-[#252525] border border-outline-variant/50 dark:border-gray-700 text-on-surface dark:text-gray-300 rounded-lg hover:bg-secondary-container/30 dark:hover:bg-gray-700 font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-6 py-2.5 bg-primary text-white rounded-lg hover:opacity-90 shadow-sm hover:shadow font-medium text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-[#1a1a1c]"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Category'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}