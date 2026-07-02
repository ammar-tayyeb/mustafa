import { NavLink, Outlet } from "react-router";
import {
  Users,
  UserCheck,
  FileText,
  ScrollText,
  BarChart2,
  Settings,
} from "lucide-react";

const navItems = [
  { to: "/",             label: "المبيعات",         icon: FileText },
  { to: "/traders",      label: "البگاگيل",           icon: Users },
  { to: "/debts",        label: "الديون",           icon: Users },
  { to: "/drivers",      label: "السواق",         icon: UserCheck },
  { to: "/transactions", label: "سجل المعاملات",   icon: ScrollText },
  { to: "/reports",      label: "التقارير",         icon: BarChart2 },
  { to: "/settings",     label: "الإعدادات",        icon: Settings },
];


export default function AppLayout() {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-border bg-sidebar">
        {/* Logo / Title */}
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold text-sidebar-foreground leading-tight">
              العلوة
          </h1>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            سوق الجملة
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-1 h-full py-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2 px-3 h-full rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                ].join(" ")
              }
            >
              <Icon size={16} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-2">
        <Outlet />
      </main>
    </div>
  );
}