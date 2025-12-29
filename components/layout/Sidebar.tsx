"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "SKU Master", path: "/dashboard/sku" },
  { label: "Label Generation", path: "/dashboard/generate" },
  { label: "Packaging Rules / SSCC Generation", path: "/dashboard/packaging" },
  { label: "Traceability Search", path: "/dashboard/search" },
  { label: "Scan Activity", path: "/dashboard/scans" },
  { label: "Audit Reports", path: "/dashboard/audit" },
  { label: "Billing & Wallet", path: "/dashboard/billing" },
  { label: "Handset Management", path: "/dashboard/handsets" },
  { label: "Settings", path: "/dashboard/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-blue-900 text-white flex flex-col">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 text-lg font-semibold border-b border-blue-800">
        RxTrace
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {MENU.map((item) => {
          const active = pathname === item.path;
          return (
            <Link
              key={item.label}
              href={item.path}
              className={`block rounded-md px-4 py-2 text-sm transition
                ${
                  active
                    ? "bg-blue-700 font-medium"
                    : "hover:bg-blue-800"
                }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
