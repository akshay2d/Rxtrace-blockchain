'use client';

import { useState, useEffect } from 'react';

type PrinterSettingsPanelProps = {
  companyId: string | null;
};

/**
 * PrinterSettingsPanel - Printers (Optional)
 * 
 * Printers are for internal reference only.
 * You can generate, export, and print codes WITHOUT registering a printer.
 */
export default function PrinterSettingsPanel({ companyId }: PrinterSettingsPanelProps) {
  const [printFormat, setPrintFormat] = useState<'PDF' | 'EPL' | 'ZPL'>('PDF');
  const [printerType, setPrinterType] = useState<'thermal' | 'laser' | 'generic'>('thermal');
  const [printerIdentifier, setPrinterIdentifier] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    async function loadPreferences() {
      try {
        const res = await fetch(`/api/companies/${companyId}/printer-settings`);
        if (res.ok) {
          const data = await res.json();
          if (data.print_format) setPrintFormat(data.print_format);
          if (data.printer_type) setPrinterType(data.printer_type);
          if (data.printer_identifier) setPrinterIdentifier(data.printer_identifier);
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    }
    loadPreferences();
  }, [companyId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/printer-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          print_format: printFormat,
          printer_type: printerType,
          printer_identifier: printerIdentifier.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save printer settings');

      setMessage({ type: 'success', text: 'Printer settings saved successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save printer settings' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
      <div className="p-8 space-y-6">
        {/* Section Header with UX Label */}
        <div>
          <h2 className="text-xl font-medium">Printers (Optional)</h2>
          <p className="text-sm text-gray-500 mt-1">
            Printers are for internal reference only. You can generate, export, and print codes without registering a printer.
          </p>
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Printer configuration is entirely optional. When you click &quot;Print&quot;, the output goes to your browser&apos;s print dialog or downloads as a file. RxTrace does not control physical printers.
          </p>
        </div>

        {loading ? (
          <div className="p-4 text-gray-500">Loading printer settings...</div>
        ) : !companyId ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            Company profile not found. Printer settings will be available after company setup.
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Print Format */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Print Format
              </label>
              <select
                value={printFormat}
                onChange={(e) => setPrintFormat(e.target.value as 'PDF' | 'EPL' | 'ZPL')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="PDF">PDF (Opens OS print dialog)</option>
                <option value="EPL">EPL (Raw file download)</option>
                <option value="ZPL">ZPL (Raw file download)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {printFormat === 'PDF'
                  ? 'PDF opens in a new browser tab and triggers your operating system&apos;s print dialog.'
                  : `${printFormat} files will be downloaded. Use your printer&apos;s utility software to print them.`}
              </p>
            </div>

            {/* Printer Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Printer Type (Optional)
              </label>
              <select
                value={printerType}
                onChange={(e) => setPrinterType(e.target.value as 'thermal' | 'laser' | 'generic')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="thermal">Thermal Printer</option>
                <option value="laser">Laser / Inkjet Printer</option>
                <option value="generic">Generic / Other</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Used for print logs and future optimization. Does not affect printing behavior.
              </p>
            </div>

            {/* Printer Identifier */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Printer Name / Identifier (Optional)
              </label>
              <input
                type="text"
                value={printerIdentifier}
                onChange={(e) => setPrinterIdentifier(e.target.value)}
                placeholder="e.g., Zebra-GK420T, Warehouse-01, Label-Printer-A"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                maxLength={100}
              />
              <p className="text-xs text-gray-500 mt-1">
                A friendly name for your own reference. Not sent to the printer or included in labels.
              </p>
            </div>

            {/* Message */}
            {message && (
              <div className={`p-3 rounded-lg text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {message.text}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end pt-4 border-t">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Saving...' : 'Save Printer Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
