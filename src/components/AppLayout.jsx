import { NavLink, Outlet } from "react-router";
import {

  Users,
  Truck,
  UserCheck,
  FileText,
  ScrollText,
  BarChart2,
  Settings,
} from "lucide-react";

const navItems = [
  { to: "/traders",      label: "التجار",           icon: Users },
  { to: "/vehicles",     label: "المركبات",         icon: Truck },
  { to: "/drivers",      label: "السائقون",         icon: UserCheck },
  { to: "/",     label: "الفواتير",         icon: FileText },
  { to: "/transactions", label: "سجل المعاملات",   icon: ScrollText },
  { to: "/reports",      label: "التقارير",         icon: BarChart2 },
  { to: "/settings",     label: "الإعدادات",        icon: Settings },
];

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col border-s border-border bg-sidebar">
        <div className="px-4 py-5 border-b border-border">
          <h1 className="text-base font-bold text-sidebar-foreground leading-tight">
            نظام إدارة العلوة
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">سوق الجملة</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                ].join(" ")
              }
            >
              <Icon size={16} className="shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
          v1.0.0 — offline
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
