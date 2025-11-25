export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-950 text-white p-10">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold mb-12">Welcome to RxTrace Dashboard</h1>
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8">
            <p className="text-gray-400">Total Labels</p>
            <p className="text-6xl font-black text-cyan-400 mt-4">12,450</p>
          </div>
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8">
            <p className="text-gray-400">This Month</p>
            <p className="text-6xl font-black text-green-400 mt-4">3,200</p>
          </div>
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8">
            <p className="text-gray-400">Current Plan</p>
            <p className="text-5xl font-bold text-purple-400 mt-4">Pro</p>
          </div>
        </div>
        <div className="text-center">
          <button className="bg-cyan-400 hover:bg-cyan-300 text-black font-bold text-2xl px-16 py-8 rounded-2xl shadow-2xl">
            Generate New Labels
          </button>
        </div>
      </div>
    </div>
  );
}