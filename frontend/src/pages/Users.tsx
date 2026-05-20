import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '../lib/zodResolver';
import * as z from 'zod/v4';
import api from '../services/api';
import { Plus, Pencil, Trash2, X, Loader2, UserCircle2, Users as UsersIcon, UserCheck, Filter, Search } from 'lucide-react';
import { useSearchStore } from '../store/searchStore';

const userSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'operator']),
  is_active: z.boolean(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
});

type UserFormValues = z.infer<typeof userSchema>;

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function Users() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Filter States
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const filterRef = useRef<HTMLDivElement>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Search State (Menggunakan Store yang sudah ada)
  const searchTerm = useSearchStore((state) => state.searchTerm);
  const setSearchTerm = useSearchStore((state) => state.setSearchTerm);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver<UserFormValues>(userSchema),
  });

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data.data as User[];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: UserFormValues) => api.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; payload: UserFormValues }) =>
      api.put(`/users/${data.id}`, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Failed to delete user');
    }
  });

  const openAddModal = () => {
    setEditingUser(null);
    reset({ name: '', email: '', role: 'operator', is_active: true, password: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    reset({ name: user.name, email: user.email, role: user.role as "admin" | "operator", is_active: user.is_active, password: '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    reset();
  };

  const onSubmit = (data: UserFormValues) => {
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, payload: data });
    } else {
      if (!data.password) {
        alert("Password is required for new user");
        return;
      }
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      deleteMutation.mutate(id);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line
    setCurrentPage(1);
  }, [searchTerm, roleFilter, statusFilter]);

  // LOGIKA PENCARIAN & FILTERING TERPADU
  const filteredUsers = usersData?.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' ? true : u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' ? true : 
                          statusFilter === 'active' ? u.is_active : !u.is_active;

    return matchesSearch && matchesRole && matchesStatus;
  }) || [];

  // LOGIKA PAGINASI
  const totalFiltered = filteredUsers.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalFiltered);
  const currentUsers = filteredUsers.slice(startIndex, endIndex);

  // Hitung statistik untuk Card
  const totalUsers = usersData?.length || 0;
  const activeUsers = usersData?.filter(u => u.is_active).length || 0;

  return (
    /* WARNA BLUSH PINK (#fff0f3) DITERAPKAN DI SINI BERSAMA DENGAN PADDING/MARGIN */
    <div className="font-body-md text-on-surface dark:text-white antialiased space-y-6 bg-[#fff0f3] dark:bg-transparent min-h-screen p-4 sm:p-6 -m-4 sm:-m-6 transition-colors duration-300">
      
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        {/* HEADER SECTION DENGAN SEARCH BAR */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="font-h2 text-3xl font-bold text-on-background dark:text-white tracking-tight">User Management</h1>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Search Bar Cantik */}
            <div className="relative w-full sm:w-64 lg:w-80">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-secondary dark:text-gray-400">
                <Search className="w-4 h-4" />
              </span>
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or email..." 
                className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest dark:bg-[#1a1a1c] border border-outline-variant/50 dark:border-gray-800 rounded-lg text-sm text-on-surface dark:text-white placeholder-secondary dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all shadow-sm"
              />
              {/* Tombol Clear Search (Silang) Muncul saat ada teks */}
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
              <span>Add New User</span>
            </button>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-[#1a1a1c] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden group hover:shadow-md transition-all duration-300">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-red-50 to-transparent dark:from-red-900/10 transition-colors"></div>
            <div className="relative z-10 flex justify-between items-start mb-4">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wider uppercase">Total Users</p>
              <div className="p-2.5 bg-red-50 dark:bg-red-900/20 rounded-xl text-[#a60016] dark:text-red-400 shadow-sm">
                <UsersIcon className="w-5 h-5" />
              </div>
            </div>
            <h3 className="relative z-10 text-4xl font-bold text-[#1e293b] dark:text-white">{totalUsers.toLocaleString('id-ID')}</h3>
          </div>

          <div className="bg-white dark:bg-[#1a1a1c] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative overflow-hidden group hover:shadow-md transition-all duration-300">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-emerald-50 to-transparent dark:from-emerald-900/10 transition-colors"></div>
            <div className="relative z-10 flex justify-between items-start mb-4">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wider uppercase">Active Users</p>
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400 shadow-sm">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>
            <h3 className="relative z-10 text-4xl font-bold text-[#1e293b] dark:text-white">{activeUsers.toLocaleString('id-ID')}</h3>
          </div>
        </div>

        {/* TABLE SECTION */}
        <section className="bg-surface-container-lowest dark:bg-[#1a1a1c] rounded-2xl shadow-sm border border-outline-variant/20 dark:border-gray-800 overflow-hidden transition-colors duration-300">
          
          <div className="p-6 border-b border-surface-container dark:border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-lg font-bold text-on-background dark:text-white">User Directory</h2>
            
            <div className="relative w-full sm:w-auto" ref={filterRef}>
              <button 
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center justify-center w-full sm:w-auto px-5 py-2 border border-outline-variant/50 dark:border-gray-700 rounded-lg text-sm font-medium text-secondary dark:text-gray-300 hover:bg-surface-container-low dark:hover:bg-gray-800 transition-colors"
              >
                <Filter className="w-4 h-4 mr-2" /> 
                Filter
                {(roleFilter !== 'all' || statusFilter !== 'all') && (
                  <span className="ml-2 w-2 h-2 rounded-full bg-primary"></span>
                )}
              </button>

              {showFilterDropdown && (
                <div className="absolute top-full right-0 mt-2 w-[240px] bg-surface-container-lowest dark:bg-[#1a1a1c] border border-outline-variant/20 dark:border-gray-800 rounded-xl shadow-xl z-20 p-4">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-secondary dark:text-gray-400 mb-1.5 uppercase tracking-wider">By Role</label>
                      <select 
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-surface-bright dark:bg-[#252525] border border-outline-variant/50 dark:border-gray-700 rounded-lg text-sm text-on-surface dark:text-white focus:outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="all">All Roles</option>
                        <option value="admin">Admin</option>
                        <option value="operator">Operator</option>
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
                        <option value="inactive">Offline</option>
                      </select>
                    </div>
                    {(roleFilter !== 'all' || statusFilter !== 'all') && (
                      <button 
                        onClick={() => { setRoleFilter('all'); setStatusFilter('all'); }}
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
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-on-surface dark:text-gray-300 text-sm divide-y divide-surface-container dark:divide-gray-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-secondary dark:text-gray-500">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                      <p>Loading users data...</p>
                    </td>
                  </tr>
                ) : currentUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-secondary dark:text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <UserCircle2 className="w-12 h-12 text-secondary/50 dark:text-gray-600 mb-3" />
                        <p className="text-base font-medium text-on-background dark:text-white">
                          {searchTerm || roleFilter !== 'all' || statusFilter !== 'all' 
                            ? "No users found matching your filters/search" 
                            : "No users found"}
                        </p>
                        {(!searchTerm && roleFilter === 'all' && statusFilter === 'all') && 
                          <p className="text-sm mt-1">Get started by adding a new user.</p>
                        }
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-red-50/50 dark:hover:bg-gray-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#a60016] to-[#ff4d6d] text-white shadow-sm flex items-center justify-center text-sm font-bold uppercase shrink-0 ring-2 ring-white dark:ring-[#1a1a1c] group-hover:scale-105 transition-transform">
                            {u.name.substring(0, 2)}
                          </div>
                          <div>
                            <p className="font-bold text-[#1e293b] dark:text-white">{u.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase shadow-sm border ${
                          u.role === 'admin' 
                            ? 'bg-red-50 border-red-100 text-[#a60016] dark:bg-red-900/20 dark:border-red-900/30 dark:text-red-400' 
                            : 'bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/20 dark:border-blue-900/30 dark:text-blue-400'
                        }`}>
                          {u.role === 'admin' ? 'Admin' : 'Operator'}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-600'}`}></span>
                          <span className={`text-sm font-bold ${u.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-secondary dark:text-gray-500'}`}>
                            {u.is_active ? 'Active' : 'Offline'}
                          </span>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => openEditModal(u)} 
                            className="p-2 text-secondary dark:text-gray-400 hover:text-primary dark:hover:text-primary hover:bg-primary-container/10 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            title="Edit User"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(u.id)} 
                            className="p-2 text-secondary dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            title="Delete User"
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

          {/* Table Footer / Pagination */}
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
                &lt;
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
                &gt;
              </button>
            </div>
          </div>
        </section>

        {/* MODAL SECTION */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
            <div 
              className="bg-surface-container-lowest dark:bg-[#1a1a1c] rounded-2xl shadow-2xl w-full max-w-[500px] overflow-hidden transform transition-all border border-transparent dark:border-gray-800"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-outline-variant/20 dark:border-gray-800 bg-surface-container-low/50 dark:bg-[#202022]">
                <div>
                  <h2 className="text-lg font-bold text-on-background dark:text-white">
                    {editingUser ? 'Edit System User' : 'Create New User'}
                  </h2>
                  <p className="text-xs text-secondary dark:text-gray-400 mt-0.5">
                    {editingUser ? 'Update user credentials and access level.' : 'Add a new member to the system.'}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-on-surface dark:text-gray-300 mb-1.5">Full Name <span className="text-primary">*</span></label>
                      <input 
                        {...register('name')}
                        className={`w-full px-4 py-2.5 bg-surface-bright dark:bg-[#252525] border ${errors.name ? 'border-primary focus:ring-primary' : 'border-outline-variant/50 dark:border-gray-700 focus:ring-primary'} rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm dark:text-white transition-colors`}
                        placeholder="e.g. Jane Doe"
                      />
                      {errors.name && <p className="text-primary text-xs mt-1.5 font-medium">{errors.name.message}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-on-surface dark:text-gray-300 mb-1.5">Email Address <span className="text-primary">*</span></label>
                      <input 
                        {...register('email')}
                        type="email"
                        className={`w-full px-4 py-2.5 bg-surface-bright dark:bg-[#252525] border ${errors.email ? 'border-primary focus:ring-primary' : 'border-outline-variant/50 dark:border-gray-700 focus:ring-primary'} rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm dark:text-white transition-colors`}
                        placeholder="name@company.com"
                      />
                      {errors.email && <p className="text-primary text-xs mt-1.5 font-medium">{errors.email.message}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-on-surface dark:text-gray-300 mb-1.5">System Role <span className="text-primary">*</span></label>
                      <select 
                        {...register('role')}
                        className="w-full px-4 py-2.5 bg-surface-bright dark:bg-[#252525] border border-outline-variant/50 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm text-on-surface dark:text-white transition-colors cursor-pointer"
                      >
                        <option value="operator">Operator (Standard Access)</option>
                        <option value="admin">Admin (Full Access)</option>
                      </select>
                      {errors.role && <p className="text-primary text-xs mt-1.5 font-medium">{errors.role.message}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-on-surface dark:text-gray-300 mb-1.5 flex items-center justify-between">
                        <span>Password {!editingUser && <span className="text-primary">*</span>}</span>
                        {editingUser && <span className="text-[10px] uppercase tracking-wider text-secondary dark:text-gray-500 font-normal">Optional</span>}
                      </label>
                      <input 
                        {...register('password')}
                        type="password"
                        className={`w-full px-4 py-2.5 bg-surface-bright dark:bg-[#252525] border ${errors.password ? 'border-primary focus:ring-primary' : 'border-outline-variant/50 dark:border-gray-700 focus:ring-primary'} rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm dark:text-white transition-colors`}
                        placeholder={editingUser ? "Leave blank to keep current" : "Min. 6 characters"}
                      />
                      {errors.password && <p className="text-primary text-xs mt-1.5 font-medium">{errors.password.message}</p>}
                    </div>
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
                        <span className="block text-sm font-semibold text-on-background dark:text-white">Active Account</span>
                        <span className="block text-xs text-secondary dark:text-gray-400 mt-0.5">Allow this user to log in and use the system.</span>
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
                      'Save User'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
