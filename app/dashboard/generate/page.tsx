// app/dashboard/generate/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabaseClient } from '@/lib/supabase/client';

import {
  generateMultiCodePDF,
  generateZPL,
  generateEPL,
  makeGtin14,
  buildGs1DisplayString,
  type LabelData,
} from '@/lib/generateLabel';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Papa from 'papaparse';
import { Upload, Printer } from 'lucide-react';
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
  const [error, setError] = useState<string>('');

  // Manual form states
  const [skuName, setSkuName] = useState('');
  const [mfgDate, setMfgDate] = useState('');      // stored as string (DD-MM-YYYY or YYYY-MM-DD etc.)
  const [mrp, setMrp] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [manualCodeType, setManualCodeType] = useState<'QR' | 'CODE128' | 'DATAMATRIX'>('QR');
  const [manualFormat, setManualFormat] = useState<'PDF' | 'PNG' | 'ZPL' | 'EPL'>('PDF');
  const [useGS1Format, setUseGS1Format] = useState(true); // currently always true, but can add toggle later
  const [gs1PreviewString, setGs1PreviewString] = useState<string>('');
  const [gtin, setGtin] = useState<string>(''); // current batch GTIN-14

  // CSV form states
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [csvCodeType, setCsvCodeType] = useState<'QR' | 'CODE128' | 'DATAMATRIX'>('QR');
  const [csvFormat, setCsvFormat] = useState<'PDF' | 'PNG' | 'ZPL' | 'EPL'>('PDF');
  const [csvUseGS1Format, setCsvUseGS1Format] = useState(true);

  const router = useRouter();

  // -------------------- LOAD COMPANY --------------------
  useEffect(() => {
    async function loadCompany() {
      try {
        const { data: { user }, error: authError } = await supabaseClient().auth.getUser();

        if (authError) {
          setError('Authentication error. Please sign in again.');
          setLoading(false);
          setTimeout(() => router.push('/auth/signin'), 2000);
          return;
        }

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
          setError('No company found. Please complete registration.');
          setLoading(false);
          setTimeout(() => router.push('/auth/signup'), 2000);
          return;
        }

        setCompany(data);
        setLoading(false);
      } catch (err) {
        console.error('Error loading company:', err);
        setError('Failed to load company data. Please refresh the page.');
        setLoading(false);
      }
    }
    loadCompany();
  }, [router]);

  // -------------------- BUILD GS1 PREVIEW --------------------
  // Build preview string using the SAME logic as barcode encoding
  useEffect(() => {
    if (!company || !skuName || !mfgDate || !expiryDate || !batchNo || !mrp) {
      setGs1PreviewString('');
      return;
    }

    // Ensure we have a GTIN for preview; generate once per batch
    if (!gtin) {
      const body = `890${Math.floor(1000000000 + Math.random() * 9000000000)}`; // 13-digit body for GTIN
      const gtin14 = makeGtin14(body);
      setGtin(gtin14);
      return; // effect will re-run with new gtin
    }

    const labelData: LabelData = {
      companyName: company.company_name,
      productName: skuName,
      batchNo,
      mfgDate,
      expiryDate,
      mrp,
      gtin,
    };

    const display = buildGs1DisplayString(labelData);
    setGs1PreviewString(display);
  }, [company, skuName, mfgDate, expiryDate, batchNo, mrp, gtin]);

  // Reset GTIN when form cleared
  useEffect(() => {
    if (!skuName && !mfgDate && !expiryDate && !batchNo && !mrp) {
      setGtin('');
      setGs1PreviewString('');
    }
  }, [skuName, mfgDate, expiryDate, batchNo, mrp]);

  // -------------------- MANUAL GENERATION --------------------
  const handleManualGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company || !skuName || !mfgDate || !mrp || !expiryDate || !batchNo || !quantity) {
      alert('Please fill all required fields');
      return;
    }

    setGenerating(true);

    try {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty < 1) {
        alert('Please enter a valid quantity');
        setGenerating(false);
        return;
      }

      const { data: { user } } = await supabaseClient().auth.getUser();
      if (!user) {
        alert('Please sign in again');
        setGenerating(false);
        return;
      }

      const { data: companyData } = await supabaseClient()
        .from('companies')
        .select('contact_person, email, phone, address')
        .eq('id', company.id)
        .single();

      // Ensure GTIN-14
      let currentGtin = gtin;
      if (!currentGtin) {
        const body = `890${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        currentGtin = makeGtin14(body);
        setGtin(currentGtin);
      }

      const labelData: LabelData = {
        companyName: company.company_name,
        productName: skuName,
        batchNo,
        mfgDate,
        expiryDate,
        mrp,
        gtin: currentGtin,
      };

      const allLabels: LabelData[] = Array(qty).fill(labelData);

      // Generate & download according to format
      await downloadLabelsManual(allLabels, manualCodeType, manualFormat, useGS1Format);

      // --- Save to product_batches ---
      const { error: batchError } = await supabaseClient()
        .from('product_batches')
        .insert({
          user_id: user.id,
          company_name: company.company_name,
          contact_person: companyData?.contact_person || 'N/A',
          email: companyData?.email || user.email || 'N/A',
          phone: companyData?.phone || 'N/A',
          address: companyData?.address || 'N/A',
          gst_number: company.gst_number,
          gtin: currentGtin,
          sku_name: skuName,
          batch_no: batchNo,
          mfd: mfgDate.split('-').reverse().join('-'),    // DD-MM-YYYY → YYYY-MM-DD
          expiry: expiryDate.split('-').reverse().join('-'),
          mrp: parseFloat(mrp),
          labels_count: qty,
        });

      if (batchError) {
        console.error('Error saving to product_batches:', batchError);
      }

      // --- Save to generated_labels ---
      const { error: labelError } = await supabaseClient()
        .from('generated_labels')
        .insert({
          user_id: user.id,
          company_id: company.id,
          label_type: manualCodeType,
          format: manualFormat,
          quantity: qty,
          gtin: currentGtin,
          batch_no: batchNo,
          expiry_date: expiryDate,
        });

      if (labelError) {
        console.error('Error saving to generated_labels:', labelError);
      }

      // Clear form
      setSkuName('');
      setMfgDate('');
      setMrp('');
      setExpiryDate('');
      setBatchNo('');
      setQuantity('1');
      setGtin('');
      setGs1PreviewString('');

      alert(`Successfully generated ${qty} label(s)!`);
    } catch (error) {
      console.error('Error generating labels:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error generating labels: ${msg}\n\nPlease check the console for details.`);
    } finally {
      setGenerating(false);
    }
  };

  // -------------------- CSV BULK --------------------
  const handleCsvUpload = () => {
    if (!csvFile || !company) {
      alert('Please select a CSV file');
      return;
    }

    setGenerating(true);

    Papa.parse(csvFile, {
      header: true,
      complete: async (results) => {
        const rows = results.data as any[];
        const validRows = rows.filter(r => r.productName && r.batchNo);

        if (validRows.length === 0) {
          alert('No valid rows found in CSV. Please check the format.');
          setGenerating(false);
          return;
        }

        const { data: { user } } = await supabaseClient().auth.getUser();
        if (!user) {
          alert('Please sign in again');
          setGenerating(false);
          return;
        }

        const { data: companyData } = await supabaseClient()
          .from('companies')
          .select('contact_person, email, phone, address')
          .eq('id', company.id)
          .single();

        const labels: LabelData[] = validRows.map(row => {
          const baseGtin = row.gtin && String(row.gtin).trim()
            ? String(row.gtin).trim()
            : `890${Math.floor(1000000000 + Math.random() * 9000000000)}`;
          const gtin14 = makeGtin14(baseGtin);

          return {
            companyName: company.company_name,
            productName: row.productName || 'Unknown Product',
            batchNo: row.batchNo,
            mfgDate: row.mfgDate || new Date().toLocaleDateString('en-IN'), // e.g. 25/11/2025 → handled by parseFlexibleDate
            expiryDate: row.expiryDate || '31-12-2027',
            mrp: row.mrp || '299.00',
            gtin: gtin14,
          };
        });

        try {
          await downloadLabelsCsv(labels, csvCodeType, csvFormat, csvUseGS1Format);

          for (const label of labels) {
            const { error: batchError } = await supabaseClient()
              .from('product_batches')
              .insert({
                user_id: user.id,
                company_name: company.company_name,
                contact_person: companyData?.contact_person || 'N/A',
                email: companyData?.email || user.email || 'N/A',
                phone: companyData?.phone || 'N/A',
                address: companyData?.address || 'N/A',
                gst_number: company.gst_number,
                gtin: label.gtin,
                sku_name: label.productName,
                batch_no: label.batchNo,
                mfd: label.mfgDate.split('-').reverse().join('-'),
                expiry: label.expiryDate.split('-').reverse().join('-'),
                mrp: parseFloat(label.mrp),
                labels_count: 1,
              });

            if (batchError) {
              console.error('Error saving batch to database:', batchError);
            }

            const { error: labelError } = await supabaseClient()
              .from('generated_labels')
              .insert({
                user_id: user.id,
                company_id: company.id,
                label_type: csvCodeType,
                format: csvFormat,
                quantity: 1,
                gtin: label.gtin,
                batch_no: label.batchNo,
                expiry_date: label.expiryDate,
              });

            if (labelError) {
              console.error('Error saving label to database:', labelError);
            }
          }

          alert(`Successfully generated ${labels.length} label(s) from CSV!`);
          setCsvFile(null);
        } catch (error) {
          console.error('Error generating CSV labels:', error);
          alert('Error generating labels from CSV. Please try again.');
        } finally {
          setGenerating(false);
        }
      },
      error: (error) => {
        console.error('CSV parsing error:', error);
        alert('Error parsing CSV file. Please check the format.');
        setGenerating(false);
      },
    });
  };

  // -------------------- DOWNLOAD HELPERS --------------------
  const downloadLabelsManual = async (
    labels: LabelData[],
    codeType: 'QR' | 'CODE128' | 'DATAMATRIX',
    format: 'PDF' | 'PNG' | 'ZPL' | 'EPL',
    useGS1: boolean
  ) => {
    let textOutput = '';

    if (format === 'PDF' || format === 'PNG') {
      const pdfBlob = await generateMultiCodePDF(labels, codeType, useGS1, false);
      triggerDownload(pdfBlob, `RxTrace_${labels.length}_Codes.pdf`);
    } else if (format === 'ZPL') {
      for (const label of labels) {
        const zpl = generateZPL(label, codeType, useGS1, false);
        textOutput += zpl;
      }
      const blob = new Blob([textOutput], { type: 'text/plain' });
      triggerDownload(blob, `RxTrace_${labels.length}_Labels.zpl`);
    } else if (format === 'EPL') {
      for (const label of labels) {
        const epl = generateEPL(label, useGS1, false);
        textOutput += epl;
      }
      const blob = new Blob([textOutput], { type: 'text/plain' });
      triggerDownload(blob, `RxTrace_${labels.length}_Labels.epl`);
    }
  };

  const downloadLabelsCsv = async (
    labels: LabelData[],
    codeType: 'QR' | 'CODE128' | 'DATAMATRIX',
    format: 'PDF' | 'PNG' | 'ZPL' | 'EPL',
    useGS1: boolean
  ) => {
    let textOutput = '';

    if (format === 'PDF' || format === 'PNG') {
      const pdfBlob = await generateMultiCodePDF(labels, codeType, useGS1, false);
      triggerDownload(pdfBlob, `RxTrace_CSV_${labels.length}_Codes.pdf`);
    } else if (format === 'ZPL') {
      for (const label of labels) {
        const zpl = generateZPL(label, codeType, useGS1, false);
        textOutput += zpl;
      }
      const blob = new Blob([textOutput], { type: 'text/plain' });
      triggerDownload(blob, `RxTrace_CSV_${labels.length}_Labels.zpl`);
    } else if (format === 'EPL') {
      for (const label of labels) {
        const epl = generateEPL(label, useGS1, false);
        textOutput += epl;
      }
      const blob = new Blob([textOutput], { type: 'text/plain' });
      triggerDownload(blob, `RxTrace_CSV_${labels.length}_Labels.epl`);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // -------------------- PRINT --------------------
  const handlePrint = async () => {
    if (!company || !skuName || !mfgDate || !mrp || !expiryDate || !batchNo || !quantity) {
      alert('Please fill all required fields before printing');
      return;
    }

    setGenerating(true);

    try {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty < 1) {
        alert('Please enter a valid quantity');
        setGenerating(false);
        return;
      }

      let currentGtin = gtin;
      if (!currentGtin) {
        const body = `890${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        currentGtin = makeGtin14(body);
        setGtin(currentGtin);
      }

      const labelData: LabelData = {
        companyName: company.company_name,
        productName: skuName,
        batchNo,
        mfgDate,
        expiryDate,
        mrp,
        gtin: currentGtin,
      };

      const allLabels: LabelData[] = Array(qty).fill(labelData);
      const pdfBlob = await generateMultiCodePDF(allLabels, manualCodeType, useGS1Format, false);

      const url = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      } else {
        alert('Please allow pop-ups to print labels');
      }

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Error printing labels:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error printing labels: ${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  // -------------------- RENDER STATES --------------------
  if (loading) return (
    <div className="text-center py-20">
      <div className="text-2xl text-gray-600 mb-4">Loading...</div>
      <div className="text-sm text-gray-500">Fetching your company details</div>
    </div>
  );

  if (error) return (
    <div className="text-center py-20">
      <div className="text-2xl text-red-600 mb-4">{error}</div>
      <div className="text-sm text-gray-500">Redirecting...</div>
    </div>
  );

  if (!company) return (
    <div className="text-center py-20">
      <div className="text-2xl text-red-600 mb-4">No company found</div>
      <div className="text-sm text-gray-500">Please complete your registration</div>
    </div>
  );

  // -------------------- UI --------------------
  return (
    <div className="max-w-6xl mx-auto py-10">
      <h1 className="text-4xl font-bold text-[#0052CC] mb-2">Generate Labels</h1>
      <p className="text-lg text-gray-600 mb-10">
        Company: <strong>{company.company_name}</strong> • GST: {company.gst_number}
      </p>

      <div className="grid lg:grid-cols-2 gap-10">
        {/* Manual Generation */}
        <Card className="p-10">
          <h2 className="text-2xl font-bold mb-8 text-[#0052CC]">Manual Generation</h2>
          <form onSubmit={handleManualGenerate} className="space-y-5">
            <div>
              <Label className="text-sm font-semibold text-gray-700">SKU Name / Product Name *</Label>
              <Input
                type="text"
                value={skuName}
                onChange={(e) => setSkuName(e.target.value)}
                placeholder="e.g., Paracetamol 500mg"
                required
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-semibold text-gray-700">MFG Date *</Label>
                <Input
                  type="date"
                  value={mfgDate ? mfgDate.split('-').reverse().join('-') : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month, day] = e.target.value.split('-');
                      setMfgDate(`${day}-${month}-${year}`);
                    } else {
                      setMfgDate('');
                    }
                  }}
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Expiry Date *</Label>
                <Input
                  type="date"
                  value={expiryDate ? expiryDate.split('-').reverse().join('-') : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month, day] = e.target.value.split('-');
                      setExpiryDate(`${day}-${month}-${year}`);
                    } else {
                      setExpiryDate('');
                    }
                  }}
                  required
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-semibold text-gray-700">MRP (₹) *</Label>
                <Input
                  type="text"
                  value={mrp}
                  onChange={(e) => setMrp(e.target.value)}
                  placeholder="299.00"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold text-gray-700">Batch No *</Label>
                <Input
                  type="text"
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                  placeholder="BATCH001"
                  required
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold text-gray-700">Code Type *</Label>
              <Select value={manualCodeType} onValueChange={(value) => setManualCodeType(value as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QR">QR Code</SelectItem>
                  <SelectItem value="CODE128">Code 128 Barcode</SelectItem>
                  <SelectItem value="DATAMATRIX">DataMatrix</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold text-gray-700">Output Format *</Label>
              <Select value={manualFormat} onValueChange={(value) => setManualFormat(value as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="PNG">PNG Image</SelectItem>
                  <SelectItem value="ZPL">ZPL (Zebra Printer)</SelectItem>
                  <SelectItem value="EPL">EPL (Eltron Printer)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold text-gray-700">Quantity *</Label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                max="10000"
                required
                className="mt-1"
              />
            </div>

            {/* GS1 Preview */}
            {gs1PreviewString && (
              <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                <Label className="text-sm font-bold text-blue-900 mb-2 block">
                  📋 GS1-Compliant Data Preview:
                </Label>
                <div className="bg-white p-3 rounded border border-blue-200 font-mono text-sm break-all text-blue-800">
                  {gs1PreviewString}
                </div>
                <p className="text-xs text-blue-700 mt-2">
                  ✓ This exact GS1 string will be encoded in your barcode/QR/DataMatrix
                </p>
                <div className="text-xs text-blue-600 mt-2 space-y-1">
                  <div>
                    <strong>(01)</strong> = GTIN • <strong>(17)</strong> = Expiry •{' '}
                    <strong>(11)</strong> = MFG • <strong>(10)</strong> = Batch •{' '}
                    <strong>(91)</strong> = MRP • <strong>(92)</strong> = SKU •{' '}
                    <strong>(93)</strong> = Company
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mt-6">
              <Button
                type="submit"
                disabled={generating}
                className="bg-orange-500 hover:bg-orange-600 text-white text-lg py-6"
              >
                {generating ? 'Generating...' : 'Download Labels'}
              </Button>

              <Button
                type="button"
                onClick={handlePrint}
                disabled={generating}
                variant="outline"
                className="border-2 border-[#0052CC] text-[#0052CC] hover:bg-[#0052CC] hover:text-white text-lg py-6"
              >
                <Printer className="mr-2 h-5 w-5" />
                Print Labels
              </Button>
            </div>
          </form>
        </Card>

        {/* CSV Bulk */}
        <Card className="p-10">
          <h2 className="text-2xl font-bold mb-8 text-[#0052CC]">Bulk CSV Upload</h2>

          <div className="space-y-5 mb-6">
            <div>
              <Label className="text-sm font-semibold text-gray-700">Code Type for CSV *</Label>
              <Select value={csvCodeType} onValueChange={(value) => setCsvCodeType(value as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QR">QR Code</SelectItem>
                  <SelectItem value="CODE128">Code 128 Barcode</SelectItem>
                  <SelectItem value="DATAMATRIX">DataMatrix</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold text-gray-700">Output Format for CSV *</Label>
              <Select value={csvFormat} onValueChange={(value) => setCsvFormat(value as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="PNG">PNG Image</SelectItem>
                  <SelectItem value="ZPL">ZPL (Zebra Printer)</SelectItem>
                  <SelectItem value="EPL">EPL (Eltron Printer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
                <p className="text-green-700 font-medium">✓ Ready: {csvFile.name}</p>
              </div>
            )}

            <div className="mt-6">
              <p className="text-sm text-gray-600 mb-3">Need the correct format?</p>
              <Button
                type="button"
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
              type="button"
              onClick={handleCsvUpload}
              disabled={!csvFile || generating}
              className="mt-8 w-full bg-orange-500 hover:bg-orange-600 text-white"
            >
              {generating ? 'Generating Labels...' : 'Generate from CSV'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
