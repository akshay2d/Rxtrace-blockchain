export default function AuthLayout({
    children,
  }: { children: React.ReactNode }) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
        >
        {children}
      </div>
    );
  }