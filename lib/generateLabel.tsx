// 1. lib/generateLabel.ts
import { createHmac } from "crypto";
import QRCode from "qrcode";
import { Barcode } from "react-barcode";
import { DataMatrixSVG } from "react-datamatrix-svg";
import { Document, Page, Text, View, StyleSheet, pdf, Image, Font } from "@react-pdf/renderer";
import { renderToString } from "react-dom/server";

// Register Indian Rupee font (fallback to Helvetica if not loaded)
Font.register({
  family: "Helvetica",
  fonts: [
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5.0.18/files/noto-sans-latin-400-normal.woff" },
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5.0.18/files/noto-sans-latin-700-normal.woff", fontWeight: 700 },
  ],
});

const COMPANY_SECRET = process.env.NEXT_PUBLIC_LABEL_HMAC_SECRET || "rxtrace2025-india-pharma-secret-key-please-change-in-prod";

const styles = StyleSheet.create({
  page: { padding: 30, fontFamily: "Helvetica", backgroundColor: "white" },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 4, textAlign: "center" },
  sku: { fontSize: 16, marginBottom: 8, textAlign: "center" },
  row: { fontSize: 12, marginBottom: 4, textAlign: "center" },
  mrp: { fontSize: 14, fontWeight: "bold", marginVertical: 8, textAlign: "center" },
  codeContainer: { alignItems: "center", marginVertical: 16 },
  footer: { fontSize: 9, textAlign: "center", marginTop: 20, color: "#666" },
});

export function formatRupee(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(num);
}

