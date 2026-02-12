import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { SubscriptionProvider } from "@/lib/hooks/useSubscription";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SubscriptionProvider>
      <div className="flex h-screen bg-gray-100">
        <Sidebar />
        <div className="flex flex-col flex-1">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </SubscriptionProvider>
  );
}
