import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function DashboardLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    // Background luar diubah agar mendukung dark mode
    <div className="flex h-screen overflow-hidden bg-[#f8f9ff] dark:bg-[#0b0c10] transition-colors duration-300">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <div className="flex-1 flex flex-col overflow-hidden relative w-full">
        <Header toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        
        {/* Background main area juga diubah agar selaras */}
        <main className="flex-1 overflow-y-auto bg-[#f8f9ff] dark:bg-[#0b0c10] transition-colors duration-300 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}