export function generateDummyGtin(): string {
  const prefix = "8909999";
  const random = Math.floor(100000 + Math.random() * 900000).toString();
  const gtin14 = (prefix + random).padEnd(14, "0").slice(0, 14);
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = parseInt(gtin14[12 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return gtin14 + checkDigit;
}

export function buildSignedGs1String(data: {
  gtin: string;
  batch: string;
  expiry: string; // YYYYMMDD
  companySecret: string;
}): string {
  const gtinPart = `(01)${data.gtin}`;
  const batchPart = `(10)${data.batch}`;
  const expiryPart = `(17)${data.expiry}`;
  const hiddenPart = "(91)RXTRACE2025";
  const gs1String = `${gtinPart}${batchPart}${expiryPart}${hiddenPart}`;

  const hmac = createHmac("sha256", data.companySecret);
  hmac.update(gs1String);
  const signature = hmac.digest("hex").toUpperCase().slice(0, 16);

  return `${gs1String}(96)${signature}`;
}

export async function generateQrDataUrl(content: string): Promise<string> {
  return await QRCode.toDataURL(content, { width: 400, margin: 2 });
}

export async function generateBarcode128DataUrl(content: string): Promise<string> {
  const svgString = renderToString(<Barcode value={content} format="CODE128" width={2} height={80} fontSize={14} />);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export async function generateDataMatrixDataUrl(content: string): Promise<string> {
  const svgString = renderToString(<DataMatrixSVG value={content} size={300} />);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);
      resolve(canvas.toDataURL("image/png"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export async function generatePdfBuffer(labelData: any): Promise<Buffer> {
  const codeUrl =
    labelData.codeType === "QR"
      ? await generateQrDataUrl(labelData.gs1Content)
      : labelData.codeType === "Code128"
      ? await generateBarcode128DataUrl(labelData.gs1Content)
      : await generateDataMatrixDataUrl(labelData.gs1Content);

  const MyDocument = () => (
    <Document>
      <Page size={[288, 432]} style={styles.page}> {/* 3x4.5 inch at 96dpi */}
        <Text style={styles.title}>{labelData.companyName}</Text>
        <Text style={styles.sku}>{labelData.skuName}</Text>
        <Text style={styles.row}>
          Batch : {labelData.batchNo}    Mfg : {labelData.mfgDate}    Exp : {labelData.expiryDate}
        </Text>
        <Text style={styles.mrp}>MRP : {formatRupee(labelData.mrp)} (Incl. of taxes)</Text>
        <View style={styles.codeContainer}>
          <Image src={codeUrl} style={{ width: 200, height: 200 }} />
        </View>
        <Text style={styles.footer}>Powered by RxTrace</Text>
      </Page>
    </Document>
  );

  const pdfDoc = <MyDocument />;
  const buffer = await pdf(pdfDoc).toBuffer();
  return buffer;
}

export async function generatePngBuffer(labelData: any): Promise<Buffer> {
  const codeUrl =
    labelData.codeType === "QR"
      ? await generateQrDataUrl(labelData.gs1Content)
      : labelData.codeType === "Code128"
      ? await generateBarcode128DataUrl(labelData.gs1Content)
      : await generateDataMatrixDataUrl(labelData.gs1Content);

  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 576;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = new Image();
  img.src = codeUrl;
  await new Promise((resolve) => (img.onload = resolve));

  ctx.font = "bold 24px Helvetica";
  ctx.textAlign = "center";
  ctx.fillStyle = "black";
  ctx.fillText(labelData.companyName, canvas.width / 2, 50);
  ctx.font = "20px Helvetica";
  ctx.fillText(labelData.skuName, canvas.width / 2, 80);
  ctx.font = "16px Helvetica";
  ctx.fillText(
    `Batch : ${labelData.batchNo}    Mfg : ${labelData.mfgDate}    Exp : ${labelData.expiryDate}`,
    canvas.width / 2,
    110
  );
  ctx.font = "bold 20px Helvetica";
  ctx.fillText(`MRP : ${formatRupee(labelData.mrp)} (Incl. of taxes)`, canvas.width / 2, 140);
  ctx.drawImage(img, (canvas.width - 250) / 2, 160, 250, 250);
  ctx.font = "12px Helvetica";
  ctx.fillStyle = "#666";
  ctx.fillText("Powered by RxTrace", canvas.width / 2, 540);

  const buffer = canvas.toBuffer ? canvas.toBuffer("image/png") : Buffer.from(canvas.toDataURL("image/png").split(",")[1], "base64");
  return buffer;
}

export function generateZplLabel(labelData: any): string {
  let codeZpl = "";
  if (labelData.codeType === "QR") {
    codeZpl = `^FO80,150^QRW,H^FDQA,${labelData.gs1Content}^FS`;
  } else if (labelData.codeType === "Code128") {
    codeZpl = `^FO50,150^BY3^B3N,N,100,Y,N^FD${labelData.gs1Content}^FS`;
  } else if (labelData.codeType === "DataMatrix") {
    codeZpl = `^FO80,150^BXN,8,200,,,_^FD${labelData.gs1Content}^FS`;
  }

  return `^XA
^CF0,30
^FO50,20^FD${labelData.companyName}^FS
^FO50,60^FD${labelData.skuName}^FS
^FO50,100^FDBatch : ${labelData.batchNo}  Mfg : ${labelData.mfgDate}  Exp : ${labelData.expiryDate}^FS
^FO50,130^FDM RP : ${formatRupee(labelData.mrp)} (Incl. of taxes)^FS
${codeZpl}
^FO100,420^FDPowered by RxTrace^FS
^XZ`;
}

export function generateEplLabel(labelData: any): string {
  return `N
A50,20,0,4,1,1,N,"${labelData.companyName}"
A50,70,0,3,1,1,N,"${labelData.skuName}"
A50,110,0,2,1,1,N,"Batch:${labelData.batchNo} Mfg:${labelData.mfgDate} Exp:${labelData.expiryDate}"
A50,140,0,3,1,1,N,"MRP:${formatRupee(labelData.mrp)}"
${labelData.codeType === "QR" ? `q400\nQ1016,24\nB100,200,0,QR,8,8,M2,L,"${labelData.gs1Content}"` : ""}
${labelData.codeType === "Code128" ? `B100,300,0,1,3,6,100,B,"${labelData.gs1Content}"` : ""}
A100,500,0,2,1,1,N,"Powered by RxTrace"
P1
`;
}