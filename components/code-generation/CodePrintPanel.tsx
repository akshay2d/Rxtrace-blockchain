'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Printer, AlertCircle } from 'lucide-react';

type LabelData = {
  id: string;
  payload: string;
  codeType: 'QR' | 'DATAMATRIX';
  displayText: string;
  metadata: Record<string, any>;
};

type CodePrintPanelProps = {
  labels: LabelData[];
  companyId: string;
  onPrint: (format: 'PDF' | 'EPL' | 'ZPL') => void;
  printing?: boolean;
};

/**
 * CodePrintPanel - Print Codes
 * 
 * Printing uses your computer or network printer.
 * RxTrace does NOT control the physical printer.
 */
export default function CodePrintPanel({
  labels,
  companyId,
  onPrint,
  printing = false,
}: CodePrintPanelProps) {
  const [selectedFormat, setSelectedFormat] = useState<'PDF' | 'EPL' | 'ZPL'>('PDF');
  const hasLabels = labels.length > 0;

  async function handlePrint() {
    // If no configured preference, use selected format
    if (companyId) {
      try {
        const res = await fetch(`/api/companies/${companyId}/printer-settings`);
        if (res.ok) {
          const data = await res.json();
          if (data.print_format) {
            onPrint(data.print_format);
            return;
          }
        }
      } catch {
        // Use selected format
      }
    }
    
    onPrint(selectedFormat);
  }

  return (
    <Card className="border-gray-200">
      <CardHeader>
        {/* Section Header with UX Label */}
        <CardTitle className="text-lg font-semibold">Print Codes</CardTitle>
        <CardDescription>
          Printing uses your computer or network printer. RxTrace does not control the physical printer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info Box */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Print</strong> sends codes to your browser&apos;s print dialog (PDF) or downloads a printer file (EPL/ZPL). 
            RxTrace does not directly connect to your printer.
          </p>
        </div>

        {!hasLabels ? (
          <div className="text-center py-6 text-gray-400">
            <Printer className="w-10 h-10 mx-auto mb-2" />
            <p className="text-sm">No codes to print yet</p>
            <p className="text-xs mt-1">Generate codes first, then print them here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status */}
            <div className="text-sm text-gray-600">
              {labels.length} code(s) ready to print
            </div>

            {/* Print Format Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Print Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedFormat('PDF')}
                  className={`px-3 py-2 text-sm rounded-lg border transition ${
                    selectedFormat === 'PDF'
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFormat('EPL')}
                  className={`px-3 py-2 text-sm rounded-lg border transition ${
                    selectedFormat === 'EPL'
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  EPL
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFormat('ZPL')}
                  className={`px-3 py-2 text-sm rounded-lg border transition ${
                    selectedFormat === 'ZPL'
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  ZPL
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {selectedFormat === 'PDF'
                  ? 'Opens your browser&apos;s print dialog'
                  : `Downloads a ${selectedFormat} file for your printer software`}
              </p>
            </div>

            {/* Print Button */}
            <Button
              onClick={handlePrint}
              disabled={printing}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <Printer className="w-4 h-4 mr-2" />
              {printing ? 'Preparing...' : 'Print Codes'}
            </Button>

            {/* How Printing Works */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">How printing works:</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li><strong>PDF:</strong> Opens in a new tab → use browser print (Ctrl+P / Cmd+P)</li>
                <li><strong>EPL/ZPL:</strong> Downloads a file → open with your printer utility</li>
              </ul>
            </div>

            {/* Printer Not Working? */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800">
                <strong>Printer not working?</strong> Check your browser&apos;s pop-up blocker, 
                ensure your printer is connected, and verify the correct format is selected.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
