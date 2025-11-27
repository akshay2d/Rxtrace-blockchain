// app/dashboard/generate/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabaseClient } from '@/lib/supabase/client';
import { generatePDF, generateZPL, generateEPL } from '@/lib/generateLabel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Papa from 'papaparse';
import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Company {
  id: string;
  company_name: string;
  gst_number: string;
}

export default function GenerateLabels() {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState('1');
  const [codeType, setCodeType] = useState<'QR' | 'CODE128' | 'DATAMATRIX'>('QR');
  const [format, setFormat] = useState<'PDF' | 'ZPL' | 'EPL'>('PDF');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function loadCompany() {
      const { data: { user } } = await supabaseClient().auth.getUser();
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      const { data, error } = await supabaseClient()
        .from('companies')
        .select('id, company_name, gst_number')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        router.push('/auth/signup');
        return;
      }

      setCompany(data);
      setLoading(false);
    }
    loadCompany();
  }, [router]);

  const handleManualGenerate = async () => {
    if (!company || !count) return;
    setGenerating(true);

    const quantity = parseInt(count);
    const batchNo = `BATCH${Date.now().toString().slice(-8)}`;
    const today = new Date().toLocaleDateString('en-IN');
    const expiry = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000);
    const expiryStr = expiry.toLocaleDateString('en-IN');
    const gtin = `890${Math.floor(100000000000 + Math.random() * 900000000000)}`;

    const labelData = {
      companyName: company.company_name,
      productName: "Sample Product 500mg",
      batchNo,
      mfgDate: today,
      expiryDate: expiryStr,
      mrp: "299.00",
      gtin,
    };

    await downloadLabels([labelData], quantity);
    setGenerating(false);
  };

  const handleCsvUpload = () => {
    if (!csvFile || !company) return;
    setGenerating(true);

    Papa.parse(csvFile, {
      header: true,
      complete: async (results) => {
        const rows = results.data as any[];
        const validRows = rows.filter(r => r.productName && r.batchNo);

        const labels = validRows.map(row => ({
          companyName: company.company_name,
          productName: row.productName || "Unknown Product",
          batchNo: row.batchNo,
          mfgDate: row.mfgDate || new Date().toLocaleDateString('en-IN'),
          expiryDate: row.expiryDate || "31-12-2027",
          mrp: row.mrp || "299.00",
          gtin: row.gtin || `890${Math.floor(100000000000 + Math.random() * 900000000000)}`,
        }));

        await downloadLabels(labels, 1);
        setGenerating(false);
      },
    });
  };

  const downloadLabels = async (labels: any[], repeatPerLabel: number) => {
    let textOutput = '';
    const pdfBlobs: Blob[] = [];

    for (const label of labels) {
      if (format === 'PDF') {
        const pdfBlob = await generatePDF(label, codeType);

        for (let i = 0; i < repeatPerLabel; i++) {
          pdfBlobs.push(pdfBlob);
        }
      } else if (format === 'ZPL') {
        const zpl = generateZPL(label, codeType);
        textOutput += zpl.repeat(repeatPerLabel);
      } else {
        const epl = generateEPL(label);
        textOutput += epl.repeat(repeatPerLabel);
      }
    }

    if (format === 'PDF' && pdfBlobs.length > 0) {
      const finalBlob = new Blob(pdfBlobs, { type: 'application/pdf' });
      triggerDownload(finalBlob, `RxTrace_${pdfBlobs.length}_Labels.pdf`);
    } else if (textOutput) {
      const blob = new Blob([textOutput], { type: 'text/plain' });
      triggerDownload(blob, `RxTrace_${labels.length * repeatPerLabel}_Labels.${format.toLowerCase()}`);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="text-center py-20 text-2xl">Loading...</div>;
  if (!company) return <div className="text-center py-20 text-2xl text-red-600">No company found</div>;

  return (
    <div className="max-w-6xl mx-auto py-10">
      <h1 className="text-4xl font-bold text-[#0052CC] mb-2">Generate Labels</h1>
      <p className="text-lg text-gray-600 mb-10">
        Company: <strong>{company.company_name}</strong> • GST: {company.gst_number}
      </p>

      <div className="grid lg:grid-cols-2 gap-10">
        {/* Manual Generation */}
        <Card className="p-10">
          <h2 className="text-2xl font-bold mb-8">Manual Generation</h2>
          <div className="space-y-6">
            <div>
              <Label>Number of Labels</Label>
              <Input type="number" value={count} onChange={(e) => setCount(e.target.value)} min="1" max="10000" />
            </div>
            <div>
              <Label>Code Type</Label>
              <Select value={codeType} onValueChange={(value) => setCodeType(value as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="QR">QR Code</SelectItem>
                  <SelectItem value="CODE128">Code 128</SelectItem>
                  <SelectItem value="DATAMATRIX">DataMatrix</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Output Format</Label>
              <Select value={format} onValueChange={(value) => setFormat(value as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="ZPL">ZPL (Zebra)</SelectItem>
                  <SelectItem value="EPL">EPL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleManualGenerate}
              disabled={generating}
              className="w-full bg-orange-500 hover:bg-orange-600 text-xl py-6"
            >
              {generating ? 'Generating...' : 'Generate Labels'}
            </Button>
          </div>
        </Card>

        {/* CSV Bulk */}
        <Card className="p-10">
          <h2 className="text-2xl font-bold mb-8">Bulk CSV Upload</h2>
          <div
            className={`border-4 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
              isDragOver ? 'border-orange-500 bg-orange-50' : 'border-gray-300'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file && file.name.endsWith('.csv')) {
                setCsvFile(file);
              }
            }}
          >
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => e.target.files?.[0] && setCsvFile(e.target.files[0])}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer block">
              <div className="mx-auto w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                <Upload className="w-10 h-10 text-orange-600" />
              </div>
              <p className="text-xl font-semibold">
                {isDragOver ? 'Drop your CSV here' : 'Drag & drop CSV file here'}
              </p>
              <p className="text-gray-500 mt-2">or click to browse</p>
            </label>

            {csvFile && (
              <div className="mt-6 p-4 bg-green-50 border border-green-300 rounded-lg">
                <p className="text-green-700 font-medium">Ready: {csvFile.name}</p>
              </div>
            )}

            <div className="mt-6">
              <p className="text-sm text-gray-600 mb-3">Need the correct format?</p>
              <Button
                variant="outline"
                className="border-orange-500 text-orange-600 hover:bg-orange-50"
                onClick={() => {
                  const csv = `productName,batchNo,mfgDate,expiryDate,mrp,gtin
Paracetamol 500mg,BATCH001,25-11-2025,25-11-2027,299.00,8901234567890
Crocin 650mg,BATCH002,01-12-2025,01-12-2027,150.00,8909876543210`;
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'RxTrace_Label_Template.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download CSV Template
              </Button>
            </div>

            <Button
              onClick={handleCsvUpload}
              disabled={!csvFile || generating}
              className="mt-8 w-full bg-orange-500 hover:bg-orange-600"
            >
              {generating ? 'Generating...' : 'Generate from CSV'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}