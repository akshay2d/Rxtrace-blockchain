"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  QrCode,
  Boxes,
  Search,
  ScanLine,
  FileText,
  Users,
  CreditCard,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MENU = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "SKU Master", path: "/dashboard/sku", icon: Package },
  { label: "Code Generation", path: "/dashboard/code-generation", icon: QrCode },
  { label: "Trace Hierarchy", path: "/dashboard/search", icon: Boxes },
  { label: "Scan Logs", path: "/dashboard/scans", icon: ScanLine },
  { label: "Reports", path: "/dashboard/audit", icon: FileText },
  { label: "Billing", path: "/dashboard/billing", icon: CreditCard },
  { label: "Help & Support", path: "/dashboard/help", icon: HelpCircle },
  { label: "Settings", path: "/dashboard/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "bg-blue-900 text-white flex flex-col transition-all duration-300 border-r border-blue-800",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-blue-800">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-3 text-lg font-semibold hover:opacity-80 transition">
            <Image src="/logo.png" alt="RxTrace" width={32} height={32} />
            <span>RxTrace</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="flex items-center justify-center w-full">
            <Image src="/logo.png" alt="RxTrace" width={32} height={32} />
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-blue-800 transition text-blue-200 hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {MENU.map((item) => {
          const active = pathname === item.path || pathname?.startsWith(item.path + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                collapsed ? "justify-center" : "",
                active
                  ? "bg-blue-700 font-medium text-white"
                  : "text-blue-100 hover:bg-blue-800 hover:text-white"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
