// app/dashboard/generate/page.tsx
"use client";

import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  buildSignedGs1String,
  generateDummyGtin,
  generatePdfBuffer,
  generatePngBuffer,
  generateZplLabel,
  generateEplLabel,
} from "@/lib/generateLabel";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const formSchema = z.object({
  companyName: z.string().min(1),
  contactPerson: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(10),
  address: z.string().min(1),
  gstNumber: z.string().length(15),
  skuName: z.string().min(1),
  batchNo: z.string().min(1),
  mfgDate: z.string(),
  expiryDate: z.string(),
  mrp: z.string().min(1),
  quantity: z.string().min(1),
  codeType: z.enum(["QR", "Code128", "DataMatrix"]),
  format: z.enum(["PDF", "PNG", "ZPL", "EPL"]),
  hasGs1: z.enum(["Yes", "No"]),
  gtinPrefix: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function GeneratePage() {
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      hasGs1: "No",
      codeType: "QR",
      format: "PDF",
      quantity: "1",
      mrp: "100",
    },
  });

  const hasGs1 = watch("hasGs1");

  const generateSingleLabel = async (data: FormData) => {
    const gtin = data.hasGs1 === "Yes" && data.gtinPrefix
      ? data.gtinPrefix.padEnd(14, "0").slice(0, 14)
      : generateDummyGtin();

    const expiryYYMMDD = format(new Date(data.expiryDate), "yyMMdd");
    const gs1Content = buildSignedGs1String({
      gtin,
      batch: data.batchNo.toUpperCase(),
      expiry: expiryYYMMDD,
      companySecret: process.env.NEXT_PUBLIC_LABEL_HMAC_SECRET || "fallback",
    });

    const labelData = {
      ...data,
      gtin,
      gs1Content,
      mfgDate: format(new Date(data.mfgDate), "MM/yyyy"),
      expiryDate: format(new Date(data.expiryDate), "MM/yyyy"),
    };

    let buffer: any;
    let ext = "";
    let mime = "";

    switch (data.format) {
      case "PDF":
        buffer = await generatePdfBuffer(labelData);
        ext = "pdf";
        mime = "application/pdf";
        break;
      case "PNG":
        buffer = await generatePngBuffer(labelData);
        ext = "png";
        mime = "image/png";
        break;
      case "ZPL":
        buffer = generateZplLabel(labelData);
        ext = "zpl";
        mime = "text/plain";
        break;
      case "EPL":
        buffer = generateEplLabel(labelData);
        ext = "epl";
        mime = "text/plain";
        break;
    }

    await supabase.from("labels").insert({
      company_name: data.companyName,
      contact_person: data.contactPerson,
      email: data.email,
      phone: data.phone,
      address: data.address,
      gst_number: data.gstNumber,
      sku_name: data.skuName,
      batch_no: data.batchNo,
      mfg_date: data.mfgDate,
      expiry_date: data.expiryDate,
      mrp: parseFloat(data.mrp),
      quantity: 1,
      code_type: data.codeType,
      format: data.format,
      gtin,
      gs1_content: gs1Content,
    });

    const blob = new Blob([buffer], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.batchNo}-${data.skuName}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onSubmit: SubmitHandler<FormData> = async (data) => {
    setIsLoading(true);
    try {
      const qty = parseInt(data.quantity) || 1;
      for (let i = 0; i < qty; i++) {
        await generateSingleLabel(data);
      }
      toast.success(`${qty} label(s) generated & saved!`);
      reset();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (result) => {
        const rows = result.data as any[];
        rows
          .filter(r => r["Company Name"] && r["SKU Name"])
          .forEach(r => {
            const data: FormData = {
              companyName: r["Company Name"] || "ABC Pharma",
              contactPerson: r["Contact Person"] || "",
              email: r["Email"] || "",
              phone: r["Phone"] || "",
              address: r["Address"] || "",
              gstNumber: r["GST Number"] || "27ABCDE1234F2Z5",
              skuName: r["SKU Name"] || "Unknown",
              batchNo: r["Batch No"] || "B001",
              mfgDate: r["MFG Date (YYYY-MM-DD)"] || "2025-01-01",
              expiryDate: r["Expiry Date (YYYY-MM-DD)"] || "2027-12-31",
              mrp: r["MRP"] || "100",
              quantity: "1",
              codeType: (r["Code Type"] || "QR") as any,
              format: (r["Format"] || "PDF") as any,
              hasGs1: (r["GS1 Letter (Yes/No)"] || "No").toLowerCase().includes("yes") ? "Yes" : "No",
              gtinPrefix: r["GTIN Prefix (optional)"] || undefined,
            };
            generateSingleLabel(data);
          });
        toast.success("Bulk labels generated from CSV!");
      },
    });
  };

  const downloadTemplate = () => {
    const csv = `Company Name,Contact Person,Email,Phone,Address,GST Number,SKU Name,Batch No,MFG Date (YYYY-MM-DD),Expiry Date (YYYY-MM-DD),MRP,Quantity,Code Type,Format,GS1 Letter (Yes/No),GTIN Prefix (optional)\nABC Pharma,John,john@example.com,9876543210,Mumbai,27ABCDE1234F2Z5,Paracetamol,B001,2025-01-01,2027-12-31,85.00,10,QR,PDF,No,\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rxtrace_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8">Indian Pharma Label Generator</h1>

        <Tabs defaultValue="manual">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="csv">CSV Bulk</TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <Card>
              <CardHeader><CardTitle>Generate Labels</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Company Name *</Label><Input {...register("companyName")} /></div>
                    <div><Label>Contact Person *</Label><Input {...register("contactPerson")} /></div>
                    <div><Label>Email *</Label><Input type="email" {...register("email")} /></div>
                    <div><Label>Phone *</Label><Input {...register("phone")} /></div>
                    <div className="md:col-span-2"><Label>Address *</Label><Textarea {...register("address")} /></div>
                    <div><Label>GST Number *</Label><Input {...register("gstNumber")} placeholder="27ABCDE1234F2Z5" /></div>
                    <div><Label>SKU Name *</Label><Input {...register("skuName")} /></div>
                    <div><Label>Batch No *</Label><Input {...register("batchNo")} /></div>
                    <div><Label>MFG Date *</Label><Input type="date" {...register("mfgDate")} /></div>
                    <div><Label>Expiry Date *</Label><Input type="date" {...register("expiryDate")} /></div>
                    <div><Label>MRP *</Label><Input type="number" step="0.01" {...register("mrp")} /></div>
                    <div><Label>Quantity *</Label><Input type="number" {...register("quantity")} /></div>

                    <div><Label>Code Type</Label>
                      <Select onValueChange={(v) => setValue("codeType", v as any)} defaultValue="QR">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="QR">QR Code</SelectItem>
                          <SelectItem value="Code128">Code 128</SelectItem>
                          <SelectItem value="DataMatrix">DataMatrix</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div><Label>Format</Label>
                      <Select onValueChange={(v) => setValue("format", v as any)} defaultValue="PDF">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PDF">PDF</SelectItem>
                          <SelectItem value="PNG">PNG</SelectItem>
                          <SelectItem value="ZPL">ZPL</SelectItem>
                          <SelectItem value="EPL">EPL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div><Label>GS1 Prefix?</Label>
                      <Select onValueChange={(v) => setValue("hasGs1", v as any)} defaultValue="No">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No (Dummy)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {hasGs1 === "Yes" && (
                      <div><Label>GTIN Prefix</Label><Input {...register("gtinPrefix")} placeholder="8901234" /></div>
                    )}
                  </div>

                  <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Generating...</> : "Generate Labels"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="csv">
            <Card>
              <CardHeader><CardTitle>Bulk Upload</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <Button onClick={downloadTemplate} variant="outline" className="w-full">
                  <Download className="mr-2 h-4 w-4" /> Download Template
                </Button>
                <Input type="file" accept=".csv" onChange={handleCsv} className="max-w-md mx-auto" />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}