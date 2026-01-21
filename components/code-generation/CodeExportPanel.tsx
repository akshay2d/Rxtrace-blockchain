'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileSpreadsheet, FileImage, FileArchive } from 'lucide-react';

type LabelData = {
  id: string;
  payload: string;
  codeType: 'QR' | 'DATAMATRIX';
  displayText: string;
  metadata: Record<string, any>;
};

type CodeExportPanelProps = {
  labels: LabelData[];
  onExport: (format: 'CSV' | 'PDF' | 'ZIP' | 'ZPL' | 'EPL') => void;
  exporting?: boolean;
};

/**
 * CodeExportPanel - Export Codes
 * 
 * Download generated codes as files.
 * Exporting does NOT print or regenerate codes.
 */
export default function CodeExportPanel({
  labels,
  onExport,
  exporting = false,
}: CodeExportPanelProps) {
  const hasLabels = labels.length > 0;

  return (
    <Card className="border-gray-200">
      <CardHeader>
        {/* Section Header with UX Label */}
        <CardTitle className="text-lg font-semibold">Export Codes</CardTitle>
        <CardDescription>
          Download generated codes as files. Exporting does not print or regenerate codes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info Box */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Export</strong> downloads codes to your computer. It does not send anything to a printer or create new codes.
          </p>
        </div>

        {!hasLabels ? (
          <div className="text-center py-6 text-gray-400">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-2" />
            <p className="text-sm">No codes to export yet</p>
            <p className="text-xs mt-1">Generate codes first, then export them here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Status */}
            <div className="text-sm text-gray-600">
              {labels.length} code(s) ready for export
            </div>

            {/* Export Buttons */}
            <div className="grid grid-cols-2 gap-3">
              {/* CSV Export */}
              <Button
                onClick={() => onExport('CSV')}
                variant="outline"
                disabled={exporting}
                className="flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                CSV
              </Button>

              {/* PDF Export */}
              <Button
                onClick={() => onExport('PDF')}
                variant="outline"
                disabled={exporting}
                className="flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                PDF
              </Button>

              {/* ZIP (Images) Export */}
              <Button
                onClick={() => onExport('ZIP')}
                variant="outline"
                disabled={exporting}
                className="flex items-center justify-center gap-2"
              >
                <FileArchive className="w-4 h-4" />
                ZIP (PNGs)
              </Button>

              {/* ZPL Export */}
              <Button
                onClick={() => onExport('ZPL')}
                variant="outline"
                disabled={exporting}
                className="flex items-center justify-center gap-2"
              >
                <FileImage className="w-4 h-4" />
                ZPL
              </Button>

              {/* EPL Export */}
              <Button
                onClick={() => onExport('EPL')}
                variant="outline"
                disabled={exporting}
                className="col-span-2 flex items-center justify-center gap-2"
              >
                <FileImage className="w-4 h-4" />
                EPL
              </Button>
            </div>

            {/* Help Text */}
            <div className="text-xs text-gray-500 space-y-1 pt-2 border-t">
              <p><strong>CSV:</strong> Spreadsheet with code data</p>
              <p><strong>PDF:</strong> Printable document with QR/DataMatrix images</p>
              <p><strong>ZIP:</strong> Individual PNG images for each code</p>
              <p><strong>ZPL/EPL:</strong> Raw printer format files for Zebra/compatible printers</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
