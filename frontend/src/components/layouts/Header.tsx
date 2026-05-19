import { useAuthStore } from '../../store/authStore';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

interface Notification {
  id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function Header({ toggleSidebar }: { toggleSidebar: () => void }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  
  const navigate = useNavigate();
  // --- STATE UNTUK DARK MODE ---
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    // Simpan pilihan user ke localStorage agar tidak hilang saat di-refresh
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };
  const queryClient = useQueryClient();
  
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Fetch Notifications
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      if (user?.role !== 'admin') return [];
      const res = await api.get('/notifications');
      return res.data.data;
    },
    enabled: user?.role === 'admin',
    refetchInterval: 10000 // Poll every 10s
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      await api.put('/notifications/mark-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleNotif = () => {
    const newOpenState = !isNotifOpen;
    setIsNotifOpen(newOpenState);
    if (newOpenState && unreadCount > 0) {
      markReadMutation.mutate();
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-surface-bright/80 dark:bg-[#0b0c10]/90 backdrop-blur-xl flex justify-between items-center px-6 md:px-10 h-20 shadow-sm border-b border-outline-variant/20 dark:border-gray-800 shrink-0 transition-colors duration-300">
      
      {/* KIRI: Hamburger Menu */}
      <div className="flex items-center gap-4 flex-1">
        <button 
          onClick={toggleSidebar}
          className="hover:bg-surface-container-low dark:hover:bg-gray-800 rounded-full p-2 transition-all mr-2 flex items-center justify-center md:hidden"
        >
          <span className="material-symbols-outlined text-on-surface-variant dark:text-gray-300">menu</span>
        </button>
      </div>
      
      {/* KANAN: Actions & Profil */}
      <div className="flex items-center">
        
        {/* Dark Mode & Notifications */}
        <div className="flex items-center gap-2">
          {/* Tombol Dark Mode */}
          <button 
            onClick={toggleTheme}
            className="hover:bg-surface-container-low dark:hover:bg-gray-800 rounded-full p-2 transition-all flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-on-surface-variant dark:text-gray-300">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {/* Tombol Notifications (Admin Only) */}
          {user?.role === 'admin' && (
            <div className="relative" ref={notifRef}>
              <button 
                onClick={toggleNotif}
                className="hover:bg-surface-container-low dark:hover:bg-gray-800 rounded-full p-2 transition-all relative flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-on-surface-variant dark:text-gray-300">notifications_active</span>
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 block h-2 w-2 rounded-full bg-primary"></span>
                )}
              </button>
              
              {/* Dropdown Notifikasi */}
              {isNotifOpen && (
                <div className="fixed inset-x-4 top-20 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-3 sm:w-80 bg-surface-container-lowest dark:bg-[#1a1a1c] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.1)] dark:shadow-none border border-outline-variant/20 dark:border-gray-800 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-outline-variant/20 dark:border-gray-800 bg-surface-container-low dark:bg-[#202022] flex justify-between items-center">
                    <h3 className="font-semibold text-on-background dark:text-white">Notifications</h3>
                  </div>
                  <div className="max-h-60 sm:max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-sm text-secondary dark:text-gray-400">
                        No notifications
                      </div>
                    ) : (
                      <div className="divide-y divide-outline-variant/10 dark:divide-gray-800">
                        {notifications.map(notif => (
                          <div key={notif.id} className={`p-4 transition-colors ${!notif.is_read ? 'bg-secondary-container/30 dark:bg-gray-800/50' : 'hover:bg-surface-container-low dark:hover:bg-[#252525]'}`}>
                            <p className="text-sm text-on-background dark:text-white">{notif.message}</p>
                            <p className="text-xs text-secondary dark:text-gray-400 mt-1">{dayjs(notif.created_at).fromNow()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Garis Pemisah */}
        <div className="h-8 w-[1px] bg-outline-variant/30 dark:bg-gray-700 mx-4"></div>

        {/* User Profile */}
        <div className="relative" ref={dropdownRef}>
          <div 
            className="flex items-center gap-3 cursor-pointer group p-1.5 rounded-lg hover:bg-surface-container-low dark:hover:bg-gray-800 transition-colors"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
          >
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-on-surface dark:text-white leading-tight capitalize">
                {user?.name || 'System Admin'}
              </p>
              <p className="text-xs text-secondary dark:text-gray-400 leading-tight capitalize">
                {user?.role || 'Admin'}
              </p>
            </div>
            {/* Avatar Lingkaran */}
            <div className="w-10 h-10 rounded-full border-2 border-primary-container dark:border-gray-700 p-0.5 bg-surface-container-high dark:bg-[#1a1a1c] flex items-center justify-center text-primary dark:text-white font-bold group-hover:bg-primary-container group-hover:text-white transition-colors uppercase">
              {(user?.name || 'S').charAt(0)}
            </div>
          </div>

          {/* Profile Dropdown (Logout) */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-surface-container-lowest dark:bg-[#1a1a1c] rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.1)] dark:shadow-none py-1 border border-outline-variant/20 dark:border-gray-800 z-50">
              <div className="px-4 py-3 border-b border-outline-variant/20 dark:border-gray-800 md:hidden">
                <p className="text-sm font-bold text-on-background dark:text-white truncate capitalize">{user?.name}</p>
                <p className="text-xs text-secondary dark:text-gray-400 truncate">{user?.email}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full text-left flex items-center px-4 py-2.5 text-sm text-primary dark:text-red-400 hover:bg-primary-container/10 dark:hover:bg-gray-800 transition-colors font-medium"
              >
                <span className="material-symbols-outlined text-[18px] mr-2">logout</span>
                Sign out
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}