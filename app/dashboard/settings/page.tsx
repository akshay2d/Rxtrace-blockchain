"use client";

import { useState } from "react";

export default function Page() {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    await fetch("/api/integrations/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: (e.currentTarget.system as HTMLSelectElement).value,
        apiUrl: (e.currentTarget.apiUrl as HTMLInputElement).value,
        apiKey: (e.currentTarget.apiKey as HTMLInputElement).value,
        syncMode: (e.currentTarget.sync as HTMLSelectElement).value,
      }),
    });

    setLoading(false);
    setSaved(true);
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          Integrations
        </h1>
        <p className="text-gray-500 mt-2 max-w-2xl">
          Securely connect RxTrace with your ERP or enterprise systems.
          Credentials are encrypted and never exposed.
        </p>
      </div>

      {/* Card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="p-8 space-y-8">

          {/* Section title */}
          <div>
            <h2 className="text-xl font-medium">
              ERP / SaaS Integration
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Used for invoice sync, batch reporting, EPCIS events and compliance exports.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* System */}
            <div>
              <label className="label">Integration System</label>
              <select name="system" className="input" required>
                <option value="">Select system</option>
                <option value="SAP">SAP</option>
                <option value="Oracle">Oracle</option>
                <option value="Tally">Tally</option>
                <option value="Custom">Custom ERP</option>
              </select>
            </div>

            {/* Sync Mode */}
            <div>
              <label className="label">Sync Mode</label>
              <select name="sync" className="input">
                <option value="pull">Pull from ERP</option>
                <option value="push">Push to ERP</option>
                <option value="bi">Bi-Directional</option>
              </select>
            </div>

            {/* API URL */}
            <div className="md:col-span-2">
              <label className="label">API Base URL</label>
              <input
                name="apiUrl"
                className="input"
                placeholder="https://erp.company.com/api"
                required
              />
            </div>

            {/* API Key */}
            <div className="md:col-span-2">
              <label className="label">API Key / Token</label>
              <input
                name="apiKey"
                type="password"
                className="input"
                placeholder="••••••••••••••••"
                required
              />
              <p className="text-xs text-gray-500 mt-2">
                Stored encrypted. Visible only during creation.
              </p>
            </div>
            {/* ================= ROTATE KEY ================= */}
<div className="border-t pt-8 mt-10">
  <h3 className="text-lg font-medium mb-2">Rotate API Key</h3>
  <p className="text-sm text-gray-500 mb-4">
    Replace the existing API key. The old key will be permanently revoked.
  </p>

  <form
    onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      const newKey = (form.newKey as HTMLInputElement).value;

      if (!confirm("This will revoke the old API key. Continue?")) return;

      await fetch("/api/integrations/rotate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: newKey }),
      });

      alert("API key rotated successfully");
      form.reset();
    }}
    className="space-y-4 max-w-lg"
  >
    <div>
      <label className="label">New API Key</label>
      <input
        name="newKey"
        type="password"
        className="input"
        placeholder="••••••••••••••••"
        required
      />
      <p className="text-xs text-gray-500 mt-1">
        This key will be stored securely and never shown again.
      </p>
    </div>

    <button className="btn-primary">
      Rotate API Key
    </button>
  </form>
</div>


            {/* Footer */}
            <div className="md:col-span-2 flex items-center justify-between pt-4">
              <div className="text-sm">
                {saved && (
                  <span className="text-green-600">
                    ✔ Integration settings saved
                  </span>
                )}
              </div>

              <button
                disabled={loading}
                className="btn-primary px-6 py-2"
              >
                {loading ? "Saving..." : "Save Integration"}
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
