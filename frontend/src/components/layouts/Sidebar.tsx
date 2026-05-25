import { NavLink } from "react-router-dom";
import { X } from "lucide-react"; // Kita hanya sisakan X untuk tombol close mobile
import { useAuthStore } from "../../store/authStore";

export default function Sidebar({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
}) {
  const user = useAuthStore((state) => state.user);

  // Menggunakan nama icon dari Material Symbols sesuai desain baru
  const navItems = [
    { name: "Dashboard", path: "/", icon: "dashboard", adminOnly: false },
    { name: "Users", path: "/users", icon: "group", adminOnly: true },
    { name: "COA", path: "/categories", icon: "category", adminOnly: false },
    {
      name: "Receipts",
      path: "/receipts",
      icon: "receipt_long",
      adminOnly: false,
    },
    { name: "Reports", path: "/reports", icon: "assessment", adminOnly: false },
    { name: "Audit Trail", path: "/audit", icon: "history", adminOnly: true },
  ];

  // Filter based on user role
  const visibleNavItems = navItems.filter((item) => {
    if (item.adminOnly && user?.role !== "admin") return false;
    return true;
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Content - Diubah menggunakan warna surface desain baru */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-surface-container-lowest dark:bg-[#111111] text-on-surface dark:text-gray-300 shadow-xl flex flex-col flex-shrink-0 h-full transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Close Button Mobile */}
        <button
          className="md:hidden absolute top-4 right-4 text-secondary hover:text-on-surface transition-colors"
          onClick={() => setIsOpen(false)}
        >
          <X className="w-6 h-6" />
        </button>

        {/* Logo Section */}
        <div className="flex items-center px-6 pt-6 pb-2 mb-4 md:mt-0">
          {/* Background putih dihapus karena background sidebar sekarang sudah putih */}
          <img
            src="/Logo-Intek-RED.png"
            alt="Intek Logo"
            className="h-10 object-contain dark:brightness-200 dark:contrast-200"
          />
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-2 space-y-2 overflow-y-auto">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                isActive
                  ? // Class saat menu SEDANG AKTIF (Merah)
                    "flex items-center px-4 py-3 bg-primary-container text-on-primary-container rounded-lg shadow-[0_4px_12px_rgba(178,0,26,0.2)] transition-all duration-300"
                  : // Class saat menu TIDAK AKTIF (Abu-abu, dengan efek hover)
                    "flex items-center px-4 py-3 text-secondary hover:bg-secondary-container/30 rounded-lg transition-colors group"
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`material-symbols-outlined ${!isActive ? "transition-transform group-hover:scale-110" : ""}`}
                  >
                    {item.icon}
                  </span>
                  <span className="ml-4 font-medium">{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